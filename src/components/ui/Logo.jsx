/**
 * Logo Ellos Juventude — chama estilizada em SVG.
 * Props:
 *   size      — altura em px (largura proporcional automática)
 *   color     — cor da chama (default: currentColor / herda do texto)
 *   withText  — exibe "ELLOS JUVENTUDE" abaixo da chama
 *   textColor — cor do texto (default: currentColor)
 *   className
 */
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
      {/* Chama principal (esquerda / grande) */}
      <path
        d="M38 98C18 98 4 82 4 64C4 50 10 40 18 32C16 42 20 50 28 54C24 44 26 30 34 18C36 30 40 38 38 50C44 42 46 30 42 18C54 30 60 46 56 62C62 56 64 46 60 34C70 46 74 60 72 76C68 90 54 98 38 98Z"
        fill={color}
      />
      {/* Chama interna (língua direita) */}
      <path
        d="M50 96C44 96 38 90 38 82C38 74 42 68 48 64C46 70 48 76 52 78C50 70 52 60 58 52C60 62 60 72 56 80C60 76 62 70 60 62C66 68 68 78 64 86C62 92 56 96 50 96Z"
        fill={color}
        opacity="0.85"
      />
    </svg>
  )
}

export function EllosLogo({ size = 40, color = 'white', textColor = 'white', className = '' }) {
  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <FlameLogo size={size} color={color} />
      <div style={{ color: textColor, lineHeight: 1 }}>
        <p style={{
          fontWeight: 800, fontSize: size * 0.38,
          letterSpacing: '0.12em', margin: 0, lineHeight: 1,
        }}>
          ELLOS
        </p>
        <p style={{
          fontWeight: 600, fontSize: size * 0.18,
          letterSpacing: '0.22em', margin: 0, lineHeight: 1.2,
          opacity: 0.85,
        }}>
          JUVENTUDE
        </p>
      </div>
    </div>
  )
}
