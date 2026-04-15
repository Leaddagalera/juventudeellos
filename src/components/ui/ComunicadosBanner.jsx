import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Megaphone, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { subdepLabel } from '../../lib/utils.js'

const DEST_COLORS = {
  todos:    { bg: 'from-blue-600 to-blue-500',    text: 'text-white', badge: 'bg-white/20 text-white', label: 'Todos' },
  lideres:  { bg: 'from-amber-500 to-orange-500', text: 'text-white', badge: 'bg-white/20 text-white', label: 'Líderes' },
  louvor:   { bg: 'from-violet-600 to-purple-500',text: 'text-white', badge: 'bg-white/20 text-white', label: 'Louvor' },
  regencia: { bg: 'from-violet-600 to-purple-500',text: 'text-white', badge: 'bg-white/20 text-white', label: 'Regência' },
  ebd:      { bg: 'from-emerald-600 to-teal-500', text: 'text-white', badge: 'bg-white/20 text-white', label: 'EBD' },
  recepcao: { bg: 'from-emerald-600 to-teal-500', text: 'text-white', badge: 'bg-white/20 text-white', label: 'Recepção' },
  midia:    { bg: 'from-pink-600 to-rose-500',    text: 'text-white', badge: 'bg-white/20 text-white', label: 'Mídia' },
}

function timeAgo(isoDate) {
  const diff = Date.now() - new Date(isoDate).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 60)  return `${mins}min atrás`
  if (hours < 24) return `${hours}h atrás`
  if (days === 1) return 'ontem'
  return `${days} dias atrás`
}

export function ComunicadosBanner({ profile, isLider = false }) {
  const [comunicados, setComunicados] = useState([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    if (!profile) return
    load()
  }, [profile?.id])

  async function load() {
    setLoading(true)
    try {
      // Calcula quais destinatários este usuário vê
      const subdeps = Array.isArray(profile.subdepartamento)
        ? profile.subdepartamento
        : profile.subdepartamento ? [profile.subdepartamento] : []

      const destFiltros = ['todos', ...subdeps]
      if (isLider) destFiltros.push('lideres')

      const { data } = await supabase
        .from('comunicados')
        .select('*, users(nome, foto_url)')
        .in('destinatario', destFiltros)
        .order('criado_em', { ascending: false })
        .limit(5)

      setComunicados(data || [])
    } catch (err) {
      console.error('[ComunicadosBanner]', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading || comunicados.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Megaphone size={14} className="text-[var(--color-text-2)]" />
          <span className="text-xs font-semibold text-[var(--color-text-2)] uppercase tracking-wide">Comunicados</span>
        </div>
        <Link
          to="/announcements"
          className="text-xs text-primary-600 dark:text-primary-400 font-medium flex items-center gap-0.5 hover:underline"
        >
          Ver todos <ChevronRight size={12} />
        </Link>
      </div>

      <div className="space-y-2">
        {comunicados.map(c => {
          const cor = DEST_COLORS[c.destinatario] || DEST_COLORS.todos
          return (
            <div
              key={c.id}
              className={`bg-gradient-to-r ${cor.bg} rounded-2xl p-4 shadow-sm`}
            >
              <div className="flex items-start gap-3">
                {c.users?.foto_url
                  ? <img src={c.users.foto_url} alt={c.users.nome} className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-0.5 ring-2 ring-white/30" />
                  : <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-xs font-bold">
                      {c.users?.nome?.[0]?.toUpperCase() || <Megaphone size={13} />}
                    </div>
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs font-semibold ${cor.text}`}>
                      {c.users?.nome || 'Líder'}
                    </span>
                    <span className={`text-2xs px-1.5 py-0.5 rounded-full font-medium ${cor.badge}`}>
                      {DEST_COLORS[c.destinatario]?.label || c.destinatario}
                    </span>
                    <span className="text-2xs text-white/70 ml-auto">
                      {timeAgo(c.criado_em)}
                    </span>
                  </div>
                  <p className={`text-sm leading-snug ${cor.text} opacity-95`}>
                    {c.texto}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
