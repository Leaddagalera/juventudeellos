/**
 * ReacoesBar — barra de reações emoji para comunicados
 * Props:
 *   comunicadoId: string (uuid)
 *   userId: string (uuid do usuário atual)
 *   initialReacoes?: array de objetos {emoji, user_id} (pré-carregados)
 *   variant?: 'white' (padrão, para cards coloridos) | 'neutral' (para cards normais)
 */
import { useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase.js'

const EMOJIS = ['🙏','🔥','❤️','👏','😂']

export function ReacoesBar({ comunicadoId, userId, initialReacoes = [], variant = 'white' }) {
  const [reacoes, setReacoes] = useState(initialReacoes)
  const [loading, setLoading] = useState(null) // emoji que está sendo processado

  // Agrupa por emoji: { '🙏': { count, minha: bool } }
  const grouped = EMOJIS.reduce((acc, e) => {
    const lista = reacoes.filter(r => r.emoji === e)
    acc[e] = { count: lista.length, minha: lista.some(r => r.user_id === userId) }
    return acc
  }, {})

  const toggle = useCallback(async (emoji) => {
    if (!userId || loading) return
    setLoading(emoji)
    const jaTem = grouped[emoji].minha

    // Optimistic update
    if (jaTem) {
      setReacoes(prev => prev.filter(r => !(r.emoji === emoji && r.user_id === userId)))
    } else {
      setReacoes(prev => [...prev, { emoji, user_id: userId, comunicado_id: comunicadoId }])
    }

    const revert = () => {
      if (jaTem) {
        setReacoes(prev => [...prev, { emoji, user_id: userId, comunicado_id: comunicadoId }])
      } else {
        setReacoes(prev => prev.filter(r => !(r.emoji === emoji && r.user_id === userId)))
      }
    }

    if (jaTem) {
      const { error } = await supabase.from('comunicado_reacoes')
        .delete()
        .eq('comunicado_id', comunicadoId)
        .eq('user_id', userId)
        .eq('emoji', emoji)
      if (error) { revert(); console.error('[ReacoesBar] delete', error) }
    } else {
      const { error } = await supabase.from('comunicado_reacoes')
        .insert({ comunicado_id: comunicadoId, user_id: userId, emoji })
      if (error) { revert(); console.error('[ReacoesBar] insert', error) }
    }

    setLoading(null)
  }, [comunicadoId, userId, grouped, loading])

  const isWhite = variant === 'white'

  return (
    <div className={`flex items-center gap-1 flex-wrap mt-2 pt-2 border-t ${isWhite ? 'border-white/15' : 'border-[var(--color-border)]'}`}>
      {EMOJIS.map(emoji => {
        const { count, minha } = grouped[emoji]
        return (
          <button
            key={emoji}
            onClick={() => toggle(emoji)}
            disabled={!!loading}
            className={`
              inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
              transition-all duration-150 select-none
              ${isWhite
                ? minha
                  ? 'bg-white/30 ring-1 ring-white/60 scale-105'
                  : count > 0
                    ? 'bg-white/15 hover:bg-white/25'
                    : 'bg-white/10 hover:bg-white/20 opacity-70 hover:opacity-100'
                : minha
                  ? 'bg-primary-100 dark:bg-primary-900/40 ring-1 ring-primary-400 dark:ring-primary-600 scale-105 text-primary-700 dark:text-primary-300'
                  : count > 0
                    ? 'bg-[var(--color-bg-2)] hover:bg-[var(--color-bg-3)] text-[var(--color-text-2)]'
                    : 'bg-[var(--color-bg-2)] hover:bg-[var(--color-bg-3)] text-[var(--color-text-3)] opacity-70 hover:opacity-100'
              }
              ${loading === emoji ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
            `}
          >
            <span>{emoji}</span>
            {count > 0 && (
              <span className={`tabular-nums ${isWhite ? 'text-white/90' : 'text-[var(--color-text-2)]'}`}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
