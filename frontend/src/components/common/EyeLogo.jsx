import { useId } from 'react';

/**
 * Eye Care HMS brand mark: an almond eye with a gradient iris, pupil and catch-light.
 * `animated` adds a slow blink and a gentle iris glance (disabled for reduced-motion users).
 */
export default function EyeLogo({ className = 'h-10 w-10', animated = false, title = 'Eye Care HMS' }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      viewBox="0 0 64 64"
      className={`${className} ${animated ? 'eye-logo-animated' : ''}`}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={`bg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1f6fb2" />
          <stop offset="1" stopColor="#0a2f50" />
        </linearGradient>
        <radialGradient id={`iris-${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#5eead4" />
          <stop offset="0.6" stopColor="#14b8a6" />
          <stop offset="1" stopColor="#0f766e" />
        </radialGradient>
        <clipPath id={`lid-${id}`}>
          <path d="M6 32C12 21 21 15 32 15s20 6 26 17c-6 11-15 17-26 17S12 43 6 32z" />
        </clipPath>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#bg-${id})`} />
      <g className="eye-logo-lid">
        <path d="M6 32C12 21 21 15 32 15s20 6 26 17c-6 11-15 17-26 17S12 43 6 32z" fill="#fff" />
        <g clipPath={`url(#lid-${id})`}>
          <g className="eye-logo-iris">
            <circle cx="32" cy="32" r="11" fill={`url(#iris-${id})`} />
            <circle cx="32" cy="32" r="11" fill="none" stroke="#0f766e" strokeWidth="1" opacity="0.6" />
            <circle cx="32" cy="32" r="5" fill="#0a2f50" />
            <circle cx="35.5" cy="28.5" r="2.2" fill="#fff" opacity="0.95" />
          </g>
        </g>
        <path d="M6 32C12 21 21 15 32 15s20 6 26 17c-6 11-15 17-26 17S12 43 6 32z" fill="none" stroke="#0a2f50" strokeWidth="1.5" opacity="0.25" />
      </g>
    </svg>
  );
}
