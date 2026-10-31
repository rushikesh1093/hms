import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarClock, CalendarPlus, CheckCircle2, FilterX, Search } from 'lucide-react';
import { followupService } from '../services/checkupService';
import { getErrorMessage } from '../services/api';
import { useAsync, useDebounce, useDocumentTitle } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { can } from '../utils/permissions';
import { FollowupStatusBadge, PageHeader, Pagination, Tabs } from '../components/common/Display';
import { EmptyState, ErrorState, Spinner, TableSkeleton } from '../components/common/Feedback';
import { Field, Input, Select, Textarea } from '../components/common/Form';
import { Modal } from '../components/common/Modal';
import { formatDate, formatDateTime, isoDate } from '../utils/format';

const VIEWS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'due_today', label: 'Due today' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'completed', label: 'Completed' },
  { key: 'missed', label: 'Missed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
];

function dueText(f) {
  if (f.status !== 'pending') return null;
  if (f.days_until === 0) return 'Today';
  if (f.days_until > 0) return `In ${f.days_until} day${f.days_until === 1 ? '' : 's'}`;
  return `${-f.days_until} day${f.days_until === -1 ? '' : 's'} overdue`;
}

function UpdateDialog({ followup, onClose, onSaved }) {
  const { user } = useAuth();
  const toast = useToast();
  const clinical = can(user, 'updateFollowupStatus');
  const [status, setStatus] = useState(followup.status);
  const [date, setDate] = useState(followup.scheduled_date);
  const [notes, setNotes] = useState(followup.notes || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const body = {};
    if (clinical && status !== followup.status) body.status = status;
    if (date !== followup.scheduled_date) body.scheduled_date = date;
    if (clinical && notes.trim() !== (followup.notes || '')) body.notes = notes.trim() || null;
    if (!Object.keys(body).length) return onClose();
    setBusy(true);
    try {
      const saved = await followupService.update(followup.id, body);
      toast.success(body.status === 'completed' ? 'Follow-up marked as completed' : 'Follow-up updated');
      onSaved(saved);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? undefined : onClose}
      title="Update follow-up"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn-primary" onClick={save} disabled={busy}>{busy && <Spinner className="h-4 w-4 text-white" />} Save</button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm">
          <b>{followup.patient.full_name}</b> <span className="font-mono text-xs text-brand-700">{followup.patient.patient_code}</span>
          {followup.checkup && <span className="block text-xs text-slate-500">From check-up {followup.checkup.checkup_code} · {followup.checkup.diagnosis}</span>}
        </p>
        {clinical && (
          <Field label="Status" hint="Statuses change only when you save. Completing records your name and the time.">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="missed">Missed (patient did not attend)</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </Field>
        )}
        <Field label="Scheduled date" hint={status !== 'pending' ? 'Only pending follow-ups can be rescheduled' : undefined}>
          <Input type="date" min={isoDate()} value={date} disabled={status !== 'pending' || followup.status !== 'pending'} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {clinical && (
          <Field label="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        )}
        {followup.completed_at && (
          <p className="text-xs text-slate-500">Completed {formatDateTime(followup.completed_at)}{followup.completer ? ` by ${followup.completer.name}` : ''}</p>
        )}
      </div>
    </Modal>
  );
}

export default function Followups() {
  useDocumentTitle('Follow-ups');
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const get = (k, d = '') => params.get(k) ?? d;
  const view = get('view', 'upcoming');
  const page = Number(get('page', '1')) || 1;
  const pageSize = Number(get('page_size', '20')) || 20;
  const [q, setQ] = useState(get('q'));
  const dq = useDebounce(q);
  const [editing, setEditing] = useState(null);

  const update = (changes, resetPage = true) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v === '' || v == null ? next.delete(k) : next.set(k, String(v))));
    if (resetPage) next.delete('page');
    setParams(next, { replace: true });
  };
  useEffect(() => {
    if (dq !== get('q')) update({ q: dq });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dq]);

  const counts = useAsync(() => followupService.counts(), []);
  const list = useAsync(
    () => followupService.list({ view, page, page_size: pageSize, q: get('q'), date_from: get('date_from'), date_to: get('date_to') }),
    [params.toString()],
  );
  const hasFilters = ['q', 'date_from', 'date_to'].some((k) => get(k));
  const tabs = VIEWS.map((v) => ({ ...v, count: counts.data?.[v.key] }));

  return (
    <>
      <PageHeader icon={CalendarClock} title="Follow-up management" subtitle="Follow-ups are scheduled from eye check-ups. Overdue items stay pending until staff update them." />
      <Tabs tabs={tabs} active={view} onChange={(k) => update({ view: k })} />
      <div className="card">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search patient ID, name or mobile" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search follow-ups" />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <input type="date" className="input" value={get('date_from')} onChange={(e) => update({ date_from: e.target.value })} aria-label="Scheduled from" title="Scheduled from" />
            <span className="text-xs text-slate-400">to</span>
            <input type="date" className="input" value={get('date_to')} onChange={(e) => update({ date_to: e.target.value })} aria-label="Scheduled to" title="Scheduled to" />
            {hasFilters && (
              <button type="button" className="btn-ghost shrink-0" title="Clear filters" onClick={() => { setQ(''); update({ q: '', date_from: '', date_to: '' }); }}>
                <FilterX className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        {list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.loading && !list.data ? (
          <TableSkeleton cols={6} />
        ) : !list.data?.items.length ? (
          <EmptyState icon={CalendarClock} title="No follow-ups in this view" message={hasFilters ? 'Try clearing the filters.' : 'Follow-ups appear here when a doctor recommends one during a check-up.'} />
        ) : (
          <div className={`overflow-x-auto ${list.loading ? 'opacity-60' : ''}`}>
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Scheduled</th>
                  <th className="th">Patient</th>
                  <th className="th">Mobile</th>
                  <th className="th">Status</th>
                  {can(user, 'viewClinical') && <th className="th">From check-up</th>}
                  {can(user, 'viewClinical') && <th className="th">Instructions</th>}
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {list.data.items.map((f) => (
                  <tr key={f.id} className={f.is_overdue ? 'bg-red-50/40' : ''}>
                    <td className="td">
                      <p className="font-medium">{formatDate(f.scheduled_date)}</p>
                      <p className={`text-xs ${f.is_overdue ? 'text-red-600' : 'text-slate-500'}`}>{dueText(f)}</p>
                    </td>
                    <td className="td">
                      <Link to={`/patients/${f.patient.id}`} className="font-medium hover:text-brand-700">{f.patient.full_name}</Link>
                      <p className="font-mono text-xs text-slate-500">{f.patient.patient_code}</p>
                    </td>
                    <td className="td">{f.patient.mobile_number}</td>
                    <td className="td">
                      <FollowupStatusBadge status={f.status} overdue={f.is_overdue} />
                      {f.completed_at && <p className="mt-0.5 text-xs text-slate-500">{formatDate(f.completed_at.slice(0, 10))}{f.completer ? ` · ${f.completer.name}` : ''}</p>}
                    </td>
                    {can(user, 'viewClinical') && (
                      <td className="td">
                        {f.checkup ? (
                          <>
                            <Link to={`/checkups/${f.checkup.id}`} className="font-mono text-xs text-brand-700 hover:underline">{f.checkup.checkup_code}</Link>
                            <p className="max-w-48 truncate text-xs text-slate-500" title={f.checkup.diagnosis}>{f.checkup.diagnosis}</p>
                          </>
                        ) : '—'}
                      </td>
                    )}
                    {can(user, 'viewClinical') && <td className="td max-w-56 truncate" title={f.notes || ''}>{f.notes || '—'}</td>}
                    <td className="td">
                      <div className="flex justify-end gap-1">
                        {can(user, 'updateFollowupStatus') && f.status === 'pending' && (
                          <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(f)}>
                            <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" /> Update
                          </button>
                        )}
                        {!can(user, 'updateFollowupStatus') && f.status === 'pending' && (
                          <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(f)}>
                            <CalendarPlus className="h-3.5 w-3.5" /> Reschedule
                          </button>
                        )}
                        {can(user, 'updateFollowupStatus') && f.status !== 'pending' && (
                          <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(f)}>Details</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.data && <Pagination page={list.data.page} pages={list.data.pages} total={list.data.total} pageSize={pageSize} onPageChange={(p) => update({ page: p }, false)} onPageSizeChange={(s) => update({ page_size: s })} />}
      </div>
      {editing && (
        <UpdateDialog
          followup={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
            counts.reload();
          }}
        />
      )}
    </>
  );
}
