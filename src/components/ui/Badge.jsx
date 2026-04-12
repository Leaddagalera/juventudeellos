import { cn } from '../../lib/utils.js'
import { getProfileLabel } from '../../lib/permissions.js'

const variants = {
  default:  'bg-[var(--color-bg-2)] text-[var(--color-text-2)] border-[var(--color-border)]',
  green:    'bg-[#EAF3DE] text-[#27500A] border-[#97C459]  dark:bg-[#1a3a0a] dark:text-[#7fcf40] dark:border-[#2a5a0a]',
  amber:    'bg-[#FAEEDA] text-[#633806] border-[#E8A84C]  dark:bg-[#3a2500] dark:text-[#f0a050] dark:border-[#5a3800]',
  red:      'bg-[#FCEBEB] text-[#791F1F] border-[#F09595]  dark:bg-[#3a0a0a] dark:text-[#f87171] dark:border-[#5a1010]',
  blue:     'bg-[#E6F1FB] text-[#0C447C] border-[#85B7EB]  dark:bg-[#0a1a3a] dark:text-[#7ab0f5] dark:border-[#102a5a]',
  violet:   'bg-[#EEEDFE] text-[#3C3489] border-[#C4C0FA]  dark:bg-[#1a1040] dark:text-[#b0a8f5] dark:border-[#2a2060]',
  gray:     'bg-[var(--color-bg-2)] text-[var(--color-text-3)] border-[var(--color-border)]',
  primary:  'bg-primary-600 text-white border-primary-700',
}

const subdepColors = {
  louvor:   'bg-[#E6F1FB] text-[#0C447C] border-[#85B7EB] dark:bg-[#0a1a3a] dark:text-[#7ab0f5]',
  regencia: 'bg-[#EEEDFE] text-[#3C3489] border-[#C4C0FA] dark:bg-[#1a1040] dark:text-[#b0a8f5]',
  ebd:      'bg-[#D1FAE5] text-[#065F46] border-[#6EE7B7] dark:bg-[#0a2a1a] dark:text-[#6ee7b7]',
  recepcao: 'bg-[#FEF3C7] text-[#78350F] border-[#FCD34D] dark:bg-[#2a1a00] dark:text-[#fcd34d]',
  midia:    'bg-[#FCE7F3] text-[#831843] border-[#F9A8D4] dark:bg-[#2a0a1a] dark:text-[#f9a8d4]',
}

export function Badge({ children, variant = 'default', subdep, className, dot }) {
  const colorClass = subdep
    ? (subdepColors[subdep] || variants.default)
    : (variants[variant] || variants.default)

  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-2xs font-semibold border',
      colorClass,
      className
    )}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />}
      {children}
    </span>
  )
}

export function TarjaBadge({ tarja }) {
  if (!tarja) return <span className="text-2xs text-[var(--color-text-3)]">—</span>
  const map = {
    discipulo: { label: 'Discípulo',    cls: 'tarja-discipulo' },
    nicodemos: { label: 'Nicodemos',    cls: 'tarja-nicodemos' },
    prodigo:   { label: 'Filho Pródigo', cls: 'tarja-prodigo' },
  }
  const t = map[tarja] || map.discipulo
  return <span className={t.cls}>{t.label}</span>
}

export function SubdepBadge({ subdep }) {
  const labels = {
    louvor:   'Louvor',
    regencia: 'Regência',
    ebd:      'EBD',
    recepcao: 'Recepção',
    midia:    'Mídia',
  }
  return <Badge subdep={subdep}>{labels[subdep] || subdep}</Badge>
}

const ROLE_VARIANT_MAP = {
  lider_geral:      'primary',
  lider_funcao:     'blue',
  membro_serve:     'green',
  membro_observador:'gray',
}

const ROLE_LABEL_MAP = {
  lider_geral:      'Líder Geral',
  lider_funcao:     'Líder Função',
  membro_serve:     'Serve',
  membro_observador:'Observador',
}

export function RoleBadge({ role, label }) {
  const variant = ROLE_VARIANT_MAP[role] || 'default'
  const displayLabel = label || ROLE_LABEL_MAP[role] || getProfileLabel(role) || role
  return <Badge variant={variant}>{displayLabel}</Badge>
}
