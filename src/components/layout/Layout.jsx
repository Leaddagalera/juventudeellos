import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu, X, Bell } from 'lucide-react'
import { Sidebar } from './Sidebar.jsx'
import { MobileNav } from './MobileNav.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { Avatar } from '../ui/Card.jsx'

const PAGE_TITLES = {
  '/dashboard':     'Dashboard',
  '/members':       'Membros',
  '/schedule':      'Escalas',
  '/briefing':      'Briefing',
  '/availability':  'Disponibilidade',
  '/visitors':      'Visitantes',
  '/reports':       'Relatórios',
  '/media':         'Mídia',
  '/announcements': 'Comunicados',
  '/profile':       'Perfil',
}

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { profile, isLiderGeral } = useAuth()
  const location = useLocation()
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  // Close sidebar on ESC
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setSidebarOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const title = PAGE_TITLES[location.pathname] || 'Ellos Juventude'

  return (
    <div className="flex h-dvh bg-[var(--color-bg)]">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-10 flex animate-slide-up">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Top bar */}
        <header className="flex-shrink-0 h-14 flex items-center justify-between px-4 bg-[var(--color-surface)] border-b border-[var(--color-border)] safe-pt">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-2)] hover:bg-[var(--color-bg-2)] transition-colors"
            >
              <Menu size={18} />
            </button>
            <h1 className="text-sm font-semibold text-[var(--color-text-1)]">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="relative w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-2)] hover:bg-[var(--color-bg-2)] transition-colors">
              <Bell size={16} />
              {isLiderGeral && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-danger-500 animate-pulse-dot" />
              )}
            </button>
            <Avatar nome={profile?.nome} src={profile?.foto_url} size="sm" className="lg:hidden" />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
          <div className="page-enter">
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom nav */}
        <div className="lg:hidden">
          <MobileNav />
        </div>
      </div>
    </div>
  )
}
