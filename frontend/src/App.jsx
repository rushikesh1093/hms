import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './routes/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import { PageLoader, EmptyState } from './components/common/Feedback';
import Login from './pages/Login';
import { hasPortalToken } from './services/portalApi';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const RegisterPatient = lazy(() => import('./pages/RegisterPatient'));
const Patients = lazy(() => import('./pages/Patients'));
const PatientDetails = lazy(() => import('./pages/PatientDetails'));
const SearchPatient = lazy(() => import('./pages/SearchPatient'));
const Checkups = lazy(() => import('./pages/Checkups'));
const AddCheckup = lazy(() => import('./pages/AddCheckup'));
const CheckupDetails = lazy(() => import('./pages/CheckupDetails'));
const Followups = lazy(() => import('./pages/Followups'));
const Reports = lazy(() => import('./pages/Reports'));
const Users = lazy(() => import('./pages/Users'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const Settings = lazy(() => import('./pages/Settings'));
const PortalHome = lazy(() => import('./pages/portal/PortalHome'));

function PublicOnly({ children }) {
  const { user, initializing } = useAuth();
  if (initializing) return <PageLoader label="Checking session…" />;
  return user ? <Navigate to="/" replace /> : children;
}

// Components (not inline conditions) so the token is checked on every navigation.
function PortalOnly({ children }) {
  return hasPortalToken() ? children : <Navigate to="/login?as=patient" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      {/* One login page with a Doctor/Staff ↔ Patient switch; /portal/login is a shortcut to the patient side. */}
      <Route path="/portal/login" element={<Navigate to="/login?as=patient" replace />} />
      <Route path="/portal" element={<PortalOnly><Suspense fallback={<PageLoader />}><PortalHome /></Suspense></PortalOnly>} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="patients" element={<Patients />} />
          <Route path="patients/:id" element={<PatientDetails />} />
          <Route path="search" element={<SearchPatient />} />
          <Route path="followups" element={<Followups />} />
          <Route path="settings" element={<Settings />} />

          <Route element={<ProtectedRoute permission="registerPatient" />}>
            <Route path="patients/new" element={<RegisterPatient />} />
            <Route path="patients/:id/edit" element={<RegisterPatient />} />
          </Route>
          <Route element={<ProtectedRoute permission="viewClinical" />}>
            <Route path="checkups" element={<Checkups />} />
            <Route path="checkups/new" element={<AddCheckup />} />
            <Route path="checkups/:id" element={<CheckupDetails />} />
            <Route path="checkups/:id/edit" element={<AddCheckup />} />
          </Route>
          <Route element={<ProtectedRoute permission="viewReports" />}>
            <Route path="reports" element={<Reports />} />
          </Route>
          <Route element={<ProtectedRoute permission="manageUsers" />}>
            <Route path="users" element={<Users />} />
          </Route>
          <Route element={<ProtectedRoute permission="viewAudit" />}>
            <Route path="audit-logs" element={<AuditLogs />} />
          </Route>
          <Route path="*" element={<EmptyState title="Page not found" message="The page you are looking for does not exist." />} />
        </Route>
      </Route>
    </Routes>
  );
}
