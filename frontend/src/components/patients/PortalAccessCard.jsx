import { useState } from 'react';
import { Copy, KeyRound, ShieldOff, Smartphone, WandSparkles } from 'lucide-react';
import { patientService } from '../../services/patientService';
import { getErrorMessage } from '../../services/api';
import { useAsync } from '../../hooks/useAsync';
import { useToast } from '../../context/ToastContext';
import { Badge } from '../common/Display';
import { Alert, Skeleton, Spinner } from '../common/Feedback';
import { ConfirmDialog, Modal } from '../common/Modal';
import { formatDateTime } from '../../utils/format';

/** A temporary password meeting the API rules (upper, lower, digit, 8+), avoiding look-alike characters. */
function generatePassword() {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (set, n) => {
    const buf = new Uint32Array(n);
    crypto.getRandomValues(buf);
    return Array.from(buf, (x) => set[x % set.length]).join('');
  };
  return `${pick(upper, 3)}${pick(lower, 3)}${pick(digits, 3)}`;
}

/** Staff card on the patient page: enable, reset or disable the patient's portal login. */
export default function PortalAccessCard({ patient }) {
  const toast = useToast();
  const access = useAsync(() => patientService.portalAccess(patient.id), [patient.id]);
  const [open, setOpen] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [password, setPassword] = useState('');
  const [issued, setIssued] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const a = access.data;

  const start = () => {
    setPassword(generatePassword());
    setIssued(null);
    setError(null);
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const status = await patientService.setPortalPassword(patient.id, password);
      access.setData(status);
      setIssued(password);
      toast.success(a?.exists ? 'Patient password reset' : 'Patient login enabled');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      access.setData(await patientService.disablePortal(patient.id));
      toast.success('Patient login disabled');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
      setConfirmDisable(false);
    }
  };

  const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast.success('Copied'));

  return (
    <section className="card no-print p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Smartphone className="h-4 w-4 text-teal-600" /> Patient portal login
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Lets the patient see their own eye reports and follow-up dates online at <span className="font-mono">/portal</span>.
          </p>
        </div>
        {access.loading ? (
          <Skeleton className="h-6 w-24" />
        ) : a?.enabled ? (
          <Badge tone="green">Enabled</Badge>
        ) : (
          <Badge tone="slate">{a?.exists ? 'Disabled' : 'Not set up'}</Badge>
        )}
      </div>

      {access.error && <div className="mt-3"><Alert tone="error">{access.error}</Alert></div>}

      {a && (
        <>
          {a.enabled && (
            <p className="mt-3 text-xs text-slate-500">
              Patient ID for sign-in: <span className="font-mono font-semibold text-slate-700">{a.patient_code}</span>
              {' · '}
              {a.last_login_at ? `Last signed in ${formatDateTime(a.last_login_at)}` : 'Has not signed in yet'}
              {a.must_change_password && ' · Will be asked to set a new password'}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {patient.is_active && (
              <button type="button" className="btn-teal btn-sm" onClick={start}>
                <KeyRound className="h-3.5 w-3.5" /> {a.enabled ? 'Reset password' : 'Enable login'}
              </button>
            )}
            {a.enabled && (
              <button type="button" className="btn-secondary btn-sm" onClick={() => setConfirmDisable(true)}>
                <ShieldOff className="h-3.5 w-3.5" /> Disable login
              </button>
            )}
          </div>
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={issued ? 'Give these details to the patient' : a?.exists ? 'Reset patient password' : 'Enable patient login'}>
        {issued ? (
          <div className="space-y-4">
            <Alert tone="success">The patient can now sign in. They will be asked to choose their own password the first time.</Alert>
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              {[
                ['Website', `${window.location.origin}/portal`],
                ['Patient ID', a?.patient_code],
                ['Temporary password', issued],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">{k}</span>
                  <span className="flex items-center gap-2 font-mono font-semibold text-slate-800">
                    {v}
                    <button type="button" className="btn-ghost p-1" onClick={() => copy(v)} aria-label={`Copy ${k}`}>
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">This password is shown only once. Write it on the patient's card or tell them in person.</p>
            <div className="flex justify-end">
              <button type="button" className="btn-primary" onClick={() => setOpen(false)}>Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={save} className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <p className="text-sm text-slate-600">
              {patient.full_name} will sign in with patient ID <span className="font-mono font-semibold">{patient.patient_code}</span> and this temporary password.
            </p>
            <div>
              <label className="label" htmlFor="portal-temp-pw">Temporary password</label>
              <div className="flex gap-2">
                <input id="portal-temp-pw" className="input font-mono" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" className="btn-secondary" onClick={() => setPassword(generatePassword())} title="Generate a new one">
                  <WandSparkles className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">At least 8 characters with upper-case, lower-case letters and a number.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="btn-teal" disabled={busy}>
                {busy && <Spinner className="h-4 w-4 text-white" />} {a?.exists ? 'Reset password' : 'Enable login'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDisable}
        tone="danger"
        title="Disable patient login?"
        confirmLabel="Disable"
        busy={busy}
        onCancel={() => setConfirmDisable(false)}
        onConfirm={disable}
        message={`${patient.full_name} will no longer be able to sign in to the patient portal. You can enable it again at any time.`}
      />
    </section>
  );
}
