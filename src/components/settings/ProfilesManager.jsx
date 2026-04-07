import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus, Shield, ShieldOff, Trash2, Users, AlertTriangle,
  ChevronRight, Copy, Loader2, CheckCircle2, Lock, Unlock,
  ArrowRight, Monitor, Zap, Eye,
} from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { Card, CardSection, Skeleton, EmptyState } from '../ui/Card.jsx'
import { Badge } from '../ui/Badge.jsx'
import { Button } from '../ui/Button.jsx'
import { Input, Toggle } from '../ui/Input.jsx'
import { Modal, ConfirmModal } from '../ui/Modal.jsx'
import {
  TELAS, ACOES, CAMPOS,
  DEFAULT_PERMISSIONS,
  invalidatePermissionsCache,
} from '../../lib/permissions.js'
import { cn } from '../../lib/utils.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function diffPermissions(original, next, catalog) {
  const added   = catalog.filter(i => !original?.includes(i.id) && next?.includes(i.id))
  const removed = catalog.filter(i =>  original?.includes(i.id) && !next?.includes(i.id))
  return { added, removed }
}

const CATEGORY_ICONS = {
  telas:           Monitor,
  acoes:           Zap,
  campos_visiveis: Eye,
}
const CATEGORY_LABELS = {
  telas:           'Telas',
  acoes:           'Ações',
  campos_visiveis: 'Campos visíveis',
}

// ── CheckboxGroup ─────────────────────────────────────────────────────────────

function CheckboxGroup({ title, icon: Icon, items, selected = [], onChange, hint }) {
  const all = items.every(i => selected.includes(i.id))

  function toggle(id) {
    onChange(selected.includes(id)
      ? selected.filter(x => x !== id)
      : [...selected, id]
    )
  }

  function toggleAll() {
    onChange(all ? [] : items.map(i => i.id))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {Icon && <Icon size={13} className="text-[var(--color-text-3)]" />}
          <span className="text-2xs font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
            {title}
          </span>
          <span className="text-2xs text-[var(--color-text-3)] bg-[var(--color-bg-2)] px-1.5 py-0.5 rounded-full">
            {selected.length}/{items.length}
          </span>
        </div>
        <button
          onClick={toggleAll}
          className="text-2xs text-primary-600 dark:text-primary-400 hover:underline"
        >
          {all ? 'Desmarcar todos' : 'Marcar todos'}
        </button>
      </div>
      {hint && <p className="text-2xs text-[var(--color-text-3)] mb-2">{hint}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {items.map(item => {
          const checked = selected.includes(item.id)
          return (
            <label
              key={item.id}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors border text-xs',
                checked
                  ? 'border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/20 text-[var(--color-text-1)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg-2)] text-[var(--color-text-2)] hover:border-primary-300 dark:hover:border-primary-700'
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(item.id)}
                className="w-3.5 h-3.5 accent-primary-600 flex-shrink-0"
              />
              {item.label}
            </label>
          )
        })}
      </div>
    </div>
  )
}

// ── Impact Modal ──────────────────────────────────────────────────────────────

function ImpactModal({ open, onClose, impacts, memberCount, profileLabel, onConfirm, saving }) {
  const hasChanges = impacts.some(g => g.added.length > 0 || g.removed.length > 0)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Confirmar alterações de permissões"
      size="md"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button size="sm" onClick={onConfirm} loading={saving}>
            <CheckCircle2 size={13} />
            Confirmar e salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Summary */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-bg-2)]">
          <div className="w-9 h-9 rounded-lg bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center flex-shrink-0">
            <Users size={16} className="text-primary-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--color-text-1)]">{profileLabel}</p>
            <p className="text-xs text-[var(--color-text-3)]">
              {memberCount === 0
                ? 'Nenhum usuário usa este perfil atualmente'
                : `${memberCount} ${memberCount === 1 ? 'usuário será afetado' : 'usuários serão afetados'}`
              }
            </p>
          </div>
        </div>

        {!hasChanges ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-3)] py-2">
            <CheckCircle2 size={15} className="text-success-500" />
            Nenhuma permissão foi alterada.
          </div>
        ) : (
          <div className="space-y-3">
            {impacts.map(group => {
              if (group.added.length === 0 && group.removed.length === 0) return null
              const Icon = CATEGORY_ICONS[group.key]
              return (
                <div key={group.key}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {Icon && <Icon size={12} className="text-[var(--color-text-3)]" />}
                    <span className="text-2xs font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
                      {CATEGORY_LABELS[group.key]}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {group.added.map(item => (
                      <div key={item.id} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-success-50 dark:bg-success-500/10 border border-success-200 dark:border-success-800">
                        <span className="w-3.5 h-3.5 rounded-full bg-success-500 flex items-center justify-center flex-shrink-0 text-white text-[9px] font-bold">+</span>
                        <span className="text-success-700 dark:text-success-400 flex-1">{item.label}</span>
                        {memberCount > 0 && (
                          <span className="text-success-600 dark:text-success-500 font-medium whitespace-nowrap">
                            {memberCount} {memberCount === 1 ? 'usuário' : 'usuários'} ganharão acesso
                          </span>
                        )}
                      </div>
                    ))}
                    {group.removed.map(item => (
                      <div key={item.id} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-800">
                        <span className="w-3.5 h-3.5 rounded-full bg-danger-500 flex items-center justify-center flex-shrink-0 text-white text-[9px] font-bold">−</span>
                        <span className="text-danger-700 dark:text-danger-400 flex-1">{item.label}</span>
                        {memberCount > 0 && (
                          <span className="text-danger-600 dark:text-danger-500 font-medium whitespace-nowrap">
                            {memberCount} {memberCount === 1 ? 'usuário' : 'usuários'} perderão acesso
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── New Profile Modal ─────────────────────────────────────────────────────────

function NewProfileModal({ open, onClose, existingPerfis, onCreate }) {
  const [label,     setLabel]     = useState('')
  const [nome,      setNome]      = useState('')
  const [descricao, setDescricao] = useState('')
  const [copyFrom,  setCopyFrom]  = useState('')
  const [saving,    setSaving]    = useState(false)
  const [slugEdited, setSlugEdited] = useState(false)

  function reset() {
    setLabel(''); setNome(''); setDescricao(''); setCopyFrom(''); setSaving(false); setSlugEdited(false)
  }

  function handleLabelChange(v) {
    setLabel(v)
    if (!slugEdited) setNome(slugify(v))
  }

  async function handleCreate() {
    if (!label.trim() || !nome.trim()) return
    if (existingPerfis.some(p => p.nome === nome)) {
      alert('Já existe um perfil com este identificador.')
      return
    }

    setSaving(true)
    try {
      // Copy permissions if requested
      let telas = [], acoes = [], campos_visiveis = []
      if (copyFrom) {
        const src = existingPerfis.find(p => p.nome === copyFrom)
        if (src) { telas = src.telas || []; acoes = src.acoes || []; campos_visiveis = src.campos_visiveis || [] }
      }

      const { data, error } = await supabase.from('perfis').insert({
        nome,
        label: label.trim(),
        descricao: descricao.trim() || null,
        protegido: false,
        telas,
        acoes,
        campos_visiveis,
      }).select().single()

      if (error) throw error
      reset()
      onClose()
      onCreate(data)
    } catch (err) {
      alert('Erro ao criar perfil: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose() }}
      title="Novo perfil de acesso"
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={() => { reset(); onClose() }} disabled={saving}>Cancelar</Button>
          <Button size="sm" onClick={handleCreate} loading={saving} disabled={!label.trim() || !nome.trim()}>
            <Plus size={13} /> Criar perfil
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label="Nome exibido"
          placeholder="Ex: Auxiliar de Louvor"
          value={label}
          onChange={e => handleLabelChange(e.target.value)}
          hint="Como este perfil aparece para os usuários"
        />
        <Input
          label="Identificador (slug)"
          placeholder="auxiliar_louvor"
          value={nome}
          onChange={e => { setNome(slugify(e.target.value)); setSlugEdited(true) }}
          hint="Somente letras minúsculas e underscores"
        />
        <Input
          label="Descrição (opcional)"
          placeholder="Descreva brevemente as responsabilidades..."
          value={descricao}
          onChange={e => setDescricao(e.target.value)}
        />

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-[var(--color-text-2)]">Copiar permissões de</label>
          <select
            className="input-base"
            value={copyFrom}
            onChange={e => setCopyFrom(e.target.value)}
          >
            <option value="">Começar sem permissões</option>
            {existingPerfis.map(p => (
              <option key={p.nome} value={p.nome}>{p.label}</option>
            ))}
          </select>
          <p className="text-2xs text-[var(--color-text-3)]">
            As permissões poderão ser ajustadas após a criação.
          </p>
        </div>
      </div>
    </Modal>
  )
}

// ── Profile Editor (right panel) ──────────────────────────────────────────────

function ProfileEditor({ perfil, memberCount, onSaved, onDeleted }) {
  const [form,    setForm]    = useState(null)
  const [original, setOriginal] = useState(null)
  const [impactOpen, setImpactOpen] = useState(false)
  const [delOpen,    setDelOpen]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  // Sync form when perfil changes
  useEffect(() => {
    if (!perfil) { setForm(null); return }
    const snap = {
      label:           perfil.label || '',
      descricao:       perfil.descricao || '',
      telas:           [...(perfil.telas || [])],
      acoes:           [...(perfil.acoes || [])],
      campos_visiveis: [...(perfil.campos_visiveis || [])],
    }
    setForm(snap)
    setOriginal(snap)
    setError('')
  }, [perfil?.id])

  if (!perfil || !form) {
    return (
      <div className="hidden lg:flex flex-1 items-center justify-center">
        <EmptyState
          icon={Shield}
          title="Selecione um perfil"
          description="Clique em um perfil à esquerda para editar suas permissões."
        />
      </div>
    )
  }

  // Compute impact groups
  const impacts = [
    { key: 'telas',           catalog: TELAS,  ...diffPermissions(original?.telas,           form.telas,           TELAS)  },
    { key: 'acoes',           catalog: ACOES,  ...diffPermissions(original?.acoes,           form.acoes,           ACOES)  },
    { key: 'campos_visiveis', catalog: CAMPOS, ...diffPermissions(original?.campos_visiveis, form.campos_visiveis, CAMPOS) },
  ]

  function handleShowImpact() {
    setError('')
    // Critical guard: lider_geral must keep gerenciar_perfis
    if (perfil.nome === 'lider_geral' && !form.acoes.includes('gerenciar_perfis')) {
      setError('O Líder Geral não pode perder acesso ao gerenciamento de perfis.')
      return
    }
    setImpactOpen(true)
  }

  async function handleConfirmSave() {
    setSaving(true)
    try {
      const { error: err } = await supabase.from('perfis').update({
        label:           form.label,
        descricao:       form.descricao,
        telas:           form.telas,
        acoes:           form.acoes,
        campos_visiveis: form.campos_visiveis,
      }).eq('id', perfil.id)
      if (err) throw err

      invalidatePermissionsCache(perfil.nome)
      setOriginal({ ...form })
      setImpactOpen(false)
      onSaved()
    } catch (e) {
      alert('Erro ao salvar: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    try {
      // Move users with this role to membro_observador
      await supabase.from('users')
        .update({ role: 'membro_observador' })
        .eq('role', perfil.nome)

      await supabase.from('perfis').delete().eq('id', perfil.id)
      invalidatePermissionsCache(perfil.nome)
      setDelOpen(false)
      onDeleted()
    } catch (e) {
      alert('Erro ao excluir: ' + e.message)
    }
  }

  const isDirty = JSON.stringify(form) !== JSON.stringify(original)

  return (
    <div className="flex-1 space-y-4 min-w-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-[var(--color-text-1)]">{perfil.label}</h3>
            {perfil.protegido
              ? <span className="inline-flex items-center gap-1 text-2xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700 px-1.5 py-0.5 rounded-full">
                  <Lock size={9} /> Protegido
                </span>
              : <span className="inline-flex items-center gap-1 text-2xs bg-[var(--color-bg-2)] text-[var(--color-text-3)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-full">
                  <Unlock size={9} /> Personalizado
                </span>
            }
          </div>
          <p className="text-xs text-[var(--color-text-3)] mt-0.5">
            <code className="font-mono bg-[var(--color-bg-2)] px-1 rounded">{perfil.nome}</code>
            {' · '}
            <span className="inline-flex items-center gap-1">
              <Users size={11} />
              {memberCount} {memberCount === 1 ? 'usuário' : 'usuários'}
            </span>
          </p>
        </div>

        {!perfil.protegido && (
          <Button size="xs" variant="danger" onClick={() => setDelOpen(true)}>
            <Trash2 size={12} /> Excluir
          </Button>
        )}
      </div>

      {/* Meta fields */}
      <Card>
        <CardSection title="Identificação">
          <div className="space-y-2">
            <Input
              label="Nome exibido"
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            />
            <Input
              label="Descrição"
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              placeholder="Descrição opcional..."
            />
          </div>
        </CardSection>
      </Card>

      {/* Telas */}
      <Card>
        <CardSection title="Telas acessíveis">
          <CheckboxGroup
            title="Telas"
            icon={Monitor}
            items={TELAS}
            selected={form.telas}
            onChange={v => setForm(f => ({ ...f, telas: v }))}
            hint="Quais páginas do sistema este perfil pode acessar"
          />
        </CardSection>
      </Card>

      {/* Ações */}
      <Card>
        <CardSection title="Ações permitidas">
          <CheckboxGroup
            title="Ações"
            icon={Zap}
            items={ACOES}
            selected={form.acoes}
            onChange={v => setForm(f => ({ ...f, acoes: v }))}
            hint="O que este perfil pode fazer dentro do sistema"
          />
        </CardSection>
      </Card>

      {/* Campos */}
      <Card>
        <CardSection title="Campos e seções visíveis">
          <CheckboxGroup
            title="Campos"
            icon={Eye}
            items={CAMPOS}
            selected={form.campos_visiveis}
            onChange={v => setForm(f => ({ ...f, campos_visiveis: v }))}
            hint="Quais informações este perfil pode visualizar"
          />
        </CardSection>
      </Card>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-danger-600 dark:text-danger-400 bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-700 rounded-lg px-3 py-2">
          <AlertTriangle size={13} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Save button */}
      <div className="flex items-center gap-2 pb-2">
        <Button
          onClick={handleShowImpact}
          disabled={!isDirty}
          className={cn(!isDirty && 'opacity-50')}
        >
          <ArrowRight size={14} />
          Ver impacto e salvar
        </Button>
        {isDirty && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            · Há alterações não salvas
          </span>
        )}
      </div>

      {/* Impact Modal */}
      <ImpactModal
        open={impactOpen}
        onClose={() => setImpactOpen(false)}
        impacts={impacts}
        memberCount={memberCount}
        profileLabel={perfil.label}
        onConfirm={handleConfirmSave}
        saving={saving}
      />

      {/* Delete Confirm */}
      <ConfirmModal
        open={delOpen}
        onClose={() => setDelOpen(false)}
        onConfirm={handleDelete}
        title={`Excluir perfil "${perfil.label}"`}
        message={memberCount > 0
          ? `Este perfil tem ${memberCount} ${memberCount === 1 ? 'usuário' : 'usuários'}. Ao excluir, ${memberCount === 1 ? 'ele será movido' : 'eles serão movidos'} automaticamente para Observador.`
          : `Tem certeza que deseja excluir o perfil "${perfil.label}"? Esta ação não pode ser desfeita.`
        }
        danger
      />
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ProfilesManager() {
  const [perfis,       setPerfis]       = useState([])
  const [memberCounts, setMemberCounts] = useState({})
  const [loading,      setLoading]      = useState(true)
  const [loadError,    setLoadError]    = useState('')
  const [selected,     setSelected]     = useState(null)
  const [newModal,     setNewModal]     = useState(false)

  // selectedId como ref separada para não re-criar loadAll a cada seleção
  const selectedIdRef = useRef(null)

  const loadAll = useCallback(async (keepSelected = true) => {
    setLoading(true)
    setLoadError('')
    try {
      const [perfisRes, usersRes] = await Promise.all([
        supabase.from('perfis').select('*').order('criado_em', { ascending: true }),
        supabase.from('users').select('role').eq('ativo', true),
      ])

      if (perfisRes.error) {
        // Tabela não existe ainda (42P01) ou schema cache desatualizado (PGRST200)
        const code = perfisRes.error?.code || ''
        const msg  = perfisRes.error?.message || ''
        if (code === '42P01' || msg.includes('schema cache') || msg.includes('perfis')) {
          setLoadError('tabela_inexistente')
        } else {
          setLoadError(msg || 'Erro ao carregar perfis.')
        }
        setPerfis([])
        setLoading(false)
        return
      }

      const perfisData = perfisRes.data || []
      setPerfis(perfisData)

      // Count members per role
      const counts = {}
      for (const u of (usersRes.data || [])) {
        counts[u.role] = (counts[u.role] || 0) + 1
      }
      setMemberCounts(counts)

      // Keep selected in sync after reload
      if (keepSelected && selectedIdRef.current) {
        const refreshed = perfisData.find(p => p.id === selectedIdRef.current)
        if (refreshed) setSelected(refreshed)
      }
    } catch (err) {
      console.error('[ProfilesManager]', err)
      setLoadError(err?.message || 'Erro inesperado.')
    } finally {
      setLoading(false)
    }
  }, [])  // sem dependências — selectedIdRef é uma ref, não state

  useEffect(() => { loadAll() }, [loadAll])

  // Sync ref whenever selected changes
  useEffect(() => { selectedIdRef.current = selected?.id || null }, [selected?.id])

  function handleProfileCreated(newPerfil) {
    loadAll().then(() => {
      selectedIdRef.current = newPerfil.id
      setSelected(newPerfil)
    })
  }

  function handleDeleted() {
    selectedIdRef.current = null
    setSelected(null)
    loadAll(false)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[var(--color-text-3)]">
            {perfis.length} {perfis.length === 1 ? 'perfil' : 'perfis'} configurados
          </p>
        </div>
        <Button size="sm" onClick={() => setNewModal(true)}>
          <Plus size={14} /> Novo perfil
        </Button>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">

        {/* ── Left: Profile list ── */}
        <div className="w-full lg:w-64 flex-shrink-0 space-y-1.5">
          {loadError === 'tabela_inexistente' ? (
            <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <AlertTriangle size={13} /> Tabela não encontrada
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Execute o SQL no Supabase para criar a tabela <code className="font-mono bg-amber-100 dark:bg-amber-800/40 px-1 rounded">public.perfis</code> e recarregue.
              </p>
              <Button size="xs" variant="secondary" onClick={() => loadAll()}>Tentar novamente</Button>
            </div>
          ) : loadError ? (
            <div className="rounded-xl border border-danger-200 dark:border-danger-700 bg-danger-50 dark:bg-danger-900/20 p-4 space-y-2">
              <p className="text-xs font-semibold text-danger-600 dark:text-danger-400 flex items-center gap-1.5">
                <AlertTriangle size={13} /> Erro ao carregar
              </p>
              <p className="text-xs text-danger-600 dark:text-danger-400">{loadError}</p>
              <Button size="xs" variant="secondary" onClick={() => loadAll()}>Tentar novamente</Button>
            </div>
          ) : loading ? (
            [...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
          ) : perfis.length === 0 ? (
            <EmptyState icon={Shield} title="Nenhum perfil encontrado" description="Crie o primeiro perfil." />
          ) : (
            perfis.map(p => {
              const count    = memberCounts[p.nome] || 0
              const isActive = selected?.id === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className={cn(
                    'w-full text-left px-3 py-3 rounded-xl border transition-colors',
                    isActive
                      ? 'border-primary-400 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-bg-2)]'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {p.protegido
                        ? <Lock size={12} className={isActive ? 'text-primary-500' : 'text-amber-500'} />
                        : <Unlock size={12} className="text-[var(--color-text-3)]" />
                      }
                      <span className={cn(
                        'text-sm font-medium truncate',
                        isActive ? 'text-primary-700 dark:text-primary-300' : 'text-[var(--color-text-1)]'
                      )}>
                        {p.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {count > 0 && (
                        <span className="text-2xs bg-[var(--color-bg-3)] text-[var(--color-text-3)] px-1.5 py-0.5 rounded-full font-medium">
                          {count}
                        </span>
                      )}
                      <ChevronRight size={12} className={isActive ? 'text-primary-500' : 'text-[var(--color-text-3)]'} />
                    </div>
                  </div>
                  {p.descricao && (
                    <p className="text-2xs text-[var(--color-text-3)] mt-0.5 truncate pl-5">{p.descricao}</p>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* ── Right: Editor ── */}
        {selected ? (
          <ProfileEditor
            key={selected.id}
            perfil={selected}
            memberCount={memberCounts[selected.nome] || 0}
            onSaved={loadAll}
            onDeleted={handleDeleted}
          />
        ) : (
          <div className="hidden lg:flex flex-1 items-center justify-center min-h-48">
            <EmptyState
              icon={Shield}
              title="Selecione um perfil"
              description="Clique em um perfil à esquerda para editar suas permissões."
            />
          </div>
        )}
      </div>

      {/* New Profile Modal */}
      <NewProfileModal
        open={newModal}
        onClose={() => setNewModal(false)}
        existingPerfis={perfis}
        onCreate={handleProfileCreated}
      />
    </div>
  )
}
