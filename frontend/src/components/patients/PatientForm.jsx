import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { HeartPulse, MapPin, Save, UserRound, UsersRound } from 'lucide-react';
import { Field, FormSection, Input, Select, Textarea } from '../common/Form';
import { Alert, Spinner } from '../common/Feedback';
import { patientService } from '../../services/patientService';
import { useDebounce } from '../../hooks/useAsync';
import { GENDERS, calculateAge, formatDate, isoDate } from '../../utils/format';

const EMPTY = {
  full_name: '',
  date_of_birth: '',
  gender: '',
  mobile_number: '',
  alternate_phone: '',
  address: '',
  village: '',
  district: '',
  state: '',
  registration_date: isoDate(),
  emergency_contact: '',
  medical_history: '',
  allergies: '',
  previous_eye_problems: '',
  previous_eye_surgery: '',
  remarks: '',
};

const OPTIONAL = ['alternate_phone', 'emergency_contact', 'medical_history', 'allergies', 'previous_eye_problems', 'previous_eye_surgery', 'remarks'];

export function toPatientPayload(values) {
  const out = { ...values };
  Object.keys(out).forEach((k) => {
    if (typeof out[k] === 'string') out[k] = out[k].trim();
  });
  OPTIONAL.forEach((k) => {
    if (!out[k]) out[k] = null;
  });
  if (!out.registration_date) delete out.registration_date;
  return out;
}

export function patientToForm(p) {
  const v = { ...EMPTY };
  Object.keys(EMPTY).forEach((k) => {
    v[k] = p[k] ?? '';
  });
  return v;
}

const MOBILE_RE = /^(?:\+?91[\s-]?|0)?[6-9]\d{9}$/;

/** Shared create/edit form. `onSubmit(payload)` must return a promise. */
export default function PatientForm({ initial, patientId, onSubmit, submitLabel = 'Register Patient', serverErrorsRef }) {
  const today = isoDate();
  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: initial || EMPTY, mode: 'onBlur' });

  if (serverErrorsRef) serverErrorsRef.current = setError;

  const [name, dob, mobile] = watch(['full_name', 'date_of_birth', 'mobile_number']);
  const age = calculateAge(dob);
  const dupInput = useDebounce(`${name}|${dob}|${mobile}`, 600);
  const [dupes, setDupes] = useState([]);

  // Live lookup of possible existing registrations while the form is filled.
  useEffect(() => {
    const [n, d, m] = dupInput.split('|');
    const digits = m.replace(/\D/g, '');
    if (n.trim().length < 3 && digits.length < 10) {
      setDupes([]);
      return;
    }
    let active = true;
    patientService
      .checkDuplicates({
        full_name: n.trim() || '-',
        date_of_birth: d || null,
        mobile_number: digits.length >= 10 ? m : null,
        exclude_id: patientId || null,
      })
      .then((r) => active && setDupes(r))
      .catch(() => active && setDupes([]));
    return () => {
      active = false;
    };
  }, [dupInput, patientId]);

  const req = (label) => ({ required: `${label} is required`, validate: (v) => (v && v.trim() ? true : `${label} is required`) });

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(toPatientPayload(v)))} noValidate className="space-y-5">
      {dupes.length > 0 && (
        <Alert tone="warning" title="Possible existing registration">
          <p>Check these patients before creating a new record:</p>
          <ul className="mt-2 space-y-1">
            {dupes.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-2">
                <Link to={`/patients/${d.id}`} className="font-medium text-brand-700 underline" target="_blank" rel="noreferrer">
                  {d.patient_code}
                </Link>
                <span>
                  {d.full_name}, {d.age} yrs, {d.mobile_number}, {d.village} (registered {formatDate(d.registration_date)})
                </span>
                <span className="text-xs text-amber-700">· {d.match_reasons.join(', ')}</span>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <FormSection title="Personal details" icon={UserRound}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Full name" required error={errors.full_name?.message} className="sm:col-span-2" htmlFor="full_name">
            <Input id="full_name" autoComplete="off" error={errors.full_name} {...register('full_name', { ...req('Full name'), minLength: { value: 2, message: 'Name is too short' }, maxLength: { value: 150, message: 'Name is too long' } })} />
          </Field>
          <Field label="Date of birth" required error={errors.date_of_birth?.message} htmlFor="date_of_birth">
            <Input
              id="date_of_birth"
              type="date"
              max={today}
              error={errors.date_of_birth}
              {...register('date_of_birth', {
                required: 'Date of birth is required',
                validate: (v) => {
                  if (v > today) return 'Date of birth cannot be in the future';
                  if (calculateAge(v) > 130) return 'Please check the year of birth';
                  return true;
                },
              })}
            />
          </Field>
          <Field label="Age" hint="Calculated from date of birth" htmlFor="age">
            <Input id="age" value={age !== null && age >= 0 ? `${age} years` : ''} readOnly disabled />
          </Field>
          <Field label="Gender" required error={errors.gender?.message} htmlFor="gender">
            <Select id="gender" error={errors.gender} {...register('gender', { required: 'Gender is required' })}>
              <option value="">Select…</option>
              {GENDERS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Mobile number" required error={errors.mobile_number?.message} htmlFor="mobile_number">
            <Input
              id="mobile_number"
              inputMode="tel"
              placeholder="10-digit mobile"
              error={errors.mobile_number}
              {...register('mobile_number', {
                required: 'Mobile number is required',
                validate: (v) => MOBILE_RE.test(v.replace(/[\s()-]/g, '')) || 'Enter a valid 10-digit mobile number',
              })}
            />
          </Field>
          <Field label="Alternate phone" error={errors.alternate_phone?.message} htmlFor="alternate_phone">
            <Input
              id="alternate_phone"
              inputMode="tel"
              error={errors.alternate_phone}
              {...register('alternate_phone', { validate: (v) => !v || /^[+\d\s()-]{6,20}$/.test(v) || 'Enter a valid phone number' })}
            />
          </Field>
          <Field label="Registration date" required error={errors.registration_date?.message} htmlFor="registration_date">
            <Input
              id="registration_date"
              type="date"
              max={today}
              error={errors.registration_date}
              {...register('registration_date', {
                required: 'Registration date is required',
                validate: (v) => {
                  if (v > today) return 'Cannot be in the future';
                  if (dob && v < dob) return 'Must be on or after the date of birth';
                  return true;
                },
              })}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Address" icon={MapPin}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Address" required error={errors.address?.message} className="sm:col-span-2 lg:col-span-3" htmlFor="address">
            <Input id="address" placeholder="House / street / landmark" error={errors.address} {...register('address', req('Address'))} />
          </Field>
          <Field label="Village / City" required error={errors.village?.message} htmlFor="village">
            <Input id="village" error={errors.village} {...register('village', req('Village/City'))} />
          </Field>
          <Field label="District" required error={errors.district?.message} htmlFor="district">
            <Input id="district" error={errors.district} {...register('district', req('District'))} />
          </Field>
          <Field label="State" required error={errors.state?.message} htmlFor="state">
            <Input id="state" error={errors.state} {...register('state', req('State'))} />
          </Field>
          <Field label="Emergency contact" hint="Name and phone number" error={errors.emergency_contact?.message} className="sm:col-span-2 lg:col-span-3" htmlFor="emergency_contact">
            <Input id="emergency_contact" placeholder="e.g. Sunita Kumar (wife) 98XXXXXXXX" {...register('emergency_contact', { maxLength: { value: 150, message: 'Too long' } })} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Medical background" description="Optional. Recorded at registration as reported by the patient." icon={HeartPulse}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Existing medical conditions" htmlFor="medical_history">
            <Textarea id="medical_history" placeholder="e.g. Diabetes, hypertension" {...register('medical_history')} />
          </Field>
          <Field label="Allergies" htmlFor="allergies">
            <Textarea id="allergies" placeholder="Drug or other allergies" {...register('allergies')} />
          </Field>
          <Field label="Previous eye problems" htmlFor="previous_eye_problems">
            <Textarea id="previous_eye_problems" {...register('previous_eye_problems')} />
          </Field>
          <Field label="Previous eye surgery" htmlFor="previous_eye_surgery">
            <Textarea id="previous_eye_surgery" placeholder="Procedure, eye and year" {...register('previous_eye_surgery')} />
          </Field>
          <Field label="Additional remarks" className="sm:col-span-2" htmlFor="remarks">
            <Textarea id="remarks" {...register('remarks')} />
          </Field>
        </div>
      </FormSection>

      <div className="flex justify-end gap-2">
        <Link to={patientId ? `/patients/${patientId}` : '/patients'} className="btn-secondary">
          Cancel
        </Link>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? <Spinner className="h-4 w-4 text-white" /> : patientId ? <Save className="h-4 w-4" /> : <UsersRound className="h-4 w-4" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
