import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardPlus, Eye, FileDown, FilterX, Search } from 'lucide-react';
import { checkupService } from '../services/checkupService';
import { userService } from '../services/authService';
import { getErrorMessage } from '../services/api';
import { useAsync, useDebounce, useDocumentTitle } from '../hooks/useAsync';
import { useToast } from '../context/ToastContext';
import { Badge, PageHeader, Pagination } from '../components/common/Display';
import { EmptyState, ErrorState, TableSkeleton } from '../components/common/Feedback';
import { CHECKUP_TYPES, formatDate, titleCase } from '../utils/format';

const FILTERS = ['q', 'doctor_id', 'date_from', 'date_to', 'checkup_type', 'followup_required'];

export default function Checkups() {
  useDocumentTitle('Eye check-ups');
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const get = (k, d = '') => params.get(k) ?? d;
  const page = Number(get('page', '1')) || 1;
  const pageSize = Number(get('page_size', '20')) || 20;
  const [q, setQ] = useState(get('q'));
  const dq = useDebounce(q);
  const doctors = useAsync(() => userService.doctors(), []);

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

  const query = { page, page_size: pageSize, ...Object.fromEntries(FILTERS.map((k) => [k, get(k)])) };
  const { data, loading, error, reload } = useAsync(() => checkupService.list(query), [params.toString()]);
  const hasFilters = FILTERS.some((k) => get(k));

  return (
    <>
      <PageHeader
        icon={Eye}
        title="Eye check-ups"
        subtitle={data ? `${data.total.toLocaleString('en-IN')} examinations` : 'All recorded eye examinations'}
        actions={
          <Link to="/search" className="btn-teal">
            <ClipboardPlus className="h-4 w-4" /> New check-up
          </Link>
        }
      />
      <div className="card">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Check-up ID, patient, mobile, diagnosis" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search check-ups" />
          </div>
          <select className="input" value={get('doctor_id')} onChange={(e) => update({ doctor_id: e.target.value })} aria-label="Doctor">
            <option value="">All doctors</option>
            {(doctors.data || []).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select className="input" value={get('checkup_type')} onChange={(e) => update({ checkup_type: e.target.value })} aria-label="Check-up type">
            <option value="">All types</option>
            {CHECKUP_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select className="input" value={get('followup_required')} onChange={(e) => update({ followup_required: e.target.value })} aria-label="Follow-up">
            <option value="">Any follow-up</option>
            <option value="true">Follow-up advised</option>
            <option value="false">No follow-up</option>
          </select>
          <div className="flex items-center gap-2">
            <input type="date" className="input" value={get('date_from')} onChange={(e) => update({ date_from: e.target.value })} aria-label="From date" title="From" />
            <input type="date" className="input" value={get('date_to')} onChange={(e) => update({ date_to: e.target.value })} aria-label="To date" title="To" />
            {hasFilters && (
              <button type="button" className="btn-ghost shrink-0" title="Clear filters" onClick={() => { setQ(''); update(Object.fromEntries(FILTERS.map((k) => [k, '']))); }}>
                <FilterX className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <TableSkeleton cols={6} />
        ) : !data?.items.length ? (
          <EmptyState icon={Eye} title={hasFilters ? 'No check-ups match these filters' : 'No check-ups recorded yet'} message="Search for a patient to record a new examination." />
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Check-up ID</th>
                  <th className="th">Date</th>
                  <th className="th">Patient</th>
                  <th className="th">Type</th>
                  <th className="th">Diagnosis</th>
                  <th className="th">Doctor</th>
                  <th className="th">Follow-up</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {data.items.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="td font-mono text-xs font-semibold text-brand-700"><Link to={`/checkups/${c.id}`}>{c.checkup_code}</Link></td>
                    <td className="td">{formatDate(c.examination_date)}</td>
                    <td className="td">
                      <Link to={`/patients/${c.patient.id}`} className="font-medium text-slate-900 hover:text-brand-700">{c.patient.full_name}</Link>
                      <p className="font-mono text-xs text-slate-500">{c.patient.patient_code}</p>
                    </td>
                    <td className="td"><Badge tone="blue">{titleCase(c.checkup_type)}</Badge></td>
                    <td className="td max-w-xs truncate" title={c.diagnosis}>{c.diagnosis}</td>
                    <td className="td">{c.doctor.name}</td>
                    <td className="td">{c.followup_required ? formatDate(c.followup_date) : <span className="text-slate-400">—</span>}</td>
                    <td className="td">
                      <div className="flex justify-end gap-0.5">
                        <Link to={`/checkups/${c.id}`} className="btn-ghost" title="Open report" aria-label="Open report"><Eye className="h-4 w-4" /></Link>
                        <button type="button" className="btn-ghost" title="Download PDF" aria-label="Download PDF" onClick={() => checkupService.downloadPdf(c.id, c.checkup_code).catch((e) => toast.error(getErrorMessage(e)))}>
                          <FileDown className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={pageSize} onPageChange={(p) => update({ page: p }, false)} onPageSizeChange={(s) => update({ page_size: s })} />}
      </div>
    </>
  );
}
