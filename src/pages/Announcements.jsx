import { useState, useEffect } from 'react'
import { Bell, Send, Pencil, Trash2, Pin, X, Check } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { Card, CardSection, EmptyState, Skeleton, Avatar } from '../components/ui/Card.jsx'
import { ReacoesBar } from '../components/ui/ReacoesBar.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Select, Textarea } from '../components/ui/Input.jsx'
import { Modal, ConfirmModal } from '../components/ui/Modal.jsx'
import { formatDate } from '../lib/utils.js'

const DEST_OPTS = [
  { value: 'todos',    label: 'Todos os membros' },
  { value: 'louvor',   label: 'Louvor' },
  { value: 'regencia', label: 'Regência' },
  { value: 'ebd',      label: 'EBD' },
  { value: 'recepcao', label: 'Recepção' },
  { value: 'midia',    label: 'Mídia' },
  { value: 'lideres',  label: 'Apenas líderes' },
]

const FIXACAO_OPTS = [
  { value: '',   label: 'Sem fixação' },
  { value: '1',  label: '1 dia' },
  { value: '3',  label: '3 dias' },
  { value: '7',  label: '1 semana' },
  { value: '14', label: '2 semanas' },
  { value: '30', label: '1 mês' },
]

const DEST_COLOR = {
  todos:    'blue',
  lideres:  'amber',
  louvor:   'purple',
  regencia: 'purple',
  ebd:      'green',
  recepcao: 'green',
  midia:    'pink',
}

function isPinned(c) {
  return c.fixado_ate && new Date(c.fixado_ate) > new Date()
}

export default function Announcements() {
  const { profile, isLiderGeral, isLiderFuncao } = useAuth()
  const [comunicados, setComunicados] = useState([])
  const [loading,     setLoading]     = useState(true)

  const [texto,   setTexto]   = useState('')
  const [dest,    setDest]    = useState('todos')
  const [fixDias, setFixDias] = useState('')
  const [sending, setSending] = useState(false)

  const [editando,    setEditando]    = useState(null)
  const [editLoading, setEditLoading] = useState(false)
  const [delAlvo,     setDelAlvo]     = useState(null)
  const [delLoading,  setDelLoading]  = useState(false)

  const canSend = isLiderGeral || isLiderFuncao
  // Líder Geral gerencia todos; autores gerenciam os próprios comunicados
  const canManageItem = (c) => isLiderGeral || c.autor_id === profile?.id

  useEffect(() => { loadComunicados() }, [])

  async function loadComunicados() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('comunicados')
        .select('*, users(nome, foto_url), comunicado_reacoes(emoji, user_id)')
        .order('fixado_ate', { ascending: false, nullsFirst: false })
        .order('criado_em',  { ascending: false })
        .limit(50)
      setComunicados(data || [])
    } catch (err) {
      console.error('[Announcements]', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSend() {
    if (!texto.trim()) return
    setSending(true)
    try {
      const fixado_ate = fixDias
        ? new Date(Date.now() + parseInt(fixDias) * 86400000).toISOString()
        : null
      const { error } = await supabase.from('comunicados').insert({
        autor_id:     profile.id,
        destinatario: dest,
        texto,
        fixado_ate,
        criado_em:    new Date().toISOString(),
      })
      if (error) throw error
      setTexto(''); setDest('todos'); setFixDias('')
      loadComunicados()
    } catch (err) {
      alert(err.message)
    } finally {
      setSending(false)
    }
  }

  function openEdit(c) {
    const ms = c.fixado_ate ? new Date(c.fixado_ate) - Date.now() : 0
    const dias = ms > 0 ? String(Math.round(ms / 86400000)) : ''
    const opcao = FIXACAO_OPTS.find(o => o.value === dias)
    setEditando({ id: c.id, texto: c.texto, dest: c.destinatario, fixDias: opcao ? dias : '' })
  }

  async function handleEdit() {
    if (!editando?.texto?.trim()) return
    setEditLoading(true)
    try {
      const updateData = {
        texto:        editando.texto,
        destinatario: editando.dest,
      }
      // Só lider_geral pode alterar a fixação
      if (isLiderGeral) {
        updateData.fixado_ate = editando.fixDias
          ? new Date(Date.now() + parseInt(editando.fixDias) * 86400000).toISOString()
          : null
      }
      await supabase.from('comunicados').update(updateData).eq('id', editando.id)
      setEditando(null)
      loadComunicados()
    } catch (err) {
      alert(err.message)
    } finally {
      setEditLoading(false)
    }
  }

  async function handleDelete() {
    if (!delAlvo) return
    setDelLoading(true)
    try {
      await supabase.from('comunicados').delete().eq('id', delAlvo.id)
      setDelAlvo(null)
      loadComunicados()
    } catch (err) {
      alert(err.message)
    } finally {
      setDelLoading(false)
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold text-[var(--color-text-1)]">Comunicados</h2>

      {/* Form novo */}
      {canSend && (
        <Card>
          <CardSection title="Novo comunicado">
            <div className="space-y-3">
              <Select label="Destinatário" value={dest} onChange={e => setDest(e.target.value)}>
                {DEST_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
              <Textarea
                label="Mensagem"
                placeholder="Digite o comunicado..."
                value={texto}
                onChange={e => setTexto(e.target.value)}
                rows={3}
              />
              {isLiderGeral && (
                <Select label="Fixar no dashboard por" value={fixDias} onChange={e => setFixDias(e.target.value)}>
                  {FIXACAO_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              )}
              <Button size="sm" onClick={handleSend} loading={sending} disabled={!texto.trim()}>
                <Send size={13} />
                Publicar comunicado
              </Button>
            </div>
          </CardSection>
        </Card>
      )}

      {/* Lista */}
      <Card>
        <CardSection title="Comunicados recentes">
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}
            </div>
          ) : comunicados.length === 0 ? (
            <EmptyState icon={Bell} title="Nenhum comunicado" description="Os comunicados dos líderes aparecerão aqui." />
          ) : comunicados.map(c => {
            const pinned = isPinned(c)
            return (
              <div key={c.id} className={`py-3 border-b border-[var(--color-border)] last:border-0 relative`}>
                {pinned && <div className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-amber-400" />}
                <div className={`flex items-start gap-2 ${pinned ? 'pl-3' : ''}`}>
                  <Avatar nome={c.users?.nome} src={c.users?.foto_url} size="xs" className="mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-[var(--color-text-1)]">{c.users?.nome || 'Líder'}</span>
                      <Badge variant={DEST_COLOR[c.destinatario] || 'default'} className="text-2xs">
                        {DEST_OPTS.find(o => o.value === c.destinatario)?.label || c.destinatario}
                      </Badge>
                      {pinned && (
                        <span className="flex items-center gap-0.5 text-2xs text-amber-600 dark:text-amber-400 font-medium">
                          <Pin size={10} />
                          Fixado até {new Date(c.fixado_ate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                        </span>
                      )}
                      <span className="text-2xs text-[var(--color-text-3)] ml-auto">{formatDate(c.criado_em)}</span>
                    </div>
                    <p className="text-sm text-[var(--color-text-2)] mt-1 leading-snug">{c.texto}</p>
                    <ReacoesBar
                      comunicadoId={c.id}
                      userId={profile?.id}
                      initialReacoes={c.comunicado_reacoes || []}
                    />
                  </div>
                  {canManageItem(c) && (
                    <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                      <button
                        onClick={() => openEdit(c)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-3)] hover:text-primary-600 hover:bg-[var(--color-bg-2)] active:bg-[var(--color-bg-3)] transition-colors touch-manipulation"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDelAlvo(c)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-3)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 active:bg-red-100 dark:active:bg-red-950/50 transition-colors touch-manipulation"
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </CardSection>
      </Card>

      {/* Modal edição */}
      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        title="Editar comunicado"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button size="sm" onClick={handleEdit} loading={editLoading} disabled={!editando?.texto?.trim()}>
              <Check size={13} />Salvar
            </Button>
          </>
        }
      >
        {editando && (
          <div className="space-y-3">
            <Select label="Destinatário" value={editando.dest} onChange={e => setEditando(p => ({ ...p, dest: e.target.value }))}>
              {DEST_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <Textarea label="Mensagem" value={editando.texto} onChange={e => setEditando(p => ({ ...p, texto: e.target.value }))} rows={4} />
            {isLiderGeral && (
              <Select label="Fixar no dashboard por" value={editando.fixDias} onChange={e => setEditando(p => ({ ...p, fixDias: e.target.value }))}>
                {FIXACAO_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </div>
        )}
      </Modal>

      {/* Modal exclusão */}
      <ConfirmModal
        open={!!delAlvo}
        onClose={() => setDelAlvo(null)}
        onConfirm={handleDelete}
        title="Excluir comunicado"
        message={`Deseja excluir este comunicado de "${delAlvo?.users?.nome || 'Líder'}"? Esta ação não pode ser desfeita.`}
        loading={delLoading}
      />
    </div>
  )
}
