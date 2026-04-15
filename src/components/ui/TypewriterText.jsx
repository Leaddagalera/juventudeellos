// src/components/ui/TypewriterText.jsx
import { useState, useEffect, useRef } from 'react'

// ── Configuração de tempo (ms) — fácil de ajustar ─────────────────────────
const DEFAULT_TIMING = {
  typeSpeed:        75,   // velocidade de digitação por letra
  deleteSpeed:      40,   // velocidade de apagamento por letra
  pauseAfterType: 1800,   // pausa com a palavra completa visível
  pauseAfterDelete: 350,  // pausa antes de começar a próxima
}

const DEFAULT_WORDS = ['Estrutura', 'Liderança', 'Ligação', 'Organização', 'Serviço']

/**
 * TypewriterText — animação de digitação/apagamento em loop infinito.
 *
 * Props:
 *   words   — array de palavras a exibir (default: lista Ellos)
 *   timing  — objeto parcial com overrides de DEFAULT_TIMING
 *   style   — estilos extras no container
 *   className
 */
export function TypewriterText({
  words     = DEFAULT_WORDS,
  timing    = {},
  style     = {},
  className = '',
}) {
  const cfg = { ...DEFAULT_TIMING, ...timing }

  const [displayed, setDisplayed] = useState('')
  const [phase, setPhase]         = useState('typing') // typing | paused | deleting | waiting
  const wordIndex = useRef(0)
  const charIndex = useRef(0)

  useEffect(() => {
    const word = words[wordIndex.current]
    let timeout

    if (phase === 'typing') {
      if (charIndex.current < word.length) {
        charIndex.current++
        setDisplayed(word.slice(0, charIndex.current))
        timeout = setTimeout(() => setPhase('typing'), cfg.typeSpeed)
      } else {
        // Palavra completa — pausa antes de apagar
        timeout = setTimeout(() => setPhase('deleting'), cfg.pauseAfterType)
      }

    } else if (phase === 'deleting') {
      if (charIndex.current > 0) {
        charIndex.current--
        setDisplayed(word.slice(0, charIndex.current))
        timeout = setTimeout(() => setPhase('deleting'), cfg.deleteSpeed)
      } else {
        // Apagamento completo — avança para próxima palavra
        timeout = setTimeout(() => setPhase('waiting'), cfg.pauseAfterDelete)
      }

    } else if (phase === 'waiting') {
      wordIndex.current = (wordIndex.current + 1) % words.length
      charIndex.current = 0
      setPhase('typing')
    }

    return () => clearTimeout(timeout)
  }, [phase, displayed])

  const showCursor = phase === 'typing' || phase === 'deleting'

  return (
    // Altura fixa — impede que o layout "pule" quando a palavra muda de tamanho
    <div
      style={{
        height: '1.6em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
      className={className}
    >
      <span style={{
        color: 'rgba(255,255,255,0.55)',
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.28em',
        textTransform: 'uppercase',
      }}>
        {displayed}

        {/* Cursor piscante — visível apenas durante digitação e apagamento */}
        <span
          className={showCursor ? 'tw-cursor' : ''}
          style={{
            display: 'inline-block',
            width: 1.5,
            height: '0.8em',
            background: showCursor ? 'rgba(255,255,255,0.5)' : 'transparent',
            marginLeft: 3,
            verticalAlign: 'middle',
          }}
        />
      </span>
    </div>
  )
}
