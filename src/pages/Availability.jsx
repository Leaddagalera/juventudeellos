import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Save, Clock, Info, CheckCircle2, XCircle, Circle } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { Card, EmptyState, Skeleton } from '../components/ui/Card.jsx'
import { Button } from '../components/ui/Button.jsx'
import { formatDomingo, subdepLabel } from '../lib/utils.js'
import { cn } from '../lib/utils.js'

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

// ── Subdep brief summary ──────────────────────────────────────────────────────

function briefSummary(subdep, dados) {
  if (!dados) return null
  if (subdep === 'louvor')   return dados.hinos ? `${dados.hinos}${dados.tom ? ` · Tom ${dados.tom}` : ''}` : null
  if (subdep === 'regencia') return dados.tema  || dados.titulo || null
  if (subdep === 'ebd')      return dados.titulo || null
  if (subdep === 'recepcao') return dados.observacoes || null
  if (subdep === 'midia')    return dados.observacoes || null
  return null
}

// ── Status helpers ────────────────────────────────────────────────────────────

// Returns the overall "readiness" of a Sunday across all subdeps
function sundayStatus(dateStr, disponibilis) {
  const v = disponibilis[dateStr]
  if (v === true)  return 'available'
  if (v === false) return 'unavailable'
  return 'unset'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Availability() {
  const { profile } = useAuth()

  const [ciclo,        setCiclo]        = useState(null)
  const [domingos,     setDomingos]     = useState([])
  const [briefings,    setBriefings]    = useState([])    // all subdeps
  const [disponibilis, setDisponibilis] = useState({})    // { dateStr: true|false|null }
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [inWindow,     setInWindow]     = useState(false)

  // Calendar navigation
  const [viewYear,  setViewYear]  = useState(new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(new Date().getMonth())

  // Selected day detail panel
  const [selectedDay, setSelectedDay] = useState(null)

  // User's subdepartamentos (array, always)
  const mySubdeps = (() => {
    const s = profile?.subdepartamento
    if (!s) return []
    return Array.isArray(s) ? s.filter(Boolean) : [s].filter(Boolean)
  })()

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
        .in('status', ['briefing_regente', 'briefing_lider', 'disponibilidade', 'escala_publicada', 'confirmacoes'])
        .order('inicio', { ascending: false }).limit(1)
      if (isCancelled()) return

      const c = ciclos?.[0]
      if (!c) { setLoading(false); return }
      setCiclo(c)

      // Window is open when and only when the cycle is in 'disponibilidade' phase
      setInWindow(c.status === 'disponibilidade')

      // Point calendar to cycle start month
      const startDate = new Date(c.inicio + 'T00:00:00')
      setViewYear(startDate.getFullYear())
      setViewMonth(startDate.getMonth())

      // Build list of Sundays within the cycle — use local date to avoid UTC offset issues
      const suns = []
      const d = new Date(c.inicio + 'T00:00:00')   // parse as local midnight
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

      // ── KEY FIX: load briefings for ALL user subdepartamentos ──────────────
      if (mySubdeps.length > 0) {
        const { data: bris } = await supabase
          .from('briefings').select('*')
          .eq('ciclo_id', c.id)
          .in('subdepartamento', mySubdeps)
        if (isCancelled()) return
        setBriefings(bris || [])
      }

      // Existing availability responses
      const { data: disps } = await supabase
        .from('disponibilidades').select('*')
        .eq('ciclo_id', c.id).eq('user_id', profile.id)
      if (isCancelled()) return

      const map = {}
      for (const s of suns) map[s] = null
      for (const r of (disps || [])) map[r.domingo] = r.disponivel
      setDisponibilis(map)
    } finally {
      if (!isCancelled()) setLoading(false)
    }
  }

  const toggleDisp = (domingo, value) => {
    if (!inWindow) return
    setDisponibilis(prev => ({
      ...prev,
      [domingo]: prev[domingo] === value ? null : value,
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const entries = Object.entries(disponibilis)
        .filter(([, v]) => v !== null)
        .map(([domingo, disponivel]) => ({
          user_id: profile.id, ciclo_id: ciclo.id, domingo, disponivel,
        }))
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
  const filled = Object.values(disponibilis).filter(v => v !== null).length
  const total  = domingos.length
  const pct    = total > 0 ? Math.round((filled / total) * 100) : 0
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
          {inWindow ? 'Janela aberta' : 'Fora da janela de preenchimento'}
        </p>
      </div>

      {/* Progress bar */}
      <Card className="!p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-[var(--color-text-2)]">
            {filled}/{total} domingos marcados
          </span>
          <span className={cn('text-xs font-semibold', pct === 100 ? 'text-success-500' : 'text-[var(--color-text-3)]')}>
            {pct}%
          </span>
        </div>
        <div className="cycle-bar">
          <div className={cn('cycle-bar-fill', pct === 100 && '!bg-success-500')} style={{ width: `${pct}%` }} />
        </div>
        {filled < total && inWindow && (
          <p className="text-xs text-warning-500 mt-1.5">{total - filled} domingo(s) sem resposta</p>
        )}
      </Card>

      {/* Closed-window banner */}
      {!inWindow && (
        <div className="alert-strip warning">
          <Clock size={13} />
          <span>A janela {['escala_publicada','confirmacoes','encerrado'].includes(ciclo.status) ? 'está encerrada' : 'ainda não abriu'}</span>
        </div>
      )}

      {/* ── Calendar card ────────────────────────────────────────────────────── */}
      <Card className="!p-3">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth}
            className="p-1.5 rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-text-2)] transition-colors">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-[var(--color-text-1)]">
            {MONTHS[viewMonth]} {viewYear}
          </span>
          <button onClick={nextMonth}
            className="p-1.5 rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-text-2)] transition-colors">
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map(day => (
            <div key={day} className={cn(
              'text-center text-2xs font-semibold py-1',
              day === 'Dom' ? 'text-primary-500' : 'text-[var(--color-text-3)]'
            )}>{day}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-y-0.5">
          {grid.map((day, i) => {
            if (!day) return <div key={i} className="h-10" />
            const dateStr = toDateStr(viewYear, viewMonth, day)
            const isEvent = domingos.includes(dateStr)
            const disp    = disponibilis[dateStr]
            const isSel   = selectedDay === dateStr
            const isToday = dateStr === today

            let bg = '', fg = ''
            if (isEvent) {
              if (disp === true)       { bg = 'bg-success-500 hover:bg-success-600'; fg = 'text-white' }
              else if (disp === false) { bg = 'bg-danger-500 hover:bg-danger-600';   fg = 'text-white' }
              else if (isSel)          { bg = 'bg-primary-600'; fg = 'text-white' }
              else                     { bg = 'bg-primary-100 dark:bg-primary-900/40 hover:bg-primary-200 dark:hover:bg-primary-900/60'; fg = 'text-primary-700 dark:text-primary-300' }
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
                  {isEvent && disp === null && !isSel && (
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
            { color: 'bg-success-500', label: 'Disponível' },
            { color: 'bg-danger-500',  label: 'Indisponível' },
            { color: 'bg-primary-200 dark:bg-primary-800', label: 'Não respondido' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={cn('w-3 h-3 rounded-full inline-block', color)} />
              <span className="text-2xs text-[var(--color-text-3)]">{label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Selected day panel (compartimentalizado por subdep) ─────────────── */}
      {selectedDay && (() => {
        const disp = disponibilis[selectedDay]
        return (
          <Card className="!p-4 border-l-4 border-primary-500">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-1)]">
                  {formatDomingo(selectedDay)}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  {disp === true  ? <><CheckCircle2 size={12} className="text-success-500" /><span className="text-xs text-success-600 font-medium">Disponível</span></> :
                   disp === false ? <><XCircle      size={12} className="text-danger-500"  /><span className="text-xs text-danger-600  font-medium">Indisponível</span></> :
                                    <><Circle       size={12} className="text-[var(--color-text-3)]" /><span className="text-xs text-[var(--color-text-3)]">Sem resposta</span></>}
                </div>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                className="text-[var(--color-text-3)] hover:text-[var(--color-text-1)] transition-colors p-1 rounded text-xs"
              >✕</button>
            </div>

            {/* ── Briefing por subdepartamento (compartimentalizado) ── */}
            {mySubdeps.length > 0 ? (
              <div className="space-y-2 mb-4">
                {mySubdeps.map(subdep => {
                  const bri  = briefings.find(b => b.domingo === selectedDay && b.subdepartamento === subdep)
                  const summ = bri ? briefSummary(subdep, bri.dados_json) : null
                  const hasBriefing = !!bri

                  return (
                    <div key={subdep}
                      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"
                    >
                      {/* Subdep header */}
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold text-[var(--color-text-1)] uppercase tracking-wide">
                          {subdepLabel(subdep)}
                        </p>
                        {hasBriefing ? (
                          <span className="flex items-center gap-1 text-2xs bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300 px-2 py-0.5 rounded-full">
                            <CheckCircle2 size={10} /> Briefing preenchido
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-2xs bg-[var(--color-border)] text-[var(--color-text-3)] px-2 py-0.5 rounded-full">
                            <Circle size={10} /> Briefing pendente
                          </span>
                        )}
                      </div>

                      {/* Briefing content */}
                      {summ ? (
                        <p className="text-xs text-[var(--color-text-2)] leading-relaxed">{summ}</p>
                      ) : hasBriefing ? (
                        <p className="text-xs text-[var(--color-text-3)] italic">Briefing preenchido · sem resumo disponível</p>
                      ) : (
                        <p className="text-xs text-[var(--color-text-3)] flex items-center gap-1">
                          <Info size={11} className="flex-shrink-0" />
                          O briefing deste subdepartamento ainda não foi preenchido
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="mb-4 p-3 rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)]">
                <p className="text-xs text-[var(--color-text-3)]">
                  Nenhum subdepartamento vinculado ao seu perfil.
                </p>
              </div>
            )}

            {/* ── Availability toggle (único por domingo) ── */}
            {inWindow ? (
              <>
                <p className="text-xs text-[var(--color-text-3)] mb-2">Sua disponibilidade para este domingo:</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => toggleDisp(selectedDay, true)}
                    className={cn(
                      'py-3 rounded-xl text-sm font-medium transition-all border flex items-center justify-center gap-1.5',
                      disp === true
                        ? 'bg-success-500 text-white border-success-500 shadow-sm'
                        : 'bg-transparent text-[var(--color-text-2)] border-[var(--color-border)] hover:border-success-400 hover:text-success-600',
                    )}
                  >
                    <CheckCircle2 size={15} />
                    Disponível
                  </button>
                  <button
                    onClick={() => toggleDisp(selectedDay, false)}
                    className={cn(
                      'py-3 rounded-xl text-sm font-medium transition-all border flex items-center justify-center gap-1.5',
                      disp === false
                        ? 'bg-danger-500 text-white border-danger-500 shadow-sm'
                        : 'bg-transparent text-[var(--color-text-2)] border-[var(--color-border)] hover:border-danger-400 hover:text-danger-600',
                    )}
                  >
                    <XCircle size={15} />
                    Indisponível
                  </button>
                </div>
                {disp !== null && disp !== undefined && (
                  <button
                    onClick={() => toggleDisp(selectedDay, disp)}   /* toggle off = sets to null */
                    className="w-full mt-2 text-xs text-[var(--color-text-3)] hover:text-[var(--color-text-1)] transition-colors py-1"
                  >
                    Limpar resposta
                  </button>
                )}
              </>
            ) : (
              <div className="alert-strip warning text-xs">
                <Clock size={12} />
                <span>{ciclo.status === 'escala_publicada' ? 'Janela encerrada' : 'Janela ainda não abriu'}</span>
              </div>
            )}
          </Card>
        )
      })()}

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
