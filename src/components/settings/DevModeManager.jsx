/**
 * DevModeManager — painel administrativo avançado.
 * Permite editar parâmetros operacionais sem mexer em código.
 *
 * Seções:
 *  1. Ciclos  — listar, criar, editar status e datas
 *  2. Janelas — availability window, schedule day
 *  3. Vagas   — DEFAULT_SLOTS por subdepartamento
 *  4. Regras  — semana de ensaio, histórico de rotação
 */

import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw, Plus, Edit2, Save, ChevronDown, ChevronUp,
  Clock, Calendar, Users, Settings2, AlertTriangle, CheckCircle,
  PlayCircle, Layers, Shuffle,
} from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { Card, CardSection, Skeleton } from '../ui/Card.jsx'
import { Button } from '../ui/Button.jsx'
import { Input } from '../ui/Input.jsx'
import { Badge } from '../ui/Badge.jsx'
import { Modal } from '../ui/Modal.jsx'
import { SYS_DEFAULTS, getSysConfig, invalidateSysConfig } from '../../lib/sysConfig.js'
import { cn, subdepLabel } from '../../lib/utils.js'
import { notify } from '../../lib/whatsapp.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_META = {
  briefing_regente:  { label: 'Briefing — Regentes',   color: 'bg-violet-500', badge: 'warning' },
  briefing_lider:    { label: 'Briefing — Líderes',     color: 'bg-blue-500',   badge: 'info'    },
  disponibilidade:   { label: 'Disponibilidade aberta', color: 'bg-primary-500',badge: 'primary' },
  gerando_escala:    { label: 'Gerando escala…',        color: 'bg-amber-500',  badge: 'warning' },
  escala_publicada:  { label: 'Escala publicada',       color: 'bg-success-500',badge: 'success' },
  confirmacoes:      { label: 'Confirmações',           color: 'bg-teal-500',   badge: 'success' },
  encerrado:         { label: 'Encerrado',              color: 'bg-gray-400',   badge: 'neutral' },
}

const STATUS_FLOW = [
  'briefing_regente',
  'briefing_lider',
  'disponibilidade',
  'escala_publicada',
  'confirmacoes',
  'encerrado',
]

const SUBDEP_LABELS = {
  louvor:   'Louvor',
  regencia: 'Regência',
  ebd:      'EBD',
  recepcao: 'Recepção',
  midia:    'Mídia',
}

function fmtDate(d) {
  if (!d) return '—'
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}

// Returns timing info relative to TODAY for a service-period cycle.
// inicio/fim = the future service dates (the Sundays being planned).
function cycleDayInfo(inicio, fim) {
  if (!inicio || !fim) return null
  const now      = Date.now()
  const startMs  = new Date(inicio + 'T00:00:00').getTime()
  const endMs    = new Date(fim    + 'T00:00:00').getTime()
  const totalDays = Math.max(1, Math.round((endMs - startMs) / 86_400_000))
  const daysUntil = Math.ceil((startMs - now) / 86_400_000)

  if (daysUntil > 0) {
    return { future: true, daysUntil, totalDays }
  }
  const elapsed = Math.floor((now - startMs) / 86_400_000) + 1
  const pct     = Math.min(100, Math.round((elapsed / totalDays) * 100))
  return { future: false, elapsed, totalDays, pct }
}

// ── Cycle Sunday helper ───────────────────────────────────────────────────────

function getSundaysInCiclo(ciclo) {
  const sundays = []
  const d = new Date(ciclo.inicio + 'T00:00:00')
  const end = new Date(ciclo.fim + 'T00:00:00')
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1)
  while (d <= end) {
    sundays.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 7)
  }
  return sundays
}

// ── Cycle status badge ────────────────────────────────────────────────────────

function CycleBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, badge: 'neutral' }
  return <Badge color={meta.badge}>{meta.label}</Badge>
}

// ── Cycle Modal (create / edit) ───────────────────────────────────────────────

function CycleModal({ cycle, onSave, onClose, saving }) {
  const isEdit = !!cycle?.id
  const [form, setForm] = useState({
    inicio: cycle?.inicio ?? '',
    fim:    cycle?.fim    ?? '',
    status: cycle?.status ?? 'briefing_regente',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.inicio || !form.fim) return
    onSave({ ...cycle, ...form })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-xl bg-primary-500/10 border border-primary-500/20 px-3 py-2 text-xs text-[var(--color-text-2)] leading-relaxed">
        Informe as datas do <strong>período de serviço</strong> — os domingos que serão planejados.
        O preenchimento de briefings e disponibilidade deve ocorrer ~30 dias antes do início.
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="1º domingo do serviço *"
          type="date"
          hint="Data futura — início do período planejado"
          value={form.inicio}
          onChange={e => set('inicio', e.target.value)}
          required
        />
        <Input
          label="Último domingo do serviço *"
          type="date"
          hint="Data futura — fim do período planejado"
          value={form.fim}
          onChange={e => set('fim', e.target.value)}
          required
        />
      </div>

      <div>
        <p className="text-xs font-medium text-[var(--color-text-2)] mb-2">Status inicial</p>
        <div className="space-y-1.5">
          {STATUS_FLOW.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => set('status', s)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all text-xs',
                form.status === s
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                  : 'border-[var(--color-border)] hover:border-primary-300',
              )}
            >
              <span className={cn('w-2 h-2 rounded-full flex-shrink-0', STATUS_META[s]?.color ?? 'bg-gray-400')} />
              <span className={form.status === s ? 'font-semibold text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-2)]'}>
                {STATUS_META[s]?.label ?? s}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button variant="secondary" fullWidth type="button" onClick={onClose}>Cancelar</Button>
        <Button fullWidth type="submit" loading={saving}>{isEdit ? 'Salvar alterações' : 'Criar ciclo'}</Button>
      </div>
    </form>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DevModeManager() {
  const { profile } = useAuth()

  // ── Cycles state
  const [cycles,      setCycles]      = useState([])
  const [cyclesLoading, setCyclesLoading] = useState(true)
  const [cycleModal,  setCycleModal]  = useState(false)
  const [editingCycle,setEditingCycle]= useState(null)
  const [savingCycle, setSavingCycle] = useState(false)
  const [expandedCycle, setExpandedCycle] = useState(null)

  // ── Sys config state
  const [cfg,         setCfg]         = useState({ ...SYS_DEFAULTS, slots: { ...SYS_DEFAULTS.slots } })
  const [cfgLoading,  setCfgLoading]  = useState(true)
  const [cfgSaving,   setCfgSaving]   = useState(false)
  const [cfgSaved,    setCfgSaved]    = useState(false)

  // ── WhatsApp notifications per cycle phase ────────────────────────────────

  async function notificarCiclo(cicloId, novoStatus, ciclo) {
    try {
      switch (novoStatus) {

        case 'briefing_regente': {
          const { data: users } = await supabase
            .from('users').select('nome, whatsapp')
            .eq('ativo', true).eq('role', 'lider_funcao').eq('subdep_lider', 'regencia')
          const prazo = new Date(Date.now() + 3 * 86400000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
          for (const u of (users || [])) {
            if (u.whatsapp) await notify.briefingRegentesAberto(u.whatsapp, u.nome, prazo).catch(() => {})
          }
          break
        }

        case 'briefing_lider': {
          const sundays = getSundaysInCiclo(ciclo)
          const { data: briefingsRegencia } = await supabase
            .from('briefings').select('domingo')
            .eq('ciclo_id', cicloId).eq('subdepartamento', 'regencia')
          const filled = new Set((briefingsRegencia || []).map(b => b.domingo))
          const pending = sundays.filter(s => !filled.has(s))

          const { data: regentes } = await supabase
            .from('users').select('nome, whatsapp')
            .eq('ativo', true).eq('role', 'lider_funcao').eq('subdep_lider', 'regencia')
          for (const u of (regentes || [])) {
            if (!u.whatsapp) continue
            if (pending.length === 0) {
              await notify.cicloFaseAgradecimento(u.whatsapp, u.nome, 'briefings de Regência').catch(() => {})
            } else {
              await notify.cicloFasePendencia(u.whatsapp, u.nome, `briefing de Regência (${pending.length} domingo(s))`).catch(() => {})
            }
          }

          const { data: lideres } = await supabase
            .from('users').select('nome, whatsapp, subdep_lider')
            .eq('ativo', true).eq('role', 'lider_funcao').neq('subdep_lider', 'regencia')
          const prazo = new Date(Date.now() + 3 * 86400000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
          for (const u of (lideres || [])) {
            if (u.whatsapp && u.subdep_lider) {
              await notify.briefingLideresAberto(u.whatsapp, u.nome, subdepLabel(u.subdep_lider), prazo).catch(() => {})
            }
          }
          break
        }

        case 'disponibilidade': {
          const sundays = getSundaysInCiclo(ciclo)
          const subdepsToCheck = ['ebd', 'recepcao', 'midia']
          for (const subdep of subdepsToCheck) {
            const { data: brf } = await supabase
              .from('briefings').select('domingo')
              .eq('ciclo_id', cicloId).eq('subdepartamento', subdep)
            const filled = new Set((brf || []).map(b => b.domingo))
            const pending = sundays.filter(s => !filled.has(s))
            const { data: lideres } = await supabase
              .from('users').select('nome, whatsapp')
              .eq('ativo', true).eq('role', 'lider_funcao').eq('subdep_lider', subdep)
            for (const u of (lideres || [])) {
              if (!u.whatsapp) continue
              if (pending.length === 0) {
                await notify.cicloFaseAgradecimento(u.whatsapp, u.nome, `briefings de ${subdepLabel(subdep)}`).catch(() => {})
              } else {
                await notify.cicloFasePendencia(u.whatsapp, u.nome, `briefing de ${subdepLabel(subdep)} (${pending.length} domingo(s))`).catch(() => {})
              }
            }
          }
          const { data: membros } = await supabase
            .from('users').select('nome, whatsapp')
            .eq('ativo', true).eq('role', 'membro_serve')
          const prazo = new Date(Date.now() + 7 * 86400000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
          for (const u of (membros || [])) {
            if (u.whatsapp) await notify.disponibilidadeAberta(u.whatsapp, u.nome, prazo).catch(() => {})
          }
          break
        }

        case 'escala_publicada': {
          const { data: escalas } = await supabase
            .from('escalas').select('user_id, domingo, subdepartamento, users(nome, whatsapp)')
            .eq('ciclo_id', cicloId).order('domingo', { ascending: true })
          const byUser = {}
          for (const e of (escalas || [])) {
            if (!byUser[e.user_id]) byUser[e.user_id] = { user: e.users, list: [] }
            byUser[e.user_id].list.push(e)
          }
          for (const { user, list } of Object.values(byUser)) {
            if (user?.whatsapp) {
              await notify.escalaPublicada(user.whatsapp, user.nome, list).catch(() => {})
            }
          }
          break
        }

        case 'confirmacoes': {
          const { data: escalas } = await supabase
            .from('escalas').select('user_id, domingo, subdepartamento, users(nome, whatsapp)')
            .eq('ciclo_id', cicloId).order('domingo', { ascending: true })
          const byUser = {}
          for (const e of (escalas || [])) {
            if (!byUser[e.user_id]) byUser[e.user_id] = { user: e.users, list: [] }
            byUser[e.user_id].list.push(e)
          }
          for (const { user, list } of Object.values(byUser)) {
            if (user?.whatsapp) {
              await notify.escalaPublicada(user.whatsapp, user.nome, list).catch(() => {})
            }
          }
          break
        }

        default: break
      }
    } catch (err) {
      console.error('[notificarCiclo]', err)
    }
  }

  // ── Load everything ───────────────────────────────────────────────────────

  const loadCycles = useCallback(async () => {
    setCyclesLoading(true)
    try {
      const { data, error } = await supabase
        .from('ciclos').select('*').order('inicio', { ascending: false })
      if (error) throw error
      setCycles(data || [])
    } catch (err) {
      console.error('[DevMode] cycles:', err)
    } finally {
      setCyclesLoading(false)
    }
  }, [])

  const loadConfig = useCallback(async () => {
    setCfgLoading(true)
    try {
      invalidateSysConfig()
      const c = await getSysConfig()
      setCfg(c)
    } finally {
      setCfgLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCycles()
    loadConfig()
  }, [loadCycles, loadConfig])

  // ── Schedule generator state
  const [generating, setGenerating] = useState(false)
  const [genResult,  setGenResult]  = useState(null)   // { cicloId, count } | null

  // ── Cycle CRUD ────────────────────────────────────────────────────────────

  const handleSaveCycle = async (form) => {
    setSavingCycle(true)
    try {
      if (form.id) {
        const { error } = await supabase.from('ciclos')
          .update({ inicio: form.inicio, fim: form.fim, status: form.status })
          .eq('id', form.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('ciclos')
          .insert({ inicio: form.inicio, fim: form.fim, status: form.status })
        if (error) throw error
      }
      await loadCycles()
      setCycleModal(false)
      setEditingCycle(null)
    } catch (err) {
      alert('Erro ao salvar ciclo: ' + err.message)
    } finally {
      setSavingCycle(false)
    }
  }

  const advanceCycleStatus = async (cycle) => {
    const idx  = STATUS_FLOW.indexOf(cycle.status)
    const next = STATUS_FLOW[idx + 1]
    if (!next) return
    if (!confirm(`Avançar ciclo para "${STATUS_META[next]?.label}"?`)) return
    try {
      const { error } = await supabase.from('ciclos').update({ status: next }).eq('id', cycle.id)
      if (error) throw error
      // Fire WhatsApp notifications (non-blocking)
      notificarCiclo(cycle.id, next, cycle).catch(e => console.warn('[notify]', e))
      await loadCycles()
    } catch (err) {
      alert('Erro: ' + err.message)
    }
  }

  // ── Schedule generator ───────────────────────────────────────────────────

  const generateSchedule = async (cycle) => {
    if (!confirm(`Gerar escala para o ciclo ${fmtDate(cycle.inicio)} – ${fmtDate(cycle.fim)}?\n\nIsto apagará qualquer escala já existente para este ciclo.`)) return
    setGenerating(true)
    setGenResult(null)
    try {
      const sysConfig = await getSysConfig()

      // 1. Build list of Sundays (local timezone — avoids UTC offset bug)
      const suns = []
      const d = new Date(cycle.inicio + 'T00:00:00')
      while (d.getDay() !== 0) d.setDate(d.getDate() + 1)
      const endD = new Date(cycle.fim + 'T00:00:00')
      while (d <= endD) {
        const y = d.getFullYear(), mo = String(d.getMonth()+1).padStart(2,'0'), dy = String(d.getDate()).padStart(2,'0')
        suns.push(`${y}-${mo}-${dy}`)
        d.setDate(d.getDate() + 7)
      }

      // 2. Get members who marked availability = true for this cycle
      const { data: disps } = await supabase
        .from('disponibilidades').select('user_id, domingo')
        .eq('ciclo_id', cycle.id).eq('disponivel', true)

      if (!disps || disps.length === 0) {
        alert('Nenhum membro preencheu disponibilidade para este ciclo.\n\nPeça para os membros acessarem a tela de Disponibilidade e marcarem os domingos antes de gerar a escala.')
        return
      }

      const dispSet = new Set(disps.map(r => `${r.user_id}:${r.domingo}`))

      // 3. Get all active members (membro_serve + lider_funcao) with their subdeps
      const { data: members } = await supabase
        .from('users').select('id, subdepartamento')
        .eq('ativo', true).in('role', ['membro_serve', 'lider_funcao'])

      if (!members || members.length === 0) {
        alert('Nenhum membro ativo encontrado.\n\nVerifique se os membros têm papel "Membro serve" ou "Líder de função" e estão ativos.')
        return
      }

      const subdeps = Object.keys(sysConfig.slots)

      // 4. For each Sunday × subdep → list of available member IDs
      const availMap = {}
      for (const sun of suns) {
        availMap[sun] = {}
        for (const sub of subdeps) availMap[sun][sub] = []
      }
      for (const m of (members||[])) {
        const mSubs = Array.isArray(m.subdepartamento) ? m.subdepartamento : [m.subdepartamento].filter(Boolean)
        for (const sun of suns) {
          if (!dispSet.has(`${m.id}:${sun}`)) continue
          for (const sub of mSubs) {
            if (availMap[sun][sub]) availMap[sun][sub].push(m.id)
          }
        }
      }

      // 5. Fair round-robin: pick least-used members first
      const usageCount = {}
      const rows = []
      for (const sun of suns) {
        for (const sub of subdeps) {
          const slots = sysConfig.slots[sub] ?? 0
          if (!slots) continue
          const sorted = [...availMap[sun][sub]].sort((a,b) => (usageCount[a]||0) - (usageCount[b]||0))
          for (const uid of sorted.slice(0, slots)) {
            usageCount[uid] = (usageCount[uid]||0) + 1
            rows.push({ ciclo_id: cycle.id, domingo: sun, subdepartamento: sub, user_id: uid, status_confirmacao: 'pendente' })
          }
        }
      }

      // 6. Replace existing escalas and advance status (only if there are rows)
      if (rows.length === 0) {
        alert('Nenhuma escalação foi gerada.\n\nIsso ocorre quando os membros que preencheram disponibilidade não pertencem a nenhum subdepartamento configurado.')
        return
      }
      // Fetch old IDs so we can delete them ONLY after a successful insert
      const { data: oldRows } = await supabase.from('escalas').select('id').eq('ciclo_id', cycle.id)
      const oldIds = (oldRows || []).map(r => r.id)
      // Insert new rows first — if it fails, old data is still intact
      const { error } = await supabase.from('escalas').insert(rows)
      if (error) throw error
      // Safe to delete old rows now
      if (oldIds.length > 0) {
        await supabase.from('escalas').delete().in('id', oldIds)
      }
      await supabase.from('ciclos').update({ status: 'escala_publicada' }).eq('id', cycle.id)
      await loadCycles()
      setGenResult({ cicloId: cycle.id, count: rows.length })
    } catch (err) {
      alert('Erro ao gerar escala: ' + err.message)
    } finally {
      setGenerating(false)
    }
  }

  // ── Sys config save ───────────────────────────────────────────────────────

  const saveSysConfig = async () => {
    setCfgSaving(true)
    try {
      const rows = [
        { key: 'sys_cycle_duration', value: cfg.cycle_duration,   updated_at: new Date().toISOString() },
        { key: 'sys_avail_window',   value: { start: cfg.avail_window_start, end: cfg.avail_window_end }, updated_at: new Date().toISOString() },
        { key: 'sys_schedule_day',   value: cfg.schedule_day,     updated_at: new Date().toISOString() },
        { key: 'sys_history_days',   value: cfg.history_days,     updated_at: new Date().toISOString() },
        { key: 'sys_ensaio_week',    value: cfg.ensaio_week,      updated_at: new Date().toISOString() },
        { key: 'sys_slots',          value: cfg.slots,            updated_at: new Date().toISOString() },
      ]
      const { error } = await supabase.from('app_config')
        .upsert(rows, { onConflict: 'key' })
      if (error) throw error
      invalidateSysConfig()
      setCfgSaved(true)
      setTimeout(() => setCfgSaved(false), 3000)
    } catch (err) {
      alert('Erro ao salvar configurações: ' + err.message)
    } finally {
      setCfgSaving(false)
    }
  }

  const setSlot = (subdep, val) =>
    setCfg(c => ({ ...c, slots: { ...c.slots, [subdep]: Number(val) || 0 } }))

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Warning */}
      <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
        <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
          <strong>Modo Desenvolvedor</strong> — alterações aqui afetam o comportamento real do sistema.
          Salve apenas quando tiver certeza dos valores.
        </p>
      </div>

      {/* ── SEÇÃO 1: CICLOS ──────────────────────────────────────────────────── */}
      <Card>
        <CardSection
          title={<span className="flex items-center gap-1.5"><Layers size={14} /> Ciclos operacionais</span>}
        >
          <p className="text-xs text-[var(--color-text-3)] mb-3">
            Cada ciclo define um <strong>período de serviço futuro</strong> (os domingos planejados).
            O trabalho de briefing, disponibilidade e geração de escala acontece ~30 dias antes do início do serviço.
          </p>

          {cyclesLoading ? (
            <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : (
            <div className="space-y-2">
              {cycles.length === 0 && (
                <p className="text-sm text-[var(--color-text-3)] py-4 text-center">Nenhum ciclo cadastrado</p>
              )}

              {cycles.map(cy => {
                const info = cycleDayInfo(cy.inicio, cy.fim)
                const isExp = expandedCycle === cy.id
                const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(cy.status) + 1]

                return (
                  <div key={cy.id} className="rounded-xl border border-[var(--color-border)] overflow-hidden">
                    {/* Summary row */}
                    <button
                      onClick={() => setExpandedCycle(x => x === cy.id ? null : cy.id)}
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-[var(--color-surface-2)] transition-colors"
                    >
                      <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', STATUS_META[cy.status]?.color ?? 'bg-gray-400')} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[var(--color-text-1)]">
                            {fmtDate(cy.inicio)} — {fmtDate(cy.fim)}
                          </span>
                          <CycleBadge status={cy.status} />
                        </div>
                        {info && (
                          <p className="text-xs text-[var(--color-text-3)] mt-0.5">
                            {info.future
                              ? `Serviço começa em ${info.daysUntil} dia${info.daysUntil !== 1 ? 's' : ''} · ${info.totalDays} dias de cobertura`
                              : `Dia ${info.elapsed} de ${info.totalDays} do serviço · ${info.pct}% concluído`}
                          </p>
                        )}
                      </div>
                      {isExp ? <ChevronUp size={15} className="text-[var(--color-text-3)] flex-shrink-0" /> : <ChevronDown size={15} className="text-[var(--color-text-3)] flex-shrink-0" />}
                    </button>

                    {/* Expanded */}
                    {isExp && (
                      <div className="border-t border-[var(--color-border)] p-3 bg-[var(--color-surface-2)] space-y-2">
                        {/* Progress bar */}
                        {info && (
                          <div>
                            <div className="flex justify-between text-2xs text-[var(--color-text-3)] mb-1">
                              {info.future
                                ? <><span className="text-primary-400">Período de serviço ainda não iniciou</span><span>em {info.daysUntil}d</span></>
                                : <><span>Dia {info.elapsed} do serviço</span><span>{info.totalDays} dias total</span></>
                              }
                            </div>
                            <div className="h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
                              <div
                                className={cn('h-full rounded-full transition-all', info.future ? 'bg-primary-400/40' : 'bg-primary-500')}
                                style={{ width: info.future ? '100%' : `${info.pct}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Phase flow */}
                        <div className="flex items-center gap-1 flex-wrap pt-1">
                          {STATUS_FLOW.map((s, idx) => {
                            const curIdx = STATUS_FLOW.indexOf(cy.status)
                            const done   = idx < curIdx
                            const active = idx === curIdx
                            return (
                              <div key={s} className="flex items-center gap-1">
                                <span className={cn(
                                  'text-2xs px-1.5 py-0.5 rounded-full',
                                  active ? 'bg-primary-600 text-white font-semibold' :
                                  done   ? 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300' :
                                           'bg-[var(--color-border)] text-[var(--color-text-3)]'
                                )}>
                                  {STATUS_META[s]?.label ?? s}
                                </span>
                                {idx < STATUS_FLOW.length - 1 && <span className="text-[var(--color-text-3)] text-2xs">›</span>}
                              </div>
                            )
                          })}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 pt-1 flex-wrap">
                          <Button
                            size="sm" variant="secondary"
                            onClick={() => { setEditingCycle(cy); setCycleModal(true) }}
                            className="flex-1"
                          >
                            <Edit2 size={12} /> Editar
                          </Button>
                          {['disponibilidade','briefing_lider','briefing_regente'].includes(cy.status) && (
                            <Button
                              size="sm" variant="secondary"
                              onClick={() => generateSchedule(cy)}
                              loading={generating && genResult?.cicloId !== cy.id}
                              disabled={generating}
                              className="flex-1"
                            >
                              <Shuffle size={12} /> Gerar Escala
                            </Button>
                          )}
                          {nextStatus && nextStatus !== 'escala_publicada' && (
                            <Button
                              size="sm"
                              onClick={() => advanceCycleStatus(cy)}
                              className="flex-1"
                            >
                              <PlayCircle size={12} /> Avançar para "{STATUS_META[nextStatus]?.label}"
                            </Button>
                          )}
                        </div>
                        {genResult?.cicloId === cy.id && (
                          <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-1)] bg-success-500/10 border border-success-500/30 rounded-lg px-3 py-2">
                            <CheckCircle size={13} className="text-success-500 flex-shrink-0" />
                            Escala gerada: <strong>{genResult.count}</strong> escalações — ciclo avançado para &quot;Escala publicada&quot;
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <Button
            size="sm" variant="secondary" className="mt-3 w-full"
            onClick={() => { setEditingCycle(null); setCycleModal(true) }}
          >
            <Plus size={13} /> Criar novo ciclo
          </Button>
        </CardSection>
      </Card>

      {/* ── SEÇÃO 2: JANELAS DE TEMPO ────────────────────────────────────────── */}
      <Card>
        <CardSection
          title={<span className="flex items-center gap-1.5"><Clock size={14} /> Janelas de tempo</span>}
        >
          {cfgLoading ? <Skeleton className="h-32 rounded-xl" /> : (
            <div className="space-y-4">
              <p className="text-xs text-[var(--color-text-3)]">
                Define em qual dia do ciclo cada fase fica disponível ou se encerra.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Disponibilidade — abre no dia"
                  type="number" min={1} max={cfg.cycle_duration - 1}
                  value={cfg.avail_window_start}
                  onChange={e => setCfg(c => ({ ...c, avail_window_start: Number(e.target.value) }))}
                  hint={`Padrão: ${SYS_DEFAULTS.avail_window_start}`}
                />
                <Input
                  label="Disponibilidade — fecha no dia"
                  type="number" min={cfg.avail_window_start + 1} max={cfg.cycle_duration}
                  value={cfg.avail_window_end}
                  onChange={e => setCfg(c => ({ ...c, avail_window_end: Number(e.target.value) }))}
                  hint={`Padrão: ${SYS_DEFAULTS.avail_window_end}`}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Geração de escala — a partir do dia"
                  type="number" min={cfg.avail_window_end + 1} max={cfg.cycle_duration}
                  value={cfg.schedule_day}
                  onChange={e => setCfg(c => ({ ...c, schedule_day: Number(e.target.value) }))}
                  hint={`Padrão: ${SYS_DEFAULTS.schedule_day}`}
                />
                <Input
                  label="Duração do ciclo (dias)"
                  type="number" min={14} max={90}
                  value={cfg.cycle_duration}
                  onChange={e => setCfg(c => ({ ...c, cycle_duration: Number(e.target.value) }))}
                  hint={`Padrão: ${SYS_DEFAULTS.cycle_duration}`}
                />
              </div>

              {/* Visual timeline */}
              <div className="rounded-xl bg-[var(--color-surface-2)] border border-[var(--color-border)] p-3">
                <p className="text-2xs text-[var(--color-text-3)] font-semibold uppercase tracking-wide mb-2">Linha do tempo do ciclo</p>
                <div className="relative h-5 rounded-full bg-[var(--color-border)] overflow-hidden">
                  {/* Briefing window: day 1-5 */}
                  <div className="absolute top-0 h-full bg-blue-400/70 rounded-l-full" style={{ left: '0%', width: `${((cfg.avail_window_start - 1) / cfg.cycle_duration) * 100}%` }} />
                  {/* Availability window */}
                  <div className="absolute top-0 h-full bg-primary-400/80" style={{
                    left:  `${((cfg.avail_window_start - 1) / cfg.cycle_duration) * 100}%`,
                    width: `${((cfg.avail_window_end - cfg.avail_window_start + 1) / cfg.cycle_duration) * 100}%`,
                  }} />
                  {/* Schedule + publish */}
                  <div className="absolute top-0 h-full bg-success-400/70 rounded-r-full" style={{
                    left:  `${((cfg.schedule_day - 1) / cfg.cycle_duration) * 100}%`,
                    width: `${((cfg.cycle_duration - cfg.schedule_day + 1) / cfg.cycle_duration) * 100}%`,
                  }} />
                </div>
                <div className="flex gap-3 mt-1.5 flex-wrap">
                  <span className="flex items-center gap-1 text-2xs text-[var(--color-text-3)]"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />Briefings (d1–{cfg.avail_window_start - 1})</span>
                  <span className="flex items-center gap-1 text-2xs text-[var(--color-text-3)]"><span className="w-2 h-2 rounded-full bg-primary-400 inline-block" />Disponibilidade (d{cfg.avail_window_start}–{cfg.avail_window_end})</span>
                  <span className="flex items-center gap-1 text-2xs text-[var(--color-text-3)]"><span className="w-2 h-2 rounded-full bg-success-400 inline-block" />Escala (d{cfg.schedule_day}+)</span>
                </div>
              </div>
            </div>
          )}
        </CardSection>
      </Card>

      {/* ── SEÇÃO 3: VAGAS POR SUBDEPARTAMENTO ───────────────────────────────── */}
      <Card>
        <CardSection
          title={<span className="flex items-center gap-1.5"><Users size={14} /> Vagas por subdepartamento</span>}
        >
          {cfgLoading ? <Skeleton className="h-24 rounded-xl" /> : (
            <div className="space-y-3">
              <p className="text-xs text-[var(--color-text-3)]">
                Número mínimo de membros a escalar por subdepartamento em cada domingo.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Object.keys(SYS_DEFAULTS.slots).map(subdep => (
                  <Input
                    key={subdep}
                    label={SUBDEP_LABELS[subdep] ?? subdep}
                    type="number" min={0} max={20}
                    value={cfg.slots[subdep] ?? SYS_DEFAULTS.slots[subdep]}
                    onChange={e => setSlot(subdep, e.target.value)}
                    hint={`Padrão: ${SYS_DEFAULTS.slots[subdep]}`}
                  />
                ))}
              </div>
            </div>
          )}
        </CardSection>
      </Card>

      {/* ── SEÇÃO 4: REGRAS OPERACIONAIS ─────────────────────────────────────── */}
      <Card>
        <CardSection
          title={<span className="flex items-center gap-1.5"><Settings2 size={14} /> Regras operacionais</span>}
        >
          {cfgLoading ? <Skeleton className="h-20 rounded-xl" /> : (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Semana do ensaio (Regência)"
                type="number" min={1} max={5}
                value={cfg.ensaio_week}
                onChange={e => setCfg(c => ({ ...c, ensaio_week: Number(e.target.value) }))}
                hint={`Padrão: ${SYS_DEFAULTS.ensaio_week}ª semana do mês`}
              />
              <Input
                label="Histórico de rotação (dias)"
                type="number" min={14} max={365}
                value={cfg.history_days}
                onChange={e => setCfg(c => ({ ...c, history_days: Number(e.target.value) }))}
                hint={`Padrão: ${SYS_DEFAULTS.history_days} dias`}
              />
            </div>
          )}
        </CardSection>
      </Card>

      {/* ── SALVAR ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button fullWidth onClick={saveSysConfig} loading={cfgSaving} disabled={cfgLoading}>
          <Save size={14} />
          {cfgSaved ? '✓ Configurações salvas!' : 'Salvar todas as configurações'}
        </Button>
        <Button
          variant="secondary"
          onClick={() => { invalidateSysConfig(); loadConfig() }}
          title="Recarregar configurações do banco"
        >
          <RefreshCw size={14} />
        </Button>
      </div>

      {/* ── CYCLE MODAL ──────────────────────────────────────────────────────── */}
      <Modal
        open={cycleModal}
        onClose={() => { setCycleModal(false); setEditingCycle(null) }}
        title={editingCycle ? 'Editar ciclo' : 'Novo ciclo'}
      >
        <CycleModal
          cycle={editingCycle}
          onSave={handleSaveCycle}
          onClose={() => { setCycleModal(false); setEditingCycle(null) }}
          saving={savingCycle}
        />
      </Modal>

    </div>
  )
}
