import { Field, Input, Textarea } from '../common/Form';

export const VA_SUGGESTIONS = ['6/5', '6/6', '6/9', '6/12', '6/18', '6/24', '6/36', '6/60', '3/60', '1/60', 'CF', 'HM', 'PL', 'NPL', 'N6', 'N8', 'N10', 'N12'];
const VA_RE = /^(\d{1,2}\/\d{1,3}(\s?[pP])?|[01](\.\d{1,2})?|-0\.[0-3]|N\d{1,2}|CF\s?\d?\s?m?|CF|HM|PL\+?|PL|NPL|FC)$/i;

const quarter = (label) => (v) => {
  if (v === '' || v === null || v === undefined) return true;
  const n = Number(v);
  if (Number.isNaN(n)) return `${label} must be a number`;
  return Math.abs(n * 4 - Math.round(n * 4)) < 1e-9 || `${label} must be in 0.25 D steps`;
};

/** One eye's measurement block. `side` is "right" or "left". */
export default function EyeSection({ side, register, errors, watch }) {
  const p = `${side}_eye_`;
  const e = (k) => errors[`${p}${k}`]?.message;
  const cyl = watch(`${p}cylinder`);
  const title = side === 'right' ? 'Right Eye (OD)' : 'Left Eye (OS)';
  const accent = side === 'right' ? 'border-t-brand-600' : 'border-t-teal-600';
  const listId = `va-${side}`;

  return (
    <section className={`card print-break border-t-4 p-5 ${accent}`} aria-label={title}>
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      <datalist id={listId}>
        {VA_SUGGESTIONS.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Unaided visual acuity" error={e('unaided_va')} htmlFor={`${p}unaided_va`}>
          <Input id={`${p}unaided_va`} list={listId} placeholder="e.g. 6/12" error={e('unaided_va')} {...register(`${p}unaided_va`, { validate: (v) => !v || VA_RE.test(v.trim()) || 'Use Snellen (6/6), decimal, N, CF, HM, PL or NPL' })} />
        </Field>
        <Field label="Corrected visual acuity" error={e('corrected_va')} htmlFor={`${p}corrected_va`}>
          <Input id={`${p}corrected_va`} list={listId} placeholder="e.g. 6/6" error={e('corrected_va')} {...register(`${p}corrected_va`, { validate: (v) => !v || VA_RE.test(v.trim()) || 'Use Snellen (6/6), decimal, N, CF, HM, PL or NPL' })} />
        </Field>
        <Field label="Sphere (D)" error={e('sphere')} hint="−30 to +30, 0.25 steps" htmlFor={`${p}sphere`}>
          <Input
            id={`${p}sphere`}
            type="number"
            step="0.25"
            min="-30"
            max="30"
            inputMode="decimal"
            error={e('sphere')}
            {...register(`${p}sphere`, { min: { value: -30, message: 'Minimum −30.00 D' }, max: { value: 30, message: 'Maximum +30.00 D' }, validate: quarter('Sphere') })}
          />
        </Field>
        <Field label="Cylinder (D)" error={e('cylinder')} hint="−15 to +15, 0.25 steps" htmlFor={`${p}cylinder`}>
          <Input
            id={`${p}cylinder`}
            type="number"
            step="0.25"
            min="-15"
            max="15"
            inputMode="decimal"
            error={e('cylinder')}
            {...register(`${p}cylinder`, { min: { value: -15, message: 'Minimum −15.00 D' }, max: { value: 15, message: 'Maximum +15.00 D' }, validate: quarter('Cylinder') })}
          />
        </Field>
        <Field label="Axis (°)" error={e('axis')} hint={cyl && Number(cyl) !== 0 ? 'Required with cylinder' : '0 to 180'} htmlFor={`${p}axis`}>
          <Input
            id={`${p}axis`}
            type="number"
            step="1"
            min="0"
            max="180"
            inputMode="numeric"
            error={e('axis')}
            {...register(`${p}axis`, {
              min: { value: 0, message: 'Axis must be 0–180' },
              max: { value: 180, message: 'Axis must be 0–180' },
              validate: (v) => {
                if (v !== '' && !Number.isInteger(Number(v))) return 'Axis must be a whole number';
                if (v === '' && cyl !== '' && cyl !== undefined && Number(cyl) !== 0) return 'Axis is required when cylinder is recorded';
                return true;
              },
            })}
          />
        </Field>
        <Field label="IOP (mmHg)" error={e('iop')} hint="Optional, 0 to 80" htmlFor={`${p}iop`}>
          <Input
            id={`${p}iop`}
            type="number"
            step="0.1"
            min="0"
            max="80"
            inputMode="decimal"
            error={e('iop')}
            {...register(`${p}iop`, { min: { value: 0, message: 'IOP must be 0–80' }, max: { value: 80, message: 'IOP must be 0–80 mmHg' } })}
          />
        </Field>
        <Field label="Clinical findings" className="col-span-2" htmlFor={`${p}findings`}>
          <Textarea id={`${p}findings`} placeholder="Lids, conjunctiva, cornea, lens, fundus…" {...register(`${p}findings`)} />
        </Field>
      </div>
    </section>
  );
}
