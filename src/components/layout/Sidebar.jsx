import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, Calendar, ClipboardList,
  CheckSquare, UserPlus, BarChart2, Image, Bell,
  LogOut, Moon, Sun, Music, ChevronRight, Settings2,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { usePermissions } from '../../lib/permissions.js'
import { cn } from '../../lib/utils.js'
import { Avatar } from '../ui/Card.jsx'

// All possible nav items, tagged by the screen ID in the `perfis` table
const ALL_LINKS = [
  { screen: 'dashboard',       to: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
  { screen: 'membros',         to: '/members',       icon: Users,           label: 'Membros' },
  { screen: 'escalas',         to: '/schedule',      icon: Calendar,        label: 'Escalas' },
  { screen: 'briefings',       to: '/briefing',      icon: ClipboardList,   label: 'Briefings' },
  { screen: 'disponibilidade', to: '/availability',  icon: CheckSquare,     label: 'Disponibilidade' },
  { screen: 'visitantes',      to: '/visitors',      icon: UserPlus,        label: 'Visitantes' },
  { screen: 'relatorios',      to: '/reports',       icon: BarChart2,       label: 'Relatórios' },
  { screen: 'midia_login',     to: '/media',         icon: Image,           label: 'Mídia' },
  { screen: 'comunicados',     to: '/announcements', icon: Bell,            label: 'Comunicados' },
  { screen: 'configuracoes',   to: '/settings',      icon: Settings2,       label: 'Configurações', divider: true },
]

export function Sidebar({ onClose }) {
  const { profile, signOut, darkMode, setDarkMode } = useAuth()
  const { hasScreen } = usePermissions()

  const links = ALL_LINKS.filter(l => hasScreen(l.screen))

  return (
    <aside className="flex flex-col h-full w-60 bg-[var(--color-surface)] border-r border-[var(--color-border)]">
      {/* Header */}
      <div className="topbar-gradient px-4 py-4 flex-shrink-0">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
            <Music size={14} className="text-white" />
          </div>
          <span className="text-white font-semibold text-sm">Ellos Juventude</span>
        </div>
        <p className="text-[#9BB5D0] text-2xs pl-9">Assembleia de Deus</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {links.map(({ to, icon: Icon, label, divider }) => (
          <div key={to}>
            {divider && <div className="border-t border-[var(--color-border)] my-1.5" />}
            <NavLink
              to={to}
              onClick={onClose}
              className={({ isActive }) => cn('sidebar-link', isActive && 'active')}
            >
              <Icon size={16} />
              <span className="flex-1">{label}</span>
            </NavLink>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="flex-shrink-0 px-2 py-3 border-t border-[var(--color-border)] space-y-1">
        {/* Dark mode toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="sidebar-link w-full"
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          <span className="flex-1">{darkMode ? 'Modo claro' : 'Modo escuro'}</span>
        </button>

        {/* Profile row */}
        <NavLink to="/profile" onClick={onClose} className={({ isActive }) => cn('sidebar-link', isActive && 'active')}>
          <Avatar nome={profile?.nome} src={profile?.foto_url} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{profile?.nome || 'Perfil'}</p>
            <p className="text-2xs text-[var(--color-text-3)] truncate">{profile?.role || ''}</p>
          </div>
          <ChevronRight size={14} className="flex-shrink-0" />
        </NavLink>

        {/* Logout */}
        <button
          onClick={signOut}
          className="sidebar-link w-full text-danger-500 hover:bg-danger-50 dark:hover:bg-danger-500/10"
        >
          <LogOut size={16} />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  )
}
