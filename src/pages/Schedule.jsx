import { useState, useEffect } from 'react'
import { Calendar, Filter, ArrowLeftRight, CheckCircle } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { Card, CardSection, EmptyState, Skeleton, Avatar } from '../components/ui/Card.jsx'
import { Badge, SubdepBadge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Select } from '../components/ui/Input.jsx'
import { Modal } from '../components/ui/Modal.jsx'
import { Textarea } from '../components/ui/Input.jsx'
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
  const [ciclo,        setCiclo]        = useState(null)
  const [escalas,      setEscalas]      = useState([])
  const [loading,      setLoading]      = useState(true)
  // lider_funcao começa filtrado pelo seu subdep; lider_geral começa sem filtro
  const [subdepFilter, setSubdepFilter] = useState(
    isLiderFuncao && !isLiderGeral ? (profile?.subdep_lider || '') : ''
  )
  const [trocaModal,   setTrocaModal]   = useState(false)
  const [trocaEscala,  setTrocaEscala]  = useState(null)
  const [trocaMotivo,  setTrocaMotivo]  = useState('')
  const [trocaSending, setTrocaSending] = useState(false)

  useEffect(() => { loadEscalas() }, [])

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
    await supabase.from('escalas').update({ status_confirmacao: status }).eq('id', escalaId)
    setEscalas(prev => prev.map(e => e.id === escalaId ? { ...e, status_confirmacao: status } : e))
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
