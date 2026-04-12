import { useState, useEffect } from 'react'
import { Calendar, ArrowLeftRight, CheckCircle, XCircle, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { Card, CardSection, EmptyState, Skeleton, Avatar } from '../components/ui/Card.jsx'
import { Badge, SubdepBadge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Select, Textarea } from '../components/ui/Input.jsx'
import { Modal } from '../components/ui/Modal.jsx'
import { formatDomingo, subdepLabel } from '../lib/utils.js'

const SUBDEPS_ALL = ['louvor','regencia','ebd','recepcao','midia']

function ConfirmButton({ status, onConfirm, onRecuse }) {
  if (status === 'confirmado') {
    return <Badge variant="green" dot="bg-success-500">Confirmado</Badge>
  }
  if (status === 'recusado') {
    return <Badge variant="red">Recusado</Badge>
  }
  return (
    <div className="flex gap-1">
      <button onClick={onConfirm} className="px-2 py-1 rounded text-xs font-semibold bg-[#EAF3DE] text-[#27500A] hover:bg-[#d0ecbc] transition-colors">
        ✓ Confirmar
      </button>
      <button onClick={onRecuse} className="px-2 py-1 rounded text-xs font-semibold bg-[#FCEBEB] text-[#791F1F] hover:bg-[#f5d0d0] transition-colors">
        ✗
      </button>
    </div>
  )
}

export default function Schedule() {
  const { profile, isLiderGeral, isLiderFuncao, isMembroServe } = useAuth()
  const canApproveTrocas = isLiderGeral || isLiderFuncao

  const [ciclo,        setCiclo]        = useState(null)
  const [escalas,      setEscalas]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [subdepFilter, setSubdepFilter] = useState(
    isLiderFuncao && !isLiderGeral ? (profile?.subdep_lider || '') : ''
  )
  // Solicit troca (membro)
  const [trocaModal,   setTrocaModal]   = useState(false)
  const [trocaEscala,  setTrocaEscala]  = useState(null)
  const [trocaMotivo,  setTrocaMotivo]  = useState('')
  const [trocaSending, setTrocaSending] = useState(false)
  // Approve trocas (líder)
  const [trocas,          setTrocas]          = useState([])
  const [trocasLoading,   setTrocasLoading]   = useState(false)
  const [approvingTroca,  setApprovingTroca]  = useState(null)

  useEffect(() => { loadEscalas() }, [])
  useEffect(() => { if (canApproveTrocas && ciclo) loadTrocas() }, [ciclo?.id])

  async function loadEscalas() {
    setLoading(true)
    try {
      const { data: ciclos } = await supabase
        .from('ciclos').select('*')
        .in('status', ['escala_publicada','confirmacoes'])
        .order('inicio', { ascending: false }).limit(1)
      const c = ciclos?.[0]
      if (!c) { setLoading(false); return }
      setCiclo(c)

      let q = supabase
        .from('escalas')
        .select('*, users(id, nome, genero, instrumento)')
        .eq('ciclo_id', c.id)
        .order('domingo', { ascending: true })
        .order('subdepartamento', { ascending: true })

      if (isLiderGeral) {
        // vê tudo, filtragem via dropdown
      } else if (isLiderFuncao) {
        // lider_funcao vê as escalas do subdep que lidera
        if (profile?.subdep_lider) {
          q = q.eq('subdepartamento', profile.subdep_lider)
        } else {
          q = q.eq('user_id', profile.id)
        }
      } else {
        // membro: apenas suas próprias escalas
        q = q.eq('user_id', profile.id)
      }

      const { data } = await q
      setEscalas(data || [])
    } finally {
      setLoading(false)
    }
  }

  async function updateStatus(escalaId, status) {
    const { error } = await supabase.from('escalas').update({ status_confirmacao: status }).eq('id', escalaId)
    if (error) { alert('Erro ao atualizar: ' + error.message); return }
    setEscalas(prev => prev.map(e => e.id === escalaId ? { ...e, status_confirmacao: status } : e))
  }

  async function loadTrocas() {
    if (!ciclo) return
    setTrocasLoading(true)
    try {
      let q = supabase
        .from('trocas')
        .select('*, escalas(domingo, subdepartamento, user_id, users(nome)), solicitante:users!trocas_solicitante_id_fkey(nome)')
        .eq('status', 'pendente')
        .order('created_at', { ascending: false })

      // lider_funcao only sees trocas for their subdep
      if (!isLiderGeral && isLiderFuncao && profile?.subdep_lider) {
        q = q.eq('escalas.subdepartamento', profile.subdep_lider)
      }

      const { data } = await q
      setTrocas((data || []).filter(t => t.escalas))   // drop orphaned rows
    } finally {
      setTrocasLoading(false)
    }
  }

  async function decideTroca(troca, decision) {
    setApprovingTroca(troca.id)
    try {
      const { error } = await supabase
        .from('trocas')
        .update({ status: decision, aprovado_por: profile.id })
        .eq('id', troca.id)
      if (error) throw error
      setTrocas(prev => prev.filter(t => t.id !== troca.id))
    } catch (err) {
      alert('Erro: ' + err.message)
    } finally {
      setApprovingTroca(null)
    }
  }

  async function submitTroca() {
    if (!trocaEscala || !trocaMotivo.trim()) return
    setTrocaSending(true)
    try {
      await supabase.from('trocas').insert({
        escala_id:      trocaEscala.id,
        solicitante_id: profile.id,
        motivo:         trocaMotivo,
        status:         'pendente',
      })
      setTrocaModal(false)
      setTrocaMotivo('')
    } finally {
      setTrocaSending(false)
    }
  }

  // Group by domingo
  const filtered = escalas.filter(e => !subdepFilter || e.subdepartamento === subdepFilter)

  const grouped = filtered.reduce((acc, e) => {
    if (!acc[e.domingo]) acc[e.domingo] = {}
    if (!acc[e.domingo][e.subdepartamento]) acc[e.domingo][e.subdepartamento] = []
    acc[e.domingo][e.subdepartamento].push(e)
    return acc
  }, {})

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-1)]">
            {isLiderGeral ? 'Escalas' : isLiderFuncao ? `Escala — ${subdepLabel(profile?.subdep_lider)}` : 'Minha Escala'}
          </h2>
          <p className="text-xs text-[var(--color-text-3)]">{ciclo ? 'Ciclo ativo' : 'Nenhum ciclo ativo'}</p>
        </div>
        {(isLiderGeral || isLiderFuncao) && (
          <Select value={subdepFilter} onChange={e => setSubdepFilter(e.target.value)} className="w-36">
            {isLiderGeral && <option value="">Todos</option>}
            {(isLiderGeral ? SUBDEPS_ALL : [profile?.subdep_lider].filter(Boolean))
              .map(s => <option key={s} value={s}>{subdepLabel(s)}</option>)
            }
          </Select>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : !ciclo || Object.keys(grouped).length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="Nenhuma escala publicada"
          description={ciclo ? 'A escala ainda não foi gerada para este ciclo.' : 'Aguarde o início do próximo ciclo.'}
        />
      ) : (
        Object.entries(grouped).map(([domingo, subdeps]) => (
          <Card key={domingo}>
            <h3 className="text-sm font-semibold text-[var(--color-text-1)] mb-3 pb-2 border-b border-[var(--color-border)]">
              {formatDomingo(domingo)}
            </h3>
            {Object.entries(subdeps).map(([subdep, members]) => (
              <div key={subdep} className="mb-3 last:mb-0">
                <div className="flex items-center gap-2 mb-2">
                  <SubdepBadge subdep={subdep} />
                  <span className="text-xs text-[var(--color-text-3)]">{members.length} escalado(s)</span>
                </div>
                <div className="space-y-1.5 pl-2">
                  {members.map(e => (
                    <div key={e.id} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Avatar nome={e.users?.nome} size="xs" />
                        <div>
                          <p className="text-xs font-medium text-[var(--color-text-1)]">{e.users?.nome}</p>
                          {e.users?.instrumento?.length > 0 && (
                            <p className="text-2xs text-[var(--color-text-3)]">{e.users.instrumento.join(', ')}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {(isMembroServe && e.user_id === profile?.id) || isLiderGeral ? (
                          <ConfirmButton
                            status={e.status_confirmacao}
                            onConfirm={() => updateStatus(e.id, 'confirmado')}
                            onRecuse={() => updateStatus(e.id, 'recusado')}
                          />
                        ) : (
                          <Badge variant={
                            e.status_confirmacao === 'confirmado' ? 'green' :
                            e.status_confirmacao === 'recusado' ? 'red' : 'amber'
                          }>
                            {e.status_confirmacao === 'confirmado' ? 'Confirmado' :
                             e.status_confirmacao === 'recusado'   ? 'Recusado' : 'Pendente'}
                          </Badge>
                        )}
                        {isMembroServe && e.user_id === profile?.id && e.status_confirmacao !== 'recusado' && (
                          <button
                            onClick={() => { setTrocaEscala(e); setTrocaModal(true) }}
                            className="w-6 h-6 rounded flex items-center justify-center text-[var(--color-text-3)] hover:text-amber-500 transition-colors"
                            title="Solicitar troca"
                          >
                            <ArrowLeftRight size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        ))
      )}

      {/* ── Trocas pendentes (líderes) ─────────────────────────────────────── */}
      {canApproveTrocas && (
        <Card>
          <CardSection
            title={
              <span className="flex items-center gap-2">
                Trocas pendentes
                {trocas.length > 0 && (
                  <span className="text-2xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-semibold">
                    {trocas.length}
                  </span>
                )}
              </span>
            }
          >
            {trocasLoading ? (
              <Skeleton className="h-16 rounded" />
            ) : trocas.length === 0 ? (
              <EmptyState icon={CheckCircle} title="Nenhuma troca pendente" />
            ) : (
              <div className="space-y-2">
                {trocas.map(t => {
                  const esc = t.escalas
                  const isApproving = approvingTroca === t.id
                  return (
                    <div key={t.id} className="rounded-xl border border-[var(--color-border)] p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium text-[var(--color-text-1)]">
                              {t.solicitante?.nome || 'Membro'}
                            </p>
                            <span className="text-[var(--color-text-3)] text-xs">→</span>
                            <SubdepBadge subdep={esc?.subdepartamento} />
                            <span className="text-xs text-[var(--color-text-3)]">
                              {esc?.domingo ? formatDomingo(esc.domingo) : ''}
                            </span>
                          </div>
                          {t.motivo && (
                            <p className="text-xs text-[var(--color-text-3)] mt-1 italic">"{t.motivo}"</p>
                          )}
                        </div>
                        <Clock size={13} className="text-amber-500 flex-shrink-0 mt-0.5" />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm" className="flex-1"
                          onClick={() => decideTroca(t, 'aprovado')}
                          loading={isApproving}
                        >
                          <CheckCircle size={12} /> Aprovar
                        </Button>
                        <Button
                          size="sm" variant="secondary" className="flex-1"
                          onClick={() => decideTroca(t, 'recusado')}
                          disabled={isApproving}
                        >
                          <XCircle size={12} /> Recusar
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardSection>
        </Card>
      )}

      {/* Troca Modal */}
      <Modal
        open={trocaModal}
        onClose={() => setTrocaModal(false)}
        title="Solicitar troca"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setTrocaModal(false)}>Cancelar</Button>
            <Button size="sm" onClick={submitTroca} loading={trocaSending} disabled={!trocaMotivo.trim()}>
              Enviar solicitação
            </Button>
          </>
        }
      >
        {trocaEscala && (
          <div className="space-y-3">
            <div className="alert-strip info">
              {formatDomingo(trocaEscala.domingo)} — {subdepLabel(trocaEscala.subdepartamento)}
            </div>
            <Textarea
              label="Motivo da troca"
              placeholder="Descreva o motivo..."
              value={trocaMotivo}
              onChange={e => setTrocaMotivo(e.target.value)}
              rows={3}
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
