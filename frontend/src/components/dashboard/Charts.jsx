import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Skeleton } from '../common/Feedback';

export const CHART_COLORS = ['#0f4c81', '#0d9488', '#3b82f6', '#14b8a6', '#6366f1', '#f59e0b', '#64748b', '#0ea5e9'];

export function ChartCard({ title, subtitle, children, loading, empty, className = '' }) {
  return (
    <div className={`card print-break p-5 ${className}`}>
      <div className="mb-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>
      {loading ? (
        <Skeleton className="h-60 w-full" />
      ) : empty ? (
        <div className="flex h-60 items-center justify-center text-sm text-slate-400">No data for this period</div>
      ) : (
        <div className="h-60">{children}</div>
      )}
    </div>
  );
}

const shortDate = (iso) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};
const shortMonth = (ym) => {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-IN', { month: 'short' }) + ` ${y.slice(2)}`;
};

const axis = { fontSize: 11, fill: '#64748b' };

/** Daily/monthly counts. Bars for short ranges (sparse counts read better), a line for long ones. */
export function TrendChart({ data, color = CHART_COLORS[0], name = 'Count', monthly = false }) {
  const gid = `grad-${color.replace('#', '')}`;
  const tooltip = <Tooltip cursor={{ fill: '#f1f5f9' }} labelFormatter={(l) => (monthly ? shortMonth(l) : l.split('-').reverse().join('-'))} />;
  const xAxis = <XAxis dataKey="label" tick={axis} tickFormatter={monthly ? shortMonth : shortDate} minTickGap={16} />;
  const grid = <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />;
  if (data.length <= 45) {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
          {grid}
          {xAxis}
          <YAxis tick={axis} allowDecimals={false} />
          {tooltip}
          <Bar dataKey="value" name={name} fill={color} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {grid}
        {xAxis}
        <YAxis tick={axis} allowDecimals={false} />
        {tooltip}
        <Area type="linear" dataKey="value" name={name} stroke={color} strokeWidth={2} fill={`url(#${gid})`} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SimpleBarChart({ data, dataKey = 'value', nameKey = 'label', name = 'Count', horizontal = false, color = CHART_COLORS[0] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 5, right: 12, left: horizontal ? 10 : -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={!horizontal} vertical={horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={axis} allowDecimals={false} />
            <YAxis type="category" dataKey={nameKey} tick={axis} width={130} />
          </>
        ) : (
          <>
            <XAxis dataKey={nameKey} tick={axis} />
            <YAxis tick={axis} allowDecimals={false} />
          </>
        )}
        <Tooltip cursor={{ fill: '#f1f5f9' }} />
        <Bar dataKey={dataKey} name={name} fill={color} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" innerRadius="55%" outerRadius="80%" paddingAngle={2} isAnimationActive={false}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
