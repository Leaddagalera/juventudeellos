import { useState, useEffect, useCallback } from 'react'
import {
  Wifi, MessageSquare, Zap, SlidersHorizontal, ShieldCheck,
  Save, CheckCircle2, XCircle, AlertTriangle, Eye, EyeOff,
  RotateCcw, Loader2, Settings2, Info,
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
  invalidateWhatsAppConfig,
} from '../lib/whatsapp.js'
import { cn } from '../lib/utils.js'
import ProfilesManager from '../components/settings/ProfilesManager.jsx'

// ── Static metadata ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'conexao',    label: 'Conexão',    icon: Wifi },
  { id: 'mensagens',  label: 'Mensagens',  icon: MessageSquare },
  { id: 'automacoes', label: 'Automações', icon: Zap },
  { id: 'condicoes',  label: 'Condições',  icon: SlidersHorizontal },
  { id: 'perfis',     label: 'Perfis',     icon: ShieldCheck },
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
}

const AUTOMATION_GROUPS = [
  {
    label: 'Ciclo — Briefings',
    keys:  ['briefingRegentesAberto', 'briefingLideresAberto'],
  },
  {
    label: 'Ciclo — Disponibilidade & Lembretes',
    keys:  ['disponibilidadeAberta', 'lembreteMetadePrazo', 'lembrete90Prazo', 'encerramentoNaoPreencheu', 'encerramentoResumoLider'],
  },
  {
    label: 'Escalas — Publicação & Confirmações',
    keys:  ['escalaPublicada', 'sextaSemConfirmacao', 'sabadoSemConfirmacao', 'sabadoAlertaLider'],
  },
  {
    label: 'Trocas',
    keys:  ['trocaSolicitada', 'trocaAprovada', 'trocaRecusada'],
  },
  {
    label: 'Pastoral',
    keys:  ['segundaVisita', 'tarjaNegativaAlerta', 'aniversario'],
  },
  {
    label: 'Sistema',
    keys:  ['novoCadastroPendente', 'midiaPendente'],
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function Settings() {
  const { isLiderGeral } = useAuth()
  const [tab,          setTab]          = useState('conexao')
  const [loadingConfig, setLoadingConfig] = useState(true)

  // config sections
  const [connection,  setConnection]  = useState({ base_url: '', instance: '', api_key: '', enabled: false })
  const [messages,    setMessages]    = useState({})
  const [automations, setAutomations] = useState({ ...DEFAULT_AUTOMATIONS })
  const [conditions,  setConditions]  = useState({ ...DEFAULT_CONDITIONS })

  // ui
  const [showKey,    setShowKey]    = useState(false)
  const [testing,    setTesting]    = useState(false)
  const [testResult, setTestResult] = useState(null)   // 'ok' | 'warn' | 'error'
  const [testMsg,    setTestMsg]    = useState('')
  const [saving,     setSaving]     = useState(false)
  const [savedKey,   setSavedKey]   = useState(null)

  // ── Load ────────────────────────────────────────────────────────────────────
  const loadConfig = useCallback(async () => {
    setLoadingConfig(true)
    try {
      const { data } = await supabase
        .from('app_config')
        .select('key, value')
        .in('key', ['whatsapp_connection', 'whatsapp_messages', 'whatsapp_automations', 'whatsapp_conditions'])

      const cfg = {}
      for (const row of (data || [])) cfg[row.key] = row.value

      if (cfg.whatsapp_connection) setConnection(cfg.whatsapp_connection)
      if (cfg.whatsapp_messages)   setMessages(cfg.whatsapp_messages)
      setAutomations({ ...DEFAULT_AUTOMATIONS, ...(cfg.whatsapp_automations || {}) })
      setConditions({ ...DEFAULT_CONDITIONS,   ...(cfg.whatsapp_conditions  || {}) })
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
        .upsert({ key, value, updated_at: new Date().toISOString() })
      if (error) throw error
      invalidateWhatsAppConfig()
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
        setTesting(false)
        return
      }
      const url = `${base_url.replace(/\/$/, '')}/instance/connectionState/${instance}`
      const res  = await fetch(url, { headers: { apikey: api_key } })
      const json = await res.json().catch(() => ({}))

      const state = json?.instance?.state || json?.state
      if (res.ok && state) {
        const stateLabels = {
          open:       '✓ WhatsApp conectado e ativo!',
          connecting: '⚠ API alcançada. WhatsApp ainda não conectado — escaneie o QR code.',
          close:      '⚠ API alcançada. WhatsApp desconectado — reconecte pelo painel.',
        }
        const isOpen = state === 'open'
        setTestResult(isOpen ? 'ok' : 'warn')
        setTestMsg(stateLabels[state] || `API respondeu: estado "${state}"`)
      } else {
        setTestResult('error')
        setTestMsg(json?.message || json?.error || `Resposta inesperada (HTTP ${res.status})`)
      }
    } catch (err) {
      setTestResult('error')
      setTestMsg('Falha ao conectar: ' + err.message)
    } finally {
      setTesting(false)
    }
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

              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" variant="secondary" onClick={testConnection} loading={testing}>
                  <Wifi size={13} /> Testar conexão
                </Button>
                <Button size="sm" onClick={() => save('whatsapp_connection', connection)} loading={saving}>
                  <Save size={13} />
                  {savedKey === 'whatsapp_connection' ? '✓ Salvo!' : 'Salvar'}
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
              <CardSection title={group.label}>
                <div className="divide-y divide-[var(--color-border)]">
                  {group.keys.map(key => {
                    const enabled = automations[key] !== undefined ? automations[key] : true
                    return (
                      <div key={key} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                        <div className="min-w-0 pr-4">
                          <p className="text-sm text-[var(--color-text-1)]">{MSG_META[key]?.label || key}</p>
                          <p className="text-2xs text-[var(--color-text-3)] mt-0.5 truncate">
                            {MSG_META[key]?.vars.join(' · ')}
                          </p>
                        </div>
                        <Toggle
                          checked={enabled}
                          onChange={v => setAutomations(a => ({ ...a, [key]: v }))}
                        />
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
              onClick={() => save('whatsapp_automations', automations)}
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

    </div>
  )
}
