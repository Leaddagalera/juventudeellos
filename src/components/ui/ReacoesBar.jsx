/**
 * ReacoesBar — barra de reações emoji para comunicados
 * Props:
 *   comunicadoId: string (uuid)
 *   userId: string (uuid do usuário atual)
 *   initialReacoes?: array de objetos {emoji, user_id} (pré-carregados)
 */
import { useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase.js'

const EMOJIS = ['🙏','🔥','❤️','👏','😂']

export function ReacoesBar({ comunicadoId, userId, initialReacoes = [] }) {
  const [reacoes, setReacoes] = useState(initialReacoes)
  const [loading, setLoading] = useState(null) // emoji que está sendo processado

  // Agrupa por emoji: { '🙏': { count, minhaReacao: bool } }
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

    try {
      if (jaTem) {
        await supabase.from('comunicado_reacoes')
          .delete()
          .eq('comunicado_id', comunicadoId)
          .eq('user_id', userId)
          .eq('emoji', emoji)
      } else {
        await supabase.from('comunicado_reacoes')
          .insert({ comunicado_id: comunicadoId, user_id: userId, emoji })
      }
    } catch (err) {
      // Reverte se falhar
      if (jaTem) {
        setReacoes(prev => [...prev, { emoji, user_id: userId, comunicado_id: comunicadoId }])
      } else {
        setReacoes(prev => prev.filter(r => !(r.emoji === emoji && r.user_id === userId)))
      }
      console.error('[ReacoesBar]', err)
    } finally {
      setLoading(null)
    }
  }, [comunicadoId, userId, grouped, loading])

  return (
    <div className="flex items-center gap-1 flex-wrap mt-2 pt-2 border-t border-white/15">
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
              ${minha
                ? 'bg-white/30 ring-1 ring-white/60 scale-105'
                : count > 0
                  ? 'bg-white/15 hover:bg-white/25'
                  : 'bg-white/10 hover:bg-white/20 opacity-70 hover:opacity-100'
              }
              ${loading === emoji ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
            `}
          >
            <span>{emoji}</span>
            {count > 0 && <span className="text-white/90 tabular-nums">{count}</span>}
          </button>
        )
      })}
    </div>
  )
}
