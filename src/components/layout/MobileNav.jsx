import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Calendar, ClipboardList, CheckSquare,
  UserCircle, UserPlus, Image, Users, BarChart2, Bell, Settings2
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { usePermissions } from '../../lib/permissions.js'
import { cn } from '../../lib/utils.js'

// All possible mobile nav items, mapped to screen IDs
const ALL_MOBILE_LINKS = [
  { screen: 'dashboard',       to: '/dashboard',    icon: LayoutDashboard, label: 'Início' },
  { screen: 'membros',         to: '/members',      icon: Users,           label: 'Membros' },
  { screen: 'escalas',         to: '/schedule',     icon: Calendar,        label: 'Escalas' },
  { screen: 'briefings',       to: '/briefing',     icon: ClipboardList,   label: 'Briefing' },
  { screen: 'disponibilidade', to: '/availability', icon: CheckSquare,     label: 'Disp.' },
  { screen: 'visitantes',      to: '/visitors',     icon: UserPlus,        label: 'Visit.' },
  { screen: 'midia_login',     to: '/media',        icon: Image,           label: 'Mídia' },
  { screen: 'comunicados',     to: '/announcements', icon: Bell,           label: 'Avisos' },
]

const MAX_MOBILE_TABS = 4 // +1 for Perfil which is always shown

export function MobileNav() {
  const { hasScreen } = usePermissions()

  // Filter by permissions and take top tabs (mobile has limited space)
  const allowed = ALL_MOBILE_LINKS.filter(l => hasScreen(l.screen))
  const links = [
    ...allowed.slice(0, MAX_MOBILE_TABS),
    { to: '/profile', icon: UserCircle, label: 'Perfil' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-surface)] border-t border-[var(--color-border)] safe-pb">
      <div className="flex items-center justify-around px-2 pt-1 pb-1">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => cn('mobile-nav-item', isActive && 'active')}
          >
            <Icon size={20} strokeWidth={1.75} />
            <span className="text-2xs font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
