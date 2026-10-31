import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { KeyRound, Pencil, UserPlus, Users as UsersIcon } from 'lucide-react';
import { userService } from '../services/authService';
import { applyFieldErrors, getErrorMessage } from '../services/api';
import { useAsync, useDocumentTitle } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Badge, PageHeader, Pagination } from '../components/common/Display';
import { EmptyState, ErrorState, Spinner, TableSkeleton } from '../components/common/Feedback';
import { Field, Input, Select } from '../components/common/Form';
import { Modal } from '../components/common/Modal';
import { ROLES, formatDateTime, titleCase } from '../utils/format';

const PW_RULE = {
  validate: (v) =>
    (v.length >= 8 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /\d/.test(v)) || 'At least 8 characters with upper-case, lower-case and a digit',
};

function UserDialog({ user, onClose, onSaved, isSelf }) {
  const toast = useToast();
  const editing = Boolean(user);
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: user
      ? { name: user.name, email: user.email, role: user.role, designation: user.designation || '', registration_number: user.registration_number || '', is_active: user.is_active ? 'true' : 'false' }
      : { username: '', name: '', email: '', password: '', role: 'doctor', designation: '', registration_number: '' },
  });
  const role = watch('role');

  const submit = async (v) => {
    const body = { ...v, designation: v.designation.trim() || null, registration_number: v.registration_number.trim() || null };
    // Disabled fields (own role/status) are undefined and must not be sent.
    if (editing && v.is_active !== undefined) body.is_active = v.is_active === 'true';
    else delete body.is_active;
    if (body.role === undefined) delete body.role;
    try {
      const saved = editing ? await userService.update(user.id, body) : await userService.create(body);
      toast.success(editing ? 'User updated' : `User ${saved.username} created`);
      onSaved();
    } catch (e) {
      if (!applyFieldErrors(e, setError)) toast.error(getErrorMessage(e));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? `Edit ${user.username}` : 'Add user'}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="user-form" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting && <Spinner className="h-4 w-4 text-white" />} Save
          </button>
        </>
      }
    >
      <form id="user-form" onSubmit={handleSubmit(submit)} className="grid gap-4 sm:grid-cols-2" noValidate>
        {!editing && (
          <Field label="Username" required error={errors.username?.message}>
            <Input autoComplete="off" error={errors.username} {...register('username', { required: 'Required', pattern: { value: /^[a-zA-Z0-9_.-]{3,50}$/, message: '3–50 letters, digits, . _ -' } })} />
          </Field>
        )}
        <Field label="Full name" required error={errors.name?.message}>
          <Input error={errors.name} {...register('name', { required: 'Required', minLength: { value: 2, message: 'Too short' } })} />
        </Field>
        <Field label="Email" required error={errors.email?.message}>
          <Input type="email" error={errors.email} {...register('email', { required: 'Required', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' } })} />
        </Field>
        {!editing && (
          <Field label="Initial password" required error={errors.password?.message}>
            <Input type="password" autoComplete="new-password" error={errors.password} {...register('password', PW_RULE)} />
          </Field>
        )}
        <Field label="Role" required>
          <Select {...register('role')} disabled={isSelf}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Designation">
          <Input placeholder={role === 'doctor' ? 'e.g. Ophthalmologist, MS' : ''} {...register('designation')} />
        </Field>
        {role === 'doctor' && (
          <Field label="Medical registration no." hint="Printed on check-up reports">
            <Input {...register('registration_number')} />
          </Field>
        )}
        {editing && (
          <Field label="Status">
            <Select {...register('is_active')} disabled={isSelf}>
              <option value="true">Active</option>
              <option value="false">Deactivated</option>
            </Select>
          </Field>
        )}
      </form>
    </Modal>
  );
}

function ResetPasswordDialog({ user, onClose }) {
  const toast = useToast();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ defaultValues: { new_password: '' } });
  const submit = async ({ new_password }) => {
    try {
      await userService.resetPassword(user.id, new_password);
      toast.success(`Password reset for ${user.username}. Their sessions were signed out.`);
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Reset password: ${user.username}`}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="pw-form" className="btn-primary" disabled={isSubmitting}>{isSubmitting && <Spinner className="h-4 w-4 text-white" />} Reset</button>
        </>
      }
    >
      <form id="pw-form" onSubmit={handleSubmit(submit)} noValidate>
        <Field label="New password" required error={errors.new_password?.message}>
          <Input type="password" autoComplete="new-password" error={errors.new_password} {...register('new_password', PW_RULE)} />
        </Field>
      </form>
    </Modal>
  );
}

export default function Users() {
  useDocumentTitle('User management');
  const { user: me } = useAuth();
  const [page, setPage] = useState(1);
  const [role, setRole] = useState('');
  const [dialog, setDialog] = useState(null); // {type, user}
  const { data, loading, error, reload } = useAsync(() => userService.list({ page, page_size: 20, ...(role ? { role } : {}) }), [page, role]);

  return (
    <>
      <PageHeader
        icon={UsersIcon}
        title="User management"
        subtitle="Staff accounts and roles. Deactivated users cannot sign in."
        actions={<button type="button" className="btn-primary" onClick={() => setDialog({ type: 'edit', user: null })}><UserPlus className="h-4 w-4" /> Add user</button>}
      />
      <div className="card">
        <div className="border-b border-slate-100 p-4">
          <select className="input w-auto" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} aria-label="Role filter">
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <TableSkeleton cols={5} />
        ) : !data?.items.length ? (
          <EmptyState title="No users" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Username</th>
                  <th className="th">Role</th>
                  <th className="th">Status</th>
                  <th className="th">Last login</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {data.items.map((u) => (
                  <tr key={u.id}>
                    <td className="td">
                      <p className="font-medium text-slate-900">{u.name}</p>
                      <p className="text-xs text-slate-500">{u.email}{u.designation ? ` · ${u.designation}` : ''}</p>
                    </td>
                    <td className="td font-mono text-xs">{u.username}</td>
                    <td className="td"><Badge tone={u.role === 'admin' ? 'blue' : u.role === 'doctor' ? 'teal' : 'slate'}>{titleCase(u.role)}</Badge></td>
                    <td className="td">{u.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Deactivated</Badge>}</td>
                    <td className="td">{u.last_login_at ? formatDateTime(u.last_login_at) : 'Never'}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        <button type="button" className="btn-ghost" title="Edit" aria-label={`Edit ${u.username}`} onClick={() => setDialog({ type: 'edit', user: u })}><Pencil className="h-4 w-4" /></button>
                        <button type="button" className="btn-ghost" title="Reset password" aria-label={`Reset password for ${u.username}`} onClick={() => setDialog({ type: 'password', user: u })}><KeyRound className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={20} onPageChange={setPage} />}
      </div>
      {dialog?.type === 'edit' && (
        <UserDialog user={dialog.user} isSelf={dialog.user?.id === me.id} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); reload(); }} />
      )}
      {dialog?.type === 'password' && <ResetPasswordDialog user={dialog.user} onClose={() => setDialog(null)} />}
    </>
  );
}
