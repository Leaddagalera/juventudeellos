import { cn } from '../../lib/utils.js'

const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] select-none'

const variants = {
  primary:   'bg-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-600',
  secondary: 'bg-[var(--color-bg-2)] text-[var(--color-text-1)] border border-[var(--color-border)] hover:bg-[var(--color-bg-3)] focus-visible:ring-primary-600',
  danger:    'bg-danger-500 text-white hover:bg-danger-700 focus-visible:ring-danger-500',
  success:   'bg-success-500 text-white hover:bg-success-700 focus-visible:ring-success-500',
  ghost:     'text-[var(--color-text-2)] hover:bg-[var(--color-bg-2)] hover:text-[var(--color-text-1)] focus-visible:ring-primary-600',
  link:      'text-primary-600 dark:text-primary-400 hover:underline p-0 h-auto focus-visible:ring-primary-600',
}

const sizes = {
  xs: 'text-xs px-2.5 py-1.5 h-7',
  sm: 'text-sm px-3 py-1.5 h-8',
  md: 'text-sm px-4 py-2 h-9',
  lg: 'text-base px-5 py-2.5 h-11',
  xl: 'text-base px-6 py-3 h-12',
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  loading = false,
  fullWidth = false,
  ...props
}) {
  return (
    <button
      className={cn(
        base,
        variants[variant] || variants.primary,
        sizes[size] || sizes.md,
        fullWidth && 'w-full',
        className
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && (
        <svg className="animate-spin -ml-1 w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
}
