import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PageLoader } from '../common/Feedback';
import {
  BarChart3,
  CalendarClock,
  ClipboardList,
  Eye,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Search,
  Settings,
  UserPlus,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { titleCase } from '../../utils/format';

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/patients/new', label: 'Register Patient', icon: UserPlus, perm: 'registerPatient' },
  { to: '/patients', label: 'All Patients', icon: UsersRound, end: true },
  { to: '/search', label: 'Search Patient', icon: Search },
  { to: '/checkups', label: 'Eye Check-ups', icon: Eye, perm: 'viewClinical' },
  { to: '/followups', label: 'Follow-ups', icon: CalendarClock },
  { to: '/reports', label: 'Summary Reports', icon: BarChart3, perm: 'viewReports' },
  { to: '/users', label: 'User Management', icon: Users, perm: 'manageUsers' },
  { to: '/audit-logs', label: 'Audit Logs', icon: ScrollText, perm: 'viewAudit' },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function Sidebar({ onNavigate }) {
  const { user, logout } = useAuth();
  const items = NAV_ITEMS.filter((i) => !i.perm || can(user, i.perm));
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="rounded-lg bg-white/10 p-1.5">
          <Eye className="h-5 w-5 text-teal-300" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">Eye Care HMS</p>
          <p className="text-[11px] text-brand-200">Ophthalmology Department</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Main">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-brand-100 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </nav>
      <div className="border-t border-white/10 px-5 py-4 text-xs text-brand-200">Confidential patient data. Authorised use only.</div>
    </div>
  );
}

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 hidden w-64 bg-brand-800 lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-brand-800 shadow-xl">
            <button type="button" className="absolute right-3 top-4 rounded p-1 text-brand-100 hover:bg-white/10" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
        <button type="button" className="btn-ghost lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <form
          className="relative hidden max-w-md flex-1 md:block"
          onSubmit={(e) => {
            e.preventDefault();
            const q = new FormData(e.currentTarget).get('q')?.toString().trim();
            if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input name="q" className="input pl-9" placeholder="Search patient ID, name, mobile or check-up ID" aria-label="Quick search" />
        </form>
        <div className="ml-auto flex items-center gap-3">
          {can(user, 'addCheckup') && (
            <NavLink to="/search" className="btn-teal btn-sm hidden sm:inline-flex">
              <ClipboardList className="h-4 w-4" /> New Check-up
            </NavLink>
          )}
          <NavLink to="/settings" className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-100">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
              {user?.name?.replace(/^Dr\.?\s*/i, '').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div className="hidden text-left leading-tight sm:block">
              <p className="text-sm font-medium text-slate-800">{user?.name}</p>
              <p className="text-xs text-slate-500">{titleCase(user?.role)}</p>
            </div>
          </NavLink>
          <button type="button" className="btn-ghost" onClick={logout} title="Logout" aria-label="Logout">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
