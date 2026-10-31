import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CalendarClock, ClipboardCheck, ClipboardList, Search, Stethoscope } from 'lucide-react';
import { checkupService } from '../services/checkupService';
import { patientService } from '../services/patientService';
import { userService } from '../services/authService';
import { applyFieldErrors, getErrorMessage } from '../services/api';
import { useAsync, useDebounce, useDocumentTitle } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { canEditCheckup } from '../utils/permissions';
import { CHECKUP_TYPES, addDays, formatDate, formatPower, isoDate, newSubmissionId } from '../utils/format';
import { PageHeader } from '../components/common/Display';
import { Alert, EmptyState, ErrorState, PageLoader, Spinner } from '../components/common/Feedback';
import { Field, FormSection, Input, Select, Textarea } from '../components/common/Form';
import { ConfirmDialog } from '../components/common/Modal';
import EyeSection from '../components/checkups/EyeSection';
import PatientBanner from '../components/checkups/PatientBanner';

const EYE_KEYS = ['unaided_va', 'corrected_va', 'sphere', 'cylinder', 'axis', 'iop', 'findings'];
const NUMERIC = new Set(['sphere', 'cylinder', 'axis', 'iop']);
const TEXT_FIELDS = ['symptom_duration', 'observations', 'doctor_notes', 'recommended_treatment', 'prescription', 'referral_recommendation', 'followup_instructions'];

function emptyForm() {
  const v = {
    examination_date: isoDate(),
    checkup_type: 'new',
    doctor_id: '',
    chief_complaints: '',
    symptom_duration: '',
    diagnosis: '',
    observations: '',
    doctor_notes: '',
    recommended_treatment: '',
    prescription: '',
    referral_recommendation: '',
    followup_required: 'no',
    followup_date: '',
    followup_instructions: '',
  };
  ['right', 'left'].forEach((s) => EYE_KEYS.forEach((k) => (v[`${s}_eye_${k}`] = '')));
  return v;
}

function checkupToForm(c) {
  const v = emptyForm();
  Object.keys(v).forEach((k) => {
    if (k in c && c[k] !== null) v[k] = String(c[k]);
  });
  v.followup_required = c.followup_required ? 'yes' : 'no';
  v.doctor_id = String(c.doctor_id);
  ['right', 'left'].forEach((s) =>
    ['sphere', 'cylinder', 'iop'].forEach((k) => {
      const val = c[`${s}_eye_${k}`];
      if (val !== null && val !== undefined) v[`${s}_eye_${k}`] = String(Number(val));
    }),
  );
  return v;
}

function toPayload(v) {
  const out = {
    examination_date: v.examination_date,
    checkup_type: v.checkup_type,
    chief_complaints: v.chief_complaints.trim(),
    diagnosis: v.diagnosis.trim(),
    followup_required: v.followup_required === 'yes',
    followup_date: v.followup_required === 'yes' ? v.followup_date || null : null,
  };
  TEXT_FIELDS.forEach((k) => (out[k] = v[k]?.trim() ? v[k].trim() : null));
  ['right', 'left'].forEach((s) =>
    EYE_KEYS.forEach((k) => {
      const key = `${s}_eye_${k}`;
      const raw = typeof v[key] === 'string' ? v[key].trim() : v[key];
      if (raw === '' || raw === undefined || raw === null) out[key] = null;
      else if (NUMERIC.has(k)) out[key] = Number(raw);
      else if (k.endsWith('_va')) out[key] = raw.toUpperCase();
      else out[key] = raw;
    }),
  );
  if (v.doctor_id) out.doctor_id = Number(v.doctor_id);
  return out;
}

function PatientPicker() {
  const [q, setQ] = useState('');
  const dq = useDebounce(q.trim(), 350);
  const navigate = useNavigate();
  const res = useAsync(() => patientService.search(dq), [dq], { enabled: dq.length >= 2 });
  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold">Select the patient</h2>
      <p className="mt-1 text-sm text-slate-500">A check-up must be linked to a registered patient.</p>
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input autoFocus className="input pl-9" placeholder="Patient ID, name or mobile number" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find patient" />
      </div>
      <ul className="mt-3 divide-y divide-slate-100">
        {res.loading && dq.length >= 2 && <li className="py-3 text-sm text-slate-500"><Spinner className="mr-2 inline h-4 w-4" />Searching…</li>}
        {!res.loading && dq.length >= 2 && res.data?.patients.length === 0 && <li className="py-3 text-sm text-slate-500">No matching patients.</li>}
        {(dq.length >= 2 ? res.data?.patients || [] : []).map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => navigate(`/checkups/new?patient=${p.id}`)} className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-slate-50">
              <span>
                <span className="font-medium">{p.full_name}</span>{' '}
                <span className="font-mono text-xs text-brand-700">{p.patient_code}</span>
                <span className="block text-xs text-slate-500">{p.age} yrs · {p.mobile_number} · {p.village}</span>
              </span>
              <span className="btn-teal btn-sm">Select</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AddCheckup() {
  const { id } = useParams();
  const editing = Boolean(id);
  const [params] = useSearchParams();
  const patientId = params.get('patient');
  useDocumentTitle(editing ? 'Edit check-up' : 'New eye check-up');

  const existing = useAsync(() => checkupService.get(id), [id], { enabled: editing });
  const patient = useAsync(() => patientService.get(patientId), [patientId], { enabled: !editing && !!patientId });

  if (!editing && !patientId) {
    return (
      <>
        <PageHeader icon={ClipboardList} title="New eye check-up" subtitle="Find the patient to examine." />
        <PatientPicker />
      </>
    );
  }
  const loading = editing ? existing.loading : patient.loading;
  const error = editing ? existing.error : patient.error;
  const reload = editing ? existing.reload : patient.reload;
  if (loading) return <PageLoader />;
  if (error) return <div className="card"><ErrorState message={error} onRetry={reload} /></div>;
  const p = editing ? existing.data.patient : patient.data;
  if (!p.is_active) return <div className="card"><EmptyState title="Patient record is deactivated" message="Restore the record before adding a check-up." /></div>;
  return <CheckupForm key={id || patientId} patient={p} existing={editing ? existing.data : null} />;
}

function CheckupForm({ patient, existing }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const isAdmin = user.role === 'admin';
  const doctors = useAsync(() => userService.doctors(), [], { enabled: isAdmin });
  const submissionId = useRef(newSubmissionId());
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);
  const today = isoDate();

  const defaults = useMemo(() => (existing ? checkupToForm(existing) : emptyForm()), [existing]);
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm({ defaultValues: defaults, mode: 'onBlur' });

  const followup = watch('followup_required') === 'yes';
  const examDate = watch('examination_date');
  const allowed = !existing || canEditCheckup(user, existing);

  const onValid = (values) => setPending(values);

  const save = async () => {
    setSaving(true);
    try {
      const payload = toPayload(pending);
      const saved = existing
        ? await checkupService.update(existing.id, payload)
        : await checkupService.create({ ...payload, patient_id: patient.id, submission_id: submissionId.current });
      toast.success(existing ? 'Check-up updated' : `Check-up ${saved.checkup_code} saved`);
      navigate(`/checkups/${saved.id}`, { replace: true });
    } catch (e) {
      setPending(null);
      if (applyFieldErrors(e, setError)) toast.error('Please correct the highlighted fields.');
      else toast.error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) {
    return <div className="card"><EmptyState title="Editing not permitted" message="Only the examining doctor or an administrator can edit this check-up." /></div>;
  }

  return (
    <>
      <PageHeader
        icon={ClipboardList}
        title={existing ? `Edit check-up ${existing.checkup_code}` : 'New eye check-up'}
        subtitle={existing ? `Examined ${formatDate(existing.examination_date)} by ${existing.doctor.name}. Changes are recorded in the audit log.` : 'All clinical assessments are entered by the examining doctor.'}
      />
      <div className="mb-5">
        <PatientBanner patient={patient} />
      </div>

      <form onSubmit={handleSubmit(onValid, () => toast.error('Please correct the highlighted fields.'))} noValidate className="space-y-5">
        <FormSection title="General information" icon={Stethoscope}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Check-up ID" hint={existing ? undefined : 'Generated on save'}>
              <Input value={existing?.checkup_code || 'Auto-generated'} disabled readOnly />
            </Field>
            <Field label="Examination date" required error={errors.examination_date?.message} htmlFor="examination_date">
              <Input
                id="examination_date"
                type="date"
                max={today}
                min={patient.registration_date}
                error={errors.examination_date}
                {...register('examination_date', {
                  required: 'Examination date is required',
                  validate: (v) => {
                    if (v > today) return 'Cannot be in the future';
                    if (patient.registration_date && v < patient.registration_date) return 'Cannot be before registration';
                    return true;
                  },
                })}
              />
            </Field>
            <Field label="Doctor" required error={errors.doctor_id?.message} htmlFor="doctor_id">
              {isAdmin ? (
                <Select id="doctor_id" error={errors.doctor_id} {...register('doctor_id', { required: 'Select the examining doctor' })}>
                  <option value="">Select doctor…</option>
                  {(doctors.data || []).map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </Select>
              ) : (
                <Input id="doctor_id" value={existing?.doctor?.name || user.name} disabled readOnly />
              )}
            </Field>
            <Field label="Visit type" htmlFor="checkup_type">
              <Select id="checkup_type" {...register('checkup_type')}>
                {CHECKUP_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Chief complaints" required error={errors.chief_complaints?.message} className="sm:col-span-2 lg:col-span-3" htmlFor="chief_complaints">
              <Textarea id="chief_complaints" rows={2} error={errors.chief_complaints} {...register('chief_complaints', { validate: (v) => !!v.trim() || 'Chief complaints are required' })} />
            </Field>
            <Field label="Duration of symptoms" htmlFor="symptom_duration">
              <Input id="symptom_duration" placeholder="e.g. 2 weeks" {...register('symptom_duration', { maxLength: { value: 100, message: 'Too long' } })} />
            </Field>
          </div>
        </FormSection>

        <div className="grid gap-5 lg:grid-cols-2">
          <EyeSection side="right" register={register} errors={errors} watch={watch} />
          <EyeSection side="left" register={register} errors={errors} watch={watch} />
        </div>

        <FormSection title="Clinical assessment" description="Entered and approved by the examining doctor." icon={ClipboardCheck}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Diagnosis" required error={errors.diagnosis?.message} className="sm:col-span-2" htmlFor="diagnosis">
              <Textarea id="diagnosis" rows={2} error={errors.diagnosis} {...register('diagnosis', { validate: (v) => !!v.trim() || 'Diagnosis is required' })} />
            </Field>
            <Field label="Observations" htmlFor="observations"><Textarea id="observations" {...register('observations')} /></Field>
            <Field label="Doctor's notes / advice" htmlFor="doctor_notes"><Textarea id="doctor_notes" {...register('doctor_notes')} /></Field>
            <Field label="Recommended treatment" htmlFor="recommended_treatment"><Textarea id="recommended_treatment" {...register('recommended_treatment')} /></Field>
            <Field label="Prescription" htmlFor="prescription"><Textarea id="prescription" placeholder="Medication, dosage, spectacles…" {...register('prescription')} /></Field>
            <Field label="Referral recommendation" hint="Optional" className="sm:col-span-2" htmlFor="referral_recommendation">
              <Input id="referral_recommendation" {...register('referral_recommendation')} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Follow-up" icon={CalendarClock}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Follow-up required">
              <div className="flex gap-4 pt-2" role="radiogroup">
                {['yes', 'no'].map((v) => (
                  <label key={v} className="inline-flex items-center gap-2 text-sm">
                    <input type="radio" value={v} className="h-4 w-4 accent-brand-700" {...register('followup_required')} /> {v === 'yes' ? 'Yes' : 'No'}
                  </label>
                ))}
              </div>
            </Field>
            {followup && (
              <>
                <Field label="Recommended follow-up date" required error={errors.followup_date?.message} htmlFor="followup_date">
                  <Input
                    id="followup_date"
                    type="date"
                    min={examDate ? addDays(examDate, 1) : undefined}
                    error={errors.followup_date}
                    {...register('followup_date', {
                      validate: (v) => {
                        if (watch('followup_required') !== 'yes') return true;
                        if (!v) return 'Follow-up date is required';
                        if (examDate && v <= examDate) return 'Must be after the examination date';
                        return true;
                      },
                    })}
                  />
                </Field>
                <Field label="Follow-up instructions" className="sm:col-span-3" htmlFor="followup_instructions">
                  <Textarea id="followup_instructions" rows={2} {...register('followup_instructions')} />
                </Field>
              </>
            )}
          </div>
        </FormSection>

        <div className="flex justify-end gap-2 pb-6">
          <Link to={existing ? `/checkups/${existing.id}` : `/patients/${patient.id}`} className="btn-secondary">Cancel</Link>
          <button type="submit" className="btn-teal" disabled={saving}>
            <ClipboardCheck className="h-4 w-4" /> {existing ? 'Review & save changes' : 'Review & save check-up'}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={!!pending}
        title={existing ? 'Save changes to this check-up?' : 'Save this eye check-up?'}
        confirmLabel={existing ? 'Save changes' : 'Save check-up'}
        busy={saving}
        onCancel={() => setPending(null)}
        onConfirm={save}
      >
        {pending && (
          <div className="space-y-2">
            <p>
              <b>{patient.full_name}</b> ({patient.patient_code}) · {formatDate(pending.examination_date)}
            </p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1" />
                  <th>VA (U/C)</th>
                  <th>Sph</th>
                  <th>Cyl × Axis</th>
                  <th>IOP</th>
                </tr>
              </thead>
              <tbody>
                {['right', 'left'].map((s) => (
                  <tr key={s}>
                    <td className="py-1 font-semibold">{s === 'right' ? 'OD' : 'OS'}</td>
                    <td>{pending[`${s}_eye_unaided_va`] || '—'} / {pending[`${s}_eye_corrected_va`] || '—'}</td>
                    <td>{formatPower(pending[`${s}_eye_sphere`])}</td>
                    <td>{formatPower(pending[`${s}_eye_cylinder`])}{pending[`${s}_eye_axis`] ? ` × ${pending[`${s}_eye_axis`]}°` : ''}</td>
                    <td>{pending[`${s}_eye_iop`] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p><span className="text-slate-500">Diagnosis:</span> {pending.diagnosis}</p>
            <p><span className="text-slate-500">Follow-up:</span> {pending.followup_required === 'yes' ? formatDate(pending.followup_date) : 'Not required'}</p>
            {!existing && <Alert tone="info">The record is saved once. Submitting again will not create a duplicate.</Alert>}
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}
