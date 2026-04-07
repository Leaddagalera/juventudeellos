import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Calendar, ClipboardList, CheckSquare,
  UserCircle, UserPlus, Image
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { cn } from '../../lib/utils.js'

export function MobileNav() {
  const { isLiderGeral, isLiderFuncao, isMembroServe } = useAuth()

  const links = isLiderGeral
    ? [
        { to: '/dashboard',    icon: LayoutDashboard, label: 'Início' },
        { to: '/members',      icon: UserCircle,      label: 'Membros' },
        { to: '/schedule',     icon: Calendar,        label: 'Escalas' },
        { to: '/media',        icon: Image,           label: 'Mídia' },
        { to: '/profile',      icon: UserCircle,      label: 'Perfil' },
      ]
    : isLiderFuncao
    ? [
        { to: '/dashboard',    icon: LayoutDashboard, label: 'Início' },
        { to: '/briefing',     icon: ClipboardList,   label: 'Briefing' },
        { to: '/schedule',     icon: Calendar,        label: 'Escala' },
        { to: '/availability', icon: CheckSquare,     label: 'Disp.' },
        { to: '/profile',      icon: UserCircle,      label: 'Perfil' },
      ]
    : isMembroServe
    ? [
        { to: '/dashboard',    icon: LayoutDashboard, label: 'Início' },
        { to: '/schedule',     icon: Calendar,        label: 'Escala' },
        { to: '/availability', icon: CheckSquare,     label: 'Disp.' },
        { to: '/visitors',     icon: UserPlus,        label: 'Visit.' },
        { to: '/profile',      icon: UserCircle,      label: 'Perfil' },
      ]
    : [
        { to: '/dashboard',    icon: LayoutDashboard, label: 'Início' },
        { to: '/schedule',     icon: Calendar,        label: 'Escala' },
        { to: '/briefing',     icon: ClipboardList,   label: 'Briefing' },
        { to: '/profile',      icon: UserCircle,      label: 'Perfil' },
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
