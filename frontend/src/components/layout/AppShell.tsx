import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-emerald-600 text-white'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`

export function AppShell() {
  const { user, isSuperAdmin, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white p-4">
        <div className="mb-6 px-3">
          <span className="text-lg font-bold text-emerald-600">🐰 BunnyBin</span>
          <p className="text-xs text-slate-400">Admin Dashboard</p>
        </div>

        <nav className="flex flex-col gap-1">
          <NavLink to="/" end className={linkClass}>Dashboard</NavLink>
          <NavLink to="/sort-logs" className={linkClass}>Log Sortir</NavLink>
          <NavLink to="/alerts" className={linkClass}>Alert</NavLink>
          {isSuperAdmin && (
            <>
              <NavLink to="/quiz" className={linkClass}>Quiz Bank</NavLink>
              <NavLink to="/management" className={linkClass}>Sekolah & Unit</NavLink>
            </>
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="text-sm text-slate-500">
            {user?.school ? user.school.name : 'Semua Sekolah'}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium">{user?.name}</div>
              <div className="text-xs text-slate-400">
                {user?.role === 'super_admin' ? 'Super Admin' : 'Admin Sekolah'}
              </div>
            </div>
            <button
              onClick={() => void handleLogout()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              Keluar
            </button>
          </div>
        </header>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
