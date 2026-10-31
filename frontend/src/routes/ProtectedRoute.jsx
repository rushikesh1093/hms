import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PageLoader, EmptyState } from '../components/common/Feedback';
import { can } from '../utils/permissions';

/** Requires a logged-in user; optionally a permission from utils/permissions. */
export default function ProtectedRoute({ permission }) {
  const { user, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return <PageLoader label="Checking session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (permission && !can(user, permission)) {
    return (
      <EmptyState
        icon={ShieldX}
        title="Access restricted"
        message="Your role does not have permission to view this page. Contact an administrator if you need access."
      />
    );
  }
  return <Outlet />;
}
