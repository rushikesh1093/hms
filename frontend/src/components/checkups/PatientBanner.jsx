import { Link } from 'react-router-dom';
import { AlertTriangle, UserRound } from 'lucide-react';
import { titleCase } from '../../utils/format';

/** Compact patient identity strip shown on clinical forms and reports. */
export default function PatientBanner({ patient }) {
  if (!patient) return null;
  return (
    <div className="card flex flex-col gap-3 border-l-4 border-l-brand-600 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-brand-50 p-2.5">
          <UserRound className="h-5 w-5 text-brand-700" />
        </div>
        <div>
          <Link to={`/patients/${patient.id}`} className="text-base font-semibold hover:text-brand-700">
            {patient.full_name}
          </Link>
          <p className="text-sm text-slate-500">
            <span className="font-mono font-semibold text-brand-700">{patient.patient_code}</span> · {patient.age} yrs · {titleCase(patient.gender)} · {patient.mobile_number}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1 text-xs sm:items-end">
        {patient.allergies && (
          <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 font-medium text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" /> Allergies: {patient.allergies}
          </span>
        )}
        {patient.medical_history && <span className="text-slate-600">Conditions: {patient.medical_history}</span>}
        {patient.previous_eye_surgery && <span className="text-slate-600">Eye surgery: {patient.previous_eye_surgery}</span>}
      </div>
    </div>
  );
}
