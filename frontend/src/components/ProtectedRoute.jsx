import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ roles }) {
  const { user, loading, disabled, error, refresh } = useAuth();
  const location = useLocation();
  if (loading) return <div className="p-8" role="status">Checking your session...</div>;
  if (error) return <div className="p-8" role="alert">{error} <button className="link" onClick={() => refresh().catch(() => {})}>Retry</button></div>;
  if (disabled) return <Navigate to="/account-disabled" replace />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  return <Outlet />;
}
