import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, FileDown, KeyRound, LogOut, Stethoscope, UserRound } from 'lucide-react';
import { portalService, setPortalExpiredHandler } from '../../services/portalApi';
import { getErrorMessage } from '../../services/api';
import { useAsync, useDocumentTitle } from '../../hooks/useAsync';
import { useToast } from '../../context/ToastContext';
import { Badge, FollowupStatusBadge } from '../../components/common/Display';
import { Alert, EmptyState, ErrorState, PageLoader, Spinner } from '../../components/common/Feedback';
import { Modal } from '../../components/common/Modal';
import EyeLogo from '../../components/common/EyeLogo';
import { formatDate, formatDateTime, formatPower, titleCase } from '../../utils/format';

function EyeRow({ label, c, side }) {
  const v = (k) => c[`${side}_eye_${k}`];
  const cells = [v('unaided_va'), v('corrected_va'), formatPower(v('sphere')), formatPower(v('cylinder')), v('axis') ?? '—', v('iop') ?? '—'];
  return (
    <tr className="border-t border-slate-100">
      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">{label}</th>
      {cells.map((x, i) => (
        <td key={i} className="px-3 py-2 text-sm text-slate-700">{x || '—'}</td>
      ))}
    </tr>
  );
}

function CheckupCard({ c, onPdf }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{formatDate(c.examination_date)}</span>
            <span className="font-mono text-xs text-slate-500">{c.checkup_code}</span>
            <Badge tone="blue">{titleCase(c.checkup_type)}</Badge>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <Stethoscope className="h-3.5 w-3.5" /> {c.doctor?.name}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide details' : 'View details'}
          </button>
          <button type="button" className="btn-teal btn-sm" onClick={() => onPdf(c.id)}>
            <FileDown className="h-3.5 w-3.5" /> Prescription PDF
          </button>
        </div>
      </div>
      <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase text-slate-500">Diagnosis</p>
          <p className="mt-0.5 font-medium text-slate-900">{c.diagnosis}</p>
        </div>
        {c.prescription && (
          <div>
            <p className="text-xs font-medium uppercase text-slate-500">Prescription</p>
            <p className="mt-0.5 whitespace-pre-line">{c.prescription}</p>
          </div>
        )}
      </div>
      {open && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full">
              <thead className="bg-slate-50">
                <tr>
                  {['', 'Vision', 'With glasses', 'Sphere', 'Cylinder', 'Axis', 'Eye pressure'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <EyeRow label="Right eye" c={c} side="right" />
                <EyeRow label="Left eye" c={c} side="left" />
              </tbody>
            </table>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {[
              ['Complaints', c.chief_complaints],
              ['Recommended treatment', c.recommended_treatment],
              ["Doctor's advice", c.doctor_notes],
              ['Referral', c.referral_recommendation],
              ['Follow-up instructions', c.followup_instructions],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs font-medium uppercase text-slate-500">{k}</dt>
                  <dd className="mt-0.5 whitespace-pre-line">{v}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}
    </div>
  );
}

// Stable no-op so the Modal's focus effect doesn't re-run (and steal focus) on every keystroke.
const NOOP = () => {};

function ChangePasswordModal({ open, forced, onClose, onDone }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (form.next !== form.confirm) return setError('The new passwords do not match.');
    setBusy(true);
    try {
      await portalService.changePassword(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <Modal open={open} onClose={forced ? NOOP : onClose} title={forced ? 'Set your own password' : 'Change password'}>
      <form onSubmit={submit} className="space-y-4">
        {forced && <Alert tone="info">For your security, please replace the password you were given at the hospital.</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
        {[
          ['current', 'Current password', 'current-password'],
          ['next', 'New password', 'new-password'],
          ['confirm', 'Confirm new password', 'new-password'],
        ].map(([k, label, ac]) => (
          <div key={k}>
            <label className="label" htmlFor={`pw-${k}`}>{label}</label>
            <input
              id={`pw-${k}`}
              type="password"
              autoComplete={ac}
              required
              className="input"
              value={form[k]}
              onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
            />
          </div>
        ))}
        <p className="text-xs text-slate-500">At least 8 characters, with upper-case and lower-case letters and a number.</p>
        <div className="flex justify-end gap-2">
          {!forced && <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>}
          <button type="submit" className="btn-teal" disabled={busy}>
            {busy && <Spinner className="h-4 w-4 text-white" />} Save password
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function PortalHome() {
  useDocumentTitle('My eye care');
  const navigate = useNavigate();
  const toast = useToast();
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => {
    setPortalExpiredHandler(() => navigate('/login?as=patient', { replace: true, state: { expired: true } }));
  }, [navigate]);

  const me = useAsync(() => portalService.me(), []);
  const checkups = useAsync(() => portalService.checkups(), []);
  const followups = useAsync(() => portalService.followups(), []);

  const upcoming = useMemo(
    () => (followups.data || []).filter((f) => f.status === 'pending').sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)),
    [followups.data],
  );

  const logout = () => {
    portalService.logout();
    navigate('/login?as=patient', { replace: true });
  };
  const openPdf = (id) => portalService.openPdf(id).catch((e) => toast.error(getErrorMessage(e)));

  if (me.loading) return <PageLoader label="Loading your records…" />;
  if (me.error) return <div className="mx-auto mt-16 max-w-md card"><ErrorState message={me.error} onRetry={me.reload} /></div>;

  const p = me.data.patient;
  const forced = me.data.must_change_password;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-gradient-to-r from-brand-800 to-brand-700 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <EyeLogo className="h-9 w-9 rounded-[10px] shadow-lg shadow-black/20" />
            <div className="leading-tight">
              <p className="text-sm font-semibold">Eye Care HMS</p>
              <p className="text-[11px] text-brand-200">Patient portal</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" className="btn px-3 text-brand-100 hover:bg-white/10" onClick={() => setPwOpen(true)}>
              <KeyRound className="h-4 w-4" /> <span className="hidden sm:inline">Password</span>
            </button>
            <button type="button" className="btn px-3 text-brand-100 hover:bg-white/10" onClick={logout}>
              <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-8 pt-2">
          <h1 className="text-2xl font-semibold text-white">Hello, {p.full_name}</h1>
          <p className="mt-1 text-sm text-brand-200">
            Patient ID <span className="font-mono text-white">{p.patient_code}</span>
            {me.data.last_login_at && <> · Last sign-in {formatDateTime(me.data.last_login_at)}</>}
          </p>
        </div>
      </header>

      <main className="mx-auto -mt-4 max-w-5xl space-y-6 px-4 pb-12">
        <div className="grid gap-4 md:grid-cols-3">
          <section className="card p-5 md:col-span-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-teal-600" /> Upcoming follow-up visits</h2>
            {followups.loading ? (
              <p className="mt-3 text-sm text-slate-500">Loading…</p>
            ) : followups.error ? (
              <ErrorState message={followups.error} onRetry={followups.reload} />
            ) : !upcoming.length ? (
              <p className="mt-3 text-sm text-slate-500">No follow-up visits scheduled.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {upcoming.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{formatDate(f.scheduled_date)}</p>
                      {f.checkup?.followup_instructions && <p className="text-xs text-slate-500">{f.checkup.followup_instructions}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {!f.is_overdue && <span className="text-xs text-slate-500">{f.days_until === 0 ? 'Today' : `In ${f.days_until} day${f.days_until === 1 ? '' : 's'}`}</span>}
                      <FollowupStatusBadge status={f.status} overdue={f.is_overdue} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><UserRound className="h-4 w-4 text-teal-600" /> My details</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ['Age / Gender', `${p.age} yrs / ${titleCase(p.gender)}`],
                ['Mobile', p.mobile_number],
                ['Address', [p.village, p.district, p.state].filter(Boolean).join(', ')],
                ['Allergies', p.allergies],
                ['Registered', formatDate(p.registration_date)],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="text-right font-medium text-slate-800">{v}</dd>
                  </div>
                ))}
            </dl>
            <p className="mt-4 text-xs text-slate-400">Something wrong? Please tell the hospital reception.</p>
          </section>
        </div>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">My eye examinations</h2>
          {checkups.loading ? (
            <PageLoader />
          ) : checkups.error ? (
            <div className="card"><ErrorState message={checkups.error} onRetry={checkups.reload} /></div>
          ) : !checkups.data.length ? (
            <div className="card"><EmptyState title="No examinations yet" message="Your eye check-ups will appear here after your visit." /></div>
          ) : (
            <div className="space-y-4">
              {checkups.data.map((c) => <CheckupCard key={c.id} c={c} onPdf={openPdf} />)}
            </div>
          )}
        </section>
      </main>

      <ChangePasswordModal
        open={forced || pwOpen}
        forced={forced}
        onClose={() => setPwOpen(false)}
        onDone={() => {
          setPwOpen(false);
          toast.success('Password changed');
          me.reload();
        }}
      />
    </div>
  );
}
