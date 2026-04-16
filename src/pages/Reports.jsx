import { useState, useEffect, useCallback, useMemo } from 'react'
import { BarChart2, Users, Calendar, TrendingUp, UserPlus, UserMinus, ArrowRight, RefreshCw, CheckCircle, Clock } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import { supabase } from '../lib/supabase.js'
import { Card, CardSection, Skeleton, EmptyState } from '../components/ui/Card.jsx'
import { Badge, TarjaBadge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { subdepLabel } from '../lib/utils.js'

const TARJA_COLORS = { discipulo: '#27500A', nicodemos: '#633806', prodigo: '#791F1F' }

const TABS = [
  { id: 'geral',      label: 'Visão Geral' },
  { id: 'membros',   label: 'Membros' },
  { id: 'tarjas',    label: 'Tarjas' },
  { id: 'escalas',   label: 'Escalas' },
  { id: 'visitantes',label: 'Visitantes' },
]

function getPresetDates(preset) {
  const now = new Date()
  const fim = now.toISOString().split('T')[0]
  let inicio
  if (preset === '1m') {
    const d = new Date(now); d.setMonth(d.getMonth() - 1); inicio = d.toISOString().split('T')[0]
  } else if (preset === '3m') {
    const d = new Date(now); d.setMonth(d.getMonth() - 3); inicio = d.toISOString().split('T')[0]
  } else if (preset === '1a') {
    const d = new Date(now); d.setFullYear(d.getFullYear() - 1); inicio = d.toISOString().split('T')[0]
  } else {
    inicio = '2020-01-01'
  }
  return { inicio, fim }
}

function KPI({ label, value, sub, icon: Icon }) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-[var(--color-text-3)] mb-1">{label}</p>
          <p className="text-2xl font-semibold text-[var(--color-text-1)]">{value}</p>
          {sub && <p className="text-2xs text-[var(--color-text-3)] mt-0.5">{sub}</p>}
        </div>
        {Icon && <Icon size={18} className="text-[var(--color-text-3)]" />}
      </div>
    </Card>
  )
}

export default function Reports() {
  const defaultRange = getPresetDates('3m')
  const [dataInicio, setDataInicio] = useState(defaultRange.inicio)
  const [dataFim,    setDataFim]    = useState(defaultRange.fim)
  const [activeTab,  setActiveTab]  = useState('geral')
  const [loading,    setLoading]    = useState(true)
  const [data,       setData]       = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)

    const inicioTs = dataInicio + 'T00:00:00'
    const fimTs    = dataFim    + 'T23:59:59'

    const [
      { data: membrosAtivos,    error: e1 },
      { data: todosMembros,     error: e2 },
      { data: novosMembros,     error: e3 },
      { data: tarjaUpdated,     error: e4 },
      { data: escalas,          error: e5 },
      { data: disponibilidades, error: e6 },
      { data: trocas,           error: e7 },
      { data: visitantes,       error: e8 },
    ] = await Promise.all([
      // Todos os membros ativos (sem filtro de período — snapshot atual)
      supabase.from('users')
        .select('id, nome, tarja, role, subdepartamento, created_at, data_entrada, ativo'),

      // Todos os membros já cadastrados (para retenção geral)
      supabase.from('users')
        .select('id, nome, ativo, created_at'),

      // Membros cadastrados no período (created_at no range)
      supabase.from('users')
        .select('id, nome, ativo, created_at, data_entrada, email, role')
        .gte('created_at', inicioTs)
        .lte('created_at', fimTs)
        .order('created_at', { ascending: false }),

      // Membros com tarja atualizada no período
      supabase.from('users')
        .select('id, nome, tarja, tarja_atualizada_em')
        .not('tarja', 'is', null)
        .not('tarja_atualizada_em', 'is', null)
        .gte('tarja_atualizada_em', inicioTs)
        .lte('tarja_atualizada_em', fimTs)
        .order('tarja_atualizada_em', { ascending: false }),

      // Escalas no período
      supabase.from('escalas')
        .select('user_id, subdepartamento, status_confirmacao, domingo, users(nome, tarja)')
        .gte('domingo', dataInicio)
        .lte('domingo', dataFim),

      // Disponibilidades no período
      supabase.from('disponibilidades')
        .select('user_id, disponivel, domingo')
        .gte('domingo', dataInicio)
        .lte('domingo', dataFim),

      // Trocas no período
      supabase.from('trocas')
        .select('id, status, created_at')
        .gte('created_at', inicioTs)
        .lte('created_at', fimTs),

      // Visitantes no período
      supabase.from('visitantes')
        .select('*')
        .gte('data_visita', dataInicio)
        .lte('data_visita', dataFim)
        .order('data_visita', { ascending: false }),
    ])

    const erros = [e1, e2, e3, e4, e5, e6, e7, e8].filter(Boolean)
    if (erros.length) console.error('[Reports] erros:', erros)

    // ── Membros
    const ativosLista   = membrosAtivos?.filter(m => m.ativo) ?? []
    const totalAtivos   = ativosLista.length
    const totalGeral    = todosMembros?.length ?? 0

    // Cadastrados no período = quem criou conta no range
    const cadastrados  = novosMembros ?? []
    // Desses, quem já está ativo (aprovado pelo líder)
    const ativadosPeriodo = cadastrados.filter(m => m.ativo)
    // Desses, ainda pendentes de aprovação
    const pendentesPeriodo = cadastrados.filter(m => !m.ativo)

    // Tarjas — snapshot atual dos membros ativos
    const tarjaCounts = { discipulo: 0, nicodemos: 0, prodigo: 0, sem_tarja: 0 }
    for (const m of ativosLista) tarjaCounts[m.tarja || 'sem_tarja']++

    // Membros com tarja atualizada no período
    const tarjaAtualizados = tarjaUpdated ?? []

    // ── Escalas
    const escalasList = escalas ?? []
    const totalEsc    = escalasList.length
    const confirmados = escalasList.filter(e => e.status_confirmacao === 'confirmado').length
    const totalDisp   = (disponibilidades ?? []).filter(d => d.disponivel).length

    const byUser = {}
    for (const e of escalasList) {
      if (!byUser[e.user_id]) {
        byUser[e.user_id] = { nome: e.users?.nome || '?', tarja: e.users?.tarja, total: 0, confirmados: 0 }
      }
      byUser[e.user_id].total++
      if (e.status_confirmacao === 'confirmado') byUser[e.user_id].confirmados++
    }
    const memberFreq = Object.values(byUser).sort((a, b) => b.total - a.total).slice(0, 15)

    const subdepCounts = {}
    for (const e of escalasList) subdepCounts[e.subdepartamento] = (subdepCounts[e.subdepartamento] || 0) + 1
    const subdepData = Object.entries(subdepCounts).map(([name, value]) => ({ name: subdepLabel(name), value }))

    const escaladosIds = new Set(escalasList.map(e => e.user_id))
    const nuncaEscalados = ativosLista.filter(m => !escaladosIds.has(m.id) && m.role === 'membro_serve')

    // ── Trocas
    const trocasList     = trocas ?? []
    const trocasSolicitadas = trocasList.length
    const trocasAprovadas   = trocasList.filter(t => t.status === 'aprovado').length

    // ── Visitantes
    const visitantesList      = visitantes ?? []
    const visitantesPorStatus = { novo: 0, recorrente: 0, acompanhado: 0, integrado: 0 }
    for (const v of visitantesList) visitantesPorStatus[v.status_acompanhamento || 'novo']++

    setData({
      totalAtivos, totalGeral,
      cadastrados, ativadosPeriodo, pendentesPeriodo,
      tarjaCounts, tarjaAtualizados,
      totalEsc, confirmados, totalDisp,
      memberFreq, subdepData, nuncaEscalados,
      trocasSolicitadas, trocasAprovadas,
      visitantesList, visitantesPorStatus,
    })
    setLoading(false)
  }, [dataInicio, dataFim])

  useEffect(() => { loadData() }, [loadData])

  const applyPreset = (preset) => {
    const { inicio, fim } = getPresetDates(preset)
    setDataInicio(inicio)
    setDataFim(fim)
  }

  const tarjaChartData = useMemo(() => data ? [
    { name: 'Discípulo',    value: data.tarjaCounts.discipulo,  color: TARJA_COLORS.discipulo },
    { name: 'Nicodemos',    value: data.tarjaCounts.nicodemos,  color: TARJA_COLORS.nicodemos },
    { name: 'Filho Pródigo',value: data.tarjaCounts.prodigo,    color: TARJA_COLORS.prodigo },
    { name: 'Sem tarja',    value: data.tarjaCounts.sem_tarja,  color: '#94a3b8' },
  ].filter(d => d.value > 0) : [], [data])

  const pctConfirm = data ? Math.round((data.confirmados / Math.max(data.totalEsc, 1)) * 100) : 0
  const pctAprov   = data ? Math.min(100, Math.round((data.totalEsc / Math.max(data.totalDisp, 1)) * 100)) : 0

  if (loading && !data) return (
    <div className="p-4 lg:p-6 space-y-3 max-w-5xl mx-auto">
      <Skeleton className="h-8 w-48 rounded" />
      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
    </div>
  )

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-5xl mx-auto">
      {/* Header + filtros */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--color-text-1)]">Relatórios</h2>
          <Button variant="secondary" size="sm" onClick={loadData} loading={loading}>
            <RefreshCw size={13} />
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-2xs text-[var(--color-text-3)] block mb-0.5">De</label>
            <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg text-xs bg-[var(--color-bg-1)] border border-[var(--color-border)] text-[var(--color-text-1)] focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
          </div>
          <div>
            <label className="text-2xs text-[var(--color-text-3)] block mb-0.5">Até</label>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg text-xs bg-[var(--color-bg-1)] border border-[var(--color-border)] text-[var(--color-text-1)] focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
          </div>
          <div className="flex gap-1">
            {[['1m','1 mês'],['3m','3 meses'],['1a','1 ano'],['all','Tudo']].map(([k,l]) => (
              <button key={k} onClick={() => applyPreset(k)}
                className="px-2.5 py-1.5 rounded-lg text-2xs font-medium text-[var(--color-text-3)] hover:text-[var(--color-text-1)] bg-[var(--color-bg-2)] hover:bg-[var(--color-bg-3)] transition-colors">
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--color-bg-2)] overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors
              ${activeTab === tab.id
                ? 'bg-[var(--color-surface)] text-[var(--color-text-1)] shadow-sm'
                : 'text-[var(--color-text-3)] hover:text-[var(--color-text-2)]'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {!data ? (
        <EmptyState icon={BarChart2} title="Sem dados" description="Nenhum dado encontrado para o período selecionado." />
      ) : (
        <>
          {activeTab === 'geral'      && <TabGeral      data={data} tarjaChartData={tarjaChartData} pctAprov={pctAprov} />}
          {activeTab === 'membros'    && <TabMembros    data={data} />}
          {activeTab === 'tarjas'     && <TabTarjas     data={data} tarjaChartData={tarjaChartData} />}
          {activeTab === 'escalas'    && <TabEscalas    data={data} pctConfirm={pctConfirm} pctAprov={pctAprov} />}
          {activeTab === 'visitantes' && <TabVisitantes data={data} />}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function TabGeral({ data, tarjaChartData, pctAprov }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI label="Membros ativos"   value={data.totalAtivos}           icon={Users} />
        <KPI label="Novos no período" value={data.cadastrados.length}    icon={UserPlus} />
        <KPI label="Aprovados"        value={data.ativadosPeriodo.length} icon={CheckCircle} />
        <KPI label="Aproveitamento"   value={`${pctAprov}%`}            sub={`${data.totalEsc} esc. / ${data.totalDisp} disp.`} icon={TrendingUp} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardSection title="Escalações por subdepartamento">
            {data.subdepData.length === 0
              ? <p className="text-xs text-[var(--color-text-3)]">Sem escalações no período</p>
              : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={data.subdepData}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Bar dataKey="value" fill="#2d6aa8" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </CardSection>
        </Card>
        <Card>
          <CardSection title="Distribuição de tarjas (atual)">
            {tarjaChartData.length === 0
              ? <p className="text-xs text-[var(--color-text-3)]">Sem dados</p>
              : (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={tarjaChartData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                      {tarjaChartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
          </CardSection>
        </Card>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function TabMembros({ data }) {
  const retencao = data.totalGeral > 0 ? Math.round((data.totalAtivos / data.totalGeral) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI label="Cadastrados"   value={data.cadastrados.length}     icon={UserPlus} />
        <KPI label="Aprovados"     value={data.ativadosPeriodo.length} icon={CheckCircle} />
        <KPI label="Pendentes"     value={data.pendentesPeriodo.length} icon={Clock} />
        <KPI label="Retenção"      value={`${retencao}%`} sub={`${data.totalAtivos} de ${data.totalGeral}`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Cadastrados no período */}
        <Card>
          <CardSection title={`Cadastrados no período (${data.cadastrados.length})`}>
            {data.cadastrados.length === 0
              ? <p className="text-xs text-[var(--color-text-3)]">Nenhum</p>
              : (
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {data.cadastrados.map(m => (
                    <div key={m.id} className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)] last:border-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-medium text-[var(--color-text-1)]">{m.nome}</p>
                        <Badge variant={m.ativo ? 'green' : 'amber'} className="text-2xs">
                          {m.ativo ? 'Ativo' : 'Pendente'}
                        </Badge>
                      </div>
                      <p className="text-2xs text-[var(--color-text-3)]">
                        {new Date(m.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
          </CardSection>
        </Card>

        {/* Pendentes de aprovação do período */}
        <Card>
          <CardSection title={`Pendentes de aprovação (${data.pendentesPeriodo.length})`}>
            {data.pendentesPeriodo.length === 0
              ? <p className="text-xs text-[var(--color-text-3)]">Nenhum</p>
              : (
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {data.pendentesPeriodo.map(m => (
                    <div key={m.id} className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)] last:border-0">
                      <p className="text-xs font-medium text-[var(--color-text-1)]">{m.nome}</p>
                      <p className="text-2xs text-[var(--color-text-3)]">
                        {new Date(m.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
          </CardSection>
        </Card>
      </div>

      {/* Nunca escalados */}
      <Card>
        <CardSection title={`Nunca escalados no período (${data.nuncaEscalados.length})`}>
          {data.nuncaEscalados.length === 0
            ? <p className="text-xs text-[var(--color-text-3)]">Todos foram escalados</p>
            : (
              <div className="flex flex-wrap gap-1.5">
                {data.nuncaEscalados.map(m => (
                  <Badge key={m.id} variant="amber">{m.nome?.split(' ')[0]}</Badge>
                ))}
              </div>
            )}
        </CardSection>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function TabTarjas({ data, tarjaChartData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KPI label="Discípulos"    value={data.tarjaCounts.discipulo} />
        <KPI label="Nicodemos"     value={data.tarjaCounts.nicodemos} />
        <KPI label="Filho Pródigo" value={data.tarjaCounts.prodigo} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Gráfico de distribuição */}
        <Card>
          <CardSection title="Distribuição atual">
            {tarjaChartData.length === 0
              ? <p className="text-xs text-[var(--color-text-3)]">Sem dados</p>
              : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={tarjaChartData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                      {tarjaChartData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
          </CardSection>
        </Card>

        {/* Tarjas atualizadas no período */}
        <Card>
          <CardSection title={`Tarjas atualizadas no período (${data.tarjaAtualizados.length})`}>
            {data.tarjaAtualizados.length === 0
              ? <p className="text-xs text-[var(--color-text-3)]">Nenhuma atualização de tarja neste período</p>
              : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {data.tarjaAtualizados.map(m => (
                    <div key={m.id} className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)] last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-[var(--color-text-1)]">
                          {m.nome?.split(' ')[0]}
                        </span>
                        <TarjaBadge tarja={m.tarja} />
                      </div>
                      <p className="text-2xs text-[var(--color-text-3)]">
                        {new Date(m.tarja_atualizada_em).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
          </CardSection>
        </Card>
      </div>

      {/* Membros sem tarja */}
      {data.tarjaCounts.sem_tarja > 0 && (
        <Card>
          <CardSection title={`Membros sem tarja (${data.tarjaCounts.sem_tarja})`}>
            <p className="text-xs text-[var(--color-text-3)]">
              {data.tarjaCounts.sem_tarja} membro(s) ativo(s) ainda não receberam uma tarja.
            </p>
          </CardSection>
        </Card>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function TabEscalas({ data, pctConfirm, pctAprov }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI label="Escalações"  value={data.totalEsc}            icon={Calendar} />
        <KPI label="Confirmação" value={`${pctConfirm}%`}         sub={`${data.confirmados} de ${data.totalEsc}`} />
        <KPI label="Aproveitamento" value={`${pctAprov}%`}        sub={`${data.totalEsc} / ${data.totalDisp} disp.`} />
        <KPI label="Trocas"      value={data.trocasSolicitadas}   sub={`${data.trocasAprovadas} aprovadas`} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardSection title="Frequência de serviço (top 15)">
            {data.memberFreq.length === 0
              ? <p className="text-xs text-[var(--color-text-3)]">Sem dados</p>
              : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.memberFreq} layout="vertical" margin={{ left: 0, right: 8 }}>
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={90} tickFormatter={v => v.split(' ')[0]} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} formatter={(v, n) => [v, n === 'confirmados' ? 'Confirmados' : 'Total']} />
                    <Bar dataKey="total"      fill="#1E3A5F"  radius={[0,3,3,0]} />
                    <Bar dataKey="confirmados" fill="#22c55e" radius={[0,3,3,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </CardSection>
        </Card>
        <Card>
          <CardSection title="Escalações por subdepartamento">
            {data.subdepData.length === 0
              ? <p className="text-xs text-[var(--color-text-3)]">Sem dados</p>
              : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.subdepData}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Bar dataKey="value" fill="#2d6aa8" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
          </CardSection>
        </Card>
      </div>

      <Card>
        <CardSection title="Membros — frequência detalhada">
          {data.memberFreq.length === 0
            ? <p className="text-xs text-[var(--color-text-3)]">Sem dados</p>
            : (
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {data.memberFreq.map((m, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)] last:border-0">
                    <div>
                      <p className="text-xs font-medium text-[var(--color-text-1)]">{m.nome}</p>
                      {m.tarja && <TarjaBadge tarja={m.tarja} />}
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-[var(--color-text-1)]">{m.total} serviços</p>
                      <p className="text-2xs text-success-500">{m.confirmados} confirm.</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </CardSection>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
function TabVisitantes({ data }) {
  const { visitantesList, visitantesPorStatus } = data
  const total = visitantesList.length
  const STATUS_LABEL = { novo: 'Novo', recorrente: 'Recorrente', acompanhado: 'Acompanhado', integrado: 'Integrado' }
  const STATUS_COLOR = { novo: '#94a3b8', recorrente: '#f59e0b', acompanhado: '#3b82f6', integrado: '#22c55e' }
  const taxaIntegracao = total > 0 ? Math.round((visitantesPorStatus.integrado / total) * 100) : 0

  const funilData = ['novo','recorrente','acompanhado','integrado']
    .map(s => ({ name: STATUS_LABEL[s], value: visitantesPorStatus[s], color: STATUS_COLOR[s] }))
    .filter(d => d.value > 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI label="Total visitantes" value={total}                        icon={Users} />
        <KPI label="Novos"            value={visitantesPorStatus.novo} />
        <KPI label="Acompanhados"     value={visitantesPorStatus.acompanhado} />
        <KPI label="Integrados"       value={visitantesPorStatus.integrado} sub={`${taxaIntegracao}% conversão`} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardSection title="Funil de visitantes">
            {funilData.length === 0
              ? <p className="text-xs text-[var(--color-text-3)]">Sem visitantes no período</p>
              : (
                <div className="space-y-2 py-2">
                  {funilData.map((d, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-[var(--color-text-2)]">{d.name}</span>
                        <span className="font-semibold text-[var(--color-text-1)]">{d.value}</span>
                      </div>
                      <div className="h-5 rounded bg-[var(--color-bg-2)]">
                        <div className="h-full rounded transition-all"
                          style={{ width: `${Math.max((d.value / total) * 100, 4)}%`, backgroundColor: d.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </CardSection>
        </Card>
        <Card>
          <CardSection title="Visitantes recentes">
            {visitantesList.length === 0
              ? <p className="text-xs text-[var(--color-text-3)]">Nenhum visitante</p>
              : (
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {visitantesList.slice(0, 20).map((v, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)] last:border-0">
                      <div>
                        <p className="text-xs font-medium text-[var(--color-text-1)]">{v.nome}</p>
                        <Badge variant={v.status_acompanhamento === 'integrado' ? 'green' : v.status_acompanhamento === 'acompanhado' ? 'blue' : 'gray'}>
                          {STATUS_LABEL[v.status_acompanhamento] || 'Novo'}
                        </Badge>
                      </div>
                      <p className="text-2xs text-[var(--color-text-3)]">
                        {new Date(v.data_visita + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
          </CardSection>
        </Card>
      </div>
    </div>
  )
}
