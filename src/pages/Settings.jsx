import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Wifi, MessageSquare, Zap, SlidersHorizontal, ShieldCheck,
  Save, CheckCircle2, XCircle, AlertTriangle, Eye, EyeOff,
  RotateCcw, Loader2, Settings2, Info, QrCode, RefreshCw, Unlink, CalendarDays, Bell,
} from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { Card, CardSection } from '../components/ui/Card.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Input, Textarea, Toggle } from '../components/ui/Input.jsx'
import {
  DEFAULT_MESSAGES,
  DEFAULT_AUTOMATIONS,
  DEFAULT_CONDITIONS,
  DEFAULT_ROLE_FILTERS,
  invalidateWhatsAppConfig,
} from '../lib/whatsapp.js'
import {
  testConnection as apiTestConnection,
  sendWhatsApp,
  invalidateConfigCache,
} from '../services/whatsapp.js'
import { cn } from '../lib/utils.js'
import ProfilesManager from '../components/settings/ProfilesManager.jsx'
import EventsManager   from '../components/settings/EventsManager.jsx'
import DevModeManager  from '../components/settings/DevModeManager.jsx'

// ── Static metadata ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'conexao',    label: 'Conexão',    icon: Wifi },
  { id: 'mensagens',  label: 'Mensagens',  icon: MessageSquare },
  { id: 'automacoes', label: 'Automações', icon: Zap },
  { id: 'condicoes',  label: 'Condições',  icon: SlidersHorizontal },
  { id: 'perfis',     label: 'Perfis',     icon: ShieldCheck },
  { id: 'eventos',       label: 'Eventos',       icon: CalendarDays },
  { id: 'notificacoes', label: 'Notificações', icon: Bell },
  { id: 'modo_dev',     label: 'Dev',           icon: Settings2 },
]

export const MSG_META = {
  briefingRegentesAberto:   { label: 'Briefing de Regência — Abertura',     vars: ['{nome}', '{prazo}', '{app_url}'] },
  briefingLideresAberto:    { label: 'Briefing de Líderes — Abertura',       vars: ['{nome}', '{subdep}', '{prazo}', '{app_url}'] },
  disponibilidadeAberta:    { label: 'Disponibilidade — Abertura',           vars: ['{nome}', '{prazo}', '{app_url}'] },
  lembreteMetadePrazo:      { label: 'Lembrete — 50% do Prazo',              vars: ['{nome}', '{tipo}', '{app_url}'] },
  lembrete90Prazo:          { label: 'Lembrete — 90% do Prazo',              vars: ['{nome}', '{tipo}', '{app_url}'] },
  encerramentoNaoPreencheu: { label: 'Encerramento — Não Preencheu',         vars: ['{nome}', '{tipo}'] },
  encerramentoResumoLider:  { label: 'Encerramento — Resumo para Líder',     vars: ['{tipo}', '{total}', '{preencheram}', '{qtd}', '{naoPreencher}', '{app_url}'] },
  escalaPublicada:          { label: 'Escala Publicada',                      vars: ['{nome}', '{lista}', '{app_url}'] },
  sextaSemConfirmacao:      { label: 'Sexta — Sem Confirmação',               vars: ['{nome}', '{domingo}', '{app_url}'] },
  sabadoSemConfirmacao:     { label: 'Sábado — Sem Confirmação',              vars: ['{nome}', '{domingo}', '{app_url}'] },
  sabadoAlertaLider:        { label: 'Sábado — Alerta Líder',                 vars: ['{domingo}', '{qtd}', '{pendentes}', '{app_url}'] },
  trocaSolicitada:          { label: 'Troca Solicitada',                      vars: ['{solicitante}', '{domingo}', '{motivo}', '{app_url}'] },
  trocaAprovada:            { label: 'Troca Aprovada',                        vars: ['{nome}', '{domingo}'] },
  trocaRecusada:            { label: 'Troca Recusada',                        vars: ['{nome}', '{domingo}', '{motivo}'] },
  segundaVisita:            { label: '2ª Visita de Visitante',                vars: ['{visitante}', '{data}'] },
  tarjaNegativaAlerta:      { label: 'Alerta — Tarja Negativa',               vars: ['{membro}', '{tarja}', '{diasSemAlteracao}'] },
  aniversario:              { label: 'Aniversário de Membro',                 vars: ['{membro}', '{data}'] },
  novoCadastroPendente:     { label: 'Novo Cadastro Pendente',                vars: ['{nome}', '{subdep}', '{app_url}'] },
  midiaPendente:            { label: 'Conteúdo de Mídia Pendente',            vars: ['{descricao}', '{enviado_por}', '{app_url}'] },
  membroAprovado:           { label: 'Cadastro Aprovado — Membro',            vars: ['{nome}', '{app_url}'] },
  cicloFaseAgradecimento:   { label: 'Ciclo — Fase Concluída (Agradecimento)', vars: ['{nome}', '{tipo}', '{app_url}'] },
  cicloFasePendencia:       { label: 'Ciclo — Fase com Pendência (Cobrança)', vars: ['{nome}', '{tipo}', '{app_url}'] },
  comunicadoPublicado: { label: 'Comunicado Publicado',        vars: ['{texto_preview}', '{destinatario}', '{app_url}'] },
  briefingPreenchido:  { label: 'Briefing Preenchido',         vars: ['{autor}', '{subdep}', '{domingo}', '{app_url}'] },
  visitanteIntegrado:  { label: 'Visitante Integrado',         vars: ['{visitante}'] },
  relatorioSemanal:             { label: 'Relatório Semanal (segunda)', vars: ['{ativos}', '{confirmados}', '{escalados}', '{visitantes}', '{trocas}', '{app_url}'] },
  escalaPublicadaObservador:   { label: 'Escala Publicada — Observador', vars: ['{nome}', '{app_url}'] },
}

const AUTOMATION_GROUPS = [
  { label: 'Ciclo — Feedback de Fase',            type: 'event',     keys: ['cicloFaseAgradecimento', 'cicloFasePendencia'] },
  { label: 'Ciclo — Briefings',                   type: 'event',     keys: ['briefingRegentesAberto', 'briefingLideresAberto'] },
  { label: 'Ciclo — Disponibilidade',             type: 'event',     keys: ['disponibilidadeAberta'] },
  { label: 'Ciclo — Lembretes de Prazo',          type: 'scheduled', keys: ['lembreteMetadePrazo', 'lembrete90Prazo', 'encerramentoNaoPreencheu', 'encerramentoResumoLider'] },
  { label: 'Escalas — Publicação',                type: 'event',     keys: ['escalaPublicada', 'escalaPublicadaObservador'] },
  { label: 'Escalas — Confirmações',              type: 'scheduled', keys: ['sextaSemConfirmacao', 'sabadoSemConfirmacao', 'sabadoAlertaLider'] },
  { label: 'Trocas',                              type: 'event',     keys: ['trocaSolicitada', 'trocaAprovada', 'trocaRecusada'] },
  { label: 'Pastoral — Visitas e Tarjas',         type: 'event',     keys: ['segundaVisita', 'tarjaNegativaAlerta'] },
  { label: 'Pastoral — Aniversários',             type: 'scheduled', keys: ['aniversario'] },
  { label: 'Sistema',                             type: 'event',     keys: ['novoCadastroPendente', 'midiaPendente', 'membroAprovado'] },
  { label: 'Notificações — Publicações',       type: 'event',     keys: ['comunicadoPublicado', 'briefingPreenchido'] },
  { label: 'Notificações — Pastoral',          type: 'event',     keys: ['visitanteIntegrado'] },
  { label: 'Notificações — Relatório Semanal', type: 'scheduled', keys: ['relatorioSemanal'] },
]

const ROLE_OPTIONS = [
  { value: 'lider_geral',       label: 'Líder Geral' },
  { value: 'lider_funcao',      label: 'Líder Função' },
  { value: 'membro_serve',      label: 'Serve' },
  { value: 'membro_observador', label: 'Observador' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function Settings() {
  const { isLiderGeral, profile } = useAuth()
  const [tab,          setTab]          = useState('conexao')
  const [loadingConfig, setLoadingConfig] = useState(true)

  // config sections
  const [connection,  setConnection]  = useState({ base_url: '', instance: '', api_key: '', enabled: false })
  const [messages,    setMessages]    = useState({})
  const [automations, setAutomations] = useState({ ...DEFAULT_AUTOMATIONS })
  const [conditions,  setConditions]  = useState({ ...DEFAULT_CONDITIONS })
  const [appUrl,      setAppUrl]      = useState('')
  const [roleFilters, setRoleFilters] = useState({})

  // ui
  const [showKey,    setShowKey]    = useState(false)
  const [testing,    setTesting]    = useState(false)
  const [testResult, setTestResult] = useState(null)   // 'ok' | 'warn' | 'error'
  const [testMsg,    setTestMsg]    = useState('')
  const [saving,     setSaving]     = useState(false)
  const [savedKey,   setSavedKey]   = useState(null)

  // QR code / WhatsApp connection
  const [qrData,       setQrData]       = useState(null)   // base64 string
  const [qrLoading,    setQrLoading]    = useState(false)
  const [qrError,      setQrError]      = useState('')
  const [waState,      setWaState]      = useState(null)   // 'open' | 'connecting' | 'close'
  const pollRef      = useRef(null)
  const mountedRef   = useRef(true)
  const connectionRef = useRef(connection)

  // Keep connectionRef in sync without triggering effects
  useEffect(() => { connectionRef.current = connection }, [connection])
  // Track mount/unmount
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; stopPoll() } }, [])

  // ── Load ────────────────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    setLoadingConfig(true)
    try {
      const { data } = await supabase
        .from('app_config')
        .select('key, value')
        .in('key', ['whatsapp_connection', 'whatsapp_messages', 'whatsapp_automations', 'whatsapp_conditions', 'whatsapp_role_filters', 'app_url'])

      const cfg = {}
      for (const row of (data || [])) cfg[row.key] = row.value

      if (cfg.whatsapp_connection) setConnection(cfg.whatsapp_connection)
      if (cfg.whatsapp_messages)   setMessages(cfg.whatsapp_messages)
      if (cfg.app_url)             setAppUrl(cfg.app_url)
      setAutomations({ ...DEFAULT_AUTOMATIONS, ...(cfg.whatsapp_automations || {}) })
      setConditions({ ...DEFAULT_CONDITIONS,   ...(cfg.whatsapp_conditions  || {}) })
      if (cfg.whatsapp_role_filters) setRoleFilters(cfg.whatsapp_role_filters)
    } catch (err) {
      console.error('[Settings] load error', err)
    } finally {
      setLoadingConfig(false)
    }
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])

  // ── Save ─────────────────────────────────────────────────────────────────────
  const save = async (key, value) => {
    setSaving(true)
    setSavedKey(null)
    try {
      const { error } = await supabase
        .from('app_config')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      if (error) throw error

      invalidateWhatsAppConfig()
      invalidateConfigCache()
      setSavedKey(key)
      setTimeout(() => setSavedKey(null), 3000)
    } catch (err) {
      alert('Erro ao salvar: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Test connection ──────────────────────────────────────────────────────────
  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    setTestMsg('')
    try {
      const { base_url, instance, api_key } = connection
      if (!base_url || !instance || !api_key) {
        setTestResult('error')
        setTestMsg('Preencha todos os campos antes de testar.')
        return
      }

      // Salva automaticamente antes de testar — evita perda dos dados ao navegar
      await supabase
        .from('app_config')
        .upsert({ key: 'whatsapp_connection', value: connection, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      invalidateWhatsAppConfig()
      invalidateConfigCache()

      const { status, message } = await apiTestConnection({
        url: base_url, apiKey: api_key, instance,
      })
      if (status === 'open') {
        setTestResult('ok')
      } else if (status === 'error' || status === 'not_found') {
        setTestResult('error')
      } else {
        setTestResult('warn')
      }
      setTestMsg(message)
    } catch (err) {
      setTestResult('error')
      setTestMsg('Falha ao conectar: ' + err.message)
    } finally {
      setTesting(false)
    }
  }

  // ── WhatsApp QR / Connection ─────────────────────────────────────────────────
  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }

  const fetchWaState = async () => {
    const { base_url, instance, api_key } = connectionRef.current
    if (!base_url || !instance || !api_key) return null
    try {
      const res  = await fetch(`${base_url.replace(/\/$/, '')}/instance/connectionState/${instance}`, { headers: { apikey: api_key } })
      const json = await res.json().catch(() => ({}))
      return json?.instance?.state || json?.state || null
    } catch { return null }
  }

  const connectWhatsApp = async () => {
    const { base_url, instance, api_key } = connectionRef.current
    if (!base_url || !instance || !api_key) {
      setQrError('Salve as credenciais antes de conectar.')
      return
    }
    setQrLoading(true)
    setQrData(null)
    setQrError('')
    setWaState(null)
    stopPoll()

    // Clear any stale QR from Supabase
    await supabase.from('app_config').upsert([
      { key: 'whatsapp_qr', value: null },
      { key: 'whatsapp_qr_ts', value: null },
    ], { onConflict: 'key' })

    try {
      // Trigger connection on Evolution API (QR delivered via webhook → Supabase)
      await fetch(`${base_url.replace(/\/$/, '')}/instance/connect/${instance}`, { headers: { apikey: api_key } }).catch(() => {})
    } catch { /* ignore */ }

    setQrLoading(false)
    setQrError('')

    // Poll Supabase every 3s for QR code or connected state (max 3 min)
    let ticks = 0
    pollRef.current = setInterval(async () => {
      if (!mountedRef.current) { stopPoll(); return }
      ticks++
      const { data } = await supabase
        .from('app_config')
        .select('key, value')
        .in('key', ['whatsapp_qr', 'whatsapp_state'])
      if (!mountedRef.current) { stopPoll(); return }
      const cfg = {}
      for (const row of (data || [])) cfg[row.key] = row.value
      const state = cfg.whatsapp_state
      const qr    = cfg.whatsapp_qr
      if (state) setWaState(state)
      if (qr && typeof qr === 'string' && qr.length > 10) {
        setQrData(qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`)
      }
      if (state === 'open') {
        stopPoll()
        setQrData(null)
        setTestResult('ok')
        setTestMsg('✓ WhatsApp conectado e ativo!')
      }
      if (ticks > 60) {   // 3 min timeout
        stopPoll()
        if (!qr) setQrError('Tempo esgotado. Verifique o servidor e tente novamente.')
      }
    }, 3000)
  }

  const disconnectWhatsApp = async () => {
    const { base_url, instance, api_key } = connectionRef.current
    if (!base_url || !instance || !api_key) return
    stopPoll()
    try {
      await fetch(`${base_url.replace(/\/$/, '')}/instance/logout/${instance}`, { method: 'DELETE', headers: { apikey: api_key } })
      setWaState('close')
      setQrData(null)
      setTestResult('warn')
      setTestMsg('WhatsApp desconectado.')
    } catch (err) {
      setQrError('Erro ao desconectar: ' + err.message)
    }
  }

  // Load initial WA state when switching to the connection tab (tab change only — NOT on every keystroke)
  useEffect(() => {
    if (tab !== 'conexao') return
    let cancelled = false
    // Load state from Supabase (set by webhook)
    supabase.from('app_config').select('key, value').in('key', ['whatsapp_state', 'whatsapp_qr']).then(({ data }) => {
      if (cancelled) return
      const cfg = {}
      for (const row of (data || [])) cfg[row.key] = row.value
      if (cfg.whatsapp_state) setWaState(cfg.whatsapp_state)
      if (cfg.whatsapp_qr && typeof cfg.whatsapp_qr === 'string' && cfg.whatsapp_qr.length > 10) {
        const qr = cfg.whatsapp_qr
        setQrData(qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`)
      }
    })
    fetchWaState().then(s => { if (!cancelled && s) setWaState(s) })
    return () => { cancelled = true; stopPoll() }
  }, [tab])  // ← only tab; connection values read from connectionRef at call time

  // ── Role filter toggle ───────────────────────────────────────────────────────
  function toggleRoleFilter(key, role) {
    setRoleFilters(prev => {
      const current = prev[key] ?? DEFAULT_ROLE_FILTERS[key] ?? []
      return {
        ...prev,
        [key]: current.includes(role)
          ? current.filter(r => r !== role)
          : [...current, role],
      }
    })
  }

  // ── Guards ───────────────────────────────────────────────────────────────────
  if (!isLiderGeral) {
    return (
      <div className="p-6 text-center text-sm text-[var(--color-text-3)]">
        Acesso restrito ao Líder Geral.
      </div>
    )
  }

  if (loadingConfig) {
    return (
      <div className="p-6 flex items-center justify-center min-h-48">
        <Loader2 size={20} className="animate-spin text-[var(--color-text-3)]" />
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-3xl mx-auto">

      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-[var(--color-text-1)] flex items-center gap-2">
          <Settings2 size={18} className="text-[var(--color-text-3)]" />
          Configurações
        </h2>
        <p className="text-xs text-[var(--color-text-3)]">Evolution API · WhatsApp &amp; automações</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-[var(--color-bg-2)] rounded-xl p-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors',
              tab === t.id
                ? 'bg-[var(--color-surface)] text-[var(--color-text-1)] shadow-card'
                : 'text-[var(--color-text-3)] hover:text-[var(--color-text-2)]'
            )}
          >
            <t.icon size={13} />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ────────────────────────────── TAB: CONEXÃO ────────────────────────── */}
      {tab === 'conexao' && (
        <Card>
          <CardSection title="Credenciais da Evolution API">
            <div className="space-y-3">

              <Input
                label="Base URL"
                placeholder="https://evo.seuservidor.com"
                value={connection.base_url}
                onChange={e => setConnection(c => ({ ...c, base_url: e.target.value }))}
                hint="URL raiz da sua instância Evolution API (sem barra no final)"
              />

              <Input
                label="Nome da Instância"
                placeholder="ellos-juventude"
                value={connection.instance}
                onChange={e => setConnection(c => ({ ...c, instance: e.target.value }))}
                hint="Nome exato da instância configurada no servidor"
              />

              {/* API Key com toggle de visibilidade */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[var(--color-text-2)]">API Key (Global)</label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    className="input-base w-full pr-10"
                    placeholder="••••••••••••••••••••••"
                    value={connection.api_key}
                    onChange={e => setConnection(c => ({ ...c, api_key: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-3)] hover:text-[var(--color-text-2)] transition-colors"
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-xs text-[var(--color-text-3)]">Chave de acesso global da Evolution API</p>
              </div>

              {/* Toggle ativar/desativar */}
              <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-[var(--color-bg-2)] mt-1">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-1)]">Ativar envio de mensagens</p>
                  <p className="text-xs text-[var(--color-text-3)] mt-0.5">
                    Quando desativado, notificações ficam em modo demo (apenas no console do navegador)
                  </p>
                </div>
                <Toggle
                  checked={connection.enabled}
                  onChange={v => setConnection(c => ({ ...c, enabled: v }))}
                />
              </div>

              {/* Resultado do teste */}
              {testResult && (
                <div className={cn(
                  'flex items-start gap-2 rounded-lg p-3 text-xs',
                  testResult === 'ok'
                    ? 'bg-success-50 dark:bg-success-500/10 text-success-700 dark:text-success-400 border border-success-200 dark:border-success-700'
                    : testResult === 'warn'
                    ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700'
                    : 'bg-danger-50 dark:bg-danger-500/10 text-danger-700 dark:text-danger-400 border border-danger-200 dark:border-danger-700'
                )}>
                  {testResult === 'ok'
                    ? <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
                    : testResult === 'warn'
                    ? <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                    : <XCircle      size={14} className="flex-shrink-0 mt-0.5" />
                  }
                  <span>{testMsg}</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1 flex-wrap">
                <Button size="sm" variant="secondary" onClick={testConnection} loading={testing}>
                  <Wifi size={13} /> Testar conexão
                </Button>
                <Button size="sm" onClick={() => save('whatsapp_connection', connection)} loading={saving}>
                  <Save size={13} />
                  {savedKey === 'whatsapp_connection' ? '✓ Salvo!' : 'Salvar'}
                </Button>
                {waState !== 'open' ? (
                  <Button size="sm" variant="secondary" onClick={connectWhatsApp} loading={qrLoading}>
                    <QrCode size={13} /> Conectar WhatsApp
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={disconnectWhatsApp}>
                    <Unlink size={13} /> Desconectar
                  </Button>
                )}
              </div>

              {/* Test message — sends to logged-in user's own WhatsApp */}
              <div className="pt-1 border-t border-[var(--color-border)] mt-1 space-y-2">
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={async () => {
                    const numero = profile?.whatsapp
                    if (!numero) {
                      setTestResult('error')
                      setTestMsg('Seu perfil não tem número de WhatsApp. Preencha em Perfil antes de testar.')
                      return
                    }
                    setTesting(true)
                    setTestResult(null)
                    setTestMsg('')
                    try {
                      const result = await sendWhatsApp({
                        numero,
                        mensagem: `🧪 *Teste Ellos Juventude*\n\nSe você recebeu esta mensagem, a integração com WhatsApp está funcionando! ✅\n\n_${new Date().toLocaleString('pt-BR')}_`,
                      })
                      if (result?.demo) {
                        setTestResult('warn')
                        setTestMsg('Modo demo — API não configurada. Verifique URL, API Key e Instância e clique em Salvar.')
                      } else {
                        setTestResult('ok')
                        setTestMsg(`Mensagem enviada para ${numero}! Verifique seu WhatsApp.`)
                      }
                    } catch (e) {
                      setTestResult('error')
                      setTestMsg('Erro ao enviar: ' + e.message)
                    } finally {
                      setTesting(false)
                    }
                  }}
                  loading={testing}
                >
                  Enviar mensagem de teste
                </Button>
                <p className="text-2xs text-[var(--color-text-3)]">
                  Envia para o seu próprio WhatsApp ({profile?.whatsapp || 'número não configurado no perfil'})
                </p>
              </div>

              {/* QR Code panel */}
              {(qrData || qrError || waState === 'open' || (waState === 'connecting' && pollRef.current)) && (
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 flex flex-col items-center gap-3">
                  {waState === 'open' && !qrData && (
                    <div className="flex items-center gap-2 text-success-600 dark:text-success-400 text-sm font-medium">
                      <CheckCircle2 size={18} /> WhatsApp conectado!
                    </div>
                  )}
                  {qrData && (
                    <>
                      <p className="text-xs text-[var(--color-text-2)] text-center">
                        Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo
                      </p>
                      <img
                        src={qrData}
                        alt="QR Code WhatsApp"
                        className="w-48 h-48 rounded-lg border border-[var(--color-border)]"
                      />
                      <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-3)]">
                        <Loader2 size={12} className="animate-spin" />
                        Aguardando leitura do QR code...
                      </div>
                      <Button size="xs" variant="secondary" onClick={connectWhatsApp} loading={qrLoading}>
                        <RefreshCw size={12} /> Gerar novo QR
                      </Button>
                    </>
                  )}
                  {qrError && (
                    <div className="flex flex-col gap-2 items-center">
                      <div className="flex items-center gap-2 text-xs text-danger-600 dark:text-danger-400">
                        <XCircle size={13} /> {qrError}
                      </div>
                      {connection.base_url && (
                        <a
                          href={`${connection.base_url.replace(/\/$/, '')}/manager`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary-600 dark:text-primary-400 underline hover:opacity-80"
                        >
                          Conectar pelo Manager externo →
                        </a>
                      )}
                    </div>
                  )}
                  {!qrData && !qrError && waState === 'connecting' && (
                    <div className="flex flex-col items-center gap-2 text-xs text-[var(--color-text-3)]">
                      <div className="flex items-center gap-1.5">
                        <Loader2 size={12} className="animate-spin" />
                        Aguardando QR code do servidor...
                      </div>
                      {connection.base_url && (
                        <a
                          href={`${connection.base_url.replace(/\/$/, '')}/manager`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary-600 dark:text-primary-400 underline hover:opacity-80"
                        >
                          Conectar pelo Manager externo →
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>
          </CardSection>

          <CardSection title="URL pública do sistema">
            <div className="space-y-3">
              <Input
                label="URL do sistema"
                placeholder="https://ellos-juventude.vercel.app"
                value={appUrl}
                onChange={e => setAppUrl(e.target.value)}
                hint="Link enviado nas mensagens do WhatsApp para os membros acessarem o app"
              />
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" onClick={() => save('app_url', appUrl)} loading={saving}>
                  <Save size={13} />
                  {savedKey === 'app_url' ? '✓ Salvo!' : 'Salvar URL'}
                </Button>
              </div>
            </div>
          </CardSection>
        </Card>
      )}

      {/* ────────────────────────────── TAB: MENSAGENS ──────────────────────── */}
      {tab === 'mensagens' && (
        <div className="space-y-3">

          <div className="flex items-start gap-2 rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 p-3">
            <Info size={14} className="text-primary-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-primary-700 dark:text-primary-300 leading-relaxed">
              Use{' '}
              <code className="font-mono bg-primary-100 dark:bg-primary-800 px-1 rounded">{'{variavel}'}</code>
              {' '}para inserir valores dinâmicos. As variáveis disponíveis estão listadas em cada mensagem.
              Suporta formatação WhatsApp: <strong>*negrito*</strong>, _itálico_, ~tachado~.
            </p>
          </div>

          {Object.entries(MSG_META).map(([key, meta]) => {
            const stored   = messages[key]
            const value    = stored !== undefined ? stored : DEFAULT_MESSAGES[key] ?? ''
            const isCustom = stored !== undefined && stored !== DEFAULT_MESSAGES[key]

            return (
              <Card key={key}>
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-[var(--color-text-1)]">{meta.label}</p>
                        {isCustom && (
                          <span className="text-2xs bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-400 px-1.5 py-0.5 rounded font-medium">
                            personalizada
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {meta.vars.map(v => (
                          <code
                            key={v}
                            className="text-2xs bg-[var(--color-bg-2)] text-primary-600 dark:text-primary-400 px-1.5 py-0.5 rounded font-mono cursor-help"
                            title={`Variável disponível: ${v}`}
                          >
                            {v}
                          </code>
                        ))}
                      </div>
                    </div>

                    {isCustom && (
                      <button
                        onClick={() => setMessages(m => { const n = { ...m }; delete n[key]; return n })}
                        className="flex-shrink-0 flex items-center gap-1 text-2xs text-[var(--color-text-3)] hover:text-danger-500 transition-colors"
                        title="Restaurar mensagem padrão"
                      >
                        <RotateCcw size={11} /> Padrão
                      </button>
                    )}
                  </div>

                  <Textarea
                    rows={4}
                    value={value}
                    onChange={e => setMessages(m => ({ ...m, [key]: e.target.value }))}
                    className="font-mono text-xs leading-relaxed"
                  />
                </div>
              </Card>
            )
          })}

          <Button
            fullWidth
            onClick={() => save('whatsapp_messages', messages)}
            loading={saving}
          >
            <Save size={14} />
            {savedKey === 'whatsapp_messages' ? '✓ Mensagens salvas!' : 'Salvar todas as mensagens'}
          </Button>

        </div>
      )}

      {/* ────────────────────────────── TAB: AUTOMAÇÕES ─────────────────────── */}
      {tab === 'automacoes' && (
        <div className="space-y-3">

          <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
            <Info size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              Automações desativadas não enviam mensagens mesmo com a API ativa —
              útil para pausar notificações específicas sem desativar tudo.
            </p>
          </div>

          {AUTOMATION_GROUPS.map(group => (
            <Card key={group.label}>
              <CardSection
                title={
                  <div className="flex items-center gap-2">
                    <span>{group.label}</span>
                    {group.type === 'event'
                      ? <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400">⚡ Imediato</span>
                      : <span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">🕐 Agendado</span>
                    }
                  </div>
                }
              >
                <div>
                  {group.keys.map(key => {
                    const enabled = automations[key] !== undefined ? automations[key] : true
                    return (
                      <div key={key} className="py-3 first:pt-0 last:pb-0 border-b border-[var(--color-border)] last:border-0">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <p className="text-sm text-[var(--color-text-1)] leading-snug">{MSG_META[key]?.label || key}</p>
                          <Toggle
                            checked={enabled}
                            onChange={v => setAutomations(a => ({ ...a, [key]: v }))}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {ROLE_OPTIONS.map(r => {
                            const allowed = (roleFilters[key] ?? DEFAULT_ROLE_FILTERS[key] ?? []).includes(r.value)
                            return (
                              <button
                                key={r.value}
                                onClick={() => toggleRoleFilter(key, r.value)}
                                className={cn(
                                  'text-2xs px-2 py-0.5 rounded-md border font-medium transition-all',
                                  allowed
                                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-700'
                                    : 'bg-[var(--color-bg-2)] text-[var(--color-text-3)] border-[var(--color-border)] line-through opacity-50'
                                )}
                              >
                                {r.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardSection>
            </Card>
          ))}

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAutomations(
                Object.fromEntries(Object.keys(DEFAULT_AUTOMATIONS).map(k => [k, true]))
              )}
            >
              Ativar todas
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAutomations(
                Object.fromEntries(Object.keys(DEFAULT_AUTOMATIONS).map(k => [k, false]))
              )}
            >
              Desativar todas
            </Button>
            <Button
              className="ml-auto"
              onClick={async () => {
                setSaving(true)
                setSavedKey(null)
                try {
                  const { error } = await supabase.from('app_config').upsert([
                    { key: 'whatsapp_automations', value: automations, updated_at: new Date().toISOString() },
                    { key: 'whatsapp_role_filters', value: roleFilters, updated_at: new Date().toISOString() },
                  ], { onConflict: 'key' })
                  if (error) throw error
                  invalidateWhatsAppConfig()
                  invalidateConfigCache()
                  setSavedKey('whatsapp_automations')
                  setTimeout(() => setSavedKey(null), 3000)
                } catch (err) {
                  alert('Erro ao salvar: ' + err.message)
                } finally {
                  setSaving(false)
                }
              }}
              loading={saving}
            >
              <Save size={14} />
              {savedKey === 'whatsapp_automations' ? '✓ Salvo!' : 'Salvar automações'}
            </Button>
          </div>

        </div>
      )}

      {/* ────────────────────────────── TAB: CONDIÇÕES ──────────────────────── */}
      {tab === 'condicoes' && (
        <div className="space-y-3">

          {/* Prazos de preenchimento */}
          <Card>
            <CardSection title="Prazos de preenchimento">
              <p className="text-xs text-[var(--color-text-3)] mb-3">
                Quantos dias os responsáveis têm para preencher cada etapa do ciclo.
                Esse prazo aparece na mensagem de abertura enviada automaticamente.
              </p>
              <div className="grid grid-cols-1 gap-3">
                <Input
                  label="Prazo — Briefing de Regência (dias)"
                  type="number"
                  min={1} max={14}
                  value={conditions.prazoBriefingRegenteDias ?? 3}
                  onChange={e => setConditions(c => ({ ...c, prazoBriefingRegenteDias: Number(e.target.value) }))}
                  hint="Dias disponíveis para as regentes preencherem o briefing · padrão: 3"
                />
                <Input
                  label="Prazo — Briefing de Líderes (dias)"
                  type="number"
                  min={1} max={14}
                  value={conditions.prazoBriefingLiderDias ?? 3}
                  onChange={e => setConditions(c => ({ ...c, prazoBriefingLiderDias: Number(e.target.value) }))}
                  hint="Dias disponíveis para os líderes de função preencherem o briefing · padrão: 3"
                />
                <Input
                  label="Prazo — Disponibilidade (dias)"
                  type="number"
                  min={1} max={21}
                  value={conditions.prazoDisponibilidadeDias ?? 7}
                  onChange={e => setConditions(c => ({ ...c, prazoDisponibilidadeDias: Number(e.target.value) }))}
                  hint="Dias disponíveis para os membros preencherem a disponibilidade · padrão: 7"
                />
              </div>
            </CardSection>
          </Card>

          {/* Janela de envio */}
          <Card>
            <CardSection title="Janela de envio">
              <p className="text-xs text-[var(--color-text-3)] mb-3">
                Mensagens fora desta janela são ignoradas para não incomodar em horários inadequados.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Não enviar antes de"
                  type="number"
                  min={0} max={23}
                  value={conditions.sendAfterHour ?? DEFAULT_CONDITIONS.sendAfterHour}
                  onChange={e => setConditions(c => ({ ...c, sendAfterHour: Number(e.target.value) }))}
                  hint="Hora (0–23) · padrão: 8h"
                />
                <Input
                  label="Não enviar depois de"
                  type="number"
                  min={0} max={23}
                  value={conditions.sendBeforeHour ?? DEFAULT_CONDITIONS.sendBeforeHour}
                  onChange={e => setConditions(c => ({ ...c, sendBeforeHour: Number(e.target.value) }))}
                  hint="Hora (0–23) · padrão: 21h"
                />
              </div>
            </CardSection>
          </Card>

          {/* Lembretes de prazo */}
          <Card>
            <CardSection title="Lembretes de prazo">
              <p className="text-xs text-[var(--color-text-3)] mb-3">
                Define em qual porcentagem do prazo os lembretes são disparados automaticamente.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="1º lembrete (% do prazo)"
                  type="number"
                  min={10} max={89}
                  value={conditions.reminder1Pct ?? DEFAULT_CONDITIONS.reminder1Pct}
                  onChange={e => setConditions(c => ({ ...c, reminder1Pct: Number(e.target.value) }))}
                  hint="Ex: 50 = na metade do prazo"
                />
                <Input
                  label="2º lembrete (% do prazo)"
                  type="number"
                  min={50} max={99}
                  value={conditions.reminder2Pct ?? DEFAULT_CONDITIONS.reminder2Pct}
                  onChange={e => setConditions(c => ({ ...c, reminder2Pct: Number(e.target.value) }))}
                  hint="Ex: 90 = em 90% do prazo"
                />
              </div>
            </CardSection>
          </Card>

          {/* Confirmação de escala */}
          <Card>
            <CardSection title="Confirmação de escala">
              <p className="text-xs text-[var(--color-text-3)] mb-3">
                Quantos dias antes do domingo os lembretes de confirmação são enviados.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Lembrete da sexta"
                  type="number"
                  min={1} max={7}
                  value={conditions.diasLembreteSexta ?? DEFAULT_CONDITIONS.diasLembreteSexta}
                  onChange={e => setConditions(c => ({ ...c, diasLembreteSexta: Number(e.target.value) }))}
                  hint="Dias antes do domingo · padrão: 2"
                />
                <Input
                  label="Alerta do sábado"
                  type="number"
                  min={1} max={3}
                  value={conditions.diasLembreteSabado ?? DEFAULT_CONDITIONS.diasLembreteSabado}
                  onChange={e => setConditions(c => ({ ...c, diasLembreteSabado: Number(e.target.value) }))}
                  hint="Dias antes do domingo · padrão: 1"
                />
              </div>
            </CardSection>
          </Card>

          {/* Tarja pastoral */}
          <Card>
            <CardSection title="Alerta de tarja pastoral">
              <Input
                label="Dias sem atualização para alertar"
                type="number"
                min={7} max={365}
                value={conditions.diasSemTarjaAlerta ?? DEFAULT_CONDITIONS.diasSemTarjaAlerta}
                onChange={e => setConditions(c => ({ ...c, diasSemTarjaAlerta: Number(e.target.value) }))}
                hint="Se a tarja não for atualizada nesse prazo, você recebe um alerta · padrão: 30 dias"
              />
            </CardSection>
          </Card>

          {/* Visitantes */}
          <Card>
            <CardSection title="Acompanhamento de visitantes">
              <Input
                label="Notificar a partir da visita nº"
                type="number"
                min={2} max={10}
                value={conditions.visitaAlertaAPartirDe ?? DEFAULT_CONDITIONS.visitaAlertaAPartirDe}
                onChange={e => setConditions(c => ({ ...c, visitaAlertaAPartirDe: Number(e.target.value) }))}
                hint="Ex: 2 = avisa quando o visitante retorna pela 2ª vez · padrão: 2"
              />
            </CardSection>
          </Card>

          <Button
            fullWidth
            onClick={() => save('whatsapp_conditions', conditions)}
            loading={saving}
          >
            <Save size={14} />
            {savedKey === 'whatsapp_conditions' ? '✓ Condições salvas!' : 'Salvar condições'}
          </Button>

        </div>
      )}

      {/* ────────────────────────────── TAB: PERFIS ─────────────────────────── */}
      {tab === 'perfis' && (
        <ProfilesManager />
      )}

      {/* ────────────────────────────── TAB: MODO DEV ──────────────────────── */}
      {tab === 'modo_dev' && (
        <DevModeManager />
      )}

      {/* ────────────────────────────── TAB: EVENTOS ────────────────────────── */}
      {tab === 'eventos' && (
        <Card>
          <div className="flex items-start gap-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 mb-4">
            <Info size={14} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
              Gerencie os eventos do departamento: cultos, retiros, células e outros.
              Configure frequência e recorrência sem precisar de ajustes técnicos.
            </p>
          </div>
          <EventsManager />
        </Card>
      )}

      {/* ── TAB: NOTIFICAÇÕES ── */}
      {tab === 'notificacoes' && (
        <div className="space-y-3">

          <div className="flex items-start gap-2 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 p-3">
            <Bell size={14} className="text-violet-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-violet-700 dark:text-violet-300 leading-relaxed">
              Configure quais eventos disparam notificações automáticas via WhatsApp para os líderes.
              Personalize as mensagens na aba <strong>Mensagens</strong>.
            </p>
          </div>

          {/* Publicações */}
          <Card>
            <CardSection title={<div className="flex items-center gap-2"><span>Publicações</span><span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400">⚡ Imediato</span></div>}>
              <div>
                {[
                  { key: 'comunicadoPublicado', label: 'Comunicado publicado',  desc: 'Notifica os outros líderes quando um novo comunicado for publicado' },
                  { key: 'briefingPreenchido',  label: 'Briefing submetido',    desc: 'Avisa o Líder Geral quando um briefing de culto ou ensaio for preenchido' },
                ].map(({ key, label, desc }) => {
                  const enabled = automations[key] !== undefined ? automations[key] : true
                  return (
                    <div key={key} className="py-3 first:pt-0 last:pb-0 border-b border-[var(--color-border)] last:border-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <p className="text-sm text-[var(--color-text-1)] leading-snug">{label}</p>
                          <p className="text-2xs text-[var(--color-text-3)] mt-0.5">{desc}</p>
                        </div>
                        <Toggle checked={enabled} onChange={v => setAutomations(a => ({ ...a, [key]: v }))} />
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {ROLE_OPTIONS.map(r => {
                          const allowed = (roleFilters[key] ?? DEFAULT_ROLE_FILTERS[key] ?? []).includes(r.value)
                          return (
                            <button
                              key={r.value}
                              onClick={() => toggleRoleFilter(key, r.value)}
                              className={cn(
                                'text-2xs px-2 py-0.5 rounded-md border font-medium transition-all',
                                allowed
                                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-700'
                                  : 'bg-[var(--color-bg-2)] text-[var(--color-text-3)] border-[var(--color-border)] line-through opacity-50'
                              )}
                            >
                              {r.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardSection>
          </Card>

          {/* Pastoral */}
          <Card>
            <CardSection title={<div className="flex items-center gap-2"><span>Pastoral</span><span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400">⚡ Imediato</span></div>}>
              <div>
                {[
                  { key: 'visitanteIntegrado',  label: 'Visitante integrado',      desc: 'Notifica o Líder Geral quando um visitante for marcado como Integrado' },
                  { key: 'segundaVisita',        label: '2ª visita de visitante',   desc: 'Notifica quando o mesmo visitante retornar pela segunda vez' },
                  { key: 'tarjaNegativaAlerta',  label: 'Alerta de tarja negativa', desc: 'Avisa quando um membro está há muito tempo sem evolução espiritual' },
                  { key: 'aniversario',          label: 'Aniversário de membro',    desc: 'Lembrete de aniversário dos membros enviado ao líder' },
                ].map(({ key, label, desc }) => {
                  const enabled = automations[key] !== undefined ? automations[key] : true
                  return (
                    <div key={key} className="py-3 first:pt-0 last:pb-0 border-b border-[var(--color-border)] last:border-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <p className="text-sm text-[var(--color-text-1)] leading-snug">{label}</p>
                          <p className="text-2xs text-[var(--color-text-3)] mt-0.5">{desc}</p>
                        </div>
                        <Toggle checked={enabled} onChange={v => setAutomations(a => ({ ...a, [key]: v }))} />
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {ROLE_OPTIONS.map(r => {
                          const allowed = (roleFilters[key] ?? DEFAULT_ROLE_FILTERS[key] ?? []).includes(r.value)
                          return (
                            <button
                              key={r.value}
                              onClick={() => toggleRoleFilter(key, r.value)}
                              className={cn(
                                'text-2xs px-2 py-0.5 rounded-md border font-medium transition-all',
                                allowed
                                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-700'
                                  : 'bg-[var(--color-bg-2)] text-[var(--color-text-3)] border-[var(--color-border)] line-through opacity-50'
                              )}
                            >
                              {r.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardSection>
          </Card>

          {/* Relatório Semanal */}
          <Card>
            <CardSection title={<div className="flex items-center gap-2"><span>Relatório</span><span className="text-2xs font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">🕐 Agendado</span></div>}>
              <div>
                {[
                  { key: 'relatorioSemanal', label: 'Relatório de segunda-feira', desc: 'Envia ao Líder Geral toda segunda-feira: membros ativos, confirmações, visitantes e trocas da semana' },
                ].map(({ key, label, desc }) => {
                  const enabled = automations[key] !== undefined ? automations[key] : false
                  return (
                    <div key={key} className="py-3 first:pt-0 last:pb-0 border-b border-[var(--color-border)] last:border-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <p className="text-sm text-[var(--color-text-1)] leading-snug">{label}</p>
                          <p className="text-2xs text-[var(--color-text-3)] mt-0.5">{desc}</p>
                        </div>
                        <Toggle checked={enabled} onChange={v => setAutomations(a => ({ ...a, [key]: v }))} />
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {ROLE_OPTIONS.map(r => {
                          const allowed = (roleFilters[key] ?? DEFAULT_ROLE_FILTERS[key] ?? []).includes(r.value)
                          return (
                            <button
                              key={r.value}
                              onClick={() => toggleRoleFilter(key, r.value)}
                              className={cn(
                                'text-2xs px-2 py-0.5 rounded-md border font-medium transition-all',
                                allowed
                                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-700'
                                  : 'bg-[var(--color-bg-2)] text-[var(--color-text-3)] border-[var(--color-border)] line-through opacity-50'
                              )}
                            >
                              {r.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardSection>
          </Card>

          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="secondary" size="sm"
              onClick={() => {
                const keys = ['comunicadoPublicado','briefingPreenchido','visitanteIntegrado','relatorioSemanal','segundaVisita','tarjaNegativaAlerta','aniversario']
                setAutomations(a => ({ ...a, ...Object.fromEntries(keys.map(k => [k, true])) }))
              }}>
              Ativar todas
            </Button>
            <Button variant="secondary" size="sm"
              onClick={() => {
                const keys = ['comunicadoPublicado','briefingPreenchido','visitanteIntegrado','relatorioSemanal','segundaVisita','tarjaNegativaAlerta','aniversario']
                setAutomations(a => ({ ...a, ...Object.fromEntries(keys.map(k => [k, false])) }))
              }}>
              Desativar todas
            </Button>
            <Button
              className="ml-auto"
              onClick={async () => {
                setSaving(true)
                setSavedKey(null)
                try {
                  const { error } = await supabase.from('app_config').upsert([
                    { key: 'whatsapp_automations', value: automations, updated_at: new Date().toISOString() },
                    { key: 'whatsapp_role_filters', value: roleFilters, updated_at: new Date().toISOString() },
                  ], { onConflict: 'key' })
                  if (error) throw error
                  invalidateWhatsAppConfig()
                  invalidateConfigCache()
                  setSavedKey('whatsapp_automations')
                  setTimeout(() => setSavedKey(null), 3000)
                } catch (err) {
                  alert('Erro ao salvar: ' + err.message)
                } finally {
                  setSaving(false)
                }
              }}
              loading={saving}
            >
              <Save size={14} />
              {savedKey === 'whatsapp_automations' ? '✓ Salvo!' : 'Salvar notificações'}
            </Button>
          </div>

        </div>
      )}

    </div>
  )
}
