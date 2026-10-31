import { describe, expect, it } from 'vitest';
import { addDays, calculateAge, cleanParams, formatDate, formatPower, isoDate, titleCase } from '../utils/format';
import { can, canEditCheckup } from '../utils/permissions';
import { toPatientPayload } from '../components/patients/PatientForm';

describe('format utils', () => {
  it('calculates age correctly around birthdays', () => {
    expect(calculateAge('2000-06-15', new Date(2026, 5, 14))).toBe(25);
    expect(calculateAge('2000-06-15', new Date(2026, 5, 15))).toBe(26);
    expect(calculateAge('')).toBeNull();
  });

  it('formats dates as DD-MM-YYYY', () => {
    expect(formatDate('2026-10-31')).toBe('31-10-2026');
    expect(formatDate(null)).toBe('—');
  });

  it('formats refractive powers with sign', () => {
    expect(formatPower(-1.25)).toBe('-1.25');
    expect(formatPower('2')).toBe('+2.00');
    expect(formatPower(0)).toBe('0.00');
    expect(formatPower(null)).toBe('—');
  });

  it('uses local dates and adds days across month ends', () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('drops empty query params', () => {
    expect(cleanParams({ a: '', b: null, c: 0, d: 'x', e: undefined })).toEqual({ c: 0, d: 'x' });
  });

  it('title-cases enum values', () => {
    expect(titleCase('post_operative')).toBe('Post Operative');
  });
});

describe('permissions', () => {
  const admin = { id: 1, role: 'admin' };
  const doctor = { id: 2, role: 'doctor' };
  const reception = { id: 3, role: 'receptionist' };

  it('maps roles to capabilities', () => {
    expect(can(reception, 'registerPatient')).toBe(true);
    expect(can(doctor, 'registerPatient')).toBe(false);
    expect(can(doctor, 'addCheckup')).toBe(true);
    expect(can(reception, 'viewClinical')).toBe(false);
    expect(can(admin, 'viewAudit')).toBe(true);
    expect(can(doctor, 'manageUsers')).toBe(false);
    expect(can(null, 'viewReports')).toBe(false);
  });

  it('lets only the examining doctor or an admin edit a check-up', () => {
    const checkup = { doctor_id: 2 };
    expect(canEditCheckup(doctor, checkup)).toBe(true);
    expect(canEditCheckup({ id: 9, role: 'doctor' }, checkup)).toBe(false);
    expect(canEditCheckup(admin, checkup)).toBe(true);
    expect(canEditCheckup(reception, checkup)).toBe(false);
  });
});

describe('patient payload', () => {
  it('trims values and sends null for empty optional fields', () => {
    const out = toPatientPayload({ full_name: '  Asha  Patil ', allergies: '  ', remarks: 'note', registration_date: '' });
    expect(out.full_name).toBe('Asha  Patil');
    expect(out.allergies).toBeNull();
    expect(out.remarks).toBe('note');
    expect(out).not.toHaveProperty('registration_date');
  });
});
