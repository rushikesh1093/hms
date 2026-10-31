import { ChevronLeft, ChevronRight } from 'lucide-react';

export function PageHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="hidden rounded-xl bg-brand-700 p-2.5 sm:block">
            <Icon className="h-5 w-5 text-white" />
          </div>
        )}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const BADGE_TONES = {
  slate: 'bg-slate-100 text-slate-700',
  blue: 'bg-brand-50 text-brand-700',
  teal: 'bg-teal-50 text-teal-700',
  amber: 'bg-amber-50 text-amber-800',
  red: 'bg-red-50 text-red-700',
  green: 'bg-emerald-50 text-emerald-700',
};

export function Badge({ tone = 'slate', children }) {
  return <span className={`badge ${BADGE_TONES[tone]}`}>{children}</span>;
}

export function FollowupStatusBadge({ status, overdue }) {
  if (status === 'pending' && overdue) return <Badge tone="red">Overdue</Badge>;
  const map = { pending: ['amber', 'Pending'], completed: ['green', 'Completed'], missed: ['red', 'Missed'], cancelled: ['slate', 'Cancelled'] };
  const [tone, label] = map[status] || ['slate', status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function StatCard({ label, value, icon: Icon, tone = 'blue', hint, loading }) {
  const tones = {
    blue: 'bg-brand-50 text-brand-700',
    teal: 'bg-teal-50 text-teal-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-600',
    slate: 'bg-slate-100 text-slate-700',
  };
  return (
    <div className="card flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase leading-snug tracking-wide text-slate-500">{label}</p>
        {loading ? (
          <div className="mt-2 h-7 w-16 animate-pulse rounded bg-slate-200" />
        ) : (
          <p className="mt-1 text-2xl font-semibold text-slate-900">{Number(value ?? 0).toLocaleString('en-IN')}</p>
        )}
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </div>
      {Icon && (
        <div className={`rounded-lg p-2 ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      )}
    </div>
  );
}

export function DetailGrid({ items, cols = 3 }) {
  const colCls = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[cols];
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-4 ${colCls}`}>
      {items.map(([label, value, wide]) => (
        <div key={label} className={wide ? 'sm:col-span-full' : ''}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="mt-1 whitespace-pre-line break-words text-sm text-slate-900">{value === null || value === undefined || value === '' ? '—' : value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Pagination({ page, pages, total, pageSize, onPageChange, onPageSizeChange }) {
  if (!total) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="no-print flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 sm:flex-row">
      <p>
        Showing <span className="font-medium">{from}</span>–<span className="font-medium">{to}</span> of{' '}
        <span className="font-medium">{total.toLocaleString('en-IN')}</span>
      </p>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <select className="input w-auto py-1.5" value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} aria-label="Rows per page">
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        )}
        <button type="button" className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-20 text-center">
          Page {page} of {pages}
        </span>
        <button type="button" className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="no-print -mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            active === t.key ? 'border-brand-700 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
