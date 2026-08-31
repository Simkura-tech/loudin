/**
 * ProtectedRoute — wraps an element and redirects to /login when there's no
 * authenticated session. Waits for the initial /me probe before deciding so
 * a refresh of /app doesn't flash to /login.
 */

import { Navigate, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import { useAuth } from '../../contexts/AuthContext';

export function ProtectedRoute({ children }: { children: ReactElement }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null; // Brief blank while probing /me; could be a spinner.
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

export default ProtectedRoute;
