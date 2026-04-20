import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Edit2, Trash2, ArrowUpCircle, Crown, Camera, Loader2, ClipboardList, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { Card, Avatar, EmptyState, Skeleton, Th, Td, TableRow } from '../components/ui/Card.jsx'
import { Badge, SubdepBadge, RoleBadge, TarjaBadge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Input, Select, ChipSelect, Textarea } from '../components/ui/Input.jsx'
import { Modal, ConfirmModal } from '../components/ui/Modal.jsx'
import { formatDate, subdepLabel, roleLabel } from '../lib/utils.js'
import { notify } from '../lib/whatsapp.js'

// ── Opções de perfil ─────────────────────────────────────────────────────────

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

// ── Opções da Ficha ──────────────────────────────────────────────────────────

const DONS_OPTS = [
  { value: 'lideranca',     label: 'Liderança' },
  { value: 'ensino',        label: 'Ensino' },
  { value: 'evangelismo',   label: 'Evangelismo' },
  { value: 'intercessao',   label: 'Intercessão' },
  { value: 'misericordia',  label: 'Misericórdia' },
  { value: 'servico',       label: 'Serviço' },
  { value: 'administracao', label: 'Administração' },
  { value: 'profecia',      label: 'Profecia' },
  { value: 'exortacao',     label: 'Exortação' },
  { value: 'generosidade',  label: 'Generosidade' },
  { value: 'musica',        label: 'Música' },
  { value: 'criatividade',  label: 'Criatividade' },
]

const SITUACAO_OPTS = [
  { value: 'estavel',         label: 'Estável' },
  { value: 'acompanhamento',  label: 'Em acompanhamento' },
  { value: 'afastado_risco',  label: 'Afastado em risco' },
  { value: 'luto',            label: 'Luto' },
  { value: 'dif_familiar',    label: 'Dificuldade familiar' },
  { value: 'nec_financeira',  label: 'Necessidade financeira' },
]

const ESCOLARIDADE_OPTS = [
  { value: 'fundamental', label: 'Ensino Fundamental' },
  { value: 'medio',       label: 'Ensino Médio' },
  { value: 'tecnico',     label: 'Técnico / Profissionalizante' },
  { value: 'superior',    label: 'Superior' },
  { value: 'pos',         label: 'Pós-graduação' },
]

// ── EditMemberModal ──────────────────────────────────────────────────────────

function EditMemberModal({ member, onClose, onSave, roleOpts }) {
  const [form,         setForm]         = useState(member || {})
  const [loading,      setLoading]      = useState(false)
  const [photoLoading, setPhotoLoading] = useState(false)
  const fileRef = useRef(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const isLiderFuncaoForm = form.role === 'lider_funcao'

  const subdepsServe = Array.isArray(form.subdepartamento)
    ? form.subdepartamento
    : form.subdepartamento ? [form.subdepartamento] : []

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoLoading(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = `${form.id}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      set('foto_url', `${data.publicUrl}?t=${Date.now()}`)
    } catch (err) {
      alert('Erro ao enviar foto: ' + err.message)
    } finally {
      setPhotoLoading(false)
    }
  }

  const LIMITE_LIDER_GERAL = 2

  const handleSave = async () => {
    setLoading(true)
    try {
      const promovendoParaLiderGeral = form.role === 'lider_geral' && member.role !== 'lider_geral'
      if (promovendoParaLiderGeral) {
        const { count } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'lider_geral')
          .eq('ativo', true)
        if ((count || 0) >= LIMITE_LIDER_GERAL) {
          alert(`Limite atingido: só pode haver ${LIMITE_LIDER_GERAL} Líderes Gerais. Remova um antes de promover outro.`)
          setLoading(false)
          return
        }
      }

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
        foto_url:        form.foto_url ?? null,
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
        {/* Foto de perfil */}
        <div className="flex flex-col items-center gap-2 pb-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handlePhotoChange}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={photoLoading}
            className="relative group"
            title="Alterar foto"
          >
            <div className="w-20 h-20 rounded-full overflow-hidden bg-primary-600 flex items-center justify-center text-white text-2xl font-semibold flex-shrink-0">
              {form.foto_url
                ? <img src={form.foto_url} alt={form.nome} className="w-full h-full object-cover" />
                : <span>{(form.nome || '?').trim().split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()}</span>
              }
            </div>
            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {photoLoading
                ? <Loader2 size={20} className="text-white animate-spin" />
                : <Camera size={20} className="text-white" />
              }
            </div>
          </button>
          <p className="text-2xs text-[var(--color-text-3)]">Clique para alterar a foto</p>
        </div>

        <Input label="Nome" value={form.nome || ''} onChange={e => set('nome', e.target.value)} />
        <Input label="WhatsApp" value={form.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} />
        <Select label="Perfil" value={form.role || ''} onChange={e => set('role', e.target.value)}>
          {roleOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>

        {isLiderFuncaoForm && (
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

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-[var(--color-text-2)]">
            {isLiderFuncaoForm ? 'Também serve em' : 'Subdepartamento(s)'}
          </label>
          {isLiderFuncaoForm && (
            <p className="text-2xs text-[var(--color-text-3)] -mt-0.5">
              Além de liderar, pode servir em outros subdepartamentos.
            </p>
          )}
          <ChipSelect
            options={SUBDEP_CHIP_OPTS}
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

// ── FichaModal ───────────────────────────────────────────────────────────────

function FichaModal({ member, onClose, onSaved, isLiderGeral: canSeePastoral }) {
  const { profile } = useAuth()

  const [tab, setTab] = useState('ficha')
  const [form, setForm] = useState({
    dons:              member.dons || [],
    vocacao:           member.vocacao || '',
    em_discipulado:    member.em_discipulado || false,
    discipulado_com:   member.discipulado_com || '',
    batizado:          member.batizado || false,
    data_batismo:      member.data_batismo || '',
    situacao_pastoral: member.situacao_pastoral || '',
    escolaridade:      member.escolaridade || '',
    profissao:         member.profissao || '',
    tem_filhos:        member.tem_filhos || false,
  })
  const [saving,          setSaving]          = useState(false)
  const [updaterNome,     setUpdaterNome]     = useState(null)
  const [anotacoes,       setAnotacoes]       = useState([])
  const [loadingNotes,    setLoadingNotes]    = useState(false)
  const [novaAnotacao,    setNovaAnotacao]    = useState('')
  const [addingNote,      setAddingNote]      = useState(false)

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Resolve nome de quem atualizou a ficha pela última vez
  useEffect(() => {
    if (!member.ficha_atualizada_por) return
    supabase.from('users').select('nome').eq('id', member.ficha_atualizada_por).single()
      .then(({ data }) => setUpdaterNome(data?.nome || null))
  }, [member.ficha_atualizada_por])

  // Carrega anotações pastorais (só lider_geral)
  useEffect(() => {
    if (canSeePastoral) loadAnotacoes()
  }, [member.id, canSeePastoral])

  async function loadAnotacoes() {
    setLoadingNotes(true)
    const { data } = await supabase
      .from('anotacoes_pastorais')
      .select('*, autor:users!anotacoes_pastorais_autor_id_fkey(nome)')
      .eq('user_id', member.id)
      .order('created_at', { ascending: false })
    setAnotacoes(data || [])
    setLoadingNotes(false)
  }

  async function saveFicha() {
    setSaving(true)
    const { error } = await supabase.from('users').update({
      dons:              form.dons,
      vocacao:           form.vocacao || null,
      em_discipulado:    form.em_discipulado,
      discipulado_com:   form.em_discipulado ? (form.discipulado_com || null) : null,
      batizado:          form.batizado,
      data_batismo:      form.batizado ? (form.data_batismo || null) : null,
      situacao_pastoral: form.situacao_pastoral || null,
      escolaridade:      form.escolaridade || null,
      profissao:         form.profissao || null,
      tem_filhos:        form.tem_filhos,
      ficha_atualizada_por: profile.id,
      ficha_atualizada_em:  new Date().toISOString(),
    }).eq('id', member.id)

    if (error) { alert(error.message); setSaving(false); return }
    setUpdaterNome(profile.nome)
    onSaved()
    setSaving(false)
  }

  async function addAnotacao() {
    if (!novaAnotacao.trim()) return
    setAddingNote(true)
    const { error } = await supabase.from('anotacoes_pastorais').insert({
      user_id:  member.id,
      autor_id: profile.id,
      texto:    novaAnotacao.trim(),
    })
    if (error) { alert(error.message) }
    else { setNovaAnotacao(''); loadAnotacoes() }
    setAddingNote(false)
  }

  async function deleteAnotacao(id) {
    const { error } = await supabase.from('anotacoes_pastorais').delete().eq('id', id)
    if (!error) loadAnotacoes()
    else alert(error.message)
  }

  const TABS = [
    { id: 'ficha',    label: 'Ficha' },
    ...(canSeePastoral ? [{ id: 'pastoral', label: 'Pastoral' }] : []),
  ]

  return (
    <Modal
      open={!!member}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Avatar nome={member.nome} src={member.foto_url} size="xs" />
          <span>{member.nome}</span>
        </div>
      }
      size="md"
      footer={
        tab === 'ficha' ? (
          <>
            <Button variant="secondary" size="sm" onClick={onClose}>Fechar</Button>
            <Button size="sm" onClick={saveFicha} loading={saving}>Salvar ficha</Button>
          </>
        ) : (
          <Button variant="secondary" size="sm" onClick={onClose}>Fechar</Button>
        )
      }
    >
      {/* Tabs */}
      {canSeePastoral && (
        <div className="flex gap-0 mb-4 border-b border-[var(--color-border)] -mt-1">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-[var(--color-text-3)] hover:text-[var(--color-text-2)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Aba Ficha ── */}
      {tab === 'ficha' && (
        <div className="space-y-5">

          {/* Última atualização */}
          {member.ficha_atualizada_em && (
            <p className="text-2xs text-[var(--color-text-3)] -mt-1">
              Atualizado por <span className="font-medium">{updaterNome || '—'}</span> em {formatDate(member.ficha_atualizada_em)}
            </p>
          )}

          {/* Espiritual */}
          <section className="space-y-3">
            <h4 className="text-2xs font-semibold uppercase tracking-wider text-[var(--color-text-3)]">Espiritual</h4>

            <div>
              <label className="text-xs font-medium text-[var(--color-text-2)] mb-1.5 block">Dons</label>
              <ChipSelect options={DONS_OPTS} selected={form.dons} onChange={v => setF('dons', v)} />
            </div>

            <Input
              label="Vocação percebida"
              value={form.vocacao}
              onChange={e => setF('vocacao', e.target.value)}
              placeholder="Ex: Pastoral, Missões, Ensino..."
            />

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.em_discipulado}
                  onChange={e => setF('em_discipulado', e.target.checked)}
                  className="w-4 h-4 accent-primary-600"
                />
                <span className="text-sm text-[var(--color-text-2)]">Em discipulado</span>
              </label>
              {form.em_discipulado && (
                <Input
                  label="Com quem"
                  value={form.discipulado_com}
                  onChange={e => setF('discipulado_com', e.target.value)}
                  placeholder="Nome do discipulador"
                />
              )}
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.batizado}
                  onChange={e => setF('batizado', e.target.checked)}
                  className="w-4 h-4 accent-primary-600"
                />
                <span className="text-sm text-[var(--color-text-2)]">Batizado(a)</span>
              </label>
              {form.batizado && (
                <Input
                  type="date"
                  label="Data do batismo"
                  value={form.data_batismo}
                  onChange={e => setF('data_batismo', e.target.value)}
                />
              )}
            </div>
          </section>

          {/* Situação */}
          <section className="space-y-3">
            <h4 className="text-2xs font-semibold uppercase tracking-wider text-[var(--color-text-3)]">Situação</h4>
            <Select
              label="Situação atual"
              value={form.situacao_pastoral}
              onChange={e => setF('situacao_pastoral', e.target.value)}
            >
              <option value="">— Não informado —</option>
              {SITUACAO_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </section>

          {/* Vida pessoal */}
          <section className="space-y-3">
            <h4 className="text-2xs font-semibold uppercase tracking-wider text-[var(--color-text-3)]">Vida pessoal</h4>

            <Select
              label="Escolaridade"
              value={form.escolaridade}
              onChange={e => setF('escolaridade', e.target.value)}
            >
              <option value="">— Não informado —</option>
              {ESCOLARIDADE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>

            <Input
              label="Profissão / área"
              value={form.profissao}
              onChange={e => setF('profissao', e.target.value)}
              placeholder="Ex: Estudante, Enfermeira, Engenheiro..."
            />

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.tem_filhos}
                onChange={e => setF('tem_filhos', e.target.checked)}
                className="w-4 h-4 accent-primary-600"
              />
              <span className="text-sm text-[var(--color-text-2)]">Tem filhos</span>
            </label>
          </section>
        </div>
      )}

      {/* ── Aba Pastoral (somente lider_geral) ── */}
      {tab === 'pastoral' && canSeePastoral && (
        <div className="space-y-4">
          {/* Nova anotação */}
          <div className="space-y-2">
            <Textarea
              label="Nova anotação pastoral"
              placeholder="Registro, observação ou situação pastoral..."
              value={novaAnotacao}
              onChange={e => setNovaAnotacao(e.target.value)}
              rows={3}
            />
            <Button
              size="sm"
              onClick={addAnotacao}
              loading={addingNote}
              disabled={!novaAnotacao.trim()}
            >
              <Plus size={13} />
              Registrar
            </Button>
          </div>

          {/* Histórico */}
          <div className="space-y-2">
            <p className="text-2xs font-semibold uppercase tracking-wider text-[var(--color-text-3)]">Histórico</p>
            {loadingNotes ? (
              <div className="space-y-2">
                {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
              </div>
            ) : anotacoes.length === 0 ? (
              <p className="text-xs text-[var(--color-text-3)] text-center py-6">Nenhuma anotação pastoral ainda.</p>
            ) : anotacoes.map(a => (
              <div
                key={a.id}
                className="p-3 rounded-lg bg-[var(--color-bg-2)] border border-[var(--color-border)]"
              >
                <div className="flex items-start gap-2">
                  <p className="text-sm text-[var(--color-text-1)] flex-1 leading-snug">{a.texto}</p>
                  <button
                    onClick={() => deleteAnotacao(a.id)}
                    className="flex-shrink-0 text-[var(--color-text-3)] hover:text-red-500 transition-colors p-0.5"
                    title="Excluir anotação"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <p className="text-2xs text-[var(--color-text-3)] mt-1.5">
                  {a.autor?.nome || 'Líder'} · {formatDate(a.created_at)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── Members (página principal) ───────────────────────────────────────────────

export default function Members() {
  const { isLiderGeral, isLiderFuncao } = useAuth()
  const canLider = isLiderGeral || isLiderFuncao

  const [members,    setMembers]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [tarjaFilter,setTarjaFilter]= useState('')
  const [editMember, setEditMember] = useState(null)
  const [fichaMember,setFichaMember]= useState(null)
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
    const { error } = await supabase.from('users').delete().eq('id', delMember.id)
    if (error) { alert(error.message); setDelLoading(false); return }
    setDelMember(null)
    loadMembers()
    setDelLoading(false)
  }

  async function approveUser(id) {
    const { error } = await supabase.from('users').update({ ativo: true }).eq('id', id)
    if (error) { alert(error.message); return }
    const member = pendentes.find(m => m.id === id)
    if (member?.whatsapp) {
      await notify.membroAprovado(member.whatsapp, member.nome, member?.role).catch(() => {})
    }
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
                  <Avatar nome={m.nome} src={m.foto_url} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-1)]">{m.nome}</p>
                    <p className="text-xs text-[var(--color-text-3)]">{m.email} · {subdepLabel(m.subdepartamento)}</p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="xs" variant="success" onClick={() => approveUser(m.id)}>Aprovar</Button>
                  {m.role !== 'lider_geral' && (
                    <Button size="xs" variant="danger" onClick={() => setDelMember(m)}>Recusar</Button>
                  )}
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
                  {canLider && <Th>Ações</Th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => {
                  const subdeps = Array.isArray(m.subdepartamento) ? m.subdepartamento : m.subdepartamento ? [m.subdepartamento] : []
                  return (
                    <TableRow key={m.id}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Avatar nome={m.nome} src={m.foto_url} size="sm" />
                          <div>
                            <p className="font-medium text-[var(--color-text-1)]">{m.nome}</p>
                            <p className="text-2xs text-[var(--color-text-3)]">{m.email}</p>
                          </div>
                        </div>
                      </Td>
                      <Td><RoleBadge role={m.role} label={roleOpts.find(o => o.value === m.role)?.label} /></Td>
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
                      <Td>
                        {subdeps.length > 0
                          ? <div className="flex flex-wrap gap-1">{subdeps.map(s => <SubdepBadge key={s} subdep={s} />)}</div>
                          : <span className="text-[var(--color-text-3)]">—</span>
                        }
                      </Td>
                      {isLiderGeral && (
                        <Td><TarjaBadge tarja={m.tarja} /></Td>
                      )}
                      <Td className="text-[var(--color-text-3)]">
                        {formatDate(m.data_entrada, { month: 'short', year: 'numeric', day: undefined })}
                      </Td>
                      {canLider && (
                        <Td>
                          <div className="flex items-center gap-1">
                            {/* Ficha — todos os líderes */}
                            <button
                              onClick={() => setFichaMember(m)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-3)] hover:bg-[var(--color-bg-2)] hover:text-primary-600 transition-colors"
                              title="Ficha do jovem"
                            >
                              <ClipboardList size={13} />
                            </button>
                            {/* Editar — apenas lider_geral */}
                            {isLiderGeral && (
                              <button
                                onClick={() => setEditMember(m)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-3)] hover:bg-[var(--color-bg-2)] hover:text-primary-600 transition-colors"
                                title="Editar"
                              >
                                <Edit2 size={13} />
                              </button>
                            )}
                            {/* Promover — apenas lider_geral */}
                            {isLiderGeral && (m.role === 'membro_observador' || m.role === 'membro_serve') && (
                              <button
                                onClick={() => setEditMember({ ...m, role: 'lider_funcao' })}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-3)] hover:bg-[var(--color-bg-2)] hover:text-primary-500 transition-colors"
                                title="Promover a Líder de Função"
                              >
                                <Crown size={13} />
                              </button>
                            )}
                            {isLiderGeral && m.role === 'membro_observador' && (
                              <button
                                onClick={() => setEditMember({ ...m, role: 'membro_serve' })}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-3)] hover:bg-[var(--color-bg-2)] hover:text-success-500 transition-colors"
                                title="Promover a Membro que Serve"
                              >
                                <ArrowUpCircle size={13} />
                              </button>
                            )}
                            {/* Excluir — apenas lider_geral */}
                            {isLiderGeral && m.role !== 'lider_geral' && (
                              <button
                                onClick={() => setDelMember(m)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-3)] hover:bg-[var(--color-bg-2)] hover:text-danger-500 transition-colors"
                                title="Excluir"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
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

      {/* Modais */}
      {editMember && (
        <EditMemberModal
          member={editMember}
          onClose={() => setEditMember(null)}
          onSave={loadMembers}
          roleOpts={roleOpts}
        />
      )}

      {fichaMember && (
        <FichaModal
          member={fichaMember}
          onClose={() => setFichaMember(null)}
          onSaved={loadMembers}
          isLiderGeral={isLiderGeral}
        />
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
