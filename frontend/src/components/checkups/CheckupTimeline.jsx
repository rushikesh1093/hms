import { Link } from 'react-router-dom';
import { CalendarClock, FileDown, Stethoscope } from 'lucide-react';
import { Badge } from '../common/Display';
import { checkupService } from '../../services/checkupService';
import { formatDate, titleCase } from '../../utils/format';

export function CheckupTimeline({ checkups, onPdfError }) {
  return (
    <ol className="relative space-y-5 border-l-2 border-brand-100 pl-6">
      {checkups.map((c) => (
        <li key={c.id} className="print-break relative">
          <span className="absolute -left-[33px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-brand-600 ring-2 ring-brand-100" />
          <div className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{formatDate(c.examination_date)}</span>
                <Link to={`/checkups/${c.id}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                  {c.checkup_code}
                </Link>
                <Badge tone="blue">{titleCase(c.checkup_type)}</Badge>
              </div>
              <div className="no-print flex gap-1">
                <Link to={`/checkups/${c.id}`} className="btn-secondary btn-sm">Open</Link>
                <button type="button" className="btn-secondary btn-sm" onClick={() => checkupService.openPdf(c.id).catch(onPdfError)}>
                  <FileDown className="h-3.5 w-3.5" /> PDF
                </button>
              </div>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <Stethoscope className="h-3.5 w-3.5" /> {c.doctor.name}
            </p>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Chief complaints</p>
                <p className="mt-0.5">{c.chief_complaints}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Diagnosis</p>
                <p className="mt-0.5 font-medium text-slate-900">{c.diagnosis}</p>
              </div>
              {(c.right_eye_findings || c.left_eye_findings) && (
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium uppercase text-slate-500">Examination findings</p>
                  <p className="mt-0.5">
                    {c.right_eye_findings && <span><b>OD:</b> {c.right_eye_findings} </span>}
                    {c.left_eye_findings && <span><b>OS:</b> {c.left_eye_findings}</span>}
                  </p>
                </div>
              )}
              <div className="sm:col-span-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
                <span>VA OD {c.right_eye_unaided_va || '—'} / OS {c.left_eye_unaided_va || '—'}</span>
                {c.followup_required && (
                  <span className="flex items-center gap-1 text-amber-700">
                    <CalendarClock className="h-3.5 w-3.5" /> Follow-up {formatDate(c.followup_date)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function MedicalHistory({ checkups, followups }) {
  return (
    <div className="space-y-6">
      <div className="card overflow-x-auto">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold">Diagnoses, prescriptions and doctor remarks</h3>
        </div>
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Date</th>
              <th className="th">Check-up</th>
              <th className="th">Diagnosis</th>
              <th className="th">Prescription / Treatment</th>
              <th className="th">Doctor remarks</th>
              <th className="th">Doctor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {checkups.map((c) => (
              <tr key={c.id} className="align-top">
                <td className="td">{formatDate(c.examination_date)}</td>
                <td className="td font-mono text-xs">
                  <Link className="text-brand-700 hover:underline" to={`/checkups/${c.id}`}>{c.checkup_code}</Link>
                </td>
                <td className="td whitespace-normal font-medium">{c.diagnosis}</td>
                <td className="td min-w-48 whitespace-normal">{[c.prescription, c.recommended_treatment].filter(Boolean).join(' · ') || '—'}</td>
                <td className="td min-w-48 whitespace-normal">{[c.doctor_notes, c.observations].filter(Boolean).join(' · ') || '—'}</td>
                <td className="td">{c.doctor.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FollowupHistory followups={followups} />
    </div>
  );
}

export function FollowupHistory({ followups }) {
  return (
    <div className="card overflow-x-auto">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-semibold">Follow-up history</h3>
      </div>
      {!followups.length ? (
        <p className="px-4 py-6 text-sm text-slate-500">No follow-ups scheduled.</p>
      ) : (
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="th">Scheduled</th>
              <th className="th">Status</th>
              <th className="th">From check-up</th>
              <th className="th">Notes</th>
              <th className="th">Completed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {followups.map((f) => (
              <tr key={f.id} className="align-top">
                <td className="td">{formatDate(f.scheduled_date)}</td>
                <td className="td">
                  <FollowupBadge f={f} />
                </td>
                <td className="td font-mono text-xs">{f.checkup?.checkup_code || '—'}</td>
                <td className="td min-w-48 whitespace-normal">{f.notes || '—'}</td>
                <td className="td">{f.completed_at ? `${formatDate(f.completed_at.slice(0, 10))}${f.completer ? ` by ${f.completer.name}` : ''}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function FollowupBadge({ f }) {
  if (f.status === 'pending' && f.is_overdue) return <Badge tone="red">Overdue</Badge>;
  const tones = { pending: 'amber', completed: 'green', missed: 'red', cancelled: 'slate' };
  return <Badge tone={tones[f.status]}>{titleCase(f.status)}</Badge>;
}
