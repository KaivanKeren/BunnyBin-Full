import { Route, Routes } from 'react-router-dom'
import { AuthGuard } from './auth/AuthGuard'
import { RoleGuard } from './auth/RoleGuard'
import { AppShell } from './components/layout/AppShell'
import { Alerts } from './pages/Alerts'
import { DashboardOverview } from './pages/DashboardOverview'
import { Login } from './pages/Login'
import { QuizManagement } from './pages/QuizManagement'
import { SchoolUnitManagement } from './pages/SchoolUnitManagement'
import { SortLogs } from './pages/SortLogs'
import { UnitDetail } from './pages/UnitDetail'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<AuthGuard />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardOverview />} />
          <Route path="/units/:id" element={<UnitDetail />} />
          <Route path="/sort-logs" element={<SortLogs />} />
          <Route path="/alerts" element={<Alerts />} />

          <Route element={<RoleGuard />}>
            <Route path="/quiz" element={<QuizManagement />} />
            <Route path="/management" element={<SchoolUnitManagement />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}
