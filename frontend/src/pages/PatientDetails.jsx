import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArchiveRestore, ClipboardPlus, History, Pencil, Printer, Trash2, UserRound } from 'lucide-react';
import { patientService } from '../services/patientService';
import { getErrorMessage } from '../services/api';
import { useAsync, useDocumentTitle } from '../hooks/useAsync';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { can } from '../utils/permissions';
import { Badge, DetailGrid, PageHeader, Tabs } from '../components/common/Display';
import { EmptyState, ErrorState, PageLoader, Skeleton } from '../components/common/Feedback';
import { ConfirmDialog } from '../components/common/Modal';
import PrintHeader from '../components/common/PrintHeader';
import PortalAccessCard from '../components/patients/PortalAccessCard';
import { CheckupTimeline, FollowupHistory, MedicalHistory } from '../components/checkups/CheckupTimeline';
import { formatDate, formatDateTime, titleCase } from '../utils/format';

export default function PatientDetails() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const clinical = can(user, 'viewClinical');
  const tab = params.get('tab') || 'overview';
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const patient = useAsync(() => patientService.get(id), [id]);
  const checkups = useAsync(() => patientService.checkups(id), [id], { enabled: clinical });
  const followups = useAsync(() => patientService.followups(id), [id]);
  const p = patient.data;
  useDocumentTitle(p ? `${p.full_name} (${p.patient_code})` : 'Patient');

  // ?print=1 opens the print dialog once data has loaded.
  const wantsPrint = params.get('print') === '1';
  const ready = p && (!clinical || checkups.data) && followups.data;
  useEffect(() => {
    if (wantsPrint && ready) {
      const t = setTimeout(() => {
        window.print();
        const next = new URLSearchParams(params);
        next.delete('print');
        setParams(next, { replace: true });
      }, 300);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [wantsPrint, ready, params, setParams]);

  const doDeactivate = async () => {
    setBusy(true);
    try {
      await patientService.deactivate(id);
      toast.success('Patient record deactivated. Clinical history preserved.');
      navigate('/patients');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const doRestore = async () => {
    try {
      const restored = await patientService.restore(id);
      patient.setData(restored);
      toast.success('Patient record restored');
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  if (patient.loading) return <PageLoader />;
  if (patient.error) return <div className="card"><ErrorState message={patient.error} onRetry={patient.reload} /></div>;

  const tabs = [
    { key: 'overview', label: 'Patient overview' },
    ...(clinical
      ? [
          { key: 'history', label: 'Check-up timeline', count: checkups.data?.length },
          { key: 'medical', label: 'Medical history' },
        ]
      : [{ key: 'followups', label: 'Follow-up appointments', count: followups.data?.length }]),
  ];

  const printing = wantsPrint;
  const show = (key) => printing || tab === key;

  return (
    <div className="print-area">
      <PrintHeader title="Patient Record" />
      <PageHeader
        icon={UserRound}
        title={p.full_name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold text-brand-700">{p.patient_code}</span>
            <span>· {p.age} yrs · {titleCase(p.gender)} · {p.mobile_number}</span>
            {!p.is_active && <Badge tone="red">Deactivated</Badge>}
          </span>
        }
        actions={
          <>
            {can(user, 'addCheckup') && p.is_active && (
              <Link to={`/checkups/new?patient=${p.id}`} className="btn-teal">
                <ClipboardPlus className="h-4 w-4" /> Add eye check-up
              </Link>
            )}
            {can(user, 'editPatient') && p.is_active && (
              <Link to={`/patients/${p.id}/edit`} className="btn-secondary">
                <Pencil className="h-4 w-4" /> Edit
              </Link>
            )}
            <button type="button" className="btn-secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </button>
            {can(user, 'deletePatient') &&
              (p.is_active ? (
                <button type="button" className="btn-secondary text-red-600" onClick={() => setConfirm('deactivate')}>
                  <Trash2 className="h-4 w-4" /> Deactivate
                </button>
              ) : (
                <button type="button" className="btn-secondary" onClick={doRestore}>
                  <ArchiveRestore className="h-4 w-4" /> Restore
                </button>
              ))}
          </>
        }
      />

      <Tabs tabs={tabs} active={tab} onChange={(k) => setParams(k === 'overview' ? {} : { tab: k }, { replace: true })} />

      {show('overview') && (
        <div className="space-y-5">
          <section className="card print-break p-5">
            <h2 className="mb-4 text-sm font-semibold">Personal & contact details</h2>
            <DetailGrid
              cols={4}
              items={[
                ['Patient ID', <span className="font-mono font-semibold">{p.patient_code}</span>],
                ['Full name', p.full_name],
                ['Date of birth', formatDate(p.date_of_birth)],
                ['Age / Gender', `${p.age} yrs / ${titleCase(p.gender)}`],
                ['Mobile number', p.mobile_number],
                ['Alternate phone', p.alternate_phone],
                ['Emergency contact', p.emergency_contact],
                ['Registration date', formatDate(p.registration_date)],
                ['Address', `${p.address}, ${p.village}, ${p.district}, ${p.state}`, true],
              ]}
            />
          </section>
          <section className="card print-break p-5">
            <h2 className="mb-4 text-sm font-semibold">Medical background (reported at registration)</h2>
            <DetailGrid
              cols={2}
              items={[
                ['Existing medical conditions', p.medical_history],
                ['Allergies', p.allergies ? <span className="font-medium text-red-700">{p.allergies}</span> : null],
                ['Previous eye problems', p.previous_eye_problems],
                ['Previous eye surgery', p.previous_eye_surgery],
                ['Remarks', p.remarks, true],
              ]}
            />
          </section>
          {can(user, 'registerPatient') && <PortalAccessCard patient={p} />}
          <section className="card no-print p-5 text-xs text-slate-500">
            Registered by {p.creator?.name || '—'} on {formatDateTime(p.created_at)}
            {p.updater && <> · Last updated by {p.updater.name} on {formatDateTime(p.updated_at)}</>}
          </section>
        </div>
      )}

      {clinical && show('history') && (
        <section className="mt-5">
          {printing && <h2 className="mb-3 text-sm font-semibold">Check-up timeline</h2>}
          {checkups.loading ? (
            <Skeleton className="h-40 w-full" />
          ) : checkups.error ? (
            <div className="card"><ErrorState message={checkups.error} onRetry={checkups.reload} /></div>
          ) : !checkups.data.length ? (
            <div className="card">
              <EmptyState
                icon={History}
                title="No eye check-ups recorded"
                message="Examinations for this patient will appear here."
                action={can(user, 'addCheckup') && p.is_active && <Link to={`/checkups/new?patient=${p.id}`} className="btn-teal">Add first check-up</Link>}
              />
            </div>
          ) : (
            <CheckupTimeline checkups={checkups.data} onPdfError={(e) => toast.error(getErrorMessage(e))} />
          )}
        </section>
      )}

      {clinical && show('medical') && checkups.data && followups.data && (
        <section className="mt-5">
          {checkups.data.length ? <MedicalHistory checkups={checkups.data} followups={followups.data} /> : !printing && <div className="card"><EmptyState title="No medical history yet" message="Diagnoses and prescriptions from eye check-ups will be listed here." /></div>}
        </section>
      )}

      {!clinical && show('followups') && followups.data && (
        <section className="mt-5">
          <FollowupHistory followups={followups.data} />
        </section>
      )}

      <ConfirmDialog
        open={confirm === 'deactivate'}
        tone="danger"
        title="Deactivate patient record?"
        confirmLabel="Deactivate"
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={doDeactivate}
        message={`${p.full_name} (${p.patient_code}) will be hidden from patient lists and reports. All check-ups and follow-ups are preserved and an administrator can restore the record.`}
      />
    </div>
  );
}
