import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Save, Clock, CheckCircle, AlertCircle, Edit2 } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { Card, EmptyState, Skeleton } from '../components/ui/Card.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Input, Textarea, ChipSelect } from '../components/ui/Input.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Modal } from '../components/ui/Modal.jsx'
import { subdepLabel } from '../lib/utils.js'
import { useSysConfig } from '../lib/sysConfig.js'

const INSTRUMENT_OPTS = [
  { value: 'violao',   label: 'Violão' },
  { value: 'guitarra', label: 'Guitarra' },
  { value: 'baixo',    label: 'Baixo' },
  { value: 'teclado',  label: 'Teclado' },
  { value: 'bateria',  label: 'Bateria' },
  { value: 'voz',      label: 'Voz' },
  { value: 'flauta',   label: 'Flauta' },
  { value: 'trompete', label: 'Trompete' },
]

const SUBDEPS = ['regencia', 'ebd', 'recepcao', 'midia']

const SUBDEP_COLORS = {
  regencia: 'text-blue-400',
  ebd:      'text-emerald-400',
  recepcao: 'text-amber-400',
  midia:    'text-pink-400',
}

// Determina o tema do culto pelo número do domingo no mês
function sundayTheme(dateStr) {
  const date = new Date(dateStr + 'T12:00:00')
  let count = 0
  const d = new Date(date.getFullYear(), date.getMonth(), 1)
  while (d <= date) {
    if (d.getDay() === 0) count++
    d.setDate(d.getDate() + 1)
  }
  const themes = ['Santa Ceia', 'Louvor e Adoração', 'Missões', 'Louvor e Adoração', 'Livre']
  return themes[count - 1] || 'Livre'
}

function formatDomingoShort(dateStr) {
  const date = new Date(dateStr + 'T12:00:00')
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

// ── Modal de edição de briefing ──────────────────────────────────────────────
function BriefingModal({ open, onClose, briefing, cicloId, domingo, subdep, readOnly, isRegente, onSave }) {
  const tema = sundayTheme(domingo)
  const [form,    setForm]    = useState({})
  const [loading, setLoading] = useState(false)
  const [saved,   setSaved]   = useState(false)

  useEffect(() => {
    if (open) {
      const base = briefing?.dados_json || {}
      // Auto-preenche tema se ainda não tiver
      setForm({ tema_culto: tema, ...base })
      setSaved(false)
    }
  }, [open, briefing, tema])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setLoading(true)
    setSaved(false)
    try {
      const query = briefing?.id
        ? supabase.from('briefings').update({ dados_json: form }).eq('id', briefing.id)
        : supabase.from('briefings').insert({ ciclo_id: cicloId, subdepartamento: subdep, domingo, dados_json: form })

      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tempo esgotado. Verifique sua conexão e tente novamente.')), 10000)
      )

      const { error } = await Promise.race([query, timeout])
      if (error) throw error

      setSaved(true)
      onSave?.()
      setTimeout(() => { setSaved(false); onClose() }, 1200)
    } catch (err) {
      alert('Erro ao salvar: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${subdepLabel(subdep)} — ${formatDomingoShort(domingo)}`}
      size="md"
      footer={!readOnly && subdep !== 'ebd' ? (
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleSave} loading={loading}>
            <Save size={13} />
            {saved ? '✓ Salvo!' : 'Salvar'}
          </Button>
        </>
      ) : (
        <Button variant="secondary" size="sm" onClick={onClose}>Fechar</Button>
      )}
    >
      <div className="space-y-3">
        {/* Tema do culto — sempre visível */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-bg-2)]">
          <span className="text-xs text-[var(--color-text-3)]">Tema do culto:</span>
          <span className="text-sm font-semibold text-[var(--color-text-1)]">{tema}</span>
        </div>

        {/* Regência */}
        {subdep === 'regencia' && (
          <div className="space-y-3">
            <Input label="Hino(s)" placeholder="Ex: Grande é o Senhor" value={form.hinos || ''} onChange={e => set('hinos', e.target.value)} disabled={readOnly} />
            <Input label="Tom" placeholder="Ex: G maior" value={form.tom || ''} onChange={e => set('tom', e.target.value)} disabled={readOnly} />
            {isRegente && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--color-text-2)]">Instrumentos necessários</label>
                <ChipSelect options={INSTRUMENT_OPTS} selected={form.instrumentos_necessarios || []} onChange={v => set('instrumentos_necessarios', v)} disabled={readOnly} />
              </div>
            )}
            <Textarea label="Observações" placeholder="Instruções adicionais..." value={form.observacoes || ''} onChange={e => set('observacoes', e.target.value)} rows={2} disabled={readOnly} />
          </div>
        )}

        {/* EBD */}
        {subdep === 'ebd' && (
          <div className="space-y-2">
            <div className="alert-strip info text-xs">Conteúdo importado automaticamente da CPAD</div>
            {form.titulo     && <div className="flex flex-col gap-0.5"><span className="text-2xs text-[var(--color-text-3)]">Lição</span><span className="text-sm font-medium">{form.titulo}</span></div>}
            {form.texto_base && <div className="flex flex-col gap-0.5"><span className="text-2xs text-[var(--color-text-3)]">Base bíblica</span><span className="text-sm">{form.texto_base}</span></div>}
            {!form.titulo    && <p className="text-xs text-[var(--color-text-3)]">Aguardando importação da CPAD...</p>}
          </div>
        )}

        {/* Recepção */}
        {subdep === 'recepcao' && (
          <div className="space-y-3">
            <Input label="Postos" placeholder="Ex: Entrada principal, lateral" value={form.postos || ''} onChange={e => set('postos', e.target.value)} disabled={readOnly} />
            <Input label="Quantidade de pessoas" type="number" min="2" value={form.quantidade || 2} onChange={e => set('quantidade', Number(e.target.value))} disabled={readOnly} />
            <Textarea label="Observações" value={form.observacoes || ''} onChange={e => set('observacoes', e.target.value)} rows={2} disabled={readOnly} />
          </div>
        )}

        {/* Mídia */}
        {subdep === 'midia' && (
          <div className="space-y-3">
            <Input label="Tema visual / identidade" value={form.tema || ''} onChange={e => set('tema', e.target.value)} disabled={readOnly} />
            <Input label="Links de inspiração" placeholder="https://..." value={form.links || ''} onChange={e => set('links', e.target.value)} disabled={readOnly} />
            <Input label="Metas / observações" value={form.metas || ''} onChange={e => set('metas', e.target.value)} disabled={readOnly} />
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── Célula do grid ───────────────────────────────────────────────────────────
function GridCell({ briefing, onClick, readOnly }) {
  const filled = briefing && Object.keys(briefing.dados_json || {}).length > 0
  return (
    <button
      onClick={onClick}
      className={`w-full h-12 rounded-lg flex items-center justify-center gap-1.5 transition-colors border
        ${filled
          ? 'bg-success-500/10 border-success-500/30 hover:bg-success-500/20'
          : 'bg-[var(--color-bg-2)] border-[var(--color-border)] hover:bg-[var(--color-bg-3)]'
        }`}
    >
      {filled
        ? <CheckCircle size={15} className="text-success-500" />
        : <AlertCircle size={15} className="text-[var(--color-text-3)]" />
      }
      <span className={`text-xs font-medium ${filled ? 'text-success-500' : 'text-[var(--color-text-3)]'}`}>
        {filled ? 'OK' : 'Preencher'}
      </span>
    </button>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function Briefing() {
  const { profile, isLiderGeral, isLiderFuncao } = useAuth()
  const { config: sysConfig } = useSysConfig()

  // Calcular subdeps visíveis ANTES dos useStates para poder usar no initializer
  const mySubdeps = Array.isArray(profile?.subdepartamento)
    ? profile.subdepartamento
    : profile?.subdepartamento ? [profile.subdepartamento] : []

  // lider_funcao também enxerga o subdep que lidera
  const visibleSubdeps = isLiderGeral
    ? SUBDEPS
    : SUBDEPS.filter(s => {
        const set = new Set(mySubdeps)
        if (profile?.subdep_lider) set.add(profile.subdep_lider)
        return set.has(s)
      })

  const isRegente = mySubdeps.includes('regencia')

  const [ciclo,     setCiclo]     = useState(null)
  const [domingos,  setDomingos]  = useState([])
  const [briefings, setBriefings] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(null)
  // lider_geral começa na visão geral; os demais, direto no primeiro subdep deles
  const [activeTab, setActiveTab] = useState(
    isLiderGeral ? 'geral' : (visibleSubdeps[0] || 'geral')
  )

  const loadBriefings = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const { data: ciclos } = await supabase
        .from('ciclos').select('*')
        .in('status', ['briefing_regente','briefing_lider','disponibilidade','escala_publicada','confirmacoes'])
        .order('inicio', { ascending: false }).limit(1)
      const c = ciclos?.[0]
      if (!c) { setLoading(false); return }
      setCiclo(c)

      const start = new Date(c.inicio)
      const end   = new Date(c.fim)
      const suns  = []
      const d = new Date(start)
      while (d.getDay() !== 0) d.setDate(d.getDate() + 1)
      while (d <= end) {
        suns.push(d.toISOString().split('T')[0])
        d.setDate(d.getDate() + 7)
      }
      setDomingos(suns)

      const { data: bris } = await supabase.from('briefings').select('*').eq('ciclo_id', c.id)
      setBriefings(bris || [])
    } catch (err) {
      console.error('[Briefing]', err)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { loadBriefings() }, [loadBriefings])

  const getBriefing = (domingo, subdep) =>
    briefings.find(b => b.domingo === domingo && b.subdepartamento === subdep)

  const dia = ciclo
    ? Math.floor((Date.now() - new Date(ciclo.inicio).getTime()) / (1000 * 60 * 60 * 24)) + 1
    : 0

  const canEdit = (subdep) => {
    if (isLiderGeral) return true
    if (isLiderFuncao && mySubdeps.includes(subdep)) return true
    return false
  }

  if (loading) return (
    <div className="p-4 lg:p-6 space-y-3 max-w-6xl mx-auto">
      <Skeleton className="h-8 w-48 rounded" />
      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
    </div>
  )

  if (!ciclo) return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto">
      <EmptyState icon={Clock} title="Nenhum ciclo ativo" description="Aguarde a abertura do próximo ciclo." />
    </div>
  )

  // Tabs: lider_geral tem "Visão Geral" + seus subdeps; os demais só seus subdeps
  const tabs = isLiderGeral
    ? [{ id: 'geral', label: 'Visão Geral' }, ...mySubdeps.map(s => ({ id: s, label: subdepLabel(s) }))]
    : visibleSubdeps.map(s => ({ id: s, label: subdepLabel(s) }))

  const activeModal = modal ? getBriefing(modal.domingo, modal.subdep) : null

  const subdepListContent = (subdep) => (
    <div className="space-y-2">
      {domingos.map(domingo => {
        const b = getBriefing(domingo, subdep)
        const filled = b && Object.keys(b.dados_json || {}).length > 0
        const tema = sundayTheme(domingo)
        return (
          <button
            key={domingo}
            onClick={() => setModal({ domingo, subdep })}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl surface border border-[var(--color-border)] hover:bg-[var(--color-bg-2)] transition-colors"
          >
            <div className="text-left">
              <p className="text-sm font-medium text-[var(--color-text-1)]">{formatDomingoShort(domingo)}</p>
              <p className="text-2xs text-[var(--color-text-3)]">{tema}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={filled ? 'green' : 'amber'}>{filled ? 'Preenchido' : 'Pendente'}</Badge>
              <Edit2 size={13} className="text-[var(--color-text-3)]" />
            </div>
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-1)]">Briefings</h2>
          <p className="text-xs text-[var(--color-text-3)]">Ciclo atual · Dia {dia} de {sysConfig.cycle_duration}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => loadBriefings(false)}>
          <RefreshCw size={13} />
          Atualizar
        </Button>
      </div>

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex gap-1 p-1 rounded-xl bg-[var(--color-bg-2)] w-fit">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${activeTab === tab.id
                  ? 'bg-[var(--color-surface)] text-[var(--color-text-1)] shadow-sm'
                  : 'text-[var(--color-text-3)] hover:text-[var(--color-text-2)]'
                }`}
            >
              {tab.id !== 'geral' && (
                <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${SUBDEP_COLORS[tab.id].replace('text-', 'bg-')}`} />
              )}
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Conteúdo da aba */}
      {activeTab === 'geral' ? (
        /* Grid visão geral */
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--color-text-3)] w-44">
                    Domingo
                  </th>
                  {visibleSubdeps.map(s => (
                    <th key={s} className="px-3 py-3 text-xs font-semibold text-center min-w-[120px]">
                      <span className={SUBDEP_COLORS[s]}>{subdepLabel(s)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {domingos.map((domingo, idx) => {
                  const tema = sundayTheme(domingo)
                  return (
                    <tr key={domingo} className={`border-b border-[var(--color-border)] last:border-0 ${idx % 2 !== 0 ? 'bg-[var(--color-bg-2)]/40' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-[var(--color-text-1)]">{formatDomingoShort(domingo)}</p>
                        <p className="text-2xs text-[var(--color-text-3)] mt-0.5">{tema}</p>
                      </td>
                      {visibleSubdeps.map(subdep => (
                        <td key={subdep} className="px-3 py-3">
                          <GridCell
                            briefing={getBriefing(domingo, subdep)}
                            readOnly={!canEdit(subdep)}
                            onClick={() => setModal({ domingo, subdep })}
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        subdepListContent(activeTab)
      )}

      {/* Modal de edição */}
      {modal && (
        <BriefingModal
          open={!!modal}
          onClose={() => setModal(null)}
          briefing={activeModal}
          cicloId={ciclo.id}
          domingo={modal.domingo}
          subdep={modal.subdep}
          readOnly={!canEdit(modal.subdep)}
          isRegente={isRegente || isLiderGeral}
          onSave={() => loadBriefings(true)}
        />
      )}
    </div>
  )
}
