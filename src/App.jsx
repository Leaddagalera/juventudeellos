import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import { Layout } from './components/layout/Layout.jsx'

// Pages
import Login      from './pages/Login.jsx'
import Register   from './pages/Register.jsx'
import LiderGeralDashboard from './pages/dashboard/LiderGeralDashboard.jsx'
import MembroDashboard     from './pages/dashboard/MembroDashboard.jsx'
import Members      from './pages/Members.jsx'
import Briefing     from './pages/Briefing.jsx'
import Availability from './pages/Availability.jsx'
import Schedule     from './pages/Schedule.jsx'
import Visitors     from './pages/Visitors.jsx'
import Reports      from './pages/Reports.jsx'
import Media        from './pages/Media.jsx'
import Announcements from './pages/Announcements.jsx'
import Profile      from './pages/Profile.jsx'
import Settings     from './pages/Settings.jsx'

// ── Guards ───────────────────────────────────────────────────────────────────

function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <AppLoader />
  if (!session) return <Navigate to="/login" replace />
  return children
}

function RedirectIfAuth({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <AppLoader />
  if (session) return <Navigate to="/dashboard" replace />
  return children
}

function DashboardRouter() {
  const { isLiderGeral, isLiderFuncao, loading } = useAuth()
  if (loading) return <AppLoader />
  if (isLiderGeral || isLiderFuncao) return <LiderGeralDashboard />
  return <MembroDashboard />
}

function AppLoader() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--color-bg)]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[var(--color-text-3)]">Carregando...</p>
      </div>
    </div>
  )
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login"    element={<RedirectIfAuth><Login /></RedirectIfAuth>} />
          <Route path="/register" element={<RedirectIfAuth><Register /></RedirectIfAuth>} />

          {/* Protected */}
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route path="/dashboard"    element={<DashboardRouter />} />
            <Route path="/members"      element={<Members />} />
            <Route path="/briefing"     element={<Briefing />} />
            <Route path="/availability" element={<Availability />} />
            <Route path="/schedule"     element={<Schedule />} />
            <Route path="/visitors"     element={<Visitors />} />
            <Route path="/reports"      element={<Reports />} />
            <Route path="/media"        element={<Media />} />
            <Route path="/announcements" element={<Announcements />} />
            <Route path="/profile"      element={<Profile />} />
            <Route path="/settings"     element={<Settings />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
