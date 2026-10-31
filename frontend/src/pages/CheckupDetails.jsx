import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown, FileText, Pencil, Printer } from 'lucide-react';
import { checkupService } from '../services/checkupService';
import { getErrorMessage } from '../services/api';
import { useAsync, useDocumentTitle } from '../hooks/useAsync';
import { useHospital } from '../hooks/useHospital';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { canEditCheckup } from '../utils/permissions';
import { calculateAge, formatDate, formatDateTime, formatPower, isoDate, titleCase } from '../utils/format';
import { ErrorState, PageLoader, Spinner } from '../components/common/Feedback';
import { FollowupStatusBadge } from '../components/common/Display';

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-3 gap-3 border-b border-slate-100 py-2 last:border-0 sm:grid-cols-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="col-span-2 whitespace-pre-line break-words text-sm text-slate-900 sm:col-span-3">{children || '—'}</dd>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="print-break mt-6">
      <h2 className="mb-2 border-b-2 border-brand-100 pb-1 text-xs font-bold uppercase tracking-wider text-brand-800">{title}</h2>
      {children}
    </section>
  );
}

export default function CheckupDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const hospital = useHospital();
  const [downloading, setDownloading] = useState(false);
  const { data: c, loading, error, reload } = useAsync(() => checkupService.get(id), [id]);
  useDocumentTitle(c ? `Check-up ${c.checkup_code}` : 'Check-up');

  if (loading) return <PageLoader />;
  if (error) return <div className="card"><ErrorState message={error} onRetry={reload} /></div>;

  const p = c.patient;
  const download = async () => {
    setDownloading(true);
    try {
      await checkupService.downloadPdf(c.id, c.checkup_code);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setDownloading(false);
    }
  };

  const eyeRows = [
    ['Unaided visual acuity', (s) => c[`${s}_eye_unaided_va`]],
    ['Corrected visual acuity', (s) => c[`${s}_eye_corrected_va`]],
    ['Sphere (D)', (s) => formatPower(c[`${s}_eye_sphere`])],
    ['Cylinder (D)', (s) => formatPower(c[`${s}_eye_cylinder`])],
    ['Axis', (s) => (c[`${s}_eye_axis`] !== null ? `${c[`${s}_eye_axis`]}°` : null)],
    ['Intraocular pressure', (s) => (c[`${s}_eye_iop`] !== null ? `${Number(c[`${s}_eye_iop`])} mmHg` : null)],
    ['Clinical findings', (s) => c[`${s}_eye_findings`]],
  ];

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to={`/patients/${p.id}?tab=history`} className="btn-ghost">
          <ArrowLeft className="h-4 w-4" /> Patient history
        </Link>
        <div className="flex flex-wrap gap-2">
          {canEditCheckup(user, c) && (
            <Link to={`/checkups/${c.id}/edit`} className="btn-secondary">
              <Pencil className="h-4 w-4" /> Edit
            </Link>
          )}
          <button type="button" className="btn-secondary" onClick={() => checkupService.openPdf(c.id).catch((e) => toast.error(getErrorMessage(e)))}>
            <FileText className="h-4 w-4" /> View PDF
          </button>
          <button type="button" className="btn-secondary" onClick={download} disabled={downloading}>
            {downloading ? <Spinner className="h-4 w-4" /> : <FileDown className="h-4 w-4" />} Download PDF
          </button>
          <button type="button" className="btn-primary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>
      </div>

      <article className="card print-area mx-auto max-w-4xl p-6 sm:p-10">
        <header className="border-b-2 border-brand-700 pb-4 text-center">
          <p className="text-xl font-bold text-brand-800">{hospital.hospital_name}</p>
          {(hospital.hospital_address || hospital.hospital_phone) && (
            <p className="mt-0.5 text-xs text-slate-600">{[hospital.hospital_address, hospital.hospital_phone].filter(Boolean).join(' | ')}</p>
          )}
          <p className="mt-3 inline-block rounded bg-brand-700 px-4 py-1 text-xs font-bold uppercase tracking-widest text-white">Eye Examination Report</p>
        </header>

        <div className="mt-5 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <p><span className="text-slate-500">Check-up ID:</span> <b className="font-mono">{c.checkup_code}</b></p>
          <p><span className="text-slate-500">Examination date:</span> <b>{formatDate(c.examination_date)}</b></p>
          <p><span className="text-slate-500">Visit type:</span> {titleCase(c.checkup_type)}</p>
          <p><span className="text-slate-500">Doctor:</span> {c.doctor.name}{c.doctor.designation ? `, ${c.doctor.designation}` : ''}</p>
        </div>

        <Section title="Patient details">
          <div className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
            <p><span className="text-slate-500">Patient ID:</span> <b className="font-mono">{p.patient_code}</b></p>
            <p><span className="text-slate-500">Name:</span> <b>{p.full_name}</b></p>
            <p><span className="text-slate-500">Age / Gender:</span> {calculateAge(p.date_of_birth, new Date(c.examination_date))} yrs / {titleCase(p.gender)}</p>
            <p><span className="text-slate-500">Mobile:</span> {p.mobile_number}</p>
            <p className="sm:col-span-2"><span className="text-slate-500">Address:</span> {p.address}, {p.village}, {p.district}, {p.state}</p>
            {p.allergies && <p className="sm:col-span-2 font-medium text-red-700">Allergies: {p.allergies}</p>}
          </div>
        </Section>

        <Section title="Presenting complaints">
          <dl>
            <Row label="Chief complaints">{c.chief_complaints}</Row>
            <Row label="Duration">{c.symptom_duration}</Row>
          </dl>
        </Section>

        <Section title="Eye examination">
          <div className="overflow-x-auto">
            <table className="min-w-full border border-slate-200 text-sm">
              <thead className="bg-brand-50">
                <tr>
                  <th className="border border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase text-slate-600">Measurement</th>
                  <th className="border border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase text-brand-800">Right eye (OD)</th>
                  <th className="border border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase text-teal-800">Left eye (OS)</th>
                </tr>
              </thead>
              <tbody>
                {eyeRows.map(([label, fn]) => (
                  <tr key={label}>
                    <td className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">{label}</td>
                    <td className="whitespace-pre-line border border-slate-200 px-3 py-2">{fn('right') || '—'}</td>
                    <td className="whitespace-pre-line border border-slate-200 px-3 py-2">{fn('left') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Clinical assessment">
          <dl>
            <Row label="Diagnosis"><b>{c.diagnosis}</b></Row>
            <Row label="Observations">{c.observations}</Row>
            <Row label="Recommended treatment">{c.recommended_treatment}</Row>
            <Row label="Prescription">{c.prescription}</Row>
            <Row label="Doctor's advice">{c.doctor_notes}</Row>
            <Row label="Referral">{c.referral_recommendation}</Row>
          </dl>
        </Section>

        <Section title="Follow-up">
          <dl>
            <Row label="Required">{c.followup_required ? 'Yes' : 'No'}</Row>
            {c.followup_required && <Row label="Follow-up date"><b>{formatDate(c.followup_date)}</b></Row>}
            {c.followup_instructions && <Row label="Instructions">{c.followup_instructions}</Row>}
            {c.followups.length > 0 && (
              <Row label="Status">
                <span className="flex flex-wrap gap-2">
                  {c.followups.map((f) => (
                    <span key={f.id} className="inline-flex items-center gap-1.5">
                      {formatDate(f.scheduled_date)} <FollowupStatusBadge status={f.status} overdue={f.status === 'pending' && f.scheduled_date < isoDate()} />
                    </span>
                  ))}
                </span>
              </Row>
            )}
          </dl>
        </Section>

        <div className="print-break mt-14 flex justify-end">
          <div className="w-64 text-center text-sm">
            <div className="h-14 border-b border-slate-400" />
            <p className="mt-2 font-semibold">Authorised Doctor's Signature</p>
            <p>{c.doctor.name}</p>
            {c.doctor.designation && <p className="text-xs text-slate-600">{c.doctor.designation}</p>}
            {c.doctor.registration_number && <p className="text-xs text-slate-600">Reg. No. {c.doctor.registration_number}</p>}
          </div>
        </div>
        <p className="mt-8 border-t border-slate-100 pt-3 text-center text-[11px] text-slate-400">
          Recorded {formatDateTime(c.created_at)}{c.updated_at !== c.created_at ? ` · last updated ${formatDateTime(c.updated_at)}` : ''} · Confidential medical record
        </p>
      </article>
    </>
  );
}
