import { Navigate, useLocation } from 'react-router-dom';

// Retired service entry point: preserve digital report context.
export function CreatorServicesPage() {
  const { search } = useLocation();
  return <Navigate to={`/my/plan${search}`} replace />;
}
