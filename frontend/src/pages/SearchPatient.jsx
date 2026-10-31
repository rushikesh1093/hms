import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardPlus, Eye, FileSearch, Search } from 'lucide-react';
import { patientService } from '../services/patientService';
import { useAsync, useDebounce, useDocumentTitle } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { can } from '../utils/permissions';
import { Badge, PageHeader } from '../components/common/Display';
import { EmptyState, ErrorState, Spinner, TableSkeleton } from '../components/common/Feedback';
import { formatDate, titleCase } from '../utils/format';

export default function SearchPatient() {
  useDocumentTitle('Search');
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const debounced = useDebounce(q.trim(), 400);

  useEffect(() => {
    setQ(params.get('q') || '');
  }, [params]);

  useEffect(() => {
    if (debounced !== (params.get('q') || '')) setParams(debounced ? { q: debounced } : {}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const active = (params.get('q') || '').length >= 2;
  const { data, loading, error, reload } = useAsync(() => patientService.search(params.get('q')), [params.get('q')], { enabled: active });
  const checkupsByPatient = {};
  (data?.checkups || []).forEach((c) => {
    (checkupsByPatient[c.patient.id] ||= []).push(c);
  });

  return (
    <>
      <PageHeader icon={FileSearch} title="Search patients & check-ups" subtitle="Search by patient ID, name, mobile number or check-up ID." />
      <div className="card p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            className="input py-3 pl-11 text-base"
            placeholder="e.g. PT2026000123, Ramesh, 98765 43210 or EC2026000045"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search"
          />
          {loading && <Spinner className="absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2" />}
        </div>
        {q.trim().length === 1 && <p className="mt-2 text-xs text-slate-500">Type at least 2 characters.</p>}
      </div>

      <div className="mt-5">
        {!active ? (
          <div className="card">
            <EmptyState icon={Search} title="Find a patient" message="Results show matching patients with their recent eye examinations." />
          </div>
        ) : error ? (
          <div className="card"><ErrorState message={error} onRetry={reload} /></div>
        ) : loading && !data ? (
          <div className="card"><TableSkeleton rows={4} cols={4} /></div>
        ) : !data?.patients.length ? (
          <div className="card">
            <EmptyState
              title="No matching patients"
              message={`Nothing matched "${params.get('q')}". Check the spelling or try the mobile number.`}
              action={can(user, 'registerPatient') && <Link to="/patients/new" className="btn-primary">Register new patient</Link>}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              {data.patients.length} patient{data.patients.length === 1 ? '' : 's'} found
              {data.matched_checkup_codes.length > 0 && <> · matched check-up {data.matched_checkup_codes.join(', ')}</>}
            </p>
            {data.patients.map((p) => {
              const recent = (checkupsByPatient[p.id] || []).slice(0, 3);
              return (
                <div key={p.id} className="card p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/patients/${p.id}`} className="text-base font-semibold hover:text-brand-700">
                          {p.full_name}
                        </Link>
                        <span className="font-mono text-xs font-semibold text-brand-700">{p.patient_code}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {p.age} yrs · {titleCase(p.gender)} · {p.mobile_number} · {p.village}, {p.district}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Registered {formatDate(p.registration_date)} · {p.total_checkups} check-up{p.total_checkups === 1 ? '' : 's'}
                        {p.last_checkup_date && <> · last on {formatDate(p.last_checkup_date)}</>}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Link to={`/patients/${p.id}`} className="btn-secondary btn-sm">
                        <Eye className="h-3.5 w-3.5" /> Open profile
                      </Link>
                      {can(user, 'addCheckup') && (
                        <Link to={`/checkups/new?patient=${p.id}`} className="btn-teal btn-sm">
                          <ClipboardPlus className="h-3.5 w-3.5" /> Add check-up
                        </Link>
                      )}
                    </div>
                  </div>
                  {recent.length > 0 && (
                    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-100">
                      <table className="min-w-full text-sm">
                        <tbody className="divide-y divide-slate-100">
                          {recent.map((c) => (
                            <tr key={c.id} className={data.matched_checkup_codes.includes(c.checkup_code) ? 'bg-amber-50' : ''}>
                              <td className="td py-2 font-mono text-xs">
                                <Link to={`/checkups/${c.id}`} className="text-brand-700 hover:underline">{c.checkup_code}</Link>
                              </td>
                              <td className="td py-2">{formatDate(c.examination_date)}</td>
                              <td className="td py-2 whitespace-normal font-medium">{c.diagnosis}</td>
                              <td className="td py-2">{c.doctor.name}</td>
                              <td className="td py-2">{c.followup_required ? <Badge tone="amber">F/U {formatDate(c.followup_date)}</Badge> : null}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
