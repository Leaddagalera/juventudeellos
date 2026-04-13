import { Component, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import { Layout } from './components/layout/Layout.jsx'
import { Button } from './components/ui/Button.jsx'

// ── Error Boundary ────────────────────────────────────────────────────────────

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('[ErrorBoundary]', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-dvh flex items-center justify-center bg-[var(--color-bg)] p-6">
          <div className="max-w-sm w-full text-center space-y-3">
            <p className="text-sm font-semibold text-[var(--color-text-1)]">Algo deu errado</p>
            <p className="text-xs text-[var(--color-text-3)]">{this.state.error?.message}</p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.href = '/dashboard' }}
              className="text-xs text-primary-600 underline"
            >
              Voltar ao início
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// Pages
import { InstallPrompt } from './components/ui/InstallPrompt.jsx'
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

function PendingApproval() {
  const { signOut, profile } = useAuth()
  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--color-bg)] p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto">
          <Clock size={28} className="text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="text-lg font-semibold text-[var(--color-text-1)]">Cadastro em análise</h2>
        <p className="text-sm text-[var(--color-text-2)] leading-relaxed">
          Olá{profile?.nome ? `, ${profile.nome.split(' ')[0]}` : ''}! Seu cadastro foi recebido e está aguardando aprovação do Líder Geral.
          Você receberá uma notificação no WhatsApp quando for aprovado.
        </p>
        <p className="text-xs text-[var(--color-text-3)]">
          Se já foi aprovado e ainda está vendo esta tela, saia e entre novamente.
        </p>
        <Button variant="secondary" onClick={signOut} className="mx-auto">Sair</Button>
      </div>
    </div>
  )
}

function ProfileError({ onRetry, onSignOut }) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--color-bg)] p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <p className="text-sm font-semibold text-[var(--color-text-1)]">Erro ao carregar perfil</p>
        <p className="text-xs text-[var(--color-text-3)] leading-relaxed">
          Não foi possível carregar seus dados. Verifique sua conexão e tente novamente.
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={onRetry}>Tentar novamente</Button>
          <Button variant="secondary" onClick={onSignOut}>Sair</Button>
        </div>
      </div>
    </div>
  )
}

function RequireAuth({ children }) {
  const { session, profile, loading, hydrating, profileLoading, profileAttempted, signOut, refreshProfile } = useAuth()

  // Primeira abertura sem cache — aguarda sessão e perfil
  if (loading) return <AppLoader />
  // Sem sessão confirmada e sem hydrating (verificação em curso com cache) → login
  if (!session && !hydrating) return <Navigate to="/login" replace />
  // Perfil ainda não disponível → aguarda
  if (profileLoading || !profileAttempted) return <AppLoader />
  // Perfil falhou e não há cache → erro recuperável
  if (!profile) return <ProfileError onRetry={refreshProfile} onSignOut={signOut} />
  // Cadastro pendente de aprovação
  if (profile.ativo === false) return <PendingApproval />
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

/** Redirect if the user's role is not in the allowed list */
function RequireRole({ allowed, children }) {
  const { profile, loading } = useAuth()
  if (loading) return <AppLoader />
  if (profile && !allowed.includes(profile.role)) return <Navigate to="/dashboard" replace />
  return children
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
    <ErrorBoundary>
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
            <Route path="/briefing"     element={<RequireRole allowed={['lider_geral','lider_funcao']}><Briefing /></RequireRole>} />
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

        {/* Solicitação de instalação PWA (mobile only) */}
        <InstallPrompt />
      </BrowserRouter>
    </AuthProvider>
    </ErrorBoundary>
  )
}
