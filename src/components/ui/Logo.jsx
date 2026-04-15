/**
 * Logo Ellos Juventude
 *
 * EllosLogo — usa o PNG real da marca (chama + texto)
 * FlameLogo — ícone SVG minimalista para contextos pequenos (sidebar, etc.)
 */

/** PNG completo: chama + "ELLOS JUVENTUDE" — ideal para login e splash */
export function EllosLogo({ height = 100, className = '', style = {} }) {
  return (
    <img
      src="/logo.png"
      alt="Ellos Juventude"
      height={height}
      style={{ height, width: 'auto', objectFit: 'contain', ...style }}
      className={className}
    />
  )
}

/** Ícone SVG da chama — para espaços pequenos onde texto ficaria ilegível */
export function FlameLogo({ size = 32, color = 'currentColor', className = '' }) {
  const w = size * 0.78
  return (
    <svg
      width={w}
      height={size}
      viewBox="0 0 78 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M38 98C18 98 4 82 4 64C4 50 10 40 18 32C16 42 20 50 28 54C24 44 26 30 34 18C36 30 40 38 38 50C44 42 46 30 42 18C54 30 60 46 56 62C62 56 64 46 60 34C70 46 74 60 72 76C68 90 54 98 38 98Z"
        fill={color}
      />
      <path
        d="M50 96C44 96 38 90 38 82C38 74 42 68 48 64C46 70 48 76 52 78C50 70 52 60 58 52C60 62 60 72 56 80C60 76 62 70 60 62C66 68 68 78 64 86C62 92 56 96 50 96Z"
        fill={color}
        opacity="0.85"
      />
    </svg>
  )
}
