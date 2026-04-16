import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, CheckSquare, ArrowLeftRight, Music, ChevronRight, Megaphone, Youtube } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { Card, CardSection, EmptyState, Skeleton, Avatar } from '../../components/ui/Card.jsx'
import { Badge, SubdepBadge } from '../../components/ui/Badge.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Modal } from '../../components/ui/Modal.jsx'
import { Textarea } from '../../components/ui/Input.jsx'
import { formatDomingo, subdepLabel, formatDate } from '../../lib/utils.js'
import { ReacoesBar } from '../../components/ui/ReacoesBar.jsx'

function ConfirmacaoInline({ escala, onConfirm }) {
  const statusMap = {
    confirmado: { label: 'Confirmado', variant: 'green' },
    pendente:   { label: 'Confirmar',  variant: 'amber' },
    recusado:   { label: 'Recusado',   variant: 'red' },
  }
  const s = statusMap[escala.status_confirmacao] || statusMap.pendente

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[var(--color-border)] last:border-0">
      <div>
        <p className="text-sm font-medium text-[var(--color-text-1)]">{formatDomingo(escala.domingo)}</p>
        <p className="text-xs text-[var(--color-text-3)]">{subdepLabel(escala.subdepartamento)}</p>
      </div>
      <div className="flex items-center gap-2">
        {escala.status_confirmacao === 'pendente' ? (
          <button
            onClick={() => onConfirm(escala.id, 'confirmado')}
            className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-[#EAF3DE] text-[#27500A] hover:bg-[#d0ecbc] transition-colors"
          >
            Confirmar
          </button>
        ) : (
          <Badge variant={s.variant}>{s.label}</Badge>
        )}
      </div>
    </div>
  )
}

export default function MembroDashboard() {
  const { profile } = useAuth()
  const [escalas,     setEscalas]     = useState([])
  const [briefing,    setBriefing]    = useState(null)
  const [comunicados, setComunicados] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [trocaModal,  setTrocaModal]  = useState(false)
  const [trocaAlvo,   setTrocaAlvo]   = useState(null)
  const [trocaMotivo, setTrocaMotivo] = useState('')
  const [sendingTroca, setSendingTroca] = useState(false)

  useEffect(() => { if (profile?.id) loadData() }, [profile?.id])

  async function loadData() {
    setLoading(true)
    try {
      // Ciclo, escalas e comunicados em paralelo
      const [{ data: ciclos }, { data: myEscalas }, { data: comunicadosData }] = await Promise.all([
        supabase.from('ciclos').select('*')
          .in('status', ['escala_publicada', 'confirmacoes'])
          .order('inicio', { ascending: false }).limit(1),
        supabase.from('escalas').select('*')
          .eq('user_id', profile.id)
          .order('domingo', { ascending: true }),
        supabase.from('comunicados').select('*, users(nome, foto_url, role), comunicado_reacoes(emoji, user_id)')
          .order('criado_em', { ascending: false }).limit(5),
      ])
      setComunicados(comunicadosData || [])

      const ciclo = ciclos?.[0]
      if (!ciclo) { setLoading(false); return }

      // Filtra as escalas do ciclo ativo
      const escalasAtivas = (myEscalas || []).filter(e => e.ciclo_id === ciclo.id)
      setEscalas(escalasAtivas)

      // Busca briefing do próximo culto (se houver)
      const today = new Date().toISOString().split('T')[0]
      const nextEscala = escalasAtivas.find(e => e.domingo >= today)
      if (nextEscala) {
        const { data: bri } = await supabase
          .from('briefings').select('*')
          .eq('ciclo_id', ciclo.id)
          .eq('subdepartamento', nextEscala.subdepartamento)
          .eq('domingo', nextEscala.domingo)
          .single()
        setBriefing(bri ? { ...bri, escala: nextEscala } : null)
      }
    } catch (err) {
      console.error('[MembroDash]', err)
    } finally {
      setLoading(false)
    }
  }

  async function confirmPresenca(escalaId, status) {
    const { error } = await supabase.from('escalas').update({ status_confirmacao: status }).eq('id', escalaId)
    if (error) { alert('Erro ao confirmar. Tente novamente.'); return }
    setEscalas(prev => prev.map(e => e.id === escalaId ? { ...e, status_confirmacao: status } : e))
  }

  async function submitTroca() {
    if (!trocaAlvo || !trocaMotivo.trim()) return
    setSendingTroca(true)
    try {
      await supabase.from('trocas').insert({
        escala_id:     trocaAlvo.id,
        solicitante_id: profile.id,
        motivo:        trocaMotivo,
        status:        'pendente',
      })
      setTrocaModal(false)
      setTrocaMotivo('')
      setTrocaAlvo(null)
    } catch (err) {
      console.error(err)
    } finally {
      setSendingTroca(false)
    }
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      {/* Greeting */}
      <div className="flex items-center gap-3 pt-1">
        <Avatar nome={profile?.nome} size="lg" />
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text-1)]">
            Olá, {profile?.nome?.split(' ')[0] || 'Membro'} 👋
          </h2>
          <p className="text-xs text-[var(--color-text-3)]">
            {(() => {
              const subdeps = Array.isArray(profile?.subdepartamento)
                ? profile.subdepartamento
                : profile?.subdepartamento ? [profile.subdepartamento] : []
              return subdeps.length > 0 ? subdeps.map(s => subdepLabel(s)).join(' · ') : 'Sem subdepartamento'
            })()}
            {profile?.instrumento?.length > 0 && ` · ${profile.instrumento.join(', ')}`}
          </p>
        </div>
      </div>

      {/* Comunicados */}
      {comunicados.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-1.5">
              <Megaphone size={13} className="text-[var(--color-text-3)]" />
              <span className="text-xs font-bold tracking-wider uppercase text-[var(--color-text-3)]">Comunicados</span>
            </div>
            <Link to="/announcements" className="text-xs text-primary-600 dark:text-primary-400 font-medium">
              Ver todos <ChevronRight size={11} className="inline" />
            </Link>
          </div>
          <div className="space-y-2">
            {comunicados.slice(0, 3).map(c => (
              <div
                key={c.id}
                className="rounded-2xl p-3 shadow-sm"
                style={{ background: 'linear-gradient(135deg, #2d6aa8 0%, #4287f5 100%)' }}
              >
                <div className="flex items-start gap-2.5">
                  <Avatar nome={c.users?.nome} src={c.users?.foto_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-semibold text-white truncate">
                          {c.users?.role === 'lider_geral' || c.users?.role === 'lider_funcao' ? 'Líder' : c.users?.nome?.split(' ')[0] || 'Líder'}
                        </span>
                        <Badge variant="default" className="text-2xs bg-white/20 text-white border-transparent">
                          {c.destinatario === 'todos' ? 'Todos' : subdepLabel(c.destinatario) || c.destinatario}
                        </Badge>
                      </div>
                      <span className="text-2xs text-white/70 whitespace-nowrap">{formatDate(c.criado_em)}</span>
                    </div>
                    <p className="text-sm text-white leading-snug">{c.texto}</p>
                    <ReacoesBar
                      comunicadoId={c.id}
                      userId={profile?.id}
                      initialReacoes={c.comunicado_reacoes || []}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My schedule */}
      <Card>
        <CardSection
          title="Minha escala"
          action={<Link to="/schedule" className="text-xs text-primary-600 dark:text-primary-400 font-medium">Ver tudo →</Link>}
        >
          {loading ? (
            <Skeleton className="h-20 rounded-lg" />
          ) : escalas.length === 0 ? (
            <EmptyState icon={Calendar} title="Sem escala no ciclo atual" description="Preencha sua disponibilidade quando a janela abrir." />
          ) : (
            escalas.slice(0, 4).map(e => (
              <ConfirmacaoInline key={e.id} escala={e} onConfirm={confirmPresenca} />
            ))
          )}
        </CardSection>
      </Card>

      {/* Next service briefing */}
      {briefing && (
        <Card>
          <CardSection title={`Próximo culto — ${formatDomingo(briefing.escala?.domingo)}`}>
            <p className="text-xs font-semibold text-[var(--color-text-2)] mb-2">
              Briefing — {subdepLabel(briefing.subdepartamento)}
            </p>
            {(briefing.subdepartamento === 'louvor' || briefing.subdepartamento === 'regencia') && briefing.dados_json && (
              <div className="space-y-1.5">
                {briefing.dados_json.hinos && (
                  <div className="flex justify-between gap-2">
                    <span className="text-xs text-[var(--color-text-3)] flex-shrink-0">Hino(s)</span>
                    <span className="text-xs font-medium text-[var(--color-text-1)] text-right">{briefing.dados_json.hinos}</span>
                  </div>
                )}
                {briefing.dados_json.tom && (
                  <div className="flex justify-between">
                    <span className="text-xs text-[var(--color-text-3)]">Tom</span>
                    <span className="text-xs font-medium text-[var(--color-text-1)]">{briefing.dados_json.tom}</span>
                  </div>
                )}
                {briefing.dados_json.instrumentos_necessarios?.length > 0 && (
                  <div className="flex justify-between gap-2">
                    <span className="text-xs text-[var(--color-text-3)] flex-shrink-0">Instrumentos</span>
                    <span className="text-xs font-medium text-[var(--color-text-1)] text-right">{briefing.dados_json.instrumentos_necessarios.join(' · ')}</span>
                  </div>
                )}
                {briefing.dados_json.solo && (
                  <div className="flex justify-between gap-2">
                    <span className="text-xs text-[var(--color-text-3)] flex-shrink-0">Solo</span>
                    <span className="text-xs font-medium text-[var(--color-text-1)] text-right">{briefing.dados_json.solo}</span>
                  </div>
                )}
                {(() => {
                  const url = briefing.dados_json.youtube_link
                  const match = url?.match(/(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/)
                  const vid = match?.[1]
                  if (!vid) return null
                  return (
                    <a
                      href={`https://www.youtube.com/watch?v=${vid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 mt-2 p-2 rounded-xl bg-[var(--color-bg-2)] hover:bg-[var(--color-bg-3)] transition-colors group"
                    >
                      <img
                        src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`}
                        alt="Thumbnail"
                        className="w-16 h-11 rounded-lg object-cover flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 text-xs font-medium text-[var(--color-text-2)] group-hover:text-primary-500 transition-colors">
                          <Youtube size={12} className="text-red-500 flex-shrink-0" />
                          <span className="truncate">{briefing.dados_json.hinos || 'Ver hino'}</span>
                        </div>
                        <p className="text-2xs text-[var(--color-text-3)] mt-0.5">Toque para abrir no YouTube</p>
                      </div>
                    </a>
                  )
                })()}
              </div>
            )}
            {briefing.subdepartamento === 'ebd' && briefing.dados_json && (
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-xs text-[var(--color-text-3)]">Lição</span>
                  <span className="text-xs font-medium text-[var(--color-text-1)]">{briefing.dados_json.titulo || '—'}</span>
                </div>
                {briefing.dados_json.texto_base && (
                  <div className="flex justify-between">
                    <span className="text-xs text-[var(--color-text-3)]">Base bíblica</span>
                    <span className="text-xs font-medium text-[var(--color-text-1)]">{briefing.dados_json.texto_base}</span>
                  </div>
                )}
              </div>
            )}
            {briefing.dados_json?.observacoes && (
              <p className="text-xs text-[var(--color-text-3)] mt-2 italic">{briefing.dados_json.observacoes}</p>
            )}
          </CardSection>
        </Card>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/availability">
          <Card className="flex flex-col items-center gap-2 py-4 hover:bg-[var(--color-bg-2)] transition-colors cursor-pointer">
            <CheckSquare size={20} className="text-primary-600" />
            <span className="text-xs font-medium text-[var(--color-text-2)]">Disponibilidade</span>
          </Card>
        </Link>
        <button
          onClick={() => {
            const next = escalas.find(e => e.domingo >= new Date().toISOString().split('T')[0])
            if (next) { setTrocaAlvo(next); setTrocaModal(true) }
          }}
        >
          <Card className="flex flex-col items-center gap-2 py-4 hover:bg-[var(--color-bg-2)] transition-colors cursor-pointer">
            <ArrowLeftRight size={20} className="text-amber-500" />
            <span className="text-xs font-medium text-[var(--color-text-2)]">Solicitar troca</span>
          </Card>
        </button>
      </div>

      {/* Troca modal */}
      <Modal
        open={trocaModal}
        onClose={() => setTrocaModal(false)}
        title="Solicitar troca de escala"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setTrocaModal(false)}>Cancelar</Button>
            <Button size="sm" onClick={submitTroca} loading={sendingTroca} disabled={!trocaMotivo.trim()}>
              Enviar solicitação
            </Button>
          </>
        }
      >
        {trocaAlvo && (
          <div className="space-y-3">
            <div className="alert-strip info">
              <Calendar size={13} />
              <span>{formatDomingo(trocaAlvo.domingo)} — {subdepLabel(trocaAlvo.subdepartamento)}</span>
            </div>
            <Textarea
              label="Motivo da solicitação"
              placeholder="Explique o motivo da troca..."
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
