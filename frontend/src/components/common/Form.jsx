import { forwardRef } from 'react';

export function Field({ label, error, required, hint, children, className = '', htmlFor }) {
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

export const Input = forwardRef(function Input({ error, className = '', ...props }, ref) {
  return <input ref={ref} className={`input ${error ? 'input-error' : ''} ${className}`} aria-invalid={!!error} {...props} />;
});

export const Select = forwardRef(function Select({ error, className = '', children, ...props }, ref) {
  return (
    <select ref={ref} className={`input ${error ? 'input-error' : ''} ${className}`} aria-invalid={!!error} {...props}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef(function Textarea({ error, className = '', rows = 3, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={`input ${error ? 'input-error' : ''} ${className}`} aria-invalid={!!error} {...props} />;
});

export function FormSection({ title, description, children, icon: Icon, className = '' }) {
  return (
    <section className={`card print-break p-5 ${className}`}>
      <div className="mb-4 flex items-start gap-3">
        {Icon && (
          <div className="rounded-lg bg-brand-50 p-2">
            <Icon className="h-4 w-4 text-brand-700" />
          </div>
        )}
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
