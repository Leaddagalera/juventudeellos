import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Save, Clock, CheckCircle2, XCircle, Circle, Music } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { Card, EmptyState, Skeleton } from '../components/ui/Card.jsx'
import { Button } from '../components/ui/Button.jsx'
import { formatDomingo, subdepLabel } from '../lib/utils.js'
import { cn } from '../lib/utils.js'
import { isEnsaioSunday } from '../lib/scheduleEngine.js'
import { useSysConfig } from '../lib/sysConfig.js'

// ── Calendar helpers ──────────────────────────────────────────────────────────

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function buildGrid(year, month) {
  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const grid = []
  for (let i = 0; i < firstDay; i++) grid.push(null)
  for (let d = 1; d <= daysInMonth; d++) grid.push(d)
  while (grid.length % 7 !== 0) grid.push(null)
  return grid
}

function toDateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// ── Briefing content extractor ─────────────────────────────────────────────

// Determina o tema do culto pelo número do domingo no mês
function sundayTheme(dateStr) {
  const date = new Date(dateStr + 'T12:00:00')
  let count = 0
  const d = new Date(date.getFullYear(), date.getMonth(), 1)
  while (d <= date) {
    if (d.getDay() === 0) count++
    d.setDate(d.getDate() + 1)
  }
  const themes = ['Santa Ceia', 'Louvor e Adoração', 'Missões', 'Louvor e Adoração', 'Livre']
  return themes[count - 1] || 'Livre'
}

// Subdeps que exibem o briefing da regência em vez do próprio
const SUBDEP_USES_REGENCIA = ['louvor']

function briefContent(subdep, dados, domingo) {
  if (!dados) return []
  const lines = []

  if (subdep === 'ensaio') {
    if (dados.playlist_link) lines.push({ label: 'Playlist', value: dados.playlist_link, isLink: true })
    if (dados.hinos?.length > 0) lines.push({ label: 'Hinos', value: `${dados.hinos.length} hino(s) programado(s)` })
    if (dados.observacoes)   lines.push({ label: 'Obs', value: dados.observacoes })
    return lines
  }

  // Tema do culto para todos os subdeps normais
  const tema = domingo ? sundayTheme(domingo) : dados.tema_culto
  if (tema) lines.push({ label: 'Culto', value: tema })

  if (subdep === 'regencia') {
    if (dados.hinos)      lines.push({ label: 'Hinos', value: dados.hinos })
    if (dados.tom)        lines.push({ label: 'Tom', value: dados.tom })
    if (dados.instrumentos_necessarios?.length > 0)
      lines.push({ label: 'Instrumentos', value: dados.instrumentos_necessarios.join(', ') })
    if (dados.observacoes) lines.push({ label: 'Obs', value: dados.observacoes })
  } else if (subdep === 'ebd') {
    if (dados.licao)      lines.push({ label: 'Lição', value: `${dados.licao}` })
    if (dados.titulo)     lines.push({ label: 'Título', value: dados.titulo })
    if (dados.texto_base) lines.push({ label: 'Base', value: dados.texto_base })
    if (dados.observacoes) lines.push({ label: 'Obs', value: dados.observacoes })
  } else if (subdep === 'recepcao') {
    if (dados.postos)      lines.push({ label: 'Postos', value: dados.postos })
    if (dados.quantidade)  lines.push({ label: 'Qtd. pessoas', value: `${dados.quantidade}` })
    if (dados.arquivo_url) lines.push({ label: 'Fluxograma', value: dados.arquivo_url, isLink: true })
    if (dados.observacoes) lines.push({ label: 'Obs', value: dados.observacoes })
  } else if (subdep === 'midia') {
    if (dados.tema)       lines.push({ label: 'Tema visual', value: dados.tema })
    if (dados.links)      lines.push({ label: 'Links', value: dados.links })
    if (dados.metas)      lines.push({ label: 'Metas', value: dados.metas })
    if (dados.observacoes) lines.push({ label: 'Obs', value: dados.observacoes })
  }
  return lines
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Availability() {
  const { profile } = useAuth()
  const { config: sysConfig } = useSysConfig()

  const [ciclo,        setCiclo]        = useState(null)
  const [domingos,     setDomingos]     = useState([])
  const [briefings,    setBriefings]    = useState([])
  // disponibilis: { 'YYYY-MM-DD:subdep': true|false|null }
  const [disponibilis, setDisponibilis] = useState({})
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [inWindow,     setInWindow]     = useState(false)
  const [selectedDay,  setSelectedDay]  = useState(null)
  // Banner de avanço: registra se o dia estava completo ao ser aberto
  const [dayOpenedComplete, setDayOpenedComplete] = useState(false)
  const [bannerDismissed,   setBannerDismissed]   = useState(false)

  const [viewYear,  setViewYear]  = useState(new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(new Date().getMonth())

  const isObservador = profile?.role === 'membro_observador'

  const mySubdeps = (() => {
    const s = profile?.subdepartamento
    if (!s) return []
    return Array.isArray(s) ? s.filter(Boolean) : [s].filter(Boolean)
  })()

  // Returns subdeps active for a given Sunday.
  // Observadores: só 'ensaio' no domingo de ensaio, nada nos demais.
  // Demais membros: todos os seus subdeps + 'ensaio' no domingo de ensaio.
  const activeSubdepsForDay = (dateStr) => {
    const ensaioWeek = sysConfig?.ensaio_week ?? 4
    if (isEnsaioSunday(dateStr, ensaioWeek)) {
      return isObservador ? ['ensaio'] : (mySubdeps.length > 0 ? [...mySubdeps, 'ensaio'] : [])
    }
    return isObservador ? [] : mySubdeps
  }

  useEffect(() => {
    if (!profile?.id) return
    let cancelled = false
    loadData(() => cancelled)
    return () => { cancelled = true }
  }, [profile?.id])

  async function loadData(isCancelled = () => false) {
    setLoading(true)
    try {
      const { data: ciclos } = await supabase
        .from('ciclos').select('*')
        .in('status', ['briefing_regente','briefing_lider','disponibilidade','escala_publicada','confirmacoes'])
        .order('inicio', { ascending: false }).limit(1)
      if (isCancelled()) return

      const c = ciclos?.[0]
      if (!c) { setLoading(false); return }
      setCiclo(c)
      setInWindow(c.status === 'disponibilidade')

      const startDate = new Date(c.inicio + 'T00:00:00')
      setViewYear(startDate.getFullYear())
      setViewMonth(startDate.getMonth())

      // Build Sundays (local midnight)
      const suns = []
      const d = new Date(c.inicio + 'T00:00:00')
      while (d.getDay() !== 0) d.setDate(d.getDate() + 1)
      const end = new Date(c.fim + 'T00:00:00')
      while (d <= end) {
        const y  = d.getFullYear()
        const mo = String(d.getMonth() + 1).padStart(2, '0')
        const dy = String(d.getDate()).padStart(2, '0')
        suns.push(`${y}-${mo}-${dy}`)
        d.setDate(d.getDate() + 7)
      }
      setDomingos(suns)

      // Load briefings: user's subdeps + regencia (for subdeps that use it) + ensaio
      const needsRegencia = mySubdeps.some(s => SUBDEP_USES_REGENCIA.includes(s))
      const briSubdepsToFetch = needsRegencia && !mySubdeps.includes('regencia')
        ? [...mySubdeps, 'regencia']
        : mySubdeps
      const [{ data: subdepBris }, { data: ensaioBris }] = await Promise.all([
        briSubdepsToFetch.length > 0
          ? supabase.from('briefings').select('*').eq('ciclo_id', c.id).in('subdepartamento', briSubdepsToFetch).neq('tipo', 'ensaio')
          : { data: [] },
        supabase.from('briefings').select('*').eq('ciclo_id', c.id).eq('tipo', 'ensaio'),
      ])
      if (isCancelled()) return
      setBriefings([...(subdepBris || []), ...(ensaioBris || [])])

      // Load existing disponibilidade per subdep
      const { data: disps } = await supabase
        .from('disponibilidades').select('*')
        .eq('ciclo_id', c.id).eq('user_id', profile.id)
      if (isCancelled()) return

      // Initialize all slots as null (activeSubdepsForDay handles observer ensaio keys)
      const map = {}
      for (const sun of suns) {
        for (const sub of activeSubdepsForDay(sun)) {
          map[`${sun}:${sub}`] = null
        }
      }
      for (const r of (disps || [])) {
        map[`${r.domingo}:${r.subdepartamento}`] = r.disponivel
      }
      setDisponibilis(map)
    } finally {
      if (!isCancelled()) setLoading(false)
    }
  }

  // Reseta estado do banner quando o usuário abre um novo dia
  useEffect(() => {
    if (!selectedDay) { setDayOpenedComplete(false); setBannerDismissed(false); return }
    const active = activeSubdepsForDay(selectedDay)
    const complete = active.length > 0 && active.every(s => disponibilis[`${selectedDay}:${s}`] !== null)
    setDayOpenedComplete(complete)
    setBannerDismissed(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay])

  const toggleDisp = (domingo, subdep, value) => {
    if (!inWindow) return
    const key = `${domingo}:${subdep}`
    setDisponibilis(prev => ({
      ...prev,
      [key]: prev[key] === value ? null : value,
    }))
  }

  const fillAllAvailable = () => {
    setDisponibilis(prev => {
      const next = { ...prev }
      for (const sun of domingos) {
        for (const sub of activeSubdepsForDay(sun)) {
          const key = `${sun}:${sub}`
          if (next[key] === null) next[key] = true
        }
      }
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const entries = Object.entries(disponibilis)
        .filter(([, v]) => v !== null)
        .map(([key, disponivel]) => {
          const [domingo, subdepartamento] = key.split(':')
          return { user_id: profile.id, ciclo_id: ciclo.id, domingo, subdepartamento, disponivel }
        })

      await supabase.from('disponibilidades')
        .delete().eq('user_id', profile.id).eq('ciclo_id', ciclo.id)
      if (entries.length > 0)
        await supabase.from('disponibilidades').insert(entries)

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  // Total slots = sum of active subdeps per sunday (ensaio sundays may have fewer)
  const totalSlots  = domingos.reduce((acc, d) => acc + activeSubdepsForDay(d).length, 0)
  const filledSlots = domingos.reduce((acc, d) => {
    return acc + activeSubdepsForDay(d).filter(s => disponibilis[`${d}:${s}`] !== null).length
  }, 0)
  const pct = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0

  // Calendar colour: green if ALL subdeps available, red if ALL unavailable,
  // yellow if partial, grey if unset
  function dayCalendarState(dateStr) {
    if (!domingos.includes(dateStr)) return 'none'
    const active = activeSubdepsForDay(dateStr)
    if (active.length === 0) return 'unset'
    const vals = active.map(s => disponibilis[`${dateStr}:${s}`])
    if (vals.every(v => v === true))  return 'available'
    if (vals.every(v => v === false)) return 'unavailable'
    if (vals.some(v => v !== null))   return 'partial'
    return 'unset'
  }

  // ── Navegação entre domingos ────────────────────────────────────────────────
  const selectedDayIdx = selectedDay ? domingos.indexOf(selectedDay) : -1
  const prevDay        = selectedDayIdx > 0 ? domingos[selectedDayIdx - 1] : null
  const nextDay        = selectedDayIdx < domingos.length - 1 ? domingos[selectedDayIdx + 1] : null

  // Próximo domingo ainda com pelo menos uma resposta null
  const nextPendingDay = selectedDay ? domingos.find((d, i) => {
    if (i <= selectedDayIdx) return false
    return activeSubdepsForDay(d).some(s => disponibilis[`${d}:${s}`] === null)
  }) ?? null : null

  // Banner de avanço: dia foi completado durante esta visita
  const selectedDayComplete = selectedDay ? (() => {
    const active = activeSubdepsForDay(selectedDay)
    return active.length > 0 && active.every(s => disponibilis[`${selectedDay}:${s}`] !== null)
  })() : false
  const showAdvanceBanner = selectedDayComplete && !dayOpenedComplete && !bannerDismissed && inWindow

  // Atalho "disponível em todos": há algum slot null?
  const hasAnyPending = inWindow && domingos.some(d =>
    activeSubdepsForDay(d).some(s => disponibilis[`${d}:${s}`] === null)
  )

  const grid   = buildGrid(viewYear, viewMonth)
  const today  = new Date().toISOString().split('T')[0]

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  // ── Loading / Empty ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-3 max-w-lg mx-auto">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    )
  }

  if (!ciclo) {
    return (
      <div className="p-4 lg:p-6 max-w-lg mx-auto">
        <EmptyState icon={Clock} title="Nenhum ciclo ativo"
          description="A janela de disponibilidade ainda não foi aberta." />
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-lg mx-auto">

      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-1)]">Disponibilidade</h2>
        <p className="text-xs text-[var(--color-text-3)]">
          {inWindow ? 'Janela aberta — marque sua disponibilidade por subdepartamento' : 'Fora da janela de preenchimento'}
        </p>
      </div>

      {/* Progress */}
      <Card className="!p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-[var(--color-text-2)]">
            {filledSlots}/{totalSlots} respostas preenchidas
          </span>
          <span className={cn('text-xs font-semibold', pct === 100 ? 'text-success-500' : 'text-[var(--color-text-3)]')}>
            {pct}%
          </span>
        </div>
        <div className="cycle-bar">
          <div className={cn('cycle-bar-fill', pct === 100 && '!bg-success-500')} style={{ width: `${pct}%` }} />
        </div>
        {filledSlots < totalSlots && inWindow && (
          <p className="text-xs text-warning-500 mt-1.5">{totalSlots - filledSlots} resposta(s) pendente(s)</p>
        )}
      </Card>

      {/* Closed-window banner */}
      {!inWindow && (
        <div className="alert-strip warning">
          <Clock size={13} />
          <span>A janela {['escala_publicada','confirmacoes','encerrado'].includes(ciclo.status) ? 'está encerrada' : 'ainda não abriu'}</span>
        </div>
      )}

      {/* ── Calendar ──────────────────────────────────────────────────────────── */}
      <Card className="!p-3">
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-text-2)] transition-colors">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-[var(--color-text-1)]">{MONTHS[viewMonth]} {viewYear}</span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-text-2)] transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map(day => (
            <div key={day} className={cn('text-center text-2xs font-semibold py-1',
              day === 'Dom' ? 'text-primary-500' : 'text-[var(--color-text-3)]')}>{day}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-0.5">
          {grid.map((day, i) => {
            if (!day) return <div key={i} className="h-10" />
            const dateStr  = toDateStr(viewYear, viewMonth, day)
            const isEvent  = domingos.includes(dateStr)
            const state    = dayCalendarState(dateStr)
            const isSel    = selectedDay === dateStr
            const isToday  = dateStr === today

            let bg = '', fg = ''
            if (isEvent) {
              if (state === 'ensaio')      { bg = 'bg-purple-500/20 hover:bg-purple-500/30'; fg = 'text-purple-400' }
              else if (state === 'available')   { bg = 'bg-success-500 hover:bg-success-600'; fg = 'text-white' }
              else if (state === 'unavailable') { bg = 'bg-danger-500 hover:bg-danger-600'; fg = 'text-white' }
              else if (state === 'partial') { bg = 'bg-warning-500/80 hover:bg-warning-500'; fg = 'text-white' }
              else if (isSel)  { bg = 'bg-primary-600'; fg = 'text-white' }
              else { bg = 'bg-primary-100 dark:bg-primary-900/40 hover:bg-primary-200 dark:hover:bg-primary-900/60'; fg = 'text-primary-700 dark:text-primary-300' }
            }

            return (
              <div key={i} className="flex items-center justify-center">
                <button
                  onClick={() => isEvent && setSelectedDay(d => d === dateStr ? null : dateStr)}
                  disabled={!isEvent}
                  className={cn(
                    'relative w-9 h-9 rounded-full text-xs font-medium transition-all flex items-center justify-center',
                    isEvent ? `cursor-pointer ${bg} ${fg} shadow-sm` : 'cursor-default text-[var(--color-text-3)]',
                    isToday && !isEvent ? 'ring-1 ring-primary-400' : '',
                    isSel ? 'ring-2 ring-offset-1 ring-primary-600 dark:ring-offset-[var(--color-surface)]' : '',
                  )}
                >
                  {day}
                  {isEvent && state === 'unset' && !isSel && (
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary-400" />
                  )}
                </button>
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-3 pt-2 border-t border-[var(--color-border)] flex-wrap">
          {[
            { color: 'bg-success-500',  label: 'Disponível' },
            { color: 'bg-danger-500',   label: 'Indisponível' },
            { color: 'bg-warning-500',  label: 'Parcial' },
            { color: 'bg-primary-300 dark:bg-primary-800', label: 'Não respondido' },
            { color: 'bg-purple-500/40', label: 'Ensaio' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={cn('w-3 h-3 rounded-full inline-block', color)} />
              <span className="text-2xs text-[var(--color-text-3)]">{label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Selected day panel ─────────────────────────────────────────────────── */}
      {selectedDay && (
        <Card className="!p-4 border-l-4 border-primary-500">
          {/* Day header com navegação */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => prevDay && setSelectedDay(prevDay)}
              disabled={!prevDay}
              className={cn('p-1.5 rounded-lg transition-colors flex-shrink-0',
                prevDay ? 'text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]'
                        : 'text-[var(--color-text-3)] opacity-30 cursor-not-allowed')}
            >
              <ChevronLeft size={17} />
            </button>
            <div className="text-center min-w-0 px-1">
              <p className="text-sm font-semibold text-[var(--color-text-1)] truncate">{formatDomingo(selectedDay)}</p>
              <p className="text-2xs text-[var(--color-text-3)]">Dom {selectedDayIdx + 1} de {domingos.length}</p>
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={() => nextDay && setSelectedDay(nextDay)}
                disabled={!nextDay}
                className={cn('p-1.5 rounded-lg transition-colors',
                  nextDay ? 'text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]'
                          : 'text-[var(--color-text-3)] opacity-30 cursor-not-allowed')}
              >
                <ChevronRight size={17} />
              </button>
              <button
                onClick={() => setSelectedDay(null)}
                className="p-1.5 text-[var(--color-text-3)] hover:text-[var(--color-text-1)] transition-colors rounded-lg text-xs leading-none"
              >✕</button>
            </div>
          </div>

          {(() => {
            const activeSubdeps = activeSubdepsForDay(selectedDay)
            if (activeSubdeps.length === 0) return (
              <p className="text-xs text-[var(--color-text-3)]">
                {isObservador ? 'Neste domingo não há ensaio.' : 'Nenhum subdepartamento vinculado ao seu perfil.'}
              </p>
            )
            return (
            <div className="space-y-4">
              {activeSubdeps.map(subdep => {
                const key  = `${selectedDay}:${subdep}`
                const disp = disponibilis[key]
                const isEnsaioCard = subdep === 'ensaio'
                // Subdeps como 'louvor' exibem o briefing da regência
                const briSubdep = (!isEnsaioCard && SUBDEP_USES_REGENCIA.includes(subdep)) ? 'regencia' : subdep
                const bri  = isEnsaioCard
                  ? briefings.find(b => b.domingo === selectedDay && b.tipo === 'ensaio')
                  : briefings.find(b => b.domingo === selectedDay && b.subdepartamento === briSubdep && b.tipo !== 'ensaio')
                const lines = briefContent(briSubdep, bri?.dados_json, selectedDay)

                return (
                  <div key={subdep} className={cn(
                    'rounded-xl border overflow-hidden',
                    isEnsaioCard ? 'border-purple-500/40' : 'border-[var(--color-border)]'
                  )}>
                    {/* Subdep header */}
                    <div className={cn(
                      'flex items-center justify-between px-3 py-2',
                      isEnsaioCard ? 'bg-purple-500/10' : 'bg-[var(--color-surface-2)]'
                    )}>
                      <span className={cn(
                        'flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide',
                        isEnsaioCard ? 'text-purple-400' : 'text-[var(--color-text-1)]'
                      )}>
                        {isEnsaioCard && <Music size={12} />}
                        {isEnsaioCard ? 'Ensaio' : subdepLabel(subdep)}
                      </span>
                      {disp === true  ? <span className="flex items-center gap-1 text-2xs text-success-500 font-medium"><CheckCircle2 size={11} />Disponível</span> :
                       disp === false ? <span className="flex items-center gap-1 text-2xs text-danger-500 font-medium"><XCircle size={11} />Indisponível</span> :
                                        <span className="flex items-center gap-1 text-2xs text-[var(--color-text-3)]"><Circle size={11} />Sem resposta</span>}
                    </div>

                    <div className="px-3 py-3 space-y-3">
                      {/* Briefing content */}
                      {lines.length > 0 ? (
                        <div className="rounded-lg bg-[var(--color-bg-2)] border border-[var(--color-border)] px-3 py-2.5 space-y-1.5">
                          {lines.map(({ label, value, isLink }) => (
                            <div key={label} className="flex gap-2 text-xs">
                              <span className="text-[var(--color-text-3)] min-w-[5rem] flex-shrink-0 font-medium">{label}</span>
                              {isLink ? (
                                <a href={value} target="_blank" rel="noopener noreferrer"
                                  className="text-primary-400 hover:text-primary-300 underline leading-relaxed truncate">
                                  {value}
                                </a>
                              ) : (
                                <span className="text-[var(--color-text-1)] leading-relaxed">{value}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--color-text-3)] italic">
                          {bri ? 'Briefing preenchido · sem detalhes adicionais'
                               : isEnsaioCard ? 'Briefing do ensaio ainda não preenchido'
                               : 'Briefing ainda não preenchido'}
                        </p>
                      )}

                      {/* Availability toggle */}
                      {inWindow ? (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            onClick={() => toggleDisp(selectedDay, subdep, false)}
                            className={cn(
                              'py-2.5 rounded-xl text-xs font-medium transition-all border flex items-center justify-center gap-1.5',
                              disp === false
                                ? 'bg-danger-500 text-white border-danger-500'
                                : 'bg-transparent text-[var(--color-text-2)] border-[var(--color-border)] hover:border-danger-400 hover:text-danger-600',
                            )}
                          >
                            <XCircle size={13} /> Indisponível
                          </button>
                          <button
                            onClick={() => toggleDisp(selectedDay, subdep, true)}
                            className={cn(
                              'py-2.5 rounded-xl text-xs font-medium transition-all border flex items-center justify-center gap-1.5',
                              disp === true
                                ? 'bg-success-500 text-white border-success-500'
                                : 'bg-transparent text-[var(--color-text-2)] border-[var(--color-border)] hover:border-success-400 hover:text-success-600',
                            )}
                          >
                            <CheckCircle2 size={13} /> Disponível
                          </button>
                        </div>
                      ) : (
                        <div className="alert-strip warning text-xs pt-1">
                          <Clock size={11} />
                          <span>{['escala_publicada','confirmacoes','encerrado'].includes(ciclo.status) ? 'Janela encerrada' : 'Janela ainda não abriu'}</span>
                        </div>
                      )}

                      {/* Clear button */}
                      {inWindow && disp !== null && (
                        <button
                          onClick={() => toggleDisp(selectedDay, subdep, disp)}
                          className="w-full text-xs text-[var(--color-text-3)] hover:text-[var(--color-text-1)] transition-colors py-0.5 text-center"
                        >
                          Limpar resposta
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            )
          })()}

          {/* Banner de avanço — aparece ao completar o dia */}
          {showAdvanceBanner && (
            <div className="mt-4 rounded-xl border border-success-500/30 bg-success-500/10 p-3.5">
              <p className="text-xs font-semibold text-success-500 mb-1.5 flex items-center gap-1.5">
                <CheckCircle2 size={13} />
                {nextPendingDay ? 'Domingo preenchido!' : 'Tudo preenchido!'}
              </p>
              <p className="text-xs text-[var(--color-text-2)] mb-3">
                {nextPendingDay
                  ? 'Podemos avançar para o próximo domingo de serviço?'
                  : 'Todos os domingos foram respondidos. Não esqueça de salvar.'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setBannerDismissed(true)}
                  className="flex-1 py-2 rounded-lg text-xs font-medium border border-[var(--color-border)] text-[var(--color-text-3)] hover:text-[var(--color-text-1)] transition-colors"
                >
                  {nextPendingDay ? 'Agora não' : 'OK'}
                </button>
                {nextPendingDay && (
                  <button
                    onClick={() => setSelectedDay(nextPendingDay)}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold bg-success-500 text-white hover:bg-success-600 transition-colors flex items-center justify-center gap-1.5"
                  >
                    Sim, próximo <ChevronRight size={12} />
                  </button>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Atalho: marcar disponível em todos os domingos pendentes */}
      {hasAnyPending && (
        <button
          onClick={fillAllAvailable}
          className="w-full py-3 rounded-xl text-sm font-medium text-primary-500 border border-primary-500/30 hover:bg-primary-500/10 active:bg-primary-500/20 transition-colors"
        >
          Marcar disponível em todos os domingos
        </button>
      )}

      {/* Save button */}
      {inWindow && (
        <Button fullWidth size="lg" onClick={handleSave} loading={saving}>
          {saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
          {saved ? 'Salvo!' : 'Salvar disponibilidade'}
        </Button>
      )}

    </div>
  )
}
