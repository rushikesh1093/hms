import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, ClipboardPlus, Eye, FilterX, History, Pencil, Printer, Search, UserPlus, UsersRound } from 'lucide-react';
import { patientService } from '../services/patientService';
import { useAsync, useDebounce, useDocumentTitle } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { can } from '../utils/permissions';
import { Badge, PageHeader, Pagination } from '../components/common/Display';
import { EmptyState, ErrorState, TableSkeleton } from '../components/common/Feedback';
import { GENDERS, formatDate, titleCase } from '../utils/format';

const COLUMNS = [
  { key: 'patient_code', label: 'Patient ID', sortable: true },
  { key: 'full_name', label: 'Name', sortable: true },
  { key: 'age', label: 'Age', sortable: true },
  { key: 'gender', label: 'Gender', sortable: true },
  { key: 'mobile_number', label: 'Mobile' },
  { key: 'registration_date', label: 'Registered', sortable: true },
  { key: 'last_checkup_date', label: 'Last check-up', sortable: true },
  { key: 'total_checkups', label: 'Check-ups', sortable: true },
];

const FILTER_KEYS = ['q', 'gender', 'registered_from', 'registered_to', 'min_age', 'max_age'];

export default function Patients() {
  useDocumentTitle('All patients');
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const get = (k, d = '') => params.get(k) ?? d;
  const page = Number(get('page', '1')) || 1;
  const pageSize = Number(get('page_size', '20')) || 20;
  const sortBy = get('sort_by', 'registration_date');
  const sortOrder = get('sort_order', 'desc');

  const [q, setQ] = useState(get('q'));
  const debouncedQ = useDebounce(q);

  const update = (changes, resetPage = true) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v === '' || v === null || v === undefined ? next.delete(k) : next.set(k, String(v))));
    if (resetPage) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (debouncedQ !== get('q')) update({ q: debouncedQ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  const query = {
    page,
    page_size: pageSize,
    sort_by: sortBy,
    sort_order: sortOrder,
    ...Object.fromEntries(FILTER_KEYS.map((k) => [k, get(k)])),
  };
  const { data, loading, error, reload } = useAsync(() => patientService.list(query), [params.toString()]);
  const hasFilters = FILTER_KEYS.some((k) => get(k));

  const toggleSort = (key) => {
    if (sortBy === key) update({ sort_order: sortOrder === 'asc' ? 'desc' : 'asc' }, false);
    else update({ sort_by: key, sort_order: key === 'full_name' || key === 'patient_code' ? 'asc' : 'desc' }, false);
  };

  return (
    <>
      <PageHeader
        icon={UsersRound}
        title="All patients"
        subtitle={data ? `${data.total.toLocaleString('en-IN')} registered patients${hasFilters ? ' match the filters' : ''}` : 'Registered patient records'}
        actions={
          can(user, 'registerPatient') && (
            <Link to="/patients/new" className="btn-primary">
              <UserPlus className="h-4 w-4" /> Register patient
            </Link>
          )
        }
      />

      <div className="card">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search ID, name or mobile" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search patients" />
          </div>
          <select className="input" value={get('gender')} onChange={(e) => update({ gender: e.target.value })} aria-label="Gender filter">
            <option value="">All genders</option>
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <input type="number" min="0" max="130" className="input" placeholder="Min age" value={get('min_age')} onChange={(e) => update({ min_age: e.target.value })} aria-label="Minimum age" />
            <input type="number" min="0" max="130" className="input" placeholder="Max age" value={get('max_age')} onChange={(e) => update({ max_age: e.target.value })} aria-label="Maximum age" />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <input type="date" className="input" value={get('registered_from')} onChange={(e) => update({ registered_from: e.target.value })} aria-label="Registered from" title="Registered from" />
            <span className="text-xs text-slate-400">to</span>
            <input type="date" className="input" value={get('registered_to')} onChange={(e) => update({ registered_to: e.target.value })} aria-label="Registered to" title="Registered to" />
            {hasFilters && (
              <button
                type="button"
                className="btn-ghost shrink-0"
                title="Clear filters"
                onClick={() => {
                  setQ('');
                  update(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])));
                }}
              >
                <FilterX className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <TableSkeleton cols={7} />
        ) : !data?.items.length ? (
          <EmptyState
            icon={UsersRound}
            title={hasFilters ? 'No patients match these filters' : 'No patients registered yet'}
            message={hasFilters ? 'Try a different search term or clear the filters.' : 'Registered patients will appear here.'}
            action={!hasFilters && can(user, 'registerPatient') && <Link to="/patients/new" className="btn-primary">Register first patient</Link>}
          />
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className="th" aria-sort={sortBy === c.key ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}>
                      {c.sortable ? (
                        <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-slate-800" onClick={() => toggleSort(c.key)}>
                          {c.label}
                          {sortBy === c.key ? sortOrder === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  ))}
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {data.items.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="td font-mono text-xs font-semibold text-brand-700">
                      <Link to={`/patients/${p.id}`}>{p.patient_code}</Link>
                    </td>
                    <td className="td">
                      <Link to={`/patients/${p.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {p.full_name}
                      </Link>
                      <p className="text-xs text-slate-500">{p.village}, {p.district}</p>
                    </td>
                    <td className="td">{p.age}</td>
                    <td className="td">{titleCase(p.gender)}</td>
                    <td className="td">{p.mobile_number}</td>
                    <td className="td">{formatDate(p.registration_date)}</td>
                    <td className="td">{p.last_checkup_date ? formatDate(p.last_checkup_date) : <span className="text-slate-400">None</span>}</td>
                    <td className="td">
                      <Badge tone={p.total_checkups ? 'teal' : 'slate'}>{p.total_checkups}</Badge>
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-0.5">
                        <Link to={`/patients/${p.id}`} className="btn-ghost" title="View patient" aria-label={`View ${p.full_name}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                        {can(user, 'editPatient') && (
                          <Link to={`/patients/${p.id}/edit`} className="btn-ghost" title="Edit patient" aria-label={`Edit ${p.full_name}`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        )}
                        {can(user, 'viewClinical') && (
                          <Link to={`/patients/${p.id}?tab=history`} className="btn-ghost" title="Check-up history" aria-label="Check-up history">
                            <History className="h-4 w-4" />
                          </Link>
                        )}
                        {can(user, 'addCheckup') && (
                          <Link to={`/checkups/new?patient=${p.id}`} className="btn-ghost text-teal-700" title="Add eye check-up" aria-label="Add eye check-up">
                            <ClipboardPlus className="h-4 w-4" />
                          </Link>
                        )}
                        <Link to={`/patients/${p.id}?print=1`} className="btn-ghost" title="Print patient details" aria-label="Print patient details">
                          <Printer className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && (
          <Pagination
            page={data.page}
            pages={data.pages}
            total={data.total}
            pageSize={pageSize}
            onPageChange={(p) => update({ page: p }, false)}
            onPageSizeChange={(s) => update({ page_size: s })}
          />
        )}
      </div>
    </>
  );
}
