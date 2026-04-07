import { useState, useEffect } from 'react'
import { UserPlus, Search } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { Card, CardSection, EmptyState, Skeleton, Avatar } from '../components/ui/Card.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Input, Select } from '../components/ui/Input.jsx'
import { Modal } from '../components/ui/Modal.jsx'
import { formatDate } from '../lib/utils.js'
import { notify } from '../lib/whatsapp.js'

const ESTADO_CIVIL = [
  { value: 'solteiro',  label: 'Solteiro(a)' },
  { value: 'casado',    label: 'Casado(a)' },
  { value: 'divorciado',label: 'Divorciado(a)' },
  { value: 'viuvo',     label: 'Viúvo(a)' },
]

const STATUS_OPTS = [
  { value: 'novo',        label: 'Novo' },
  { value: 'recorrente',  label: 'Recorrente' },
  { value: 'acompanhado', label: 'Em acompanhamento' },
  { value: 'integrado',   label: 'Integrado' },
]

const EMPTY_FORM = {
  nome: '', idade: '', estado_civil: '', endereco: '',
  igreja: '', motivo: '',
}

export default function Visitors() {
  const { profile, isLiderGeral } = useAuth()
  const [visitors, setVisitors] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(false)
  const [form,     setForm]     = useState(EMPTY_FORM)
  const [saving,   setSaving]   = useState(false)
  const [search,   setSearch]   = useState('')

  useEffect(() => { loadVisitors() }, [])

  async function loadVisitors() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('visitantes').select('*')
        .order('data_visita', { ascending: false })
      setVisitors(data || [])
    } finally {
      setLoading(false)
    }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.nome.trim()) return
    setSaving(true)
    try {
      const today = new Date().toISOString().split('T')[0]

      // Check if recurring visitor
      const { data: prev } = await supabase
        .from('visitantes')
        .select('id, data_visita')
        .ilike('nome', `%${form.nome}%`)
        .order('data_visita', { ascending: false })
        .limit(5)

      const isRecorrente = prev && prev.length > 0

      const { error } = await supabase.from('visitantes').insert({
        ...form,
        idade: form.idade ? Number(form.idade) : null,
        data_visita: today,
        status_acompanhamento: isRecorrente ? 'recorrente' : 'novo',
      })
      if (error) throw error

      // Notify on 2nd visit
      if (isRecorrente) {
        const { data: lider } = await supabase
          .from('users').select('whatsapp').eq('role', 'lider_geral').limit(1).single()
        if (lider?.whatsapp) {
          await notify.segundaVisita(lider.whatsapp, form.nome, formatDate(today))
        }
      }

      setModal(false)
      setForm(EMPTY_FORM)
      loadVisitors()
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(id, status) {
    await supabase.from('visitantes').update({ status_acompanhamento: status }).eq('id', id)
    setVisitors(prev => prev.map(v => v.id === id ? { ...v, status_acompanhamento: status } : v))
  }

  const today = new Date().toISOString().split('T')[0]
  const todayVisitors = visitors.filter(v => v.data_visita === today)
  const pastVisitors  = visitors.filter(v => v.data_visita !== today)

  const filtered = (isLiderGeral ? pastVisitors : []).filter(v =>
    !search || v.nome?.toLowerCase().includes(search.toLowerCase())
  )

  const statusColor = {
    novo:         'blue',
    recorrente:   'amber',
    acompanhado:  'violet',
    integrado:    'green',
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-1)]">Visitantes</h2>
          <p className="text-xs text-[var(--color-text-3)]">
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <Button size="sm" onClick={() => setModal(true)}>
          <UserPlus size={14} />
          Registrar
        </Button>
      </div>

      {/* Today's visitors */}
      <Card>
        <CardSection title={`Visitantes hoje (${todayVisitors.length})`}>
          {todayVisitors.length === 0 ? (
            <EmptyState icon={UserPlus} title="Nenhum visitante registrado hoje" />
          ) : todayVisitors.map(v => (
            <div key={v.id} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
              <div className="flex items-center gap-2">
                <Avatar nome={v.nome} size="sm" />
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-1)]">{v.nome}</p>
                  <p className="text-xs text-[var(--color-text-3)]">
                    {v.idade && `${v.idade} anos`}
                    {v.estado_civil && ` · ${ESTADO_CIVIL.find(e => e.value === v.estado_civil)?.label || v.estado_civil}`}
                  </p>
                </div>
              </div>
              <Badge variant={statusColor[v.status_acompanhamento] || 'default'}>
                {STATUS_OPTS.find(s => s.value === v.status_acompanhamento)?.label || v.status_acompanhamento}
              </Badge>
            </div>
          ))}
        </CardSection>
      </Card>

      {/* History (líder only) */}
      {isLiderGeral && (
        <Card>
          <CardSection title="Histórico">
            <div className="relative mb-3">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]" />
              <input
                className="input-base pl-8 text-xs"
                placeholder="Buscar visitante..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            {loading ? (
              <Skeleton className="h-20 rounded" />
            ) : filtered.length === 0 ? (
              <EmptyState icon={UserPlus} title="Nenhum visitante no histórico" />
            ) : filtered.map(v => (
              <div key={v.id} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0 gap-2">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-1)]">{v.nome}</p>
                  <p className="text-xs text-[var(--color-text-3)]">
                    {formatDate(v.data_visita)} · {v.igreja || 'Igreja não informada'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Badge variant={statusColor[v.status_acompanhamento] || 'default'}>
                    {STATUS_OPTS.find(s => s.value === v.status_acompanhamento)?.label || v.status_acompanhamento}
                  </Badge>
                  <Select
                    value={v.status_acompanhamento}
                    onChange={e => updateStatus(v.id, e.target.value)}
                    className="!text-xs !py-0.5 !h-6 !px-1.5 w-28"
                  >
                    {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </div>
              </div>
            ))}
          </CardSection>
        </Card>
      )}

      {/* Register Modal */}
      <Modal
        open={modal}
        onClose={() => { setModal(false); setForm(EMPTY_FORM) }}
        title="Registrar visitante"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setModal(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} loading={saving} disabled={!form.nome.trim()}>
              Registrar
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input label="Nome completo" placeholder="Nome do visitante" value={form.nome} onChange={e => set('nome', e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Idade" type="number" placeholder="Ex: 22" value={form.idade} onChange={e => set('idade', e.target.value)} />
            <Select label="Estado civil" value={form.estado_civil} onChange={e => set('estado_civil', e.target.value)}>
              <option value="">Selecione...</option>
              {ESTADO_CIVIL.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>
          <Input label="Endereço / Bairro" placeholder="Bairro ou cidade" value={form.endereco} onChange={e => set('endereco', e.target.value)} />
          <Input label="Igreja de origem" placeholder="Nome da igreja (se houver)" value={form.igreja} onChange={e => set('igreja', e.target.value)} />
          <Input label="Motivo da visita" placeholder="Como nos conheceu?" value={form.motivo} onChange={e => set('motivo', e.target.value)} />
        </div>
      </Modal>
    </div>
  )
}
