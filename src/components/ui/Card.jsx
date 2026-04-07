import { cn } from '../../lib/utils.js'

export function Card({ children, className, padding = true, ...props }) {
  return (
    <div
      className={cn(
        'surface rounded-xl shadow-card',
        padding && 'p-4',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardSection({ title, action, children, className }) {
  return (
    <div className={cn('mb-5 last:mb-0', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          {title && (
            <h3 className="text-2xs font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
              {title}
            </h3>
          )}
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

export function MetricCard({ label, value, sub, icon: Icon, color = 'blue', trend }) {
  const colors = {
    blue:   'text-[#0C447C] bg-[#E6F1FB] dark:text-[#7ab0f5] dark:bg-[#0a1a3a]',
    green:  'text-[#27500A] bg-[#EAF3DE] dark:text-[#7fcf40] dark:bg-[#1a3a0a]',
    amber:  'text-[#633806] bg-[#FAEEDA] dark:text-[#f0a050] dark:bg-[#3a2500]',
    red:    'text-[#791F1F] bg-[#FCEBEB] dark:text-[#f87171] dark:bg-[#3a0a0a]',
    violet: 'text-[#3C3489] bg-[#EEEDFE] dark:text-[#b0a8f5] dark:bg-[#1a1040]',
  }

  return (
    <Card className="flex flex-col gap-1">
      <div className="flex items-start justify-between">
        <p className="text-xs text-[var(--color-text-2)] font-medium">{label}</p>
        {Icon && (
          <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', colors[color])}>
            <Icon size={14} />
          </div>
        )}
      </div>
      <p className="text-2xl font-semibold text-[var(--color-text-1)] tabular-nums">{value}</p>
      {sub && <p className="text-2xs text-[var(--color-text-3)]">{sub}</p>}
      {trend && (
        <p className={cn('text-2xs font-medium', trend > 0 ? 'text-success-500' : trend < 0 ? 'text-danger-500' : 'text-[var(--color-text-3)]')}>
          {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'} {Math.abs(trend)}% vs. ciclo anterior
        </p>
      )}
    </Card>
  )
}

export function TableRow({ children, className, onClick }) {
  return (
    <tr
      className={cn(
        'border-t border-[var(--color-border)] hover:bg-[var(--color-bg-2)] transition-colors',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {children}
    </tr>
  )
}

export function Td({ children, className, ...props }) {
  return (
    <td className={cn('px-4 py-3 text-sm text-[var(--color-text-1)]', className)} {...props}>
      {children}
    </td>
  )
}

export function Th({ children, className }) {
  return (
    <th className={cn('px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-[var(--color-text-3)] bg-[var(--color-bg-2)]', className)}>
      {children}
    </th>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-[var(--color-bg-2)] flex items-center justify-center mb-4">
          <Icon size={24} className="text-[var(--color-text-3)]" />
        </div>
      )}
      <p className="text-sm font-medium text-[var(--color-text-2)] mb-1">{title}</p>
      {description && <p className="text-xs text-[var(--color-text-3)] max-w-xs mb-4">{description}</p>}
      {action}
    </div>
  )
}

export function Skeleton({ className }) {
  return (
    <div className={cn('animate-pulse bg-[var(--color-bg-3)] rounded', className)} />
  )
}

export function Avatar({ nome, size = 'md', className }) {
  const sizes = { xs: 'w-6 h-6 text-2xs', sm: 'w-7 h-7 text-xs', md: 'w-8 h-8 text-xs', lg: 'w-10 h-10 text-sm', xl: 'w-12 h-12 text-base' }
  const inits = nome
    ? nome.trim().split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '?'
  return (
    <div className={cn(
      'rounded-full bg-primary-600 text-white flex items-center justify-center font-semibold flex-shrink-0',
      sizes[size] || sizes.md, className
    )}>
      {inits}
    </div>
  )
}
