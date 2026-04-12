import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, AlertTriangle, CheckSquare, Bell,
  ChevronRight, Music, Calendar, Cake,
  RefreshCw, Play
} from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { MetricCard, Card, CardSection, Avatar, EmptyState, Skeleton } from '../../components/ui/Card.jsx'
import { Badge, SubdepBadge, TarjaBadge } from '../../components/ui/Badge.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { ConfirmModal } from '../../components/ui/Modal.jsx'
import { runScheduleEngine } from '../../lib/scheduleEngine.js'
import { formatDateShort, formatDomingo, isBirthdayThisWeek, daysSince, subdepLabel } from '../../lib/utils.js'
import { notify } from '../../lib/whatsapp.js'

const SUBDEPS = ['louvor', 'regencia', 'ebd', 'recepcao', 'midia']

function SaúdeSubdep({ subdep, data }) {
  const { escalados, confirmados, total, alertas, semBriefing } = data || {}
  const status = semBriefing ? 'red' : alertas > 0 ? 'amber' : 'green'
  const labels = { green: 'OK', amber: 'Atenção', red: 'Alerta' }
  const semClass = { green: 'sem-green', amber: 'sem-amber', red: 'sem-red' }

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[var(--color-border)] last:border-0">
      <div className="flex items-center gap-2">
        <span className={`semaforo ${semClass[status]}`} />
        <div>
          <p className="text-sm font-medium text-[var(--color-text-1)]">{subdepLabel(subdep)}</p>
          <p className="text-xs text-[var(--color-text-3)]">
            {semBriefing
              ? 'Briefing não preenchido'
              : `${escalados || 0}/${total || 0} escalados · ${confirmados || 0} confirmados`
            }
          </p>
        </div>
      </div>
      <Badge variant={status === 'green' ? 'green' : status === 'amber' ? 'amber' : 'red'}>
        {labels[status]}
      </Badge>
    </div>
  )
}

export default function LiderGeralDashboard() {
  const { profile, isLiderGeral, isLiderFuncao } = useAuth()

  // Subdeps que este usuário gerencia — lider_geral vê todos; lider_funcao só os seus
  const managedSubdeps = (() => {
    if (isLiderGeral) return SUBDEPS
    const set = new Set(
      Array.isArray(profile?.subdepartamento)
        ? profile.subdepartamento
        : profile?.subdepartamento ? [profile.subdepartamento] : []
    )
    if (profile?.subdep_lider) set.add(profile.subdep_lider)
    return SUBDEPS.filter(s => set.has(s))
  })()

  const [metrics,  setMetrics]  = useState(null)
  const [ciclo,    setCiclo]    = useState(null)
  const [saude,    setSaude]    = useState({})
  const [alertas,  setAlertas]  = useState([])
  const [aniverss, setAniverss] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [runModal, setRunModal] = useState(false)
  const [running,  setRunning]  = useState(false)
  const [runResult,setRunResult]= useState(null)

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    setLoading(true)
    try {
      // Active cycle
      const { data: ciclos } = await supabase
        .from('ciclos')
        .select('*')
        .in('status', ['briefing_regente','briefing_lider','disponibilidade','escala_publicada','confirmacoes'])
        .order('inicio', { ascending: false })
        .limit(1)
      const activeCiclo = ciclos?.[0] || null
      setCiclo(activeCiclo)

      // Members metrics
      const { count: totalAtivos } = await supabase
        .from('users').select('*', { count: 'exact', head: true })
        .eq('ativo', true).eq('role', 'membro_serve')

      const { count: confirmados } = await supabase
        .from('escalas').select('*', { count: 'exact', head: true })
        .eq('status_confirmacao', 'confirmado')
        .eq('ciclo_id', activeCiclo?.id || '')

      // Members without availability (if in window)
      let semDisp = 0
      if (activeCiclo?.id) {
        const { data: dispUsers } = await supabase
          .from('disponibilidades').select('user_id').eq('ciclo_id', activeCiclo.id)
        const { data: membros } = await supabase
          .from('users').select('id').eq('ativo', true).eq('role', 'membro_serve')
        const dispSet = new Set((dispUsers || []).map(d => d.user_id))
        semDisp = (membros || []).filter(m => !dispSet.has(m.id)).length
      }

      // Pending alerts
      const { count: pendMedia } = await supabase
        .from('conteudo_login').select('*', { count: 'exact', head: true }).eq('status', 'pendente')
      const { count: pendCadastros } = await supabase
        .from('users').select('*', { count: 'exact', head: true }).eq('ativo', false)

      setMetrics({
        ativos:      totalAtivos || 0,
        semDisp,
        confirmados: confirmados || 0,
        alertas:     (pendMedia || 0) + (pendCadastros || 0),
      })

      // Build department health — apenas os subdeps gerenciados pelo usuário
      const saudeObj = {}
      for (const subdep of managedSubdeps) {
        const { data: escalasDep } = await supabase
          .from('escalas').select('status_confirmacao, user_id')
          .eq('ciclo_id', activeCiclo?.id || '').eq('subdepartamento', subdep)

        const { data: briefingDep } = await supabase
          .from('briefings').select('id')
          .eq('ciclo_id', activeCiclo?.id || '').eq('subdepartamento', subdep).limit(1)

        saudeObj[subdep] = {
          total:       escalasDep?.length || 0,
          escalados:   escalasDep?.length || 0,
          confirmados: escalasDep?.filter(e => e.status_confirmacao === 'confirmado').length || 0,
          semBriefing: !briefingDep?.length,
          alertas:     escalasDep?.filter(e => e.status_confirmacao === 'pendente').length || 0,
        }
      }
      setSaude(saudeObj)

      // Alerts list
      const alertList = []
      if ((pendMedia || 0) > 0) alertList.push({ type: 'warning', msg: `${pendMedia} conteúdo(s) de mídia aguardando aprovação`, link: '/media' })
      if ((pendCadastros || 0) > 0) alertList.push({ type: 'warning', msg: `${pendCadastros} cadastro(s) pendentes de aprovação`, link: '/members' })

      // Tarja negativa sem alteração há 30+ dias
      const { data: tarjas } = await supabase
        .from('users').select('nome, tarja, tarja_atualizada_em')
        .eq('ativo', true).in('tarja', ['nicodemos', 'prodigo'])
      for (const t of (tarjas || [])) {
        if (daysSince(t.tarja_atualizada_em) >= 30) {
          alertList.push({ type: 'danger', msg: `${t.nome} — ${t.tarja === 'nicodemos' ? 'Nicodemos' : 'Filho Pródigo'} há ${daysSince(t.tarja_atualizada_em)} dias sem evolução`, link: '/members' })
        }
      }

      // Escala engine available
      if (activeCiclo?.status === 'disponibilidade') {
        const start = new Date(activeCiclo.inicio)
        const now   = new Date()
        const dia   = Math.floor((now - start) / (1000 * 60 * 60 * 24)) + 1
        if (dia >= 21) alertList.push({ type: 'info', msg: 'Dia 21+ — motor de escala disponível para execução', link: null, action: 'run_engine' })
      }

      setAlertas(alertList)

      // Birthdays this week
      const { data: membrosAniv } = await supabase
        .from('users').select('nome, data_nascimento').eq('ativo', true)
      setAniverss((membrosAniv || []).filter(m => isBirthdayThisWeek(m.data_nascimento)))

    } catch (err) {
      console.error('[Dashboard]', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleRunEngine() {
    if (!ciclo?.id) return
    setRunning(true)
    try {
      const result = await runScheduleEngine(ciclo.id)
      setRunResult(result)
      if (result.success) await loadDashboard()
    } catch (err) {
      setRunResult({ success: false, error: err.message })
    } finally {
      setRunning(false)
      setRunModal(false)
    }
  }

  // Cycle day
  const cycleDay = ciclo
    ? Math.floor((Date.now() - new Date(ciclo.inicio + 'T00:00:00').getTime()) / 86_400_000) + 1
    : null
  const cycleTotalDays = ciclo
    ? Math.max(1, Math.round((new Date(ciclo.fim + 'T00:00:00') - new Date(ciclo.inicio + 'T00:00:00')) / 86_400_000))
    : 45
  const cycleProgress = cycleDay && cycleDay > 0
    ? Math.min(100, Math.round((cycleDay / cycleTotalDays) * 100))
    : 0

  return (
    <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      {/* Welcome + Cycle bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--color-text-1)]">
            Olá, {profile?.nome?.split(' ')[0] || 'Líder'} 👋
          </h2>
          {ciclo ? (
            <p className="text-sm text-[var(--color-text-3)]">
              Ciclo ativo · {cycleDay > 0 ? `Dia ${cycleDay} de ${cycleTotalDays}` : `Serviço em ${Math.abs(cycleDay - 1)}d`}
            </p>
          ) : (
            <p className="text-sm text-[var(--color-text-3)]">Nenhum ciclo ativo</p>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={loadDashboard}>
          <RefreshCw size={14} />
          Atualizar
        </Button>
      </div>

      {/* Cycle progress */}
      {ciclo && (
        <Card className="!p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[var(--color-text-2)]">
              Progresso do ciclo — {new Date(ciclo.inicio).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
            </span>
            <span className="text-xs text-[var(--color-text-3)]">{cycleProgress}%</span>
          </div>
          <div className="cycle-bar">
            <div className="cycle-bar-fill" style={{ width: `${cycleProgress}%` }} />
          </div>
          <div className="flex justify-between mt-1">
            {['Briefing', 'Disp.', 'Escala', 'Confirmações'].map((label, i) => (
              <span key={label} className="text-2xs text-[var(--color-text-3)]">{label}</span>
            ))}
          </div>
        </Card>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading ? (
          [...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <MetricCard label="Membros ativos"       value={metrics?.ativos ?? '—'}      icon={Users}       color="blue" />
            <MetricCard label="Sem disponibilidade"  value={metrics?.semDisp ?? '—'}     icon={Calendar}    color="amber" />
            <MetricCard label="Confirmações"         value={metrics?.confirmados ?? '—'} icon={CheckSquare} color="green" />
            <MetricCard label="Alertas pendentes"    value={metrics?.alertas ?? '—'}     icon={Bell}        color="red" />
          </>
        )}
      </div>

      {/* Two-column grid */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Saúde dos subdepartamentos */}
        <Card>
          <CardSection title="Saúde dos subdepartamentos">
            {loading
              ? [...Array(managedSubdeps.length || 3)].map((_, i) => <Skeleton key={i} className="h-10 rounded mb-1" />)
              : managedSubdeps.map(s => <SaúdeSubdep key={s} subdep={s} data={saude[s]} />)
            }
          </CardSection>
        </Card>

        {/* Right column */}
        <div className="space-y-4">
          {/* Alertas */}
          <Card>
            <CardSection title="Alertas do sistema">
              {alertas.length === 0 ? (
                <EmptyState icon={Bell} title="Sem alertas" description="Tudo em ordem por enquanto." />
              ) : alertas.map((a, i) => (
                <div key={i} className={`alert-strip ${a.type} mb-1.5 last:mb-0`}>
                  <AlertTriangle size={13} className="flex-shrink-0" />
                  <span className="flex-1">{a.msg}</span>
                  {a.link && (
                    <Link to={a.link} className="font-semibold underline whitespace-nowrap">Ver →</Link>
                  )}
                  {a.action === 'run_engine' && (
                    <button
                      onClick={() => setRunModal(true)}
                      className="font-semibold underline whitespace-nowrap"
                    >
                      Gerar escala
                    </button>
                  )}
                </div>
              ))}
            </CardSection>
          </Card>

          {/* Aniversariantes */}
          <Card>
            <CardSection title="Aniversariantes da semana">
              {aniverss.length === 0 ? (
                <EmptyState icon={Cake} title="Nenhum aniversário esta semana" />
              ) : aniverss.map((m, i) => {
                const today = new Date()
                const bday  = new Date(m.data_nascimento)
                const isToday = today.getMonth() === bday.getMonth() && today.getDate() === bday.getDate()
                return (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0">
                    <div className="flex items-center gap-2">
                      <Avatar nome={m.nome} size="sm" />
                      <span className="text-sm text-[var(--color-text-1)]">{m.nome}</span>
                    </div>
                    <Badge variant={isToday ? 'blue' : 'default'}>
                      {isToday ? 'Hoje 🎂' : formatDateShort(m.data_nascimento)}
                    </Badge>
                  </div>
                )
              })}
            </CardSection>
          </Card>
        </div>
      </div>

      {/* Quick access links */}
      <Card>
        <CardSection title="Acesso rápido">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {[
              { to: '/members',      icon: Users,         label: 'Membros',        color: 'text-blue-500' },
              { to: '/schedule',     icon: Calendar,      label: 'Escalas',        color: 'text-violet-500' },
              { to: '/briefing',     icon: Music,         label: 'Briefings',      color: 'text-emerald-500' },
              { to: '/reports',      icon: CheckSquare,   label: 'Relatórios',     color: 'text-amber-500' },
              { to: '/media',        icon: Bell,          label: 'Mídia',          color: 'text-pink-500' },
            ].map(item => (
              <Link
                key={item.to}
                to={item.to}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-[var(--color-bg-2)] hover:bg-[var(--color-bg-3)] transition-colors text-center"
              >
                <item.icon size={20} className={item.color} />
                <span className="text-xs font-medium text-[var(--color-text-2)]">{item.label}</span>
              </Link>
            ))}
          </div>
        </CardSection>
      </Card>

      {/* Engine result */}
      {runResult && (
        <div className={`alert-strip ${runResult.success ? 'success' : 'danger'}`}>
          {runResult.success
            ? `✅ Escala gerada com sucesso — ${runResult.totalEscalados} escalados`
            : `❌ ${runResult.reason === 'cobertura_insuficiente' ? 'Escala não publicada: cobertura insuficiente em algum domingo' : runResult.error}`
          }
          {runResult.alertas?.length > 0 && (
            <span className="ml-1 font-semibold">({runResult.alertas.length} alertas)</span>
          )}
        </div>
      )}

      {/* Confirm run engine */}
      <ConfirmModal
        open={runModal}
        onClose={() => setRunModal(false)}
        onConfirm={handleRunEngine}
        title="Gerar escala do ciclo"
        message="O motor de escala será executado agora. A escala será publicada automaticamente se todos os domingos tiverem cobertura. Confirmar?"
        loading={running}
      />
    </div>
  )
}
