import { useState, useEffect, useCallback } from 'react'
import { Search, Edit2, Trash2, ArrowUpCircle, Crown } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { Card, Avatar, EmptyState, Skeleton, Th, Td, TableRow } from '../components/ui/Card.jsx'
import { Badge, SubdepBadge, RoleBadge, TarjaBadge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Input, Select, ChipSelect } from '../components/ui/Input.jsx'
import { Modal, ConfirmModal } from '../components/ui/Modal.jsx'
import { formatDate, subdepLabel, roleLabel } from '../lib/utils.js'
import { notify } from '../lib/whatsapp.js'

const SUBDEP_CHIP_OPTS = [
  { value: 'louvor',   label: 'Louvor' },
  { value: 'regencia', label: 'Regência' },
  { value: 'ebd',      label: 'EBD' },
  { value: 'recepcao', label: 'Recepção' },
  { value: 'midia',    label: 'Mídia' },
]

const TARJA_OPTS = [
  { value: 'discipulo', label: 'Discípulo' },
  { value: 'nicodemos', label: 'Nicodemos' },
  { value: 'prodigo',   label: 'Filho Pródigo' },
]

const ROLE_OPTS_FALLBACK = [
  { value: 'lider_geral',       label: 'Líder Geral' },
  { value: 'lider_funcao',      label: 'Líder de Função' },
  { value: 'membro_serve',      label: 'Membro que Serve' },
  { value: 'membro_observador', label: 'Observador' },
]

function EditMemberModal({ member, onClose, onSave, roleOpts }) {
  const [form,    setForm]    = useState(member || {})
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const isLiderFuncao = form.role === 'lider_funcao'

  // Subdeps served = all selected subdeps (chip select)
  const subdepsServe = Array.isArray(form.subdepartamento)
    ? form.subdepartamento
    : form.subdepartamento ? [form.subdepartamento] : []

  // Chips available for "serve em" = exclude the one they lead (to avoid confusion in display, but still allowed)
  const serveOpts = SUBDEP_CHIP_OPTS

  const handleSave = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.from('users').update({
        nome:            form.nome,
        whatsapp:        form.whatsapp,
        role:            form.role,
        subdepartamento: form.subdepartamento,
        subdep_lider:    form.role === 'lider_funcao' ? (form.subdep_lider || null) : null,
        estado_civil:    form.estado_civil,
        endereco:        form.endereco,
        tarja:           form.tarja,
        tarja_atualizada_em: form.tarja !== member.tarja ? new Date().toISOString() : member.tarja_atualizada_em,
        ativo:           form.ativo,
      }).eq('id', form.id)
      if (error) throw error
      onSave()
      onClose()
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={!!member}
      onClose={onClose}
      title="Editar membro"
      size="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} loading={loading}>Salvar</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input label="Nome" value={form.nome || ''} onChange={e => set('nome', e.target.value)} />
        <Input label="WhatsApp" value={form.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} />
        <Select label="Perfil" value={form.role || ''} onChange={e => set('role', e.target.value)}>
          {roleOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>

        {/* ── Campos exclusivos para Líder de Função ── */}
        {isLiderFuncao && (
          <div className="rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 p-3 space-y-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Crown size={13} className="text-primary-600" />
              <span className="text-xs font-semibold text-primary-700 dark:text-primary-400">Liderança de Subdepartamento</span>
            </div>

            <Select
              label="Subdepartamento que lidera"
              value={form.subdep_lider || ''}
              onChange={e => set('subdep_lider', e.target.value)}
            >
              <option value="">— Selecione um subdepartamento —</option>
              {SUBDEP_CHIP_OPTS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
            <p className="text-2xs text-[var(--color-text-3)] -mt-1">
              Este é o subdepartamento pelo qual este líder é responsável.
            </p>
          </div>
        )}

        {/* ── Subdepartamentos em que serve ── */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[var(--color-text-2)]">
            {isLiderFuncao ? 'Também serve em' : 'Subdepartamento(s)'}
          </label>
          {isLiderFuncao && (
            <p className="text-2xs text-[var(--color-text-3)] -mt-0.5">
              Além de liderar, pode servir em outros subdepartamentos.
            </p>
          )}
          <ChipSelect
            options={serveOpts}
            selected={subdepsServe}
            onChange={v => set('subdepartamento', v)}
          />
        </div>

        <Select label="Tarja pastoral" value={form.tarja || ''} onChange={e => set('tarja', e.target.value)}>
          <option value="">Sem tarja</option>
          {TARJA_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="ativo"
            checked={form.ativo || false}
            onChange={e => set('ativo', e.target.checked)}
            className="w-4 h-4 accent-primary-600"
          />
          <label htmlFor="ativo" className="text-sm text-[var(--color-text-2)]">Membro ativo</label>
        </div>
      </div>
    </Modal>
  )
}

export default function Members() {
  const { isLiderGeral } = useAuth()
  const [members,    setMembers]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [tarjaFilter,setTarjaFilter]= useState('')
  const [editMember, setEditMember] = useState(null)
  const [delMember,  setDelMember]  = useState(null)
  const [delLoading, setDelLoading] = useState(false)
  const [pendentes,  setPendentes]  = useState([])
  const [roleOpts,   setRoleOpts]   = useState(ROLE_OPTS_FALLBACK)

  const loadMembers = useCallback(async () => {
    setLoading(true)
    try {
      let usersQuery = supabase.from('users').select('*').order('nome', { ascending: true })
      if (!isLiderGeral) usersQuery = usersQuery.eq('ativo', true)

      const [usersRes, perfisRes] = await Promise.all([
        usersQuery,
        supabase.from('perfis').select('nome, label').order('criado_em', { ascending: true }),
      ])

      if (usersRes.error) throw usersRes.error
      setMembers(usersRes.data || [])
      setPendentes((usersRes.data || []).filter(m => !m.ativo))

      // Build dynamic role options from perfis table
      if (perfisRes.data && perfisRes.data.length > 0) {
        setRoleOpts(perfisRes.data.map(p => ({ value: p.nome, label: p.label })))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [isLiderGeral])

  useEffect(() => { loadMembers() }, [loadMembers])

  const filtered = members.filter(m => {
    const matchSearch = !search || m.nome?.toLowerCase().includes(search.toLowerCase()) || m.email?.toLowerCase().includes(search.toLowerCase())
    const matchRole   = !roleFilter   || m.role === roleFilter
    const matchTarja  = !tarjaFilter  || m.tarja === tarjaFilter
    return matchSearch && matchRole && matchTarja
  })

  async function handleDelete() {
    if (!delMember) return
    setDelLoading(true)
    try {
      await supabase.from('users').delete().eq('id', delMember.id)
      setDelMember(null)
      loadMembers()
    } catch (err) {
      alert(err.message)
    } finally {
      setDelLoading(false)
    }
  }

  async function approveUser(id) {
    await supabase.from('users').update({ ativo: true }).eq('id', id)
    loadMembers()
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-1)]">Membros</h2>
          <p className="text-xs text-[var(--color-text-3)]">{members.filter(m => m.ativo).length} ativos</p>
        </div>
      </div>

      {/* Pendentes de aprovação */}
      {pendentes.length > 0 && isLiderGeral && (
        <Card className="!p-3">
          <p className="text-xs font-semibold text-[var(--color-text-2)] mb-2">{pendentes.length} cadastro(s) aguardando aprovação</p>
          <div className="space-y-2">
            {pendentes.map(m => (
              <div key={m.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Avatar nome={m.nome} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-1)]">{m.nome}</p>
                    <p className="text-xs text-[var(--color-text-3)]">{m.email} · {subdepLabel(m.subdepartamento)}</p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="xs" variant="success" onClick={() => approveUser(m.id)}>Aprovar</Button>
                  <Button size="xs" variant="danger" onClick={() => setDelMember(m)}>Recusar</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-3)]" />
          <input
            className="input-base pl-8"
            placeholder="Buscar membro..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="sm:w-44">
          <option value="">Todos os perfis</option>
          {roleOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        {isLiderGeral && (
          <Select value={tarjaFilter} onChange={e => setTarjaFilter(e.target.value)} className="sm:w-44">
            <option value="">Todas as tarjas</option>
            {TARJA_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        )}
      </div>

      {/* Table */}
      <Card padding={false}>
        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Search} title="Nenhum membro encontrado" description="Tente ajustar os filtros." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>Perfil</Th>
                  <Th>Líder de</Th>
                  <Th>Serve em</Th>
                  {isLiderGeral && <Th>Tarja</Th>}
                  <Th>Entrada</Th>
                  {isLiderGeral && <Th>Ações</Th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => {
                  const subdeps = Array.isArray(m.subdepartamento) ? m.subdepartamento : m.subdepartamento ? [m.subdepartamento] : []
                  return (
                    <TableRow key={m.id}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Avatar nome={m.nome} size="sm" />
                          <div>
                            <p className="font-medium text-[var(--color-text-1)]">{m.nome}</p>
                            <p className="text-2xs text-[var(--color-text-3)]">{m.email}</p>
                          </div>
                        </div>
                      </Td>
                      <Td><RoleBadge role={m.role} label={roleOpts.find(o => o.value === m.role)?.label} /></Td>
                      {/* Líder de */}
                      <Td>
                        {m.subdep_lider
                          ? (
                            <div className="flex items-center gap-1">
                              <Crown size={11} className="text-primary-500 flex-shrink-0" />
                              <SubdepBadge subdep={m.subdep_lider} />
                            </div>
                          )
                          : <span className="text-[var(--color-text-3)]">—</span>
                        }
                      </Td>
                      {/* Serve em */}
                      <Td>
                        {subdeps.length > 0
                          ? <div className="flex flex-wrap gap-1">{subdeps.map(s => <SubdepBadge key={s} subdep={s} />)}</div>
                          : <span className="text-[var(--color-text-3)]">—</span>
                        }
                      </Td>
                      {isLiderGeral && (
                        <Td>
                          <TarjaBadge tarja={m.tarja} />
                        </Td>
                      )}
                      <Td className="text-[var(--color-text-3)]">{formatDate(m.data_entrada, { month: 'short', year: 'numeric', day: undefined })}</Td>
                      {isLiderGeral && (
                        <Td>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setEditMember(m)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-3)] hover:bg-[var(--color-bg-2)] hover:text-primary-600 transition-colors"
                              title="Editar"
                            >
                              <Edit2 size={13} />
                            </button>
                            {(m.role === 'membro_observador' || m.role === 'membro_serve') && (
                              <button
                                onClick={() => setEditMember({ ...m, role: 'lider_funcao' })}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-3)] hover:bg-[var(--color-bg-2)] hover:text-primary-500 transition-colors"
                                title="Promover a Líder de Função"
                              >
                                <Crown size={13} />
                              </button>
                            )}
                            {m.role === 'membro_observador' && (
                              <button
                                onClick={() => setEditMember({ ...m, role: 'membro_serve' })}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-3)] hover:bg-[var(--color-bg-2)] hover:text-success-500 transition-colors"
                                title="Promover a Membro que Serve"
                              >
                                <ArrowUpCircle size={13} />
                              </button>
                            )}
                            <button
                              onClick={() => setDelMember(m)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-3)] hover:bg-[var(--color-bg-2)] hover:text-danger-500 transition-colors"
                              title="Excluir"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </Td>
                      )}
                    </TableRow>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editMember && (
        <EditMemberModal member={editMember} onClose={() => setEditMember(null)} onSave={loadMembers} roleOpts={roleOpts} />
      )}

      <ConfirmModal
        open={!!delMember}
        onClose={() => setDelMember(null)}
        onConfirm={handleDelete}
        title="Excluir membro"
        message={`Tem certeza que deseja excluir "${delMember?.nome}"? Esta ação não pode ser desfeita.`}
        danger
        loading={delLoading}
      />
    </div>
  )
}
