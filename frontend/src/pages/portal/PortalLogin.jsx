import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarClock, Eye, EyeOff, FileText, IdCard, Lock, ShieldCheck } from 'lucide-react';
import { portalService } from '../../services/portalApi';
import { getErrorMessage } from '../../services/api';
import { Alert, Spinner } from '../../components/common/Feedback';
import EyeLogo from '../../components/common/EyeLogo';
import { useDocumentTitle } from '../../hooks/useAsync';

const FEATURES = [
  { icon: FileText, title: 'Your eye reports', text: 'See your examinations and download prescriptions.' },
  { icon: CalendarClock, title: 'Your appointments', text: 'Check when your next follow-up visit is due.' },
];

export default function PortalLogin() {
  useDocumentTitle('Patient sign in');
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { patient_code: '', password: '' } });

  const onSubmit = async ({ patient_code, password }) => {
    setError(null);
    try {
      await portalService.login(patient_code.trim(), password);
      navigate('/portal', { replace: true });
    } catch (e) {
      setError(getErrorMessage(e, 'Sign in failed'));
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-teal-700 via-brand-800 to-brand-900 p-12 text-white lg:flex">
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 top-1/2 h-[560px] w-[560px] -translate-y-1/2 rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-1/2 h-[400px] w-[400px] -translate-y-1/2 rounded-full border border-white/10" />
        <div className="relative flex items-center gap-3">
          <EyeLogo className="h-11 w-11 rounded-xl shadow-lg shadow-black/30" />
          <div>
            <p className="text-lg font-semibold tracking-tight">Eye Care HMS</p>
            <p className="text-sm text-teal-100">Patient portal</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <EyeLogo animated className="login-float mb-8 h-24 w-24 rounded-3xl shadow-2xl shadow-black/40 ring-4 ring-white/10" />
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-white">
            Your eye health,<br />
            <span className="text-teal-300">in your hands.</span>
          </h1>
          <ul className="mt-8 space-y-4">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="mt-0.5 rounded-lg bg-white/10 p-2 ring-1 ring-white/10">
                  <Icon className="h-4 w-4 text-teal-300" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-white">{title}</span>
                  <span className="block text-sm text-teal-100">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-sm text-teal-100">
          <ShieldCheck className="h-4 w-4" /> You can only see your own records.
        </p>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-4 py-12">
        <div className="login-fade-up relative w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <EyeLogo animated className="h-16 w-16 rounded-2xl shadow-xl shadow-brand-900/20" />
            <p className="mt-3 text-xl font-semibold tracking-tight text-slate-900">Eye Care HMS</p>
            <p className="text-sm text-slate-500">Patient portal</p>
          </div>

          <div className="card p-8 shadow-xl shadow-slate-200/70">
            <h2 className="text-2xl font-semibold tracking-tight">Patient sign in</h2>
            <p className="mt-1 text-sm text-slate-500">Use the patient ID on your hospital card and the password given at the reception.</p>

            <form className="mt-7 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
              {location.state?.expired && !error && <Alert tone="warning">Your session ended. Please sign in again.</Alert>}
              {error && <Alert tone="error">{error}</Alert>}
              <div>
                <label className="label" htmlFor="patient_code">Patient ID</label>
                <div className="relative">
                  <IdCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="patient_code"
                    autoComplete="username"
                    autoFocus
                    placeholder="e.g. PT2026000123"
                    className={`input py-2.5 pl-9 uppercase placeholder:normal-case ${errors.patient_code ? 'input-error' : ''}`}
                    {...register('patient_code', { required: 'Patient ID is required' })}
                  />
                </div>
                {errors.patient_code && <p className="mt-1 text-xs text-red-600">{errors.patient_code.message}</p>}
              </div>
              <div>
                <label className="label" htmlFor="portal_password">Password</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="portal_password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
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
              </div>
              <button type="submit" className="btn-teal w-full py-3 text-base shadow-md shadow-teal-700/25" disabled={isSubmitting}>
                {isSubmitting && <Spinner className="h-4 w-4 text-white" />} {isSubmitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-slate-500">
            No password yet? Ask at the hospital reception to enable your patient login.
          </p>
          <p className="mt-3 text-center text-sm">
            <Link to="/login" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" /> Hospital staff sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
