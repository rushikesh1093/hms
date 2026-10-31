import { formatDate } from '../../utils/format';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function formatCell(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string' && DATE_RE.test(v)) return formatDate(v);
  if (typeof v === 'number') return v.toLocaleString('en-IN');
  return String(v);
}

export default function ReportTable({ report }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-100 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {report.columns.map((c) => (
              <th key={c.key} className="th">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {report.rows.map((row, i) => (
            <tr key={i} className="align-top hover:bg-slate-50/60">
              {report.columns.map((c) => (
                <td key={c.key} className={`td ${typeof row[c.key] === 'string' && row[c.key].length > 30 ? 'min-w-48 whitespace-normal' : ''}`}>
                  {formatCell(row[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
