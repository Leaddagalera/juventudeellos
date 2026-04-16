import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Save, Clock, CheckCircle, AlertCircle, Edit2, Plus, Trash2, Music, Youtube, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { Card, EmptyState, Skeleton } from '../components/ui/Card.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Input, Textarea, ChipSelect } from '../components/ui/Input.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Modal } from '../components/ui/Modal.jsx'
import { subdepLabel } from '../lib/utils.js'
import { useSysConfig } from '../lib/sysConfig.js'
import { isEnsaioSunday } from '../lib/scheduleEngine.js'

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

// ── CPAD EBD data ─────────────────────────────────────────────────────────────
// Source: https://www.estudantesdabiblia.com.br/cpad-sumario-jovens-2026-2t.htm
// Tema: "Entre a verdade e o engano — Combatendo ideologias e ensinos que se
//        opõem à palavra de Deus" — comentado por Eduardo Leandro Alves
const CPAD_LESSONS = {
  '2026-Q2': {
    inicio: '2026-04-05', // first Sunday of Q2 2026 (local date)
    licoes: [
      { licao: 1,  titulo: 'O que é uma ideologia' },
      { licao: 2,  titulo: 'A falácia do Materialismo Histórico' },
      { licao: 3,  titulo: 'A falácia do Relativismo Ético-moral' },
      { licao: 4,  titulo: 'A falácia da Ideologia de Gênero' },
      { licao: 5,  titulo: 'A falácia da Teologia Progressista' },
      { licao: 6,  titulo: 'A falácia do Humanismo' },
      { licao: 7,  titulo: 'A falácia da Teoria Darwiniana' },
      { licao: 8,  titulo: 'A falácia do Pragmatismo' },
      { licao: 9,  titulo: 'A falácia do Ateísmo' },
      { licao: 10, titulo: 'A falácia da Teoria do Deísmo' },
      { licao: 11, titulo: 'A falácia da Teologia da Prosperidade' },
      { licao: 12, titulo: 'A falácia do Triunfalismo' },
      { licao: 13, titulo: 'O discernimento do cristão' },
    ],
  },
}

// Returns the EBD lesson object for a given Sunday date string (YYYY-MM-DD)
function getEbdLesson(sundayStr) {
  for (const key of Object.keys(CPAD_LESSONS)) {
    const tri = CPAD_LESSONS[key]
    const start = new Date(tri.inicio + 'T00:00:00')  // local midnight
    const d     = new Date(sundayStr  + 'T00:00:00')  // local midnight
    const weekIndex = Math.round((d - start) / (7 * 24 * 60 * 60 * 1000))
    if (weekIndex >= 0 && weekIndex < tri.licoes.length) {
      return tri.licoes[weekIndex]
    }
  }
  return null
}

// Extrai o ID do vídeo de qualquer formato de URL do YouTube
function extractYouTubeId(url) {
  if (!url) return null
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}

const SUBDEPS = ['regencia', 'ebd', 'recepcao', 'midia']

const SUBDEP_COLORS = {
  regencia: 'text-blue-400',
  ebd:      'text-emerald-400',
  recepcao: 'text-amber-400',
  midia:    'text-pink-400',
  ensaio:   'text-violet-400',
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
  const [form,     setForm]     = useState({})
  const [loading,  setLoading]  = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [membros,  setMembros]  = useState([])
  const [regentes, setRegentes] = useState([])

  useEffect(() => {
    if (open) {
      const base = briefing?.dados_json || {}
      // Auto-preenche defaults por subdep
      const defaults = { tema_culto: tema }
      if (subdep === 'midia') {
        defaults.tema = tema
        defaults.metas = '10 minutos de vídeo útil + 10 fotos boas para carrossel'
      }
      setForm({ ...defaults, ...base })
      setSaved(false)

      // Carrega membros para dropdowns de Regência
      if (subdep === 'regencia') {
        supabase.from('users').select('id, nome, role, subdepartamento').eq('ativo', true)
          .then(({ data }) => {
            const todos = data || []
            setMembros(todos)
            // Líderes de regência: role lider_geral ou lider_funcao com subdep regencia
            setRegentes(todos.filter(m => {
              if (m.role === 'lider_geral') return true
              const subdeps = Array.isArray(m.subdepartamento)
                ? m.subdepartamento
                : m.subdepartamento ? [m.subdepartamento] : []
              return (m.role === 'lider_funcao') && subdeps.includes('regencia')
            }))
          })
      }
    }
  }, [open, briefing, tema, subdep])

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
      footer={!readOnly ? (
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

            {/* Link do YouTube */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--color-text-2)] flex items-center gap-1.5">
                <Youtube size={13} className="text-red-500" />
                Link do hino (YouTube)
              </label>
              <input
                className="input-base"
                placeholder="https://youtube.com/watch?v=..."
                value={form.youtube_link || ''}
                onChange={e => set('youtube_link', e.target.value)}
                disabled={readOnly}
                type="url"
                inputMode="url"
              />
              {/* Thumbnail preview */}
              {(() => {
                const vid = extractYouTubeId(form.youtube_link)
                if (!vid) return null
                return (
                  <a
                    href={`https://www.youtube.com/watch?v=${vid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative block rounded-xl overflow-hidden border border-[var(--color-border)] hover:border-primary-400 transition-colors"
                  >
                    <img
                      src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`}
                      alt="Thumbnail do hino"
                      className="w-full h-auto object-cover"
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex items-center gap-1.5 bg-white/90 dark:bg-black/70 text-xs font-semibold px-3 py-1.5 rounded-full text-[var(--color-text-1)]">
                        <ExternalLink size={12} />
                        Abrir no YouTube
                      </div>
                    </div>
                  </a>
                )
              })()}
            </div>

            {/* Regente */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--color-text-2)]">Regente</label>
              <select
                value={form.regente_id || ''}
                onChange={e => {
                  const m = regentes.find(r => r.id === e.target.value)
                  set('regente_id', e.target.value)
                  set('regente_nome', m?.nome || '')
                }}
                disabled={readOnly}
                className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--color-bg-1)] border border-[var(--color-border)] text-[var(--color-text-1)] focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              >
                <option value="">Selecionar regente…</option>
                {regentes.map(m => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
            </div>

            {/* Solistas (rapaz + moça) */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--color-text-2)]">Solista (rapaz)</label>
                <select
                  value={form.solo_rapaz_id || ''}
                  onChange={e => {
                    const m = membros.find(r => r.id === e.target.value)
                    set('solo_rapaz_id', e.target.value)
                    set('solo_rapaz', m?.nome || '')
                  }}
                  disabled={readOnly}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--color-bg-1)] border border-[var(--color-border)] text-[var(--color-text-1)] focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                >
                  <option value="">Nenhum</option>
                  {membros.map(m => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--color-text-2)]">Solista (moça)</label>
                <select
                  value={form.solo_moca_id || ''}
                  onChange={e => {
                    const m = membros.find(r => r.id === e.target.value)
                    set('solo_moca_id', e.target.value)
                    set('solo_moca', m?.nome || '')
                  }}
                  disabled={readOnly}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--color-bg-1)] border border-[var(--color-border)] text-[var(--color-text-1)] focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                >
                  <option value="">Nenhuma</option>
                  {membros.map(m => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>
              </div>
            </div>

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
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--color-text-3)]">Conteúdo CPAD — editável</span>
              <a
                href={`https://www.google.com/search?q=CPAD+jovens+2026+segundo+trimestre+${form.licao ? `lição+${form.licao}` : (form.titulo ? encodeURIComponent(form.titulo) : 'EBD')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary-500 hover:text-primary-400 font-medium"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                Buscar na Web
              </a>
            </div>
            <Input
              label="Título da lição"
              placeholder="Ex: A falácia do Materialismo Histórico"
              value={form.titulo || ''}
              onChange={e => set('titulo', e.target.value)}
              disabled={readOnly}
            />
            <Input
              label="Base bíblica"
              placeholder="Ex: Colossenses 2.8"
              value={form.texto_base || ''}
              onChange={e => set('texto_base', e.target.value)}
              disabled={readOnly}
            />
            <Textarea
              label="Observações"
              placeholder="Informações adicionais para a equipe..."
              value={form.observacoes || ''}
              onChange={e => set('observacoes', e.target.value)}
              rows={2}
              disabled={readOnly}
            />
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

// ── Modal de briefing de ensaio ──────────────────────────────────────────────
function EnsaioModal({ open, onClose, briefing, cicloId, domingo, readOnly, onSave }) {
  const [form, setForm] = useState({ hinos: [], observacoes: '' })
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [membros, setMembros] = useState([])

  useEffect(() => {
    if (open) {
      const base = briefing?.dados_json || {}
      setForm({
        hinos: Array.isArray(base.hinos) ? base.hinos : [],
        observacoes: base.observacoes || '',
      })
      setSaved(false)
      // Carregar membros ativos da regência para dropdown de solista
      supabase
        .from('users')
        .select('id, nome')
        .eq('ativo', true)
        .then(({ data }) => {
          const regenciaMembers = (data || []).filter(m => {
            // Buscar todos os membros (líderes podem escalar qualquer um)
            return true
          })
          setMembros(regenciaMembers)
        })
    }
  }, [open, briefing])

  const addHino = () => {
    setForm(f => ({
      ...f,
      hinos: [...f.hinos, { nome: '', tom: '', solista_id: '', solista_nome: '', instrumentos: [] }]
    }))
  }

  const removeHino = (index) => {
    setForm(f => ({ ...f, hinos: f.hinos.filter((_, i) => i !== index) }))
  }

  const updateHino = (index, field, value) => {
    setForm(f => {
      const hinos = [...f.hinos]
      hinos[index] = { ...hinos[index], [field]: value }
      // Se mudou o solista_id, atualizar solista_nome
      if (field === 'solista_id') {
        const membro = membros.find(m => m.id === value)
        hinos[index].solista_nome = membro?.nome || ''
      }
      return { ...f, hinos }
    })
  }

  const handleSave = async () => {
    setLoading(true)
    setSaved(false)
    try {
      const query = briefing?.id
        ? supabase.from('briefings').update({ dados_json: form }).eq('id', briefing.id)
        : supabase.from('briefings').insert({
            ciclo_id: cicloId,
            subdepartamento: 'regencia',
            domingo,
            dados_json: form,
            tipo: 'ensaio',
          })

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
      title={`Ensaio — ${formatDomingoShort(domingo)}`}
      size="lg"
      footer={!readOnly ? (
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
      <div className="space-y-4">
        {/* Lista de hinos */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[var(--color-text-2)] uppercase tracking-wide">Hinos</label>
            {!readOnly && (
              <Button variant="secondary" size="xs" onClick={addHino}>
                <Plus size={12} />
                Adicionar hino
              </Button>
            )}
          </div>

          {form.hinos.length === 0 && (
            <div className="text-center py-6 text-sm text-[var(--color-text-3)]">
              Nenhum hino adicionado. Clique em "Adicionar hino" para começar.
            </div>
          )}

          {form.hinos.map((hino, idx) => (
            <div key={idx} className="p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-2)]/50 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--color-text-2)] flex items-center gap-1.5">
                  <Music size={12} />
                  Hino {idx + 1}
                </span>
                {!readOnly && (
                  <button onClick={() => removeHino(idx)} className="text-red-400 hover:text-red-300 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <Input
                label="Nome do hino"
                placeholder="Ex: Grande é o Senhor"
                value={hino.nome || ''}
                onChange={e => updateHino(idx, 'nome', e.target.value)}
                disabled={readOnly}
              />

              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Tom"
                  placeholder="Ex: G maior"
                  value={hino.tom || ''}
                  onChange={e => updateHino(idx, 'tom', e.target.value)}
                  disabled={readOnly}
                />

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--color-text-2)]">Solista</label>
                  <select
                    value={hino.solista_id || ''}
                    onChange={e => updateHino(idx, 'solista_id', e.target.value)}
                    disabled={readOnly}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--color-bg-1)] border border-[var(--color-border)] text-[var(--color-text-1)] focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                  >
                    <option value="">Sem solista</option>
                    {membros.map(m => (
                      <option key={m.id} value={m.id}>{m.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--color-text-2)]">Instrumentos necessários</label>
                <ChipSelect
                  options={INSTRUMENT_OPTS}
                  selected={hino.instrumentos || []}
                  onChange={v => updateHino(idx, 'instrumentos', v)}
                  disabled={readOnly}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Observações gerais */}
        <Textarea
          label="Observações gerais"
          placeholder="Instruções adicionais para o ensaio..."
          value={form.observacoes || ''}
          onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
          rows={3}
          disabled={readOnly}
        />
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
  const ensaioWeek = sysConfig?.ensaio_week ?? 2

  const [ciclo,        setCiclo]        = useState(null)
  const [domingos,     setDomingos]     = useState([])
  const [briefings,    setBriefings]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [modal,        setModal]        = useState(null)
  const [ensaioModal,  setEnsaioModal]  = useState(null) // { domingo }
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

      // Parse as local midnight to avoid UTC-offset date shift (same as Availability.jsx)
      const end  = new Date(c.fim   + 'T00:00:00')
      const suns = []
      const d    = new Date(c.inicio + 'T00:00:00')
      while (d.getDay() !== 0) d.setDate(d.getDate() + 1)
      while (d <= end) {
        const y  = d.getFullYear()
        const mo = String(d.getMonth() + 1).padStart(2, '0')
        const dy = String(d.getDate()).padStart(2, '0')
        suns.push(`${y}-${mo}-${dy}`)
        d.setDate(d.getDate() + 7)
      }
      setDomingos(suns)

      const { data: bris } = await supabase.from('briefings').select('*').eq('ciclo_id', c.id)

      // Auto-populate EBD briefings from CPAD data for any Sunday that has no record yet
      const missing = suns.filter(
        domingo => !bris?.find(b => b.domingo === domingo && b.subdepartamento === 'ebd')
      )
      if (missing.length > 0) {
        const toInsert = missing
          .map(domingo => {
            const lesson = getEbdLesson(domingo)
            if (!lesson) return null
            return { ciclo_id: c.id, subdepartamento: 'ebd', domingo, dados_json: { licao: lesson.licao, titulo: lesson.titulo } }
          })
          .filter(Boolean)
        if (toInsert.length > 0) {
          await supabase.from('briefings').insert(toInsert)
          const { data: refreshed } = await supabase.from('briefings').select('*').eq('ciclo_id', c.id)
          setBriefings(refreshed || [])
          return
        }
      }

      setBriefings(bris || [])
    } catch (err) {
      console.error('[Briefing]', err)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => { loadBriefings() }, [loadBriefings])

  const getBriefing = (domingo, subdep) =>
    briefings.find(b => b.domingo === domingo && b.subdepartamento === subdep && b.tipo !== 'ensaio')

  const STATUS_LABEL = {
    briefing_regente: 'Preenchimento — Regentes',
    briefing_lider:   'Preenchimento — Líderes',
    disponibilidade:  'Disponibilidade aberta',
    escala_publicada: 'Escala publicada',
    confirmacoes:     'Confirmações',
    encerrado:        'Encerrado',
  }

  // Briefings só são editáveis durante as fases de preenchimento,
  // e cada fase libera apenas o papel correto.
  const canEdit = (subdep) => {
    if (!ciclo) return false
    const { status } = ciclo
    if (status !== 'briefing_regente' && status !== 'briefing_lider') return false
    if (isLiderGeral) return true
    // briefing_regente → somente regentes editam 'regencia'
    if (status === 'briefing_regente') return subdep === 'regencia' && mySubdeps.includes('regencia')
    // briefing_lider → lider_funcao edita seus subdeps
    if (status === 'briefing_lider') return isLiderFuncao && mySubdeps.includes(subdep)
    return false
  }

  // Ensaio briefings: filtrar por tipo = 'ensaio'
  const getEnsaioBriefing = (domingo) =>
    briefings.find(b => b.domingo === domingo && b.tipo === 'ensaio')

  // Ensaio: editável até o dia do domingo (não depende da fase do ciclo)
  const canEditEnsaio = (domingo) => {
    if (!ciclo) return false
    if (isLiderGeral) return true
    if (isLiderFuncao && (profile?.subdep_lider === 'regencia' || mySubdeps.includes('regencia'))) {
      const sundayDate = new Date(domingo + 'T23:59:59')
      return sundayDate >= new Date()
    }
    return false
  }

  // Domingos de ensaio dentro do ciclo (2º domingo do mês)
  const ensaioDomingos = domingos.filter(d => isEnsaioSunday(d, ensaioWeek))

  // Aba Ensaio visível para quem tem acesso a regência
  const showEnsaioTab = isLiderGeral || mySubdeps.includes('regencia') || profile?.subdep_lider === 'regencia'

  const isEditPhase = ciclo && ['briefing_regente', 'briefing_lider'].includes(ciclo.status)

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
  const baseTabs = isLiderGeral
    ? [{ id: 'geral', label: 'Visão Geral' }, ...mySubdeps.map(s => ({ id: s, label: subdepLabel(s) }))]
    : visibleSubdeps.map(s => ({ id: s, label: subdepLabel(s) }))
  const tabs = showEnsaioTab
    ? [...baseTabs, { id: 'ensaio', label: 'Ensaio' }]
    : baseTabs

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
          <p className="text-xs text-[var(--color-text-3)]">
            {ciclo ? (STATUS_LABEL[ciclo.status] || ciclo.status) : ''}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => loadBriefings(false)}>
          <RefreshCw size={13} />
          Atualizar
        </Button>
      </div>

      {/* Banner de fase */}
      {ciclo && !isEditPhase && (
        <div className="alert-strip info">
          <AlertCircle size={13} />
          <span>Briefings em modo de leitura — fase atual: <strong>{STATUS_LABEL[ciclo.status] || ciclo.status}</strong></span>
        </div>
      )}
      {ciclo?.status === 'briefing_regente' && !isLiderGeral && !mySubdeps.includes('regencia') && (
        <div className="alert-strip info">
          <AlertCircle size={13} />
          <span>Aguardando preenchimento das Regentes. Briefings em leitura para os demais.</span>
        </div>
      )}

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
                  const isEnsaio = isEnsaioSunday(domingo, ensaioWeek)
                  return (
                    <tr key={domingo} className={`border-b border-[var(--color-border)] last:border-0 ${idx % 2 !== 0 ? 'bg-[var(--color-bg-2)]/40' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-[var(--color-text-1)]">{formatDomingoShort(domingo)}</p>
                        <p className="text-2xs text-[var(--color-text-3)] mt-0.5">{tema}</p>
                        {isEnsaio && (
                          <Badge variant="blue" className="text-2xs mt-1">Ensaio</Badge>
                        )}
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
      ) : activeTab === 'ensaio' ? (
        /* Lista de domingos de ensaio */
        <div className="space-y-2">
          {ensaioDomingos.length === 0 && (
            <EmptyState icon={Music} title="Sem ensaios neste ciclo" description="Nenhum 2º domingo encontrado neste período." />
          )}
          {ensaioDomingos.map(domingo => {
            const b = getEnsaioBriefing(domingo)
            const hinosCount = b?.dados_json?.hinos?.length || 0
            const editable = canEditEnsaio(domingo)
            return (
              <button
                key={domingo}
                onClick={() => setEnsaioModal({ domingo })}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl surface border border-[var(--color-border)] hover:bg-[var(--color-bg-2)] transition-colors"
              >
                <div className="text-left">
                  <p className="text-sm font-medium text-[var(--color-text-1)]">{formatDomingoShort(domingo)}</p>
                  <p className="text-2xs text-[var(--color-text-3)]">
                    {hinosCount > 0 ? `${hinosCount} hino${hinosCount > 1 ? 's' : ''}` : 'Sem hinos'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={hinosCount > 0 ? 'green' : 'amber'}>
                    {hinosCount > 0 ? 'Preenchido' : 'Pendente'}
                  </Badge>
                  {editable && <Edit2 size={13} className="text-[var(--color-text-3)]" />}
                </div>
              </button>
            )
          })}
        </div>
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

      {/* Modal de ensaio */}
      {ensaioModal && (
        <EnsaioModal
          open={!!ensaioModal}
          onClose={() => setEnsaioModal(null)}
          briefing={getEnsaioBriefing(ensaioModal.domingo)}
          cicloId={ciclo.id}
          domingo={ensaioModal.domingo}
          readOnly={!canEditEnsaio(ensaioModal.domingo)}
          onSave={() => loadBriefings(true)}
        />
      )}
    </div>
  )
}
