import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar, CheckSquare, ArrowLeftRight, ChevronRight,
  Megaphone, Youtube, CheckCircle2, AlertCircle, Clock,
  ArrowRightLeft, BarChart2,
} from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useSysConfig } from '../../lib/sysConfig.js'
import { isEnsaioSunday } from '../../lib/scheduleEngine.js'
import { Card, CardSection, EmptyState, Skeleton, Avatar } from '../../components/ui/Card.jsx'
import { Badge } from '../../components/ui/Badge.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { Modal } from '../../components/ui/Modal.jsx'
import { Textarea } from '../../components/ui/Input.jsx'
import { formatDomingo, subdepLabel, formatDate } from '../../lib/utils.js'
import { ReacoesBar } from '../../components/ui/ReacoesBar.jsx'

// ── Sub-componentes ──────────────────────────────────────────────────────────

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

/** Item de linha no checklist de status do ciclo */
function StatusItem({ icon: Icon, label, sub, iconClass, to }) {
  const inner = (
    <div className="flex items-start gap-2.5 py-2.5 border-b border-[var(--color-border)] last:border-0">
      <Icon size={15} className={`mt-0.5 flex-shrink-0 ${iconClass}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--color-text-1)] leading-snug">{label}</p>
        {sub && <p className="text-xs text-[var(--color-text-3)] mt-0.5">{sub}</p>}
      </div>
      {to && <ChevronRight size={13} className="text-[var(--color-text-3)] flex-shrink-0 mt-0.5" />}
    </div>
  )
  return to
    ? <Link to={to} className="block hover:bg-[var(--color-bg-2)] -mx-4 px-4 transition-colors">{inner}</Link>
    : inner
}

// ── Dashboard principal ──────────────────────────────────────────────────────

export default function MembroDashboard() {
  const { profile } = useAuth()
  const { config: sysConfig } = useSysConfig()

  const [ciclo,            setCiclo]            = useState(null)
  const [escalas,          setEscalas]          = useState([])
  const [briefing,         setBriefing]         = useState(null)
  const [comunicados,      setComunicados]      = useState([])
  const [dispRecords,      setDispRecords]      = useState([])
  const [trocasPend,       setTrocasPend]       = useState([])
  const [loading,          setLoading]          = useState(true)

  // Troca modal
  const [trocaModal,   setTrocaModal]   = useState(false)
  const [trocaAlvo,    setTrocaAlvo]    = useState(null)
  const [trocaMotivo,  setTrocaMotivo]  = useState('')
  const [sendingTroca, setSendingTroca] = useState(false)

  useEffect(() => { if (profile?.id) loadData() }, [profile?.id])

  async function loadData() {
    setLoading(true)
    try {
      // Carrega ciclo ativo (qualquer status exceto encerrado), escalas e comunicados em paralelo
      const [{ data: ciclos }, { data: myEscalas }, { data: comunicadosData }, { data: trocasData }] =
        await Promise.all([
          supabase.from('ciclos').select('*')
            .neq('status', 'encerrado')
            .order('inicio', { ascending: false })
            .limit(1),
          supabase.from('escalas').select('*')
            .eq('user_id', profile.id)
            .order('domingo', { ascending: true }),
          supabase.from('comunicados')
            .select('*, users(nome, foto_url, role), comunicado_reacoes(emoji, user_id)')
            .order('criado_em', { ascending: false })
            .limit(5),
          supabase.from('trocas')
            .select('*, escala:escalas(domingo, subdepartamento)')
            .eq('solicitante_id', profile.id)
            .in('status', ['pendente', 'aprovado'])
            .order('created_at', { ascending: false })
            .limit(3),
        ])

      setComunicados(comunicadosData || [])
      setTrocasPend(trocasData || [])

      const cicloAtivo = ciclos?.[0] || null
      setCiclo(cicloAtivo)

      if (!cicloAtivo) { setLoading(false); return }

      // Escalas do ciclo ativo
      const escalasAtivas = (myEscalas || []).filter(e => e.ciclo_id === cicloAtivo.id)
      setEscalas(escalasAtivas)

      // Disponibilidade do usuário no ciclo (todos os registros para calcular progresso)
      const { data: dispData } = await supabase
        .from('disponibilidades')
        .select('domingo, subdepartamento')
        .eq('user_id', profile.id)
        .eq('ciclo_id', cicloAtivo.id)
      setDispRecords(dispData || [])

      // Briefing do próximo culto escalado
      const today = new Date().toISOString().split('T')[0]
      const nextEscala = escalasAtivas.find(e => e.domingo >= today)
      if (nextEscala) {
        const { data: bri } = await supabase
          .from('briefings').select('*')
          .eq('ciclo_id', cicloAtivo.id)
          .eq('subdepartamento', nextEscala.subdepartamento)
          .eq('domingo', nextEscala.domingo)
          .single()
        setBriefing(bri ? { ...bri, escala: nextEscala } : null)
      } else {
        setBriefing(null)
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
    const { error } = await supabase.from('trocas').insert({
      escala_id:      trocaAlvo.id,
      solicitante_id: profile.id,
      motivo:         trocaMotivo,
      status:         'pendente',
    })
    if (!error) { setTrocaModal(false); setTrocaMotivo(''); setTrocaAlvo(null); loadData() }
    setSendingTroca(false)
  }

  // ── Derivações ──────────────────────────────────────────────────────────────

  const today = new Date().toISOString().split('T')[0]
  const proxEscala      = escalas.find(e => e.domingo >= today)
  const escalasPassadas = escalas.filter(e => e.domingo < today)
  const escalasFuturas  = escalas.filter(e => e.domingo >= today)
  const escalasPendConf = escalasFuturas.filter(e => e.status_confirmacao === 'pendente')

  // Progresso do ciclo — baseado na fase atual, não em dias de serviço
  const PHASE_PROGRESS = {
    briefing_regente: 10,
    briefing_lider:   22,
    disponibilidade:  45,
    gerando_escala:   58,
    escala_publicada: 75,
    confirmacoes:     90,
    encerrado:        100,
  }
  const cycleProgress = ciclo ? (PHASE_PROGRESS[ciclo.status] ?? 0) : 0

  // Days until service
  const daysUntilService = ciclo
    ? Math.ceil((new Date(ciclo.inicio + 'T00:00:00').getTime() - Date.now()) / 86_400_000)
    : null
  const cycleProgressLabel = ciclo
    ? (daysUntilService > 0 ? `${daysUntilService}d para o serviço · ${cycleProgress}%` : `${cycleProgress}%`)
    : null

  // Cycle title: "Planejamento: dd/MM - dd/MM | Serviço: dd/MM - dd/MM"
  const fmtD = (d) => new Date(typeof d === 'string' && !d.includes('T') ? d + 'T00:00:00' : d)
    .toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const planEndDate = ciclo ? (() => { const d = new Date(ciclo.inicio + 'T00:00:00'); d.setDate(d.getDate() - 1); return d })() : null
  const cycleTitle = ciclo
    ? `Planejamento: ${fmtD(ciclo.created_at)} - ${fmtD(planEndDate)} | Serviço: ${fmtD(ciclo.inicio)} - ${fmtD(ciclo.fim)}`
    : null

  // Status de disponibilidade conforme fase do ciclo
  const faseAntesDsip    = ['briefing_regente', 'briefing_lider'].includes(ciclo?.status)
  const faseDisponib     = ciclo?.status === 'disponibilidade'
  const faseAposDisponib = ['gerando_escala', 'escala_publicada', 'confirmacoes'].includes(ciclo?.status)
  const escalaPublicada  = ['escala_publicada', 'confirmacoes'].includes(ciclo?.status)

  // ── Progresso de disponibilidade ────────────────────────────────────────────
  const isObservador = profile?.role === 'membro_observador'
  const mySubdeps = (() => {
    const s = profile?.subdepartamento
    if (!s) return []
    return Array.isArray(s) ? s.filter(Boolean) : [s].filter(Boolean)
  })()

  // Slots válidos do ciclo: constrói Set de "domingo:subdep" e faz cross-reference com DB
  const { availTotalSlots, availFilledSlots } = (() => {
    if (!ciclo) return { availTotalSlots: 0, availFilledSlots: 0 }
    const ensaioWeek = sysConfig?.ensaio_week ?? 4
    const d = new Date(ciclo.inicio + 'T00:00:00')
    while (d.getDay() !== 0) d.setDate(d.getDate() + 1)
    const end = new Date(ciclo.fim + 'T00:00:00')
    const validKeys = new Set()
    while (d <= end) {
      const y  = d.getFullYear()
      const mo = String(d.getMonth() + 1).padStart(2, '0')
      const dy = String(d.getDate()).padStart(2, '0')
      const dateStr = `${y}-${mo}-${dy}`
      const activeSubs = isEnsaioSunday(dateStr, ensaioWeek)
        ? (isObservador ? ['ensaio'] : mySubdeps.length > 0 ? [...mySubdeps, 'ensaio'] : [])
        : (isObservador ? [] : [...mySubdeps])
      for (const sub of activeSubs) validKeys.add(`${dateStr}:${sub}`)
      d.setDate(d.getDate() + 7)
    }
    const filled = dispRecords.filter(r => validKeys.has(`${r.domingo}:${r.subdepartamento}`)).length
    return { availTotalSlots: validKeys.size, availFilledSlots: filled }
  })()

  const availPct = availTotalSlots > 0 ? Math.round((availFilledSlots / availTotalSlots) * 100) : 100

  // Prazo da janela: normaliza created_at para início do dia local, depois soma avail_window_end
  const windowDeadline = (ciclo && faseDisponib) ? (() => {
    const d = new Date(ciclo.created_at)
    d.setHours(0, 0, 0, 0)   // evita inflação por horário UTC vs. local
    d.setDate(d.getDate() + (sysConfig?.avail_window_end ?? 20))
    return d
  })() : null
  const daysUntilDeadline = windowDeadline
    ? Math.ceil((windowDeadline.getTime() - Date.now()) / 86_400_000)
    : null

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">

      {/* Saudação */}
      <div className="flex items-center gap-3 pt-1">
        <Avatar nome={profile?.nome} src={profile?.foto_url} size="lg" />
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

      {/* ── Barra de progresso do ciclo ── */}
      {loading ? (
        <Skeleton className="h-16 rounded-xl" />
      ) : ciclo ? (
        <Card className="!p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-[var(--color-text-2)]">
              {cycleTitle}
            </span>
            <span className="text-xs text-[var(--color-text-3)]">{cycleProgressLabel}</span>
          </div>
          <div className="cycle-bar">
            <div className="cycle-bar-fill" style={{ width: `${cycleProgress}%` }} />
          </div>
          <div className="flex justify-between mt-1">
            {['Briefing', 'Disp.', 'Escala', 'Confirmações'].map(label => (
              <span key={label} className="text-2xs text-[var(--color-text-3)]">{label}</span>
            ))}
          </div>
        </Card>
      ) : null}

      {/* ── CTA de disponibilidade ── */}
      {!loading && ciclo && faseDisponib && availTotalSlots > 0 && (
        availPct === 100 ? (
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={18} className="text-success-500 flex-shrink-0" />
              <p className="text-sm font-semibold text-success-500">Disponibilidade enviada</p>
            </div>
          </Card>
        ) : (
          <Link to="/availability">
            <Card className="!p-4 hover:bg-[var(--color-bg-2)] transition-colors cursor-pointer">
              {/* Cabeçalho */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${availPct > 0 ? 'bg-warning-500/15' : 'bg-primary-500/15'}`}>
                    <CheckSquare size={15} className={availPct > 0 ? 'text-warning-500' : 'text-primary-500'} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-1)] leading-tight">
                      {availPct === 0 ? 'Preencha sua disponibilidade' : 'Disponibilidade incompleta'}
                    </p>
                    {daysUntilDeadline !== null && (
                      <p className={`text-xs mt-0.5 flex items-center gap-1 ${daysUntilDeadline <= 2 ? 'text-danger-500' : 'text-[var(--color-text-3)]'}`}>
                        <Clock size={10} />
                        {daysUntilDeadline > 0
                          ? `Prazo: ${daysUntilDeadline} dia${daysUntilDeadline > 1 ? 's' : ''}`
                          : 'Encerra hoje!'}
                      </p>
                    )}
                  </div>
                </div>
                {availPct > 0 && (
                  <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-warning-500/20 text-warning-500 flex-shrink-0 mt-0.5">
                    Incompleto
                  </span>
                )}
              </div>

              {/* Barra de progresso (só quando parcialmente preenchido) */}
              {availPct > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex-1 cycle-bar">
                    <div className="cycle-bar-fill !bg-warning-500" style={{ width: `${availPct}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-warning-500 w-8 text-right">{availPct}%</span>
                </div>
              )}

              {/* Rodapé */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--color-text-3)]">
                  {availFilledSlots} de {availTotalSlots} domingos
                </span>
                <span className="text-xs font-semibold text-primary-500 flex items-center gap-1">
                  Preencher agora <ChevronRight size={12} />
                </span>
              </div>
            </Card>
          </Link>
        )
      )}

      {/* ── Comunicados ── */}
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
                          {c.users?.role === 'lider_geral' || c.users?.role === 'lider_funcao'
                            ? 'Líder' : c.users?.nome?.split(' ')[0] || 'Líder'}
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

      {/* ── Meu status no ciclo ── */}
      {ciclo && (
        <Card>
          <CardSection title="Meu status no ciclo">
            {loading ? (
              <Skeleton className="h-24 rounded-lg" />
            ) : (
              <>
                {/* Disponibilidade */}
                {faseAntesDsip && (
                  <StatusItem
                    icon={Clock}
                    iconClass="text-[var(--color-text-3)]"
                    label="Disponibilidade"
                    sub="Janela ainda não aberta"
                  />
                )}
                {faseDisponib && (
                  availPct === 100
                    ? <StatusItem icon={CheckCircle2} iconClass="text-success-500" label="Disponibilidade enviada" />
                    : <StatusItem icon={AlertCircle}  iconClass="text-warning-500"
                        label={availPct > 0 ? 'Disponibilidade incompleta' : 'Disponibilidade não preenchida'}
                        sub="Toque para preencher agora" to="/availability" />
                )}
                {faseAposDisponib && (
                  availPct > 0
                    ? <StatusItem icon={CheckCircle2} iconClass="text-success-500" label="Disponibilidade preenchida" />
                    : <StatusItem icon={AlertCircle}  iconClass="text-[var(--color-text-3)]" label="Disponibilidade não preenchida" />
                )}

                {/* Escala / confirmação */}
                {!escalaPublicada ? (
                  <StatusItem
                    icon={Clock}
                    iconClass="text-[var(--color-text-3)]"
                    label="Escala"
                    sub="Aguardando publicação"
                  />
                ) : escalas.length === 0 ? (
                  <StatusItem
                    icon={AlertCircle}
                    iconClass="text-[var(--color-text-3)]"
                    label="Não escalado(a) neste ciclo"
                  />
                ) : escalasPendConf.length > 0 ? (
                  <StatusItem
                    icon={AlertCircle}
                    iconClass="text-warning-500"
                    label={`${escalasPendConf.length} confirmação${escalasPendConf.length > 1 ? 'ões' : ''} pendente${escalasPendConf.length > 1 ? 's' : ''}`}
                    sub="Toque para confirmar sua presença"
                    to="/schedule"
                  />
                ) : (
                  <StatusItem
                    icon={CheckCircle2}
                    iconClass="text-success-500"
                    label="Presença confirmada em todos os domingos"
                  />
                )}

                {/* Próximo serviço */}
                {proxEscala && (
                  <StatusItem
                    icon={Calendar}
                    iconClass="text-primary-500"
                    label={`Próximo serviço: ${formatDomingo(proxEscala.domingo)}`}
                    sub={subdepLabel(proxEscala.subdepartamento)}
                    to="/schedule"
                  />
                )}

                {/* Frequência */}
                {escalas.length > 0 && (
                  <StatusItem
                    icon={BarChart2}
                    iconClass="text-primary-400"
                    label={`${escalasPassadas.length} de ${escalas.length} domingos servidos neste ciclo`}
                  />
                )}
              </>
            )}
          </CardSection>
        </Card>
      )}

      {/* ── Trocas pendentes ── */}
      {trocasPend.length > 0 && (
        <Card>
          <CardSection title="Minhas trocas">
            {trocasPend.map(t => (
              <div key={t.id} className="flex items-center justify-between py-2.5 border-b border-[var(--color-border)] last:border-0 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <ArrowRightLeft size={13} className="text-[var(--color-text-3)] flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--color-text-1)] truncate">
                      {t.escala?.domingo ? formatDomingo(t.escala.domingo) : '—'}
                    </p>
                    <p className="text-xs text-[var(--color-text-3)]">
                      {t.escala?.subdepartamento ? subdepLabel(t.escala.subdepartamento) : ''}
                    </p>
                  </div>
                </div>
                <Badge variant={t.status === 'aprovado' ? 'green' : 'amber'}>
                  {t.status === 'aprovado' ? 'Aprovada' : 'Aguardando'}
                </Badge>
              </div>
            ))}
          </CardSection>
        </Card>
      )}

      {/* ── Minha escala ── */}
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

      {/* ── Briefing do próximo culto ── */}
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
                    <span className="text-xs font-medium text-[var(--color-text-1)] text-right">
                      {briefing.dados_json.instrumentos_necessarios.join(' · ')}
                    </span>
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

      {/* ── Ações rápidas ── */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/availability">
          <Card className="flex flex-col items-center gap-2 py-4 hover:bg-[var(--color-bg-2)] transition-colors cursor-pointer">
            <CheckSquare size={20} className="text-primary-600" />
            <span className="text-xs font-medium text-[var(--color-text-2)]">Disponibilidade</span>
          </Card>
        </Link>
        <button
          className="w-full"
          onClick={() => {
            const next = escalas.find(e => e.domingo >= today)
            if (next) { setTrocaAlvo(next); setTrocaModal(true) }
          }}
        >
          <Card className="flex flex-col items-center gap-2 py-4 hover:bg-[var(--color-bg-2)] transition-colors cursor-pointer">
            <ArrowLeftRight size={20} className="text-amber-500" />
            <span className="text-xs font-medium text-[var(--color-text-2)]">Solicitar troca</span>
          </Card>
        </button>
      </div>

      {/* ── Modal troca ── */}
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
