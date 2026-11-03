import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CalendarClock,
  ClipboardList,
  Eye,
  EyeOff,
  FileText,
  HeartPulse,
  IdCard,
  Lock,
  ShieldCheck,
  Stethoscope,
  User,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../services/api';
import { hasPortalToken, portalService } from '../services/portalApi';
import { Alert, Spinner } from '../components/common/Feedback';
import EyeLogo from '../components/common/EyeLogo';
import { useDocumentTitle } from '../hooks/useAsync';

/** Everything that differs between the two sign-in modes. */
const MODES = {
  staff: {
    tab: 'Doctor / Staff',
    tabIcon: Stethoscope,
    title: 'Welcome back',
    subtitle: 'Sign in with your hospital staff account.',
    idName: 'username',
    idLabel: 'Username',
    idIcon: User,
    idPlaceholder: 'e.g. dr.sharma',
    idRequired: 'Username is required',
    button: 'btn-primary bg-gradient-to-r from-brand-700 to-brand-600 shadow-brand-700/25 hover:from-brand-800 hover:to-brand-700',
    footer: 'Forgot your password? Ask your administrator to reset it.',
    panel: 'from-brand-700 via-brand-800 to-brand-900',
    headline: ['Clear vision,', 'clearer records.'],
    blurb: 'Patient registration, eye examinations and follow-up care in one place, with a full audit trail of every change.',
    features: [
      { icon: UsersRound, title: 'Patient registration', text: 'Register and find patients in seconds.' },
      { icon: ClipboardList, title: 'Eye examinations', text: 'Visual acuity, refraction, IOP and diagnosis for both eyes.' },
      { icon: CalendarClock, title: 'Follow-up care', text: 'Never miss a scheduled review.' },
    ],
    note: 'Access is restricted to authorised hospital staff.',
  },
  patient: {
    tab: 'Patient',
    tabIcon: UserRound,
    title: 'Patient sign in',
    subtitle: 'Use the patient ID on your hospital card and the password given at the reception.',
    idName: 'patient_code',
    idLabel: 'Patient ID',
    idIcon: IdCard,
    idPlaceholder: 'e.g. PT2026000123',
    idRequired: 'Patient ID is required',
    button: 'btn-teal shadow-teal-700/25',
    footer: 'No password yet? Ask at the hospital reception to enable your patient login.',
    panel: 'from-teal-700 via-brand-800 to-brand-900',
    headline: ['Your eye health,', 'in your hands.'],
    blurb: 'See your eye examinations, prescriptions and upcoming visits whenever you need them.',
    features: [
      { icon: FileText, title: 'Your eye reports', text: 'See your examinations and download prescriptions.' },
      { icon: CalendarClock, title: 'Your appointments', text: 'Check when your next follow-up visit is due.' },
      { icon: HeartPulse, title: 'Your health details', text: 'Allergies and history recorded by the hospital.' },
    ],
    note: 'You can only see your own records.',
  },
};

export default function Login() {
  const [params, setParams] = useSearchParams();
  const mode = params.get('as') === 'patient' ? 'patient' : 'staff';
  const m = MODES[mode];
  useDocumentTitle(mode === 'patient' ? 'Patient sign in' : 'Sign in');

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { username: '', patient_code: '', password: '' }, shouldUnregister: true });

  // A patient who is already signed in goes straight to their portal.
  if (mode === 'patient' && hasPortalToken()) return <Navigate to="/portal" replace />;

  const switchMode = (next) => {
    if (next === mode) return;
    setError(null);
    setShowPw(false);
    reset();
    const p = new URLSearchParams(params);
    if (next === 'patient') p.set('as', 'patient');
    else p.delete('as');
    setParams(p, { replace: true, state: null });
  };

  const onSubmit = async (values) => {
    setError(null);
    try {
      if (mode === 'patient') {
        await portalService.login(values.patient_code.trim(), values.password);
        navigate('/portal', { replace: true });
      } else {
        await login(values.username.trim(), values.password);
        navigate(location.state?.from?.pathname || '/', { replace: true });
      }
    } catch (e) {
      setError(getErrorMessage(e, 'Sign in failed'));
    }
  };

  const checkCaps = (e) => setCapsLock(Boolean(e.getModifierState?.('CapsLock')));
  const IdIcon = m.idIcon;

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Brand panel: colours and copy follow the selected mode */}
      <div className={`relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br ${m.panel} p-12 text-white transition-colors duration-500 lg:flex`}>
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 top-1/2 h-[560px] w-[560px] -translate-y-1/2 rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-1/2 h-[400px] w-[400px] -translate-y-1/2 rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 top-1/2 h-[240px] w-[240px] -translate-y-1/2 rounded-full bg-teal-400/10 blur-2xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <EyeLogo className="h-11 w-11 rounded-xl shadow-lg shadow-black/30" />
          <div>
            <p className="text-lg font-semibold tracking-tight">Eye Care HMS</p>
            <p className="text-sm text-brand-200">Government District Hospital</p>
          </div>
        </div>

        <div key={mode} className="login-fade-up relative max-w-md">
          <EyeLogo animated className="login-float mb-8 h-24 w-24 rounded-3xl shadow-2xl shadow-black/40 ring-4 ring-white/10" />
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-white">
            {m.headline[0]}<br />
            <span className="text-teal-300">{m.headline[1]}</span>
          </h1>
          <p className="mt-4 text-brand-100">{m.blurb}</p>
          <ul className="mt-8 space-y-4">
            {m.features.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="mt-0.5 rounded-lg bg-white/10 p-2 ring-1 ring-white/10">
                  <Icon className="h-4 w-4 text-teal-300" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-white">{title}</span>
                  <span className="block text-sm text-brand-200">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative flex items-center gap-2 text-sm text-brand-200">
          <ShieldCheck className="h-4 w-4" /> {m.note}
        </p>
      </div>

      {/* Sign-in form */}
      <div className="relative flex flex-1 items-center justify-center px-4 py-12">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-brand-50 to-transparent lg:hidden" />
        <div className="login-fade-up relative w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <EyeLogo animated className="h-16 w-16 rounded-2xl shadow-xl shadow-brand-900/20" />
            <p className="mt-3 text-xl font-semibold tracking-tight text-slate-900">Eye Care HMS</p>
            <p className="text-sm text-slate-500">Government District Hospital</p>
          </div>

          <div className="card p-8 shadow-xl shadow-slate-200/70">
            {/* Two-option switch */}
            <div role="tablist" aria-label="Sign in as" className="relative mb-7 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
              <span
                aria-hidden="true"
                className={`absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-sm ring-1 ring-slate-200 transition-transform duration-300 ease-out ${
                  mode === 'patient' ? 'translate-x-full' : 'translate-x-0'
                }`}
              />
              {Object.entries(MODES).map(([key, def]) => {
                const TabIcon = def.tabIcon;
                const active = key === mode;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => switchMode(key)}
                    className={`relative z-10 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors ${
                      active ? (key === 'patient' ? 'text-teal-700' : 'text-brand-700') : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <TabIcon className="h-4 w-4" /> {def.tab}
                  </button>
                );
              })}
            </div>

            <div key={mode} className="login-fade-up">
              <h2 className="text-2xl font-semibold tracking-tight">{m.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{m.subtitle}</p>

              <form className="mt-7 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
                {location.state?.expired && !error && <Alert tone="warning">Your session expired. Please sign in again.</Alert>}
                {error && <Alert tone="error">{error}</Alert>}
                <div>
                  <label className="label" htmlFor={m.idName}>{m.idLabel}</label>
                  <div className="relative">
                    <IdIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      key={m.idName}
                      id={m.idName}
                      autoComplete="username"
                      autoFocus
                      placeholder={m.idPlaceholder}
                      className={`input py-2.5 pl-9 ${mode === 'patient' ? 'uppercase placeholder:normal-case' : ''} ${errors[m.idName] ? 'input-error' : ''}`}
                      {...register(m.idName, { required: m.idRequired })}
                    />
                  </div>
                  {errors[m.idName] && <p className="mt-1 text-xs text-red-600">{errors[m.idName].message}</p>}
                </div>
                <div>
                  <label className="label" htmlFor="password">Password</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="password"
                      type={showPw ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      onKeyUp={checkCaps}
                      onKeyDown={checkCaps}
                      className={`input py-2.5 pl-9 pr-10 ${errors.password ? 'input-error' : ''}`}
                      {...register('password', { required: 'Password is required' })}
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                      onClick={() => setShowPw((s) => !s)}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
                  {capsLock && <p className="mt-1 text-xs text-amber-600">Caps Lock is on.</p>}
                </div>
                <button type="submit" className={`${m.button} w-full py-3 text-base shadow-md`} disabled={isSubmitting}>
                  {isSubmitting && <Spinner className="h-4 w-4 text-white" />} {isSubmitting ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            </div>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" /> {m.footer}
          </p>
        </div>
      </div>
    </div>
  );
}
