import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlarmClock, CalendarCheck, CalendarDays, ClipboardList, Eye, LayoutDashboard, UserPlus, UsersRound } from 'lucide-react';
import { reportService } from '../services/reportService';
import { useAsync, useDocumentTitle } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { can } from '../utils/permissions';
import { PageHeader, StatCard } from '../components/common/Display';
import { ErrorState } from '../components/common/Feedback';
import { ChartCard, DonutChart, SimpleBarChart, TrendChart, CHART_COLORS } from '../components/dashboard/Charts';
import { addDays, formatDate, isoDate } from '../utils/format';

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

export default function Dashboard() {
  useDocumentTitle('Dashboard');
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const end = isoDate();
  const start = addDays(end, -(days - 1));
  const { data, loading, error, reload } = useAsync(() => reportService.dashboard({ start_date: start, end_date: end }), [start, end]);
  const k = data?.kpis;
  const sum = (arr) => (arr || []).reduce((a, p) => a + p.value, 0);

  return (
    <>
      <PageHeader
        icon={LayoutDashboard}
        title={`Welcome, ${user?.name}`}
        subtitle={data ? `Figures as of ${formatDate(data.as_of)}` : 'Hospital activity overview'}
        actions={
          <>
            {can(user, 'registerPatient') && (
              <Link to="/patients/new" className="btn-primary">
                <UserPlus className="h-4 w-4" /> Register Patient
              </Link>
            )}
            {can(user, 'addCheckup') && (
              <Link to="/search" className="btn-teal">
                <ClipboardList className="h-4 w-4" /> New Check-up
              </Link>
            )}
          </>
        }
      />

      {error ? (
        <div className="card">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <StatCard loading={loading} label="Total patients" value={k?.total_patients} icon={UsersRound} />
            <StatCard loading={loading} label="Total check-ups" value={k?.total_checkups} icon={Eye} tone="teal" />
            <StatCard loading={loading} label="Today's registrations" value={k?.today_registrations} icon={UserPlus} />
            <StatCard loading={loading} label="Today's check-ups" value={k?.today_checkups} icon={CalendarCheck} tone="teal" />
            <StatCard loading={loading} label="This month" value={k?.month_registrations} icon={CalendarDays} hint="registrations" tone="slate" />
            <Link to="/followups" className="block">
              <StatCard
                loading={loading}
                label="Follow-ups pending"
                value={k?.followups_pending}
                icon={AlarmClock}
                tone={k?.followups_overdue ? 'red' : 'amber'}
                hint={k ? `${k.followups_overdue} overdue` : undefined}
              />
            </Link>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Trends</h2>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label="Date range">
              {RANGES.map((r) => (
                <button
                  key={r.days}
                  type="button"
                  onClick={() => setDays(r.days)}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${days === r.days ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <ChartCard title="Daily patient registrations" subtitle={`${sum(data?.daily_registrations)} in the last ${days} days`} loading={loading}>
              <TrendChart data={data?.daily_registrations || []} name="Registrations" />
            </ChartCard>
            <ChartCard title="Daily eye check-ups" subtitle={`${sum(data?.daily_checkups)} in the last ${days} days`} loading={loading}>
              <TrendChart data={data?.daily_checkups || []} name="Check-ups" color={CHART_COLORS[1]} />
            </ChartCard>
            <ChartCard title="Monthly registrations" subtitle="Last 12 months" loading={loading}>
              <SimpleBarChart data={(data?.monthly_registrations || []).map((p) => ({ ...p, label: monthLabel(p.label) }))} name="Registrations" />
            </ChartCard>
            <ChartCard title="Commonly recorded eye conditions" subtitle={`Diagnoses in the last ${days} days`} loading={loading} empty={!loading && !data?.common_conditions?.length}>
              <SimpleBarChart data={data?.common_conditions || []} name="Check-ups" horizontal color={CHART_COLORS[1]} />
            </ChartCard>
            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 lg:grid-cols-3">
              <ChartCard title="Age groups" subtitle="All active patients" loading={loading} empty={!loading && !sum(data?.age_groups)}>
                <SimpleBarChart data={data?.age_groups || []} name="Patients" color={CHART_COLORS[2]} />
              </ChartCard>
              <ChartCard title="Gender distribution" subtitle="All active patients" loading={loading} empty={!loading && !data?.gender_distribution?.length}>
                <DonutChart data={data?.gender_distribution || []} />
              </ChartCard>
              <ChartCard title="Check-ups by doctor" subtitle={`Last ${days} days`} loading={loading} empty={!loading && !data?.doctor_checkups?.length} className="sm:col-span-2 lg:col-span-1">
                <SimpleBarChart data={data?.doctor_checkups || []} dataKey="count" nameKey="doctor_name" name="Check-ups" horizontal />
              </ChartCard>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-IN', { month: 'short' });
}
