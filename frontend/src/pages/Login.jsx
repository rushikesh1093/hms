import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../services/api';
import { Alert, Spinner } from '../components/common/Feedback';
import { useDocumentTitle } from '../hooks/useAsync';

export default function Login() {
  useDocumentTitle('Sign in');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState(null);
  const [showPw, setShowPw] = useState(false);
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

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 flex-col justify-between bg-brand-800 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white/10 p-2">
            <Eye className="h-6 w-6 text-teal-300" />
          </div>
          <div>
            <p className="font-semibold">Eye Care HMS</p>
            <p className="text-sm text-brand-200">Government District Hospital</p>
          </div>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight text-white">Patient registration, eye examinations and follow-up care in one place.</h1>
          <p className="mt-4 text-brand-100">Every record is saved to the hospital database with a full audit trail of who created or changed it.</p>
        </div>
        <p className="flex items-center gap-2 text-sm text-brand-200">
          <ShieldCheck className="h-4 w-4" /> Access is restricted to authorised hospital staff.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="rounded-xl bg-brand-700 p-2">
              <Eye className="h-6 w-6 text-teal-300" />
            </div>
            <p className="text-lg font-semibold">Eye Care HMS</p>
          </div>
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use your hospital staff account.</p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
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
                  className={`input pl-9 ${errors.username ? 'input-error' : ''}`}
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
                  className={`input pl-9 pr-10 ${errors.password ? 'input-error' : ''}`}
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
            <button type="submit" className="btn-primary w-full py-2.5" disabled={isSubmitting}>
              {isSubmitting && <Spinner className="h-4 w-4 text-white" />} Sign in
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
