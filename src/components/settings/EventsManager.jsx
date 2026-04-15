/**
 * EventsManager — CRUD de eventos dentro de Configurações.
 * Gerencia a tabela `eventos` no Supabase.
 */

import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit2, Trash2, Calendar, RepeatIcon, CheckCircle, PauseCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { Card, Skeleton, EmptyState } from '../ui/Card.jsx'
import { Button } from '../ui/Button.jsx'
import { Input, Textarea } from '../ui/Input.jsx'
import { Badge } from '../ui/Badge.jsx'
import { Modal, ConfirmModal } from '../ui/Modal.jsx'

// ── Constants ─────────────────────────────────────────────────────────────────

const RECORRENCIAS = [
  { value: 'unico',      label: 'Único',      desc: 'Acontece apenas uma vez' },
  { value: 'semanal',    label: 'Semanal',     desc: 'Toda semana nos dias selecionados' },
  { value: 'quinzenal',  label: 'Quinzenal',   desc: 'A cada 2 semanas' },
  { value: 'mensal',     label: 'Mensal',      desc: 'Uma vez por mês' },
]

const DIAS_SEMANA = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
]

const STATUS_OPTS = [
  { value: 'ativo',      label: 'Ativo',      icon: CheckCircle,  color: 'success' },
  { value: 'pausado',    label: 'Pausado',     icon: PauseCircle,  color: 'warning' },
  { value: 'encerrado',  label: 'Encerrado',   icon: XCircle,      color: 'danger'  },
]

const EMPTY_FORM = {
  titulo: '',
  descricao: '',
  data_inicio: '',
  hora_inicio: '',
  hora_fim: '',
  recorrencia: 'semanal',
  dias_semana: [0],
  data_fim_recorrencia: '',
  status: 'ativo',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status) {
  if (status === 'ativo')     return <Badge color="success">Ativo</Badge>
  if (status === 'pausado')   return <Badge color="warning">Pausado</Badge>
  if (status === 'encerrado') return <Badge color="danger">Encerrado</Badge>
  return null
}

function recorrenciaLabel(rec, dias) {
  const r = RECORRENCIAS.find(x => x.value === rec)
  if (!r) return '—'
  if ((rec === 'semanal' || rec === 'quinzenal') && dias?.length) {
    const labels = dias.map(d => DIAS_SEMANA.find(x => x.value === d)?.label || '').filter(Boolean)
    return `${r.label} · ${labels.join(', ')}`
  }
  return r.label
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

// ── Form Modal ─────────────────────────────────────────────────────────────────

function EventForm({ initial, onSave, onClose, saving }) {
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const toggleDia = (d) => {
    set('dias_semana',
      form.dias_semana.includes(d)
        ? form.dias_semana.filter(x => x !== d)
        : [...form.dias_semana, d].sort()
    )
  }

  const needsDias = form.recorrencia === 'semanal' || form.recorrencia === 'quinzenal'
  const needsFim  = form.recorrencia !== 'unico'

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.titulo.trim()) return
    if (!form.data_inicio)   return
    onSave(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      <Input
        label="Título do evento *"
        placeholder="Ex: Culto Regular, Retiro, Célula..."
        value={form.titulo}
        onChange={e => set('titulo', e.target.value)}
        required
      />

      <Textarea
        label="Descrição"
        placeholder="Detalhes adicionais sobre o evento (opcional)"
        rows={2}
        value={form.descricao}
        onChange={e => set('descricao', e.target.value)}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Data de início *"
          type="date"
          value={form.data_inicio}
          onChange={e => set('data_inicio', e.target.value)}
          required
        />
        {needsFim && (
          <Input
            label="Repetir até"
            type="date"
            value={form.data_fim_recorrencia}
            onChange={e => set('data_fim_recorrencia', e.target.value)}
            hint="Deixe vazio para indefinido"
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Início"
          type="time"
          value={form.hora_inicio}
          onChange={e => set('hora_inicio', e.target.value)}
        />
        <Input
          label="Término"
          type="time"
          value={form.hora_fim}
          onChange={e => set('hora_fim', e.target.value)}
        />
      </div>

      {/* Recorrência */}
      <div>
        <p className="text-xs font-medium text-[var(--color-text-2)] mb-2">Frequência</p>
        <div className="grid grid-cols-2 gap-2">
          {RECORRENCIAS.map(r => (
            <button
              key={r.value}
              type="button"
              onClick={() => set('recorrencia', r.value)}
              className={[
                'p-2.5 rounded-xl border text-left transition-all',
                form.recorrencia === r.value
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                  : 'border-[var(--color-border)] text-[var(--color-text-2)] hover:border-primary-300',
              ].join(' ')}
            >
              <p className="text-xs font-semibold">{r.label}</p>
              <p className="text-2xs text-[var(--color-text-3)] mt-0.5">{r.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Dias da semana (semanal / quinzenal) */}
      {needsDias && (
        <div>
          <p className="text-xs font-medium text-[var(--color-text-2)] mb-2">Dias da semana</p>
          <div className="flex gap-1.5 flex-wrap">
            {DIAS_SEMANA.map(d => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleDia(d.value)}
                className={[
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                  form.dias_semana.includes(d.value)
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'border-[var(--color-border)] text-[var(--color-text-2)] hover:border-primary-400',
                ].join(' ')}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Status */}
      <div>
        <p className="text-xs font-medium text-[var(--color-text-2)] mb-2">Status</p>
        <div className="flex gap-2">
          {STATUS_OPTS.map(s => (
            <button
              key={s.value}
              type="button"
              onClick={() => set('status', s.value)}
              className={[
                'flex-1 py-2 rounded-xl border text-xs font-medium transition-all',
                form.status === s.value
                  ? `bg-${s.color}-100 dark:bg-${s.color}-900/30 border-${s.color}-400 text-${s.color}-700 dark:text-${s.color}-300`
                  : 'border-[var(--color-border)] text-[var(--color-text-3)] hover:text-[var(--color-text-2)]',
              ].join(' ')}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button variant="secondary" fullWidth type="button" onClick={onClose}>
          Cancelar
        </Button>
        <Button fullWidth type="submit" loading={saving}>
          Salvar evento
        </Button>
      </div>
    </form>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function EventsManager() {
  const { profile } = useAuth()

  const [events,      setEvents]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [modal,       setModal]       = useState(false)   // 'create' | 'edit'
  const [editing,     setEditing]     = useState(null)    // event object
  const [saving,      setSaving]      = useState(false)
  const [deleting,    setDeleting]    = useState(null)    // event id being deleted
  const [expanded,    setExpanded]    = useState(null)    // expanded event id
  const [confirmDel,  setConfirmDel]  = useState(null)   // event id pending confirm

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('eventos')
        .select('*')
        .order('data_inicio', { ascending: true })
      if (error) throw error
      setEvents(data || [])
    } catch (err) {
      console.error('[EventsManager] load error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => { setEditing(null); setModal(true) }
  const openEdit   = (ev) => { setEditing(ev); setModal(true) }
  const closeModal = () => { setModal(false); setEditing(null) }

  const handleSave = async (form) => {
    setSaving(true)
    try {
      const payload = {
        titulo:               form.titulo.trim(),
        descricao:            form.descricao?.trim() || null,
        data_inicio:          form.data_inicio,
        hora_inicio:          form.hora_inicio || null,
        hora_fim:             form.hora_fim    || null,
        recorrencia:          form.recorrencia,
        dias_semana:          form.dias_semana || [],
        data_fim_recorrencia: form.data_fim_recorrencia || null,
        status:               form.status,
        atualizado_em:        new Date().toISOString(),
      }

      if (editing) {
        const { error } = await supabase
          .from('eventos').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('eventos').insert({ ...payload, criado_por: profile.id })
        if (error) throw error
      }

      await load()
      closeModal()
    } catch (err) {
      alert('Erro ao salvar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDel) return
    setDeleting(confirmDel)
    setConfirmDel(null)
    try {
      const { error } = await supabase.from('eventos').delete().eq('id', confirmDel)
      if (error) throw error
      setEvents(prev => prev.filter(e => e.id !== confirmDel))
    } catch (err) {
      alert('Erro ao excluir: ' + err.message)
    } finally {
      setDeleting(null)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    )
  }

  return (
    <div className="space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text-1)]">Eventos</p>
          <p className="text-xs text-[var(--color-text-3)]">
            {events.length} evento(s) cadastrado(s)
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} />
          Novo evento
        </Button>
      </div>

      {/* Event list */}
      {events.length === 0 ? (
        <div className="py-8 text-center">
          <Calendar size={28} className="mx-auto text-[var(--color-text-3)] mb-2 opacity-40" />
          <p className="text-sm text-[var(--color-text-3)]">Nenhum evento cadastrado</p>
          <p className="text-xs text-[var(--color-text-3)] mt-1 opacity-70">
            Clique em "Novo evento" para começar
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map(ev => {
            const isExp = expanded === ev.id
            return (
              <Card key={ev.id} className="!p-0 overflow-hidden">
                {/* Summary row */}
                <button
                  onClick={() => setExpanded(x => x === ev.id ? null : ev.id)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-[var(--color-surface-2)] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-[var(--color-text-1)] truncate">{ev.titulo}</p>
                      {statusBadge(ev.status)}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-[var(--color-text-3)] flex items-center gap-1">
                        <Calendar size={11} />
                        {formatDate(ev.data_inicio)}
                        {ev.hora_inicio && ` · ${ev.hora_inicio.slice(0,5)}`}
                        {ev.hora_fim    && `–${ev.hora_fim.slice(0,5)}`}
                      </span>
                      <span className="text-xs text-[var(--color-text-3)] flex items-center gap-1">
                        <RepeatIcon size={11} />
                        {recorrenciaLabel(ev.recorrencia, ev.dias_semana)}
                      </span>
                    </div>
                  </div>
                  {isExp ? <ChevronUp size={16} className="flex-shrink-0 text-[var(--color-text-3)]" /> : <ChevronDown size={16} className="flex-shrink-0 text-[var(--color-text-3)]" />}
                </button>

                {/* Expanded detail + actions */}
                {isExp && (
                  <div className="border-t border-[var(--color-border)] p-3 space-y-3 bg-[var(--color-surface-2)]">
                    {ev.descricao && (
                      <p className="text-xs text-[var(--color-text-2)] leading-relaxed">{ev.descricao}</p>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-xs text-[var(--color-text-3)]">
                      {ev.data_fim_recorrencia && (
                        <div>
                          <span className="font-medium text-[var(--color-text-2)]">Repetir até </span>
                          {formatDate(ev.data_fim_recorrencia)}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openEdit(ev)}
                        className="flex-1"
                      >
                        <Edit2 size={13} />
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => setConfirmDel(ev.id)}
                        loading={deleting === ev.id}
                        className="flex-1"
                      >
                        <Trash2 size={13} />
                        Excluir
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Create / Edit modal */}
      <Modal
        open={modal}
        onClose={closeModal}
        title={editing ? 'Editar evento' : 'Novo evento'}
      >
        <EventForm
          initial={editing}
          onSave={handleSave}
          onClose={closeModal}
          saving={saving}
        />
      </Modal>

      {/* Confirm delete modal */}
      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={handleDelete}
        title="Excluir evento"
        message="Deseja excluir este evento? Esta ação não pode ser desfeita."
        loading={!!deleting}
      />

    </div>
  )
}
