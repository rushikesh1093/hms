import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CalendarClock, ClipboardList, Eye, EyeOff, Lock, ShieldCheck, User, UsersRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../services/api';
import { Alert, Spinner } from '../components/common/Feedback';
import EyeLogo from '../components/common/EyeLogo';
import { useDocumentTitle } from '../hooks/useAsync';

const FEATURES = [
  { icon: UsersRound, title: 'Patient registration', text: 'Register and find patients in seconds.' },
  { icon: ClipboardList, title: 'Eye examinations', text: 'Visual acuity, refraction, IOP and diagnosis for both eyes.' },
  { icon: CalendarClock, title: 'Follow-up care', text: 'Never miss a scheduled review.' },
];

export default function Login() {
  useDocumentTitle('Sign in');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { username: '', password: '' } });

  const onSubmit = async ({ username, password }) => {
    setError(null);
    try {
      await login(username.trim(), password);
      const dest = location.state?.from?.pathname || '/';
      navigate(dest, { replace: true });
    } catch (e) {
      setError(getErrorMessage(e, 'Login failed'));
    }
  };

  const checkCaps = (e) => setCapsLock(Boolean(e.getModifierState?.('CapsLock')));

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 p-12 text-white lg:flex">
        {/* Decorative rings, like an eye chart / iris */}
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

        <div className="relative max-w-md">
          <EyeLogo animated className="login-float mb-8 h-24 w-24 rounded-3xl shadow-2xl shadow-black/40 ring-4 ring-white/10" />
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-white">
            Clear vision,<br />
            <span className="text-teal-300">clearer records.</span>
          </h1>
          <p className="mt-4 text-brand-100">
            Patient registration, eye examinations and follow-up care in one place, with a full audit trail of every change.
          </p>
          <ul className="mt-8 space-y-4">
            {FEATURES.map(({ icon: Icon, title, text }) => (
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
          <ShieldCheck className="h-4 w-4" /> Access is restricted to authorised hospital staff.
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
            <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
            <p className="mt-1 text-sm text-slate-500">Sign in with your hospital staff account.</p>

            <form className="mt-7 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
              {location.state?.expired && !error && <Alert tone="warning">Your session expired. Please sign in again.</Alert>}
              {error && <Alert tone="error">{error}</Alert>}
              <div>
                <label className="label" htmlFor="username">Username</label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="username"
                    autoComplete="username"
                    autoFocus
                    placeholder="e.g. dr.sharma"
                    className={`input py-2.5 pl-9 ${errors.username ? 'input-error' : ''}`}
                    {...register('username', { required: 'Username is required' })}
                  />
                </div>
                {errors.username && <p className="mt-1 text-xs text-red-600">{errors.username.message}</p>}
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
              <button
                type="submit"
                className="btn-primary w-full bg-gradient-to-r from-brand-700 to-brand-600 py-3 text-base shadow-md shadow-brand-700/25 hover:from-brand-800 hover:to-brand-700"
                disabled={isSubmitting}
              >
                {isSubmitting && <Spinner className="h-4 w-4 text-white" />} {isSubmitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>

          <Link
            to="/portal/login"
            className="mt-4 flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3 text-sm transition-colors hover:bg-teal-50"
          >
            <span>
              <span className="block font-medium text-teal-900">Are you a patient?</span>
              <span className="block text-xs text-teal-700">View your eye reports and follow-up dates</span>
            </span>
            <span className="font-medium text-teal-700">Patient login →</span>
          </Link>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" /> Forgot your password? Ask your administrator to reset it.
          </p>
        </div>
      </div>
    </div>
  );
}
