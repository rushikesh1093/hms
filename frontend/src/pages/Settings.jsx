import { useForm } from 'react-hook-form';
import { Building2, KeyRound, Settings as SettingsIcon, UserRound } from 'lucide-react';
import { authService } from '../services/authService';
import { applyFieldErrors, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useDocumentTitle } from '../hooks/useAsync';
import { useHospital } from '../hooks/useHospital';
import { DetailGrid, PageHeader } from '../components/common/Display';
import { Spinner } from '../components/common/Feedback';
import { Field, FormSection, Input } from '../components/common/Form';
import { formatDateTime, titleCase } from '../utils/format';

export default function Settings() {
  useDocumentTitle('Settings');
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const hospital = useHospital();

  const profile = useForm({ defaultValues: { name: user.name, email: user.email, designation: user.designation || '' } });
  const pw = useForm({ defaultValues: { current_password: '', new_password: '', confirm: '' } });

  const saveProfile = async (v) => {
    try {
      const u = await authService.updateProfile({ name: v.name.trim(), email: v.email.trim(), designation: v.designation.trim() || null });
      setUser(u);
      toast.success('Profile updated');
    } catch (e) {
      if (!applyFieldErrors(e, profile.setError)) toast.error(getErrorMessage(e));
    }
  };

  const changePassword = async (v) => {
    try {
      await authService.changePassword({ current_password: v.current_password, new_password: v.new_password });
      toast.success('Password changed. Please sign in again.');
      await logout();
    } catch (e) {
      if (!applyFieldErrors(e, pw.setError)) toast.error(getErrorMessage(e));
    }
  };

  return (
    <>
      <PageHeader icon={SettingsIcon} title="Settings" subtitle="Your profile, password and system information." />
      <div className="grid gap-5 lg:grid-cols-2">
        <FormSection title="My profile" icon={UserRound}>
          <form onSubmit={profile.handleSubmit(saveProfile)} className="space-y-4" noValidate>
            <DetailGrid cols={2} items={[['Username', user.username], ['Role', titleCase(user.role)], ['Last sign-in', formatDateTime(user.last_login_at)]]} />
            <Field label="Full name" required error={profile.formState.errors.name?.message}>
              <Input {...profile.register('name', { required: 'Required', minLength: { value: 2, message: 'Too short' } })} />
            </Field>
            <Field label="Email" required error={profile.formState.errors.email?.message}>
              <Input type="email" {...profile.register('email', { required: 'Required' })} />
            </Field>
            <Field label="Designation">
              <Input {...profile.register('designation')} />
            </Field>
            <div className="flex justify-end">
              <button type="submit" className="btn-primary" disabled={profile.formState.isSubmitting}>
                {profile.formState.isSubmitting && <Spinner className="h-4 w-4 text-white" />} Save profile
              </button>
            </div>
          </form>
        </FormSection>

        <FormSection title="Change password" description="You will be signed out on all devices." icon={KeyRound}>
          <form onSubmit={pw.handleSubmit(changePassword)} className="space-y-4" noValidate>
            <Field label="Current password" required error={pw.formState.errors.current_password?.message}>
              <Input type="password" autoComplete="current-password" {...pw.register('current_password', { required: 'Required' })} />
            </Field>
            <Field label="New password" required error={pw.formState.errors.new_password?.message} hint="At least 8 characters with upper-case, lower-case and a digit">
              <Input
                type="password"
                autoComplete="new-password"
                {...pw.register('new_password', {
                  validate: (v) => (v.length >= 8 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /\d/.test(v)) || 'Does not meet the password rules',
                })}
              />
            </Field>
            <Field label="Confirm new password" required error={pw.formState.errors.confirm?.message}>
              <Input type="password" autoComplete="new-password" {...pw.register('confirm', { validate: (v) => v === pw.getValues('new_password') || 'Passwords do not match' })} />
            </Field>
            <div className="flex justify-end">
              <button type="submit" className="btn-primary" disabled={pw.formState.isSubmitting}>
                {pw.formState.isSubmitting && <Spinner className="h-4 w-4 text-white" />} Change password
              </button>
            </div>
          </form>
        </FormSection>

        <FormSection title="Hospital" description="Printed on reports. Configured by the system administrator in the server environment." icon={Building2} className="lg:col-span-2">
          <DetailGrid cols={3} items={[['Name', hospital.hospital_name], ['Address', hospital.hospital_address], ['Phone', hospital.hospital_phone]]} />
        </FormSection>
      </div>
    </>
  );
}
