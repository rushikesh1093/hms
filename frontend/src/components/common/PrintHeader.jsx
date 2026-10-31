import { useHospital } from '../../hooks/useHospital';

/** Letterhead shown only when printing. */
export default function PrintHeader({ title }) {
  const h = useHospital();
  return (
    <div className="print-only mb-4 border-b-2 border-brand-700 pb-3 text-center">
      <p className="text-lg font-bold text-brand-800">{h.hospital_name}</p>
      {(h.hospital_address || h.hospital_phone) && (
        <p className="text-xs text-slate-600">{[h.hospital_address, h.hospital_phone].filter(Boolean).join(' | ')}</p>
      )}
      {title && <p className="mt-2 text-sm font-semibold uppercase tracking-wide">{title}</p>}
    </div>
  );
}
