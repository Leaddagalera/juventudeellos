import { useState, useEffect } from 'react'
import { BarChart2, Users, Calendar, TrendingUp } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'
import { supabase } from '../lib/supabase.js'
import { Card, CardSection, Skeleton } from '../components/ui/Card.jsx'
import { Select } from '../components/ui/Input.jsx'
import { Badge, TarjaBadge } from '../components/ui/Badge.jsx'
import { subdepLabel } from '../lib/utils.js'

const COLORS = ['#1E3A5F','#2d6aa8','#4287f5','#7aabff','#b8d0ff']
const TARJA_COLORS = { discipulo: '#27500A', nicodemos: '#633806', prodigo: '#791F1F' }

export default function Reports() {
  const [ciclos,        setCiclos]        = useState([])
  const [selectedCiclo, setSelectedCiclo] = useState('')
  const [data,          setData]          = useState(null)
  const [loading,       setLoading]       = useState(true)

  useEffect(() => {
    supabase.from('ciclos').select('*').order('inicio', { ascending: false }).limit(12)
      .then(({ data }) => {
        setCiclos(data || [])
        if (data?.length > 0) setSelectedCiclo(data[0].id)
      })
  }, [])

  useEffect(() => {
    if (!selectedCiclo) return
    loadReportData(selectedCiclo)
  }, [selectedCiclo])

  async function loadReportData(cicloId) {
    setLoading(true)
    try {
      // Service frequency per member
      const { data: escalas } = await supabase
        .from('escalas')
        .select('user_id, subdepartamento, status_confirmacao, users(nome, subdepartamento, tarja)')
        .eq('ciclo_id', cicloId)

      // Group by user
      const byUser = {}
      for (const e of (escalas || [])) {
        if (!byUser[e.user_id]) {
          byUser[e.user_id] = {
            nome:         e.users?.nome || 'Desconhecido',
            subdep:       e.users?.subdepartamento,
            tarja:        e.users?.tarja,
            total:        0,
            confirmados:  0,
            subdeps:      {},
          }
        }
        byUser[e.user_id].total++
        if (e.status_confirmacao === 'confirmado') byUser[e.user_id].confirmados++
        byUser[e.user_id].subdeps[e.subdepartamento] = (byUser[e.user_id].subdeps[e.subdepartamento] || 0) + 1
      }

      const memberData = Object.values(byUser)
        .sort((a, b) => b.total - a.total)
        .slice(0, 15)

      // Availability vs scheduled
      const { data: disps } = await supabase
        .from('disponibilidades').select('user_id, disponivel').eq('ciclo_id', cicloId)
      const totalDisp = (disps || []).filter(d => d.disponivel).length
      const totalEsc  = (escalas || []).length

      // Subdep distribution
      const subdepCounts = {}
      for (const e of (escalas || [])) {
        subdepCounts[e.subdepartamento] = (subdepCounts[e.subdepartamento] || 0) + 1
      }
      const subdepData = Object.entries(subdepCounts).map(([name, value]) => ({
        name: subdepLabel(name), value
      }))

      // Tarja distribution
      const { data: members } = await supabase
        .from('users').select('tarja').eq('ativo', true)
      const tarjaCounts = { discipulo: 0, nicodemos: 0, prodigo: 0, sem_tarja: 0 }
      for (const m of (members || [])) {
        tarjaCounts[m.tarja || 'sem_tarja']++
      }

      setData({ memberData, totalDisp, totalEsc, subdepData, tarjaCounts, totalMembers: members?.length || 0 })
    } finally {
      setLoading(false)
    }
  }

  const tarjaChartData = data ? [
    { name: 'Discípulo',     value: data.tarjaCounts.discipulo, color: TARJA_COLORS.discipulo },
    { name: 'Nicodemos',     value: data.tarjaCounts.nicodemos, color: TARJA_COLORS.nicodemos },
    { name: 'Filho Pródigo', value: data.tarjaCounts.prodigo,   color: TARJA_COLORS.prodigo },
    { name: 'Sem tarja',     value: data.tarjaCounts.sem_tarja, color: '#94a3b8' },
  ].filter(d => d.value > 0) : []

  const pct = data ? Math.round((data.totalEsc / Math.max(data.totalDisp, 1)) * 100) : 0

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-text-1)]">Relatórios</h2>
        <Select value={selectedCiclo} onChange={e => setSelectedCiclo(e.target.value)} className="w-48">
          {ciclos.map(c => (
            <option key={c.id} value={c.id}>
              {new Date(c.inicio).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <div className="grid lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : !data ? (
        <p className="text-sm text-[var(--color-text-3)]">Selecione um ciclo para ver os dados.</p>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Card>
              <p className="text-xs text-[var(--color-text-2)] mb-1">Disponíveis marcados</p>
              <p className="text-2xl font-semibold">{data.totalDisp}</p>
            </Card>
            <Card>
              <p className="text-xs text-[var(--color-text-2)] mb-1">Escalações geradas</p>
              <p className="text-2xl font-semibold">{data.totalEsc}</p>
            </Card>
            <Card className="col-span-2 lg:col-span-1">
              <p className="text-xs text-[var(--color-text-2)] mb-1">% aproveitamento</p>
              <p className="text-2xl font-semibold">{pct}%</p>
              <div className="cycle-bar mt-2">
                <div className="cycle-bar-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Frequency chart */}
            <Card>
              <CardSection title="Frequência de serviço (top 15)">
                {data.memberData.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-3)]">Sem dados</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.memberData} layout="vertical" margin={{ left: 0, right: 8 }}>
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis
                        type="category"
                        dataKey="nome"
                        tick={{ fontSize: 10 }}
                        width={90}
                        tickFormatter={v => v.split(' ')[0]}
                      />
                      <Tooltip
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--color-border)' }}
                        formatter={(v, n) => [v, n === 'confirmados' ? 'Confirmados' : 'Total']}
                      />
                      <Bar dataKey="total" fill="#1E3A5F" radius={[0, 3, 3, 0]} />
                      <Bar dataKey="confirmados" fill="#22c55e" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardSection>
            </Card>

            {/* Tarja pie */}
            <Card>
              <CardSection title="Distribuição de tarjas">
                {tarjaChartData.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-3)]">Sem dados de tarja</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={tarjaChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                        {tarjaChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardSection>
            </Card>

            {/* Subdep distribution */}
            <Card>
              <CardSection title="Escalações por subdepartamento">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={data.subdepData}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Bar dataKey="value" fill="#2d6aa8" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardSection>
            </Card>

            {/* Member table */}
            <Card>
              <CardSection title="Membros — frequência detalhada">
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {data.memberData.map((m, i) => (
                    <div key={i} className="flex items-center justify-between py-1 border-b border-[var(--color-border)] last:border-0">
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
              </CardSection>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
