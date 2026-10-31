import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../context/ToastContext';
import EyeSection from '../components/checkups/EyeSection';
import { ConfirmDialog } from '../components/common/Modal';
import { Pagination } from '../components/common/Display';

vi.mock('../services/patientService', () => ({
  patientService: { checkDuplicates: vi.fn().mockResolvedValue([]) },
}));

import PatientForm from '../components/patients/PatientForm';
import { patientService } from '../services/patientService';

function renderWithProviders(ui) {
  return render(
    <MemoryRouter>
      <ToastProvider>{ui}</ToastProvider>
    </MemoryRouter>,
  );
}

describe('PatientForm', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks submission and shows required-field errors', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<PatientForm onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: /register patient/i }));
    expect(await screen.findByText('Full name is required')).toBeInTheDocument();
    expect(screen.getByText('Date of birth is required')).toBeInTheDocument();
    expect(screen.getByText('Gender is required')).toBeInTheDocument();
    expect(screen.getByText('Mobile number is required')).toBeInTheDocument();
    expect(screen.getByText('Address is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('validates mobile number format', async () => {
    renderWithProviders(<PatientForm onSubmit={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/mobile number/i), '12345');
    await userEvent.tab();
    expect(await screen.findByText('Enter a valid 10-digit mobile number')).toBeInTheDocument();
  });

  it('calculates age from date of birth', async () => {
    renderWithProviders(<PatientForm onSubmit={vi.fn()} />);
    const dob = screen.getByLabelText(/date of birth/i);
    await userEvent.type(dob, '2000-01-01');
    const expected = new Date().getFullYear() - 2000;
    expect(screen.getByLabelText(/^age/i)).toHaveValue(`${expected} years`);
  });

  it('submits a cleaned payload when valid', async () => {
    const onSubmit = vi.fn().mockResolvedValue();
    renderWithProviders(<PatientForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/full name/i), 'Asha Patil');
    await userEvent.type(screen.getByLabelText(/date of birth/i), '1960-03-03');
    await userEvent.selectOptions(screen.getByLabelText(/gender/i), 'female');
    await userEvent.type(screen.getByLabelText(/mobile number/i), '9876543210');
    await userEvent.type(screen.getByLabelText(/^address/i), 'House 1');
    await userEvent.type(screen.getByLabelText(/village/i), 'Karad');
    await userEvent.type(screen.getByLabelText(/district/i), 'Satara');
    await userEvent.type(screen.getByLabelText(/^state/i), 'Maharashtra');
    await userEvent.click(screen.getByRole('button', { name: /register patient/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0][0];
    expect(payload).toMatchObject({ full_name: 'Asha Patil', gender: 'female', mobile_number: '9876543210', allergies: null });
  });

  it('shows possible duplicates returned by the API', async () => {
    patientService.checkDuplicates.mockResolvedValue([
      { id: 7, patient_code: 'PT2026000007', full_name: 'Asha Patil', age: 66, mobile_number: '9876543210', village: 'Karad', registration_date: '2026-01-01', match_reasons: ['Same mobile number'] },
    ]);
    renderWithProviders(<PatientForm onSubmit={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/mobile number/i), '9876543210');
    expect(await screen.findByText('PT2026000007', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByText(/possible existing registration/i)).toBeInTheDocument();
  });
});

function EyeHarness({ onValid }) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm({ mode: 'onSubmit' });
  return (
    <form onSubmit={handleSubmit(onValid)} noValidate>
      <EyeSection side="right" register={register} errors={errors} watch={watch} />
      <button type="submit">save</button>
    </form>
  );
}

describe('EyeSection validation', () => {
  it('rejects out-of-range and non-quarter-step values', async () => {
    const onValid = vi.fn();
    render(<EyeHarness onValid={onValid} />);
    await userEvent.type(screen.getByLabelText(/sphere/i), '-1.3');
    await userEvent.type(screen.getByLabelText(/axis/i), '200');
    await userEvent.type(screen.getByLabelText(/iop/i), '90');
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(await screen.findByText('Sphere must be in 0.25 D steps')).toBeInTheDocument();
    expect(screen.getByText('Axis must be 0–180')).toBeInTheDocument();
    expect(screen.getByText('IOP must be 0–80 mmHg')).toBeInTheDocument();
    expect(onValid).not.toHaveBeenCalled();
  });

  it('requires axis when cylinder is entered and accepts optional blanks', async () => {
    const onValid = vi.fn();
    render(<EyeHarness onValid={onValid} />);
    await userEvent.type(screen.getByLabelText(/cylinder/i), '-0.75');
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(await screen.findByText('Axis is required when cylinder is recorded')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/axis/i), '90');
    await userEvent.type(screen.getByLabelText(/unaided/i), '6/12');
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    await waitFor(() => expect(onValid).toHaveBeenCalled());
  });

  it('rejects invalid visual acuity notation', async () => {
    render(<EyeHarness onValid={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/unaided/i), 'good');
    await userEvent.click(screen.getByRole('button', { name: 'save' }));
    expect(await screen.findByText(/use snellen/i)).toBeInTheDocument();
  });
});

describe('common components', () => {
  it('ConfirmDialog calls confirm and cancel handlers', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="Save?" message="Are you sure" confirmLabel="Yes, save" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByRole('dialog', { name: 'Save?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, save' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Pagination shows range and disables bounds', async () => {
    const onPage = vi.fn();
    render(<Pagination page={1} pages={3} total={45} pageSize={20} onPageChange={onPage} />);
    expect(screen.getByText(/showing/i)).toHaveTextContent('Showing 1–20 of 45');
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(onPage).toHaveBeenCalledWith(2);
  });
});

describe('route protection', () => {
  it('redirects anonymous users to login', async () => {
    vi.resetModules();
    vi.doMock('../services/authService', () => ({
      authService: { restore: vi.fn().mockRejectedValue(new Error('no session')) },
    }));
    const { AuthProvider } = await import('../context/AuthContext');
    const { default: ProtectedRoute } = await import('../routes/ProtectedRoute');
    render(
      <MemoryRouter initialEntries={['/patients']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<p>login page</p>} />
            <Route element={<ProtectedRoute />}>
              <Route path="/patients" element={<p>secret</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('shows access restricted for a role without permission', async () => {
    vi.resetModules();
    vi.doMock('../services/authService', () => ({
      authService: { restore: vi.fn().mockResolvedValue({ id: 3, name: 'Desk', role: 'receptionist' }) },
    }));
    const { AuthProvider } = await import('../context/AuthContext');
    const { default: ProtectedRoute } = await import('../routes/ProtectedRoute');
    render(
      <MemoryRouter initialEntries={['/users']}>
        <AuthProvider>
          <Routes>
            <Route element={<ProtectedRoute permission="manageUsers" />}>
              <Route path="/users" element={<p>user admin</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Access restricted')).toBeInTheDocument();
    expect(screen.queryByText('user admin')).not.toBeInTheDocument();
  });
});
