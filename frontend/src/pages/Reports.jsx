import { useState } from 'react';
import { BarChart3, FileDown, FileSpreadsheet, FileText, Play, Printer } from 'lucide-react';
import { reportService } from '../services/reportService';
import { userService } from '../services/authService';
import { getErrorMessage } from '../services/api';
import { useAsync, useDocumentTitle } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { PageHeader } from '../components/common/Display';
import { Alert, EmptyState, ErrorState, Spinner, TableSkeleton } from '../components/common/Feedback';
import { Field, Input, Select } from '../components/common/Form';
import PrintHeader from '../components/common/PrintHeader';
import ReportTable from '../components/reports/ReportTable';
import { CHECKUP_TYPES, GENDERS, addDays, formatDate, isoDate } from '../utils/format';

export const REPORT_TYPES = [
  { value: 'daily', label: 'Daily patient report', range: () => [isoDate(), isoDate()] },
  { value: 'weekly', label: 'Weekly patient report', range: () => [addDays(isoDate(), -6), isoDate()] },
  { value: 'monthly', label: 'Monthly patient report', range: () => [isoDate().slice(0, 8) + '01', isoDate()] },
  { value: 'registrations', label: 'Patient registration report', range: () => [addDays(isoDate(), -29), isoDate()] },
  { value: 'examinations', label: 'Eye examination report', range: () => [addDays(isoDate(), -29), isoDate()] },
  { value: 'doctor_wise', label: 'Doctor-wise report', range: () => [addDays(isoDate(), -29), isoDate()] },
  { value: 'followup_pending', label: 'Follow-up pending report', range: () => ['', addDays(isoDate(), 30)] },
  { value: 'repeat_patients', label: 'Repeat patient report', range: () => [addDays(isoDate(), -89), isoDate()] },
];

// Which filters apply to which report.
const USES = {
  doctor: ['daily', 'weekly', 'monthly', 'examinations', 'doctor_wise', 'followup_pending', 'repeat_patients'],
  checkup_type: ['daily', 'weekly', 'monthly', 'examinations', 'doctor_wise', 'repeat_patients'],
};

function initialFilters(type) {
  const [start, end] = REPORT_TYPES.find((r) => r.value === type).range();
  return { report_type: type, start_date: start, end_date: end, doctor_id: '', gender: '', patient_code: '', checkup_type: '' };
}

export default function Reports() {
  useDocumentTitle('Summary reports');
  const toast = useToast();
  const [filters, setFilters] = useState(() => initialFilters('daily'));
  const [applied, setApplied] = useState(filters);
  const [exporting, setExporting] = useState(null);
  const doctors = useAsync(() => userService.doctors(), []);
  const { data: report, loading, error, reload } = useAsync(() => reportService.generate(applied), [JSON.stringify(applied)]);

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const changeType = (e) => {
    const next = { ...initialFilters(e.target.value), doctor_id: filters.doctor_id, gender: filters.gender, patient_code: filters.patient_code };
    setFilters(next);
    setApplied(next);
  };
  const rangeError = filters.start_date && filters.end_date && filters.start_date > filters.end_date ? 'Start date must be before end date' : null;
  const params = (f) => ({
    ...f,
    doctor_id: USES.doctor.includes(f.report_type) ? f.doctor_id : '',
    checkup_type: USES.checkup_type.includes(f.report_type) ? f.checkup_type : '',
  });

  const doExport = async (format) => {
    setExporting(format);
    try {
      await reportService.export(format, params(applied));
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch (e) {
      toast.error(getErrorMessage(e, 'Export failed'));
    } finally {
      setExporting(null);
    }
  };

  const ExportBtn = ({ format, icon: Icon, label }) => (
    <button type="button" className="btn-secondary" onClick={() => doExport(format)} disabled={!!exporting || !report}>
      {exporting === format ? <Spinner className="h-4 w-4" /> : <Icon className="h-4 w-4" />} {label}
    </button>
  );

  return (
    <>
      <PageHeader
        icon={BarChart3}
        title="Summary reports"
        subtitle="Generated from live hospital records. Exports are logged in the audit trail."
        actions={
          <>
            <ExportBtn format="pdf" icon={FileText} label="PDF" />
            <ExportBtn format="excel" icon={FileSpreadsheet} label="Excel" />
            <ExportBtn format="csv" icon={FileDown} label="CSV" />
            <button type="button" className="btn-primary" onClick={() => window.print()} disabled={!report}>
              <Printer className="h-4 w-4" /> Print
            </button>
          </>
        }
      />

      <form
        className="card no-print mb-5 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7"
        onSubmit={(e) => {
          e.preventDefault();
          if (!rangeError) setApplied(params(filters));
        }}
      >
        <Field label="Report" className="sm:col-span-2 lg:col-span-2 xl:col-span-2">
          <Select value={filters.report_type} onChange={changeType} aria-label="Report type">
            {REPORT_TYPES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Start date" error={rangeError}>
          <Input type="date" value={filters.start_date} onChange={set('start_date')} error={rangeError} aria-label="Start date" />
        </Field>
        <Field label="End date">
          <Input type="date" value={filters.end_date} onChange={set('end_date')} aria-label="End date" />
        </Field>
        <Field label="Doctor">
          <Select value={filters.doctor_id} onChange={set('doctor_id')} disabled={!USES.doctor.includes(filters.report_type)} aria-label="Doctor">
            <option value="">All doctors</option>
            {(doctors.data || []).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Gender">
          <Select value={filters.gender} onChange={set('gender')} aria-label="Gender">
            <option value="">All</option>
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Patient ID">
          <Input value={filters.patient_code} onChange={set('patient_code')} placeholder="PT…" aria-label="Patient ID" />
        </Field>
        <Field label="Check-up type" className="xl:col-span-2">
          <Select value={filters.checkup_type} onChange={set('checkup_type')} disabled={!USES.checkup_type.includes(filters.report_type)} aria-label="Check-up type">
            <option value="">All types</option>
            {CHECKUP_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end sm:col-span-2 lg:col-span-4 xl:col-span-5 xl:justify-end">
          <button type="submit" className="btn-primary" disabled={!!rangeError || loading}>
            {loading ? <Spinner className="h-4 w-4 text-white" /> : <Play className="h-4 w-4" />} Generate report
          </button>
        </div>
      </form>

      <div className="card print-area">
        <PrintHeader />
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !report ? (
          <TableSkeleton cols={7} />
        ) : report ? (
          <>
            <div className="border-b border-slate-100 p-4">
              <h2 className="text-base font-semibold">{report.title}</h2>
              <p className="text-sm text-slate-500">
                {formatDate(report.start_date)} to {formatDate(report.end_date)}
                {Object.entries(report.filters).map(([k, v]) => ` · ${k}: ${v}`).join('')}
              </p>
              {report.summary.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {report.summary.map((s) => (
                    <div key={s.label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-xs text-slate-500">{s.label}</p>
                      <p className="text-lg font-semibold">{s.value.toLocaleString('en-IN')}</p>
                    </div>
                  ))}
                </div>
              )}
              {report.truncated && <div className="mt-3"><Alert tone="warning">Showing the first {report.total_rows.toLocaleString('en-IN')} rows. Narrow the date range to see all.</Alert></div>}
            </div>
            <div className={loading ? 'opacity-60' : ''}>
              {report.rows.length ? <ReportTable report={report} /> : <EmptyState title="No records for these filters" message="Adjust the date range or filters and generate again." />}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
