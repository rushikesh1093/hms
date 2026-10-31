import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, ClipboardList, Eye, Printer, UserPen, UserPlus } from 'lucide-react';
import PatientForm, { patientToForm } from '../components/patients/PatientForm';
import { PageHeader } from '../components/common/Display';
import { ConfirmDialog } from '../components/common/Modal';
import { ErrorState, PageLoader } from '../components/common/Feedback';
import { patientService } from '../services/patientService';
import { applyFieldErrors, getErrorCode, getErrorMessage } from '../services/api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { useAsync, useDocumentTitle } from '../hooks/useAsync';
import { can } from '../utils/permissions';
import { formatDate } from '../utils/format';

export default function RegisterPatient() {
  const { id } = useParams();
  const editing = Boolean(id);
  useDocumentTitle(editing ? 'Edit patient' : 'Register patient');
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const setErrorRef = useRef(null);
  const [created, setCreated] = useState(null);
  const [duplicate, setDuplicate] = useState(null); // {payload, candidates}
  const [formKey, setFormKey] = useState(0);
  const [busy, setBusy] = useState(false);

  const existing = useAsync(() => patientService.get(id), [id], { enabled: editing });

  const handleError = (e) => {
    const code = getErrorCode(e);
    if (code === 'duplicate_patient') {
      const c = e.response.data.error.details?.[0];
      toast.error(`${getErrorMessage(e)}${c ? ` Existing record: ${c.patient_code} (${c.full_name}).` : ''}`);
      return;
    }
    if (!applyFieldErrors(e, setErrorRef.current || (() => {}))) toast.error(getErrorMessage(e));
    else toast.error('Please correct the highlighted fields.');
  };

  const submit = async (payload) => {
    try {
      if (editing) {
        await patientService.update(id, payload);
        toast.success('Patient details updated');
        navigate(`/patients/${id}`);
      } else {
        const p = await patientService.create(payload);
        setCreated(p);
        toast.success(`Patient registered: ${p.patient_code}`);
      }
    } catch (e) {
      if (!editing && getErrorCode(e) === 'possible_duplicate') {
        setDuplicate({ payload, candidates: e.response.data.error.details || [] });
        return;
      }
      handleError(e);
    }
  };

  const confirmNew = async () => {
    setBusy(true);
    try {
      const p = await patientService.create({ ...duplicate.payload, confirm_not_duplicate: true });
      setDuplicate(null);
      setCreated(p);
      toast.success(`Patient registered: ${p.patient_code}`);
    } catch (e) {
      setDuplicate(null);
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="card p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-teal-600" />
          <h1 className="mt-4 text-xl font-semibold">Patient registered successfully</h1>
          <p className="mt-1 text-sm text-slate-500">{created.full_name} · {created.age} yrs · registered {formatDate(created.registration_date)}</p>
          <div className="mx-auto mt-6 w-fit rounded-xl border-2 border-dashed border-brand-200 bg-brand-50 px-8 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-700">Patient ID</p>
            <p className="mt-1 font-mono text-3xl font-bold tracking-wider text-brand-800" data-testid="new-patient-code">{created.patient_code}</p>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <Link to={`/patients/${created.id}`} className="btn-primary">
              <Eye className="h-4 w-4" /> View patient
            </Link>
            {can(user, 'addCheckup') && (
              <Link to={`/checkups/new?patient=${created.id}`} className="btn-teal">
                <ClipboardList className="h-4 w-4" /> Add eye check-up
              </Link>
            )}
            <Link to={`/patients/${created.id}?print=1`} className="btn-secondary">
              <Printer className="h-4 w-4" /> Print
            </Link>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setCreated(null);
                setFormKey((k) => k + 1);
              }}
            >
              <UserPlus className="h-4 w-4" /> Register another
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (editing && existing.loading) return <PageLoader />;
  if (editing && existing.error) return <div className="card"><ErrorState message={existing.error} onRetry={existing.reload} /></div>;

  return (
    <>
      <PageHeader
        icon={editing ? UserPen : UserPlus}
        title={editing ? 'Edit patient details' : 'Register patient'}
        subtitle={editing ? `${existing.data.patient_code} · ${existing.data.full_name}` : 'A unique patient ID is generated automatically when the record is saved.'}
      />
      <PatientForm
        key={formKey}
        patientId={editing ? Number(id) : undefined}
        initial={editing ? patientToForm(existing.data) : undefined}
        onSubmit={submit}
        submitLabel={editing ? 'Save changes' : 'Register Patient'}
        serverErrorsRef={setErrorRef}
      />

      <ConfirmDialog
        open={!!duplicate}
        title="Possible duplicate registration"
        confirmLabel="Different person: register"
        busy={busy}
        onCancel={() => setDuplicate(null)}
        onConfirm={confirmNew}
        message="These existing patients have matching details. Open the existing record if it is the same person."
      >
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {duplicate?.candidates.map((d) => (
            <li key={d.id} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <Link to={`/patients/${d.id}`} className="font-mono text-sm font-semibold text-brand-700 underline">
                  {d.patient_code}
                </Link>
                <span className="text-xs text-amber-700">{d.match_reasons.join(', ')}</span>
              </div>
              <p className="text-sm text-slate-700">
                {d.full_name} · {d.age} yrs · {d.mobile_number} · {d.village}
              </p>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </>
  );
}
