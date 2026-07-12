import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'

// school_admin yang memaksa akses URL super_admin diarahkan ke dashboard.
export function RoleGuard() {
  const { isSuperAdmin } = useAuth()

  return isSuperAdmin ? <Outlet /> : <Navigate to="/" replace />
}
