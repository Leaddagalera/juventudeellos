import { cn } from '../../lib/utils.js'

export function Input({ label, error, hint, className, ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-[var(--color-text-2)]">{label}</label>
      )}
      <input
        className={cn('input-base', error && 'border-danger-500 focus:ring-danger-500/30 focus:border-danger-500', className)}
        {...props}
      />
      {error && <p className="text-xs text-danger-500">{error}</p>}
      {hint && !error && <p className="text-xs text-[var(--color-text-3)]">{hint}</p>}
    </div>
  )
}

export function Textarea({ label, error, hint, className, rows = 3, ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-[var(--color-text-2)]">{label}</label>
      )}
      <textarea
        rows={rows}
        className={cn('input-base resize-none', error && 'border-danger-500', className)}
        {...props}
      />
      {error && <p className="text-xs text-danger-500">{error}</p>}
      {hint && !error && <p className="text-xs text-[var(--color-text-3)]">{hint}</p>}
    </div>
  )
}

export function Select({ label, error, hint, children, className, ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-[var(--color-text-2)]">{label}</label>
      )}
      <select
        className={cn('input-base', error && 'border-danger-500', className)}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-danger-500">{error}</p>}
      {hint && !error && <p className="text-xs text-[var(--color-text-3)]">{hint}</p>}
    </div>
  )
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className={cn('flex items-center gap-2 cursor-pointer select-none', disabled && 'opacity-50 cursor-not-allowed')}>
      <div
        onClick={() => !disabled && onChange?.(!checked)}
        className={cn(
          'relative w-9 h-5 rounded-full transition-colors duration-200',
          checked ? 'bg-primary-600' : 'bg-[var(--color-bg-3)]'
        )}
      >
        <div className={cn(
          'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0'
        )} />
      </div>
      {label && <span className="text-sm text-[var(--color-text-2)]">{label}</span>}
    </label>
  )
}

export function ChipSelect({ options, selected = [], onChange, max }) {
  const toggle = (val) => {
    if (selected.includes(val)) {
      onChange(selected.filter(v => v !== val))
    } else {
      if (max && selected.length >= max) return
      onChange([...selected, val])
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const isSelected = selected.includes(opt.value)
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={cn(
              'chip',
              isSelected && 'selected'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
