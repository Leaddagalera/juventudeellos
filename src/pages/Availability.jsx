import { useState, useEffect } from 'react'
import { Save, Clock, Info } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { Card, EmptyState, Skeleton } from '../components/ui/Card.jsx'
import { Button } from '../components/ui/Button.jsx'
import { formatDomingo, subdepLabel } from '../lib/utils.js'

function DomingoCard({ domingo, briefing, disponivel, blocked, onToggle }) {
  const status = blocked ? 'blocked' : disponivel === true ? 'available' : disponivel === false ? 'unavailable' : 'unset'

  return (
    <Card className="!p-3">
      <div className="mb-2">
        <p className="text-sm font-semibold text-[var(--color-text-1)]">{formatDomingo(domingo)}</p>
        {briefing?.dados_json && (
          <p className="text-xs text-[var(--color-text-3)] mt-0.5">
            {briefing.subdepartamento === 'louvor' && briefing.dados_json.hinos
              ? `${briefing.dados_json.hinos} · Tom ${briefing.dados_json.tom || '?'}`
              : briefing.subdepartamento === 'ebd' && briefing.dados_json.titulo
              ? briefing.dados_json.titulo
              : subdepLabel(briefing.subdepartamento)
            }
          </p>
        )}
        {!briefing && (
          <p className="text-xs text-[var(--color-text-3)] mt-0.5 flex items-center gap-1">
            <Info size={11} />
            Briefing ainda não preenchido
          </p>
        )}
      </div>

      {blocked ? (
        <p className="text-xs text-[var(--color-text-3)] text-center py-1">
          Bloqueado — aguardando briefing
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onToggle(domingo, true)}
            className={`avail-day ${status === 'available' ? 'available' : 'unset'}`}
          >
            Disponível
          </button>
          <button
            onClick={() => onToggle(domingo, false)}
            className={`avail-day ${status === 'unavailable' ? 'unavailable' : 'unset'}`}
          >
            Indisponível
          </button>
        </div>
      )}
    </Card>
  )
}

export default function Availability() {
  const { profile } = useAuth()
  const [ciclo,        setCiclo]        = useState(null)
  const [domingos,     setDomingos]     = useState([])
  const [briefings,    setBriefings]    = useState([])
  const [disponibilis, setDisponibilis] = useState({}) // { domingo: bool | null }
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [inWindow,     setInWindow]     = useState(false)

  useEffect(() => { if (profile?.id) loadData() }, [profile?.id])

  async function loadData() {
    setLoading(true)
    try {
      const { data: ciclos } = await supabase
        .from('ciclos').select('*')
        .in('status', ['disponibilidade', 'briefing_lider', 'escala_publicada'])
        .order('inicio', { ascending: false }).limit(1)
      const c = ciclos?.[0]
      if (!c) { setLoading(false); return }
      setCiclo(c)

      // Check window
      const dia = Math.floor((Date.now() - new Date(c.inicio).getTime()) / (1000 * 60 * 60 * 24)) + 1
      setInWindow(dia >= 6 && dia <= 20)

      // Sundays
      const suns = []
      const d = new Date(c.inicio)
      while (d.getDay() !== 0) d.setDate(d.getDate() + 1)
      const end = new Date(c.fim)
      while (d <= end) { suns.push(d.toISOString().split('T')[0]); d.setDate(d.getDate() + 7) }
      setDomingos(suns)

      // Briefings for my subdep
      const mySubdep = Array.isArray(profile.subdepartamento) ? profile.subdepartamento[0] : profile.subdepartamento
      const { data: bris } = await supabase
        .from('briefings').select('*')
        .eq('ciclo_id', c.id).eq('subdepartamento', mySubdep)
      setBriefings(bris || [])

      // My existing availability
      const { data: disps } = await supabase
        .from('disponibilidades').select('*')
        .eq('ciclo_id', c.id).eq('user_id', profile.id)

      const dispMap = {}
      for (const s of suns) dispMap[s] = null
      for (const d of (disps || [])) dispMap[d.domingo] = d.disponivel
      setDisponibilis(dispMap)
    } finally {
      setLoading(false)
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
      // Upsert each entry
      const entries = Object.entries(disponibilis)
        .filter(([_, v]) => v !== null)
        .map(([domingo, disponivel]) => ({
          user_id:  profile.id,
          ciclo_id: ciclo.id,
          domingo,
          disponivel,
        }))

      // Delete existing, re-insert
      await supabase.from('disponibilidades')
        .delete().eq('user_id', profile.id).eq('ciclo_id', ciclo.id)

      if (entries.length > 0) {
        await supabase.from('disponibilidades').insert(entries)
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  const filled   = Object.values(disponibilis).filter(v => v !== null).length
  const total    = domingos.length
  const pct      = total > 0 ? Math.round((filled / total) * 100) : 0

  if (loading) {
    return (
      <div className="p-4 lg:p-6 space-y-3 max-w-lg mx-auto">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    )
  }

  if (!ciclo) {
    return (
      <div className="p-4 lg:p-6 max-w-lg mx-auto">
        <EmptyState icon={Clock} title="Nenhum ciclo ativo" description="A janela de disponibilidade ainda não foi aberta." />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-lg mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-1)]">Disponibilidade</h2>
        <p className="text-xs text-[var(--color-text-3)]">
          {inWindow ? `Prazo: dia 20 do ciclo` : 'Fora da janela de preenchimento'}
        </p>
      </div>

      {/* Progress */}
      <Card className="!p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-[var(--color-text-2)]">Progresso — {filled}/{total} domingos preenchidos</span>
          <span className="text-xs text-[var(--color-text-3)]">{pct}%</span>
        </div>
        <div className="cycle-bar">
          <div className={`cycle-bar-fill ${pct === 100 ? '!bg-success-500' : ''}`} style={{ width: `${pct}%` }} />
        </div>
        {filled < total && inWindow && (
          <p className="text-xs text-warning-500 mt-1.5">
            Você ainda não preencheu {total - filled} domingo(s)
          </p>
        )}
      </Card>

      {!inWindow && (
        <div className="alert-strip warning">
          <Clock size={13} />
          <span>A janela de disponibilidade {ciclo.status === 'escala_publicada' ? 'está encerrada' : 'ainda não abriu'}</span>
        </div>
      )}

      {/* Domingo cards */}
      <div className="space-y-2">
        {domingos.map(domingo => {
          const mySubdep = Array.isArray(profile.subdepartamento) ? profile.subdepartamento[0] : profile.subdepartamento
          const briefing = briefings.find(b => b.domingo === domingo)
          const blocked  = !inWindow || !briefing
          return (
            <DomingoCard
              key={domingo}
              domingo={domingo}
              briefing={briefing}
              disponivel={disponibilis[domingo]}
              blocked={!inWindow}
              onToggle={toggleDisp}
            />
          )
        })}
      </div>

      {inWindow && (
        <div className="flex items-center gap-2 sticky bottom-20 lg:bottom-4">
          <Button fullWidth size="lg" onClick={handleSave} loading={saving}>
            <Save size={16} />
            Salvar disponibilidade
          </Button>
          {saved && <span className="text-xs text-success-500 font-medium whitespace-nowrap">✓ Salvo!</span>}
        </div>
      )}
    </div>
  )
}
