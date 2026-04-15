import { useState, useEffect } from 'react'
import { UserPlus, Search, Pencil, Trash2, Phone, ChevronDown, ChevronUp, Calendar } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { Card, CardSection, EmptyState, Skeleton, Avatar } from '../components/ui/Card.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Input, Select } from '../components/ui/Input.jsx'
import { Modal, ConfirmModal } from '../components/ui/Modal.jsx'
import { formatDate } from '../lib/utils.js'
import { notify } from '../lib/whatsapp.js'
import { cn } from '../lib/utils.js'

const ESTADO_CIVIL = [
  { value: 'solteiro',   label: 'Solteiro(a)' },
  { value: 'casado',     label: 'Casado(a)' },
  { value: 'divorciado', label: 'Divorciado(a)' },
  { value: 'viuvo',      label: 'Viúvo(a)' },
]

const STATUS_OPTS = [
  { value: 'novo',        label: 'Novo',              color: 'blue'   },
  { value: 'recorrente',  label: 'Recorrente',        color: 'amber'  },
  { value: 'acompanhado', label: 'Em acompanhamento', color: 'violet' },
  { value: 'integrado',   label: 'Integrado',         color: 'green'  },
]

const EMPTY_FORM = {
  nome: '', idade: '', estado_civil: '', endereco: '',
  telefone: '', igreja: '', motivo: '',
}

function toLocalDate(isoStr) {
  if (!isoStr) return ''
  const [y, m, d] = isoStr.split('-')
  return `${d}/${m}/${y}`
}

function todayStr() {
  const d = new Date()
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dy = String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${dy}`
}

// ── Visitor form (create / edit) ──────────────────────────────────────────────

function VisitorForm({ form, onChange }) {
  const set = (k, v) => onChange({ ...form, [k]: v })
  return (
    <div className="space-y-3">
      <Input label="Nome completo *" placeholder="Nome do visitante"
        value={form.nome} onChange={e => set('nome', e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Input label="Telefone / WhatsApp" placeholder="(xx) 9xxxx-xxxx" type="tel"
          value={form.telefone} onChange={e => set('telefone', e.target.value)} />
        <Input label="Idade" type="number" placeholder="Ex: 22"
          value={form.idade} onChange={e => set('idade', e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select label="Estado civil" value={form.estado_civil} onChange={e => set('estado_civil', e.target.value)}>
          <option value="">Selecione...</option>
          {ESTADO_CIVIL.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Input label="Endereço / Bairro" placeholder="Bairro ou cidade"
          value={form.endereco} onChange={e => set('endereco', e.target.value)} />
      </div>
      <Input label="Igreja de origem" placeholder="Nome da igreja (se houver)"
        value={form.igreja} onChange={e => set('igreja', e.target.value)} />
      <Input label="Como nos conheceu?" placeholder="Motivo da visita"
        value={form.motivo} onChange={e => set('motivo', e.target.value)} />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Visitors() {
  const { profile, isLiderGeral, isLiderFuncao } = useAuth()
  const canSeeHistory = isLiderGeral || isLiderFuncao

  const [visitors,    setVisitors]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [filterDate,  setFilterDate]  = useState('')   // 'YYYY-MM-DD' | ''

  // Register modal
  const [regModal,    setRegModal]    = useState(false)
  const [regForm,     setRegForm]     = useState(EMPTY_FORM)
  const [regSaving,   setRegSaving]   = useState(false)

  // Edit modal
  const [editModal,   setEditModal]   = useState(false)
  const [editTarget,  setEditTarget]  = useState(null)
  const [editForm,    setEditForm]    = useState(EMPTY_FORM)
  const [editSaving,  setEditSaving]  = useState(false)

  // Delete confirm
  const [delTarget,   setDelTarget]   = useState(null)
  const [deleting,    setDeleting]    = useState(false)

  // History grouping
  const [expandedDates, setExpandedDates] = useState({})

  useEffect(() => { loadVisitors() }, [])

  async function loadVisitors() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('visitantes').select('*')
        .order('data_visita', { ascending: false })
        .order('nome', { ascending: true })
      setVisitors(data || [])
    } finally {
      setLoading(false)
    }
  }

  // ── Register ────────────────────────────────────────────────────────────────

  async function handleRegister() {
    if (!regForm.nome.trim()) return
    setRegSaving(true)
    try {
      const today = todayStr()
      const { data: prev } = await supabase
        .from('visitantes').select('id').ilike('nome', regForm.nome.trim())
        .limit(5)
      const isRecorrente = prev && prev.length > 0
      const { error } = await supabase.from('visitantes').insert({
        ...regForm,
        idade: regForm.idade ? Number(regForm.idade) : null,
        data_visita: today,
        status_acompanhamento: isRecorrente ? 'recorrente' : 'novo',
      })
      if (error) throw error
      if (isRecorrente) {
        const { data: lider } = await supabase
          .from('users').select('whatsapp').eq('role', 'lider_geral').limit(1).maybeSingle()
        if (lider?.whatsapp) await notify.segundaVisita(lider.whatsapp, regForm.nome, formatDate(today))
      }
      setRegModal(false)
      setRegForm(EMPTY_FORM)
      loadVisitors()
    } catch (err) {
      alert(err.message)
    } finally {
      setRegSaving(false)
    }
  }

  // ── Edit ────────────────────────────────────────────────────────────────────

  function openEdit(v) {
    setEditTarget(v)
    setEditForm({
      nome:         v.nome         || '',
      idade:        v.idade        ? String(v.idade) : '',
      estado_civil: v.estado_civil || '',
      endereco:     v.endereco     || '',
      telefone:     v.telefone     || '',
      igreja:       v.igreja       || '',
      motivo:       v.motivo       || '',
    })
    setEditModal(true)
  }

  async function handleEdit() {
    if (!editForm.nome.trim()) return
    setEditSaving(true)
    try {
      const { error } = await supabase.from('visitantes').update({
        ...editForm,
        idade: editForm.idade ? Number(editForm.idade) : null,
      }).eq('id', editTarget.id)
      if (error) throw error
      setEditModal(false)
      setEditTarget(null)
      loadVisitors()
    } catch (err) {
      alert(err.message)
    } finally {
      setEditSaving(false)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!delTarget) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('visitantes').delete().eq('id', delTarget.id)
      if (error) throw error
      setDelTarget(null)
      loadVisitors()
    } catch (err) {
      alert(err.message)
    } finally {
      setDeleting(false)
    }
  }

  // ── Status update ────────────────────────────────────────────────────────────

  async function updateStatus(id, status) {
    await supabase.from('visitantes').update({ status_acompanhamento: status }).eq('id', id)
    setVisitors(prev => prev.map(v => v.id === id ? { ...v, status_acompanhamento: status } : v))
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const today = todayStr()
  const todayVisitors = visitors.filter(v => v.data_visita === today)

  const historyVisitors = visitors.filter(v => {
    if (v.data_visita === today) return false
    if (filterDate && v.data_visita !== filterDate) return false
    if (search && !v.nome?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Group history by date
  const groupedHistory = historyVisitors.reduce((acc, v) => {
    if (!acc[v.data_visita]) acc[v.data_visita] = []
    acc[v.data_visita].push(v)
    return acc
  }, {})
  const historyDates = Object.keys(groupedHistory).sort((a,b) => b.localeCompare(a))

  const toggleDate = (date) => setExpandedDates(prev => ({ ...prev, [date]: !prev[date] }))

  const statusColor = { novo:'blue', recorrente:'amber', acompanhado:'violet', integrado:'green' }

  function VisitorRow({ v, showEdit = false, showDelete = false }) {
    return (
      <div className="flex items-center justify-between py-2.5 border-b border-[var(--color-border)] last:border-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar nome={v.nome} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--color-text-1)] truncate">{v.nome}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {v.idade && <span className="text-2xs text-[var(--color-text-3)]">{v.idade} anos</span>}
              {v.estado_civil && <span className="text-2xs text-[var(--color-text-3)]">{ESTADO_CIVIL.find(e=>e.value===v.estado_civil)?.label}</span>}
              {v.telefone && (
                <a href={`tel:${v.telefone}`} className="flex items-center gap-0.5 text-2xs text-primary-600 hover:underline">
                  <Phone size={10} />{v.telefone}
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Badge variant={statusColor[v.status_acompanhamento] || 'default'}>
            {STATUS_OPTS.find(s=>s.value===v.status_acompanhamento)?.label || v.status_acompanhamento}
          </Badge>
          {showEdit && canSeeHistory && (
            <Select
              value={v.status_acompanhamento}
              onChange={e => updateStatus(v.id, e.target.value)}
              className="!text-xs !py-0.5 !h-6 !px-1.5 w-28"
            >
              {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          )}
          {showEdit && (
            <button onClick={() => openEdit(v)}
              className="p-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-3)] hover:text-primary-500 transition-colors"
              title="Editar dados">
              <Pencil size={13} />
            </button>
          )}
          {showDelete && isLiderGeral && (
            <button onClick={() => setDelTarget(v)}
              className="p-1 rounded hover:bg-danger-50 dark:hover:bg-danger-900/20 text-[var(--color-text-3)] hover:text-danger-500 transition-colors"
              title="Excluir">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-1)]">Visitantes</h2>
          <p className="text-xs text-[var(--color-text-3)]">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <Button size="sm" onClick={() => setRegModal(true)}>
          <UserPlus size={14} /> Registrar
        </Button>
      </div>

      {/* Today */}
      <Card>
        <CardSection title={`Visitantes hoje (${todayVisitors.length})`}>
          {loading ? <Skeleton className="h-16 rounded" /> :
           todayVisitors.length === 0
            ? <EmptyState icon={UserPlus} title="Nenhum visitante registrado hoje" />
            : todayVisitors.map(v => (
                <VisitorRow key={v.id} v={v} showEdit showDelete />
              ))
          }
        </CardSection>
      </Card>

      {/* History */}
      {canSeeHistory && (
        <Card>
          <CardSection title="Histórico de visitas">
            {/* Filters */}
            <div className="flex gap-2 mb-3 flex-wrap">
              <div className="relative flex-1 min-w-32">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]" />
                <input className="input-base pl-8 text-xs w-full" placeholder="Buscar por nome..."
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar size={13} className="text-[var(--color-text-3)]" />
                <input type="date" className="input-base text-xs h-8 px-2"
                  value={filterDate} onChange={e => setFilterDate(e.target.value)}
                  title="Filtrar por data específica" />
                {filterDate && (
                  <button onClick={() => setFilterDate('')}
                    className="text-xs text-[var(--color-text-3)] hover:text-[var(--color-text-1)]">✕</button>
                )}
              </div>
            </div>

            {loading ? <Skeleton className="h-24 rounded" /> :
             historyDates.length === 0
              ? <EmptyState icon={UserPlus} title="Nenhum visitante no histórico" />
              : historyDates.map(date => {
                  const group   = groupedHistory[date]
                  const isOpen  = expandedDates[date] !== false  // default open
                  const domingo = new Date(date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                  return (
                    <div key={date} className="mb-2 border border-[var(--color-border)] rounded-xl overflow-hidden">
                      <button
                        onClick={() => toggleDate(date)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--color-surface-2)] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[var(--color-text-1)] capitalize">{domingo}</span>
                          <span className="text-2xs bg-[var(--color-bg-2)] text-[var(--color-text-3)] px-1.5 py-0.5 rounded-full">
                            {group.length} visitante{group.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {isOpen ? <ChevronUp size={14} className="text-[var(--color-text-3)]" />
                                : <ChevronDown size={14} className="text-[var(--color-text-3)]" />}
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-1 border-t border-[var(--color-border)]">
                          {group.map(v => <VisitorRow key={v.id} v={v} showEdit showDelete />)}
                        </div>
                      )}
                    </div>
                  )
                })
            }
          </CardSection>
        </Card>
      )}

      {/* Register Modal */}
      <Modal open={regModal} onClose={() => { setRegModal(false); setRegForm(EMPTY_FORM) }}
        title="Registrar visitante"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setRegModal(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleRegister} loading={regSaving} disabled={!regForm.nome.trim()}>
              Registrar
            </Button>
          </>
        }
      >
        <VisitorForm form={regForm} onChange={setRegForm} />
      </Modal>

      {/* Edit Modal */}
      <Modal open={editModal} onClose={() => { setEditModal(false); setEditTarget(null) }}
        title="Editar visitante"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditModal(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleEdit} loading={editSaving} disabled={!editForm.nome.trim()}>
              Salvar
            </Button>
          </>
        }
      >
        <VisitorForm form={editForm} onChange={setEditForm} />
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        open={!!delTarget}
        onClose={() => setDelTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Excluir visitante"
        message={`Tem certeza que deseja excluir "${delTarget?.nome}"? Esta ação não pode ser desfeita.`}
        danger
      />
    </div>
  )
}
