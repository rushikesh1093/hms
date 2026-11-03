import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, FilterX, ScrollText } from 'lucide-react';
import { auditService } from '../services/authService';
import { useAsync, useDocumentTitle } from '../hooks/useAsync';
import { Badge, PageHeader, Pagination } from '../components/common/Display';
import { EmptyState, ErrorState, TableSkeleton } from '../components/common/Feedback';
import { formatDateTime, titleCase } from '../utils/format';

const ACTION_TONES = { create: 'green', update: 'blue', deactivate: 'red', restore: 'teal', login_failed: 'amber', refresh_token_reuse: 'red', view: 'slate', portal_login: 'teal', portal_login_failed: 'amber', portal_enable: 'green', portal_disable: 'red', portal_password_reset: 'blue', portal_password_change: 'blue', portal_export_pdf: 'slate' };

function Changes({ log }) {
  const keys = Array.from(new Set([...Object.keys(log.old_values || {}), ...Object.keys(log.new_values || {})]));
  if (!keys.length) return <p className="text-xs text-slate-500">No field values recorded for this action.</p>;
  const show = (v) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-slate-500">
          <th className="py-1 pr-4 font-medium">Field</th>
          {log.old_values && <th className="py-1 pr-4 font-medium">Before</th>}
          <th className="py-1 font-medium">{log.old_values ? 'After' : 'Value'}</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k} className="align-top">
            <td className="py-1 pr-4 font-mono text-slate-600">{k}</td>
            {log.old_values && <td className="max-w-xs break-words py-1 pr-4 text-red-700">{show(log.old_values?.[k])}</td>}
            <td className="max-w-xs break-words py-1 text-emerald-700">{show(log.new_values?.[k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AuditLogs() {
  useDocumentTitle('Audit logs');
  const [filters, setFilters] = useState({ action: '', entity_type: '', entity_id: '', date_from: '', date_to: '' });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const facets = useAsync(() => auditService.facets(), []);
  const { data, loading, error, reload } = useAsync(() => auditService.list({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), page, page_size: 25 }), [JSON.stringify(filters), page]);
  const set = (k) => (e) => {
    setFilters((f) => ({ ...f, [k]: e.target.value }));
    setPage(1);
  };
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader icon={ScrollText} title="Audit logs" subtitle="Append-only record of logins, record views, changes and exports." />
      <div className="card">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <select className="input" value={filters.action} onChange={set('action')} aria-label="Action">
            <option value="">All actions</option>
            {(facets.data?.actions || []).map((a) => <option key={a} value={a}>{titleCase(a)}</option>)}
          </select>
          <select className="input" value={filters.entity_type} onChange={set('entity_type')} aria-label="Entity">
            <option value="">All record types</option>
            {(facets.data?.entity_types || []).map((a) => <option key={a} value={a}>{titleCase(a)}</option>)}
          </select>
          <input className="input" placeholder="Record ID (e.g. PT2026000001)" value={filters.entity_id} onChange={set('entity_id')} aria-label="Record ID" />
          <input type="date" className="input" value={filters.date_from} onChange={set('date_from')} aria-label="From" title="From" />
          <input type="date" className="input" value={filters.date_to} onChange={set('date_to')} aria-label="To" title="To" />
          {hasFilters && (
            <button type="button" className="btn-secondary" onClick={() => { setFilters({ action: '', entity_type: '', entity_id: '', date_from: '', date_to: '' }); setPage(1); }}>
              <FilterX className="h-4 w-4" /> Clear
            </button>
          )}
        </div>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <TableSkeleton cols={5} />
        ) : !data?.items.length ? (
          <EmptyState icon={ScrollText} title="No audit entries" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th w-8" />
                  <th className="th">Time</th>
                  <th className="th">User</th>
                  <th className="th">Action</th>
                  <th className="th">Record</th>
                  <th className="th">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {data.items.map((log) => (
                  <Fragment key={log.id}>
                    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(open === log.id ? null : log.id)}>
                      <td className="td">{open === log.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}</td>
                      <td className="td">{formatDateTime(log.created_at)}</td>
                      <td className="td">{log.user ? `${log.user.name} (${titleCase(log.user.role)})` : log.action.startsWith('portal_') ? <span className="text-teal-700">Patient (portal)</span> : <span className="text-slate-400">Unknown</span>}</td>
                      <td className="td"><Badge tone={ACTION_TONES[log.action] || 'slate'}>{titleCase(log.action)}</Badge></td>
                      <td className="td">{titleCase(log.entity_type)} <span className="font-mono text-xs text-slate-500">{log.entity_id}</span></td>
                      <td className="td font-mono text-xs text-slate-500">{log.ip_address || '—'}</td>
                    </tr>
                    {open === log.id && (
                      <tr className="bg-slate-50/60">
                        <td />
                        <td colSpan={5} className="px-4 py-3"><Changes log={log} /></td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={25} onPageChange={setPage} />}
      </div>
    </>
  );
}
