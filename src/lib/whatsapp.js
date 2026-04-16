/**
 * WhatsApp notification layer via Evolution API
 * Config is loaded dynamically from Supabase (app_config table).
 * Falls back to .env vars if no DB config is found.
 *
 * Message templates use {placeholder} syntax, e.g. {nome}, {prazo}.
 */

import { loadAppConfig, invalidateAppConfig } from './config.js'
import { sendWhatsApp as _send, invalidateConfigCache } from '../services/whatsapp.js'

// ── Defaults (shown/used when no custom config exists) ─────────────────────

export const DEFAULT_MESSAGES = {
  briefingRegentesAberto:
    '👋 Olá, *{nome}*!\n\nA janela de preenchimento do *briefing de regência* está aberta.\n⏰ Prazo: *{prazo}*\n\nAcesse o sistema: {app_url}',

  briefingLideresAberto:
    '👋 Olá, *{nome}*!\n\nA janela de preenchimento do *briefing ({subdep})* está aberta.\n⏰ Prazo: *{prazo}*\n\nAcesse o sistema: {app_url}',

  disponibilidadeAberta:
    '📅 Olá, *{nome}*!\n\nJá pode marcar sua *disponibilidade* para o próximo ciclo.\n⏰ Prazo: *{prazo}*\n\nAcesse agora: {app_url}',

  lembreteMetadePrazo:
    '⏳ *{nome}*, você ainda não preencheu: *{tipo}*.\nJá passou metade do prazo! Não deixe para última hora. 😉\n\n{app_url}',

  lembrete90Prazo:
    '🚨 *Urgente, {nome}!*\n\nO prazo para *{tipo}* encerra em breve.\nAcesse agora e evite problemas na escala: {app_url}',

  encerramentoNaoPreencheu:
    '🔒 O prazo para *{tipo}* encerrou, *{nome}*.\nVocê não foi registrado(a). Fale com seu líder se precisar de ajuda.',

  encerramentoResumoLider:
    '📊 *Resumo de encerramento — {tipo}*\n\n✅ Preencheram: {preencheram}/{total}\n❌ Não preencheram ({qtd}): {naoPreencher}\n\nAcesse o painel: {app_url}',

  escalaPublicada:
    '🎉 Olá, *{nome}*! A escala do próximo ciclo foi publicada.\n\n*Seus domingos:*\n{lista}\n\nConfirme sua presença no sistema: {app_url}',

  sextaSemConfirmacao:
    '⚠️ *{nome}*, você ainda não confirmou presença para o culto de *{domingo}*.\nPor favor, confirme ou solicite troca até amanhã: {app_url}',

  sabadoSemConfirmacao:
    '🚨 *{nome}*, o culto de *{domingo}* é amanhã e você ainda não confirmou!\nConfirme agora: {app_url}',

  sabadoAlertaLider:
    '🚨 *Alerta — Sábado*\n\nCulto de *{domingo}* com {qtd} confirmação(ões) pendente(s):\n{pendentes}\n\nPainel: {app_url}',

  trocaSolicitada:
    '🔄 *Troca solicitada*\n\n*{solicitante}* quer trocar o domingo de *{domingo}*.\nMotivo: {motivo}\n\nAprove ou recuse no painel: {app_url}',

  trocaAprovada:
    '✅ Sua solicitação de troca para *{domingo}* foi *aprovada*, *{nome}*!',

  trocaRecusada:
    '❌ Sua solicitação de troca para *{domingo}* foi *recusada*, *{nome}*.\nMotivo: {motivo}',

  segundaVisita:
    '👤 *2ª visita registrada*\n\n*{visitante}* visitou novamente em *{data}*.\nConsidere fazer um acompanhamento pastoral. 🙏',

  tarjaNegativaAlerta:
    '⚠️ *Alerta pastoral*\n\n*{membro}* está com tarja *{tarja}* há *{diasSemAlteracao} dias* sem atualização.\nConsidere uma visita ou conversa. 🙏',

  aniversario:
    '🎂 *Aniversário hoje!*\n\n*{membro}* faz aniversário em *{data}*.\nLembre-se de parabenizá-lo(a)! 🎉',

  novoCadastroPendente:
    '📋 *Novo cadastro para aprovação*\n\n*{nome}* ({subdep}) está aguardando aprovação.\nAcesse o painel: {app_url}',

  midiaPendente:
    '🖼️ *Conteúdo de mídia aguardando aprovação*\n\n"{descricao}" enviado por *{enviado_por}*.\nAprove no painel: {app_url}',

  membroAprovado:
    '✅ Olá, *{nome}*! Seu cadastro na Juventude Ellos foi aprovado.\n\nBem-vindo(a)! Acesse agora: {app_url}',

  cicloFaseAgradecimento:
    '🙏 Obrigado, *{nome}*! Todos os {tipo} do ciclo estão preenchidos.\n\nVocê pode acompanhar tudo pelo sistema: {app_url}',

  cicloFasePendencia:
    '⚠️ *{nome}*, ainda há *{tipo}* pendente(s) para o ciclo.\n\nO ciclo só avançará após a resolução. Acesse agora: {app_url}',
}

export const DEFAULT_AUTOMATIONS = {
  briefingRegentesAberto:   true,
  briefingLideresAberto:    true,
  disponibilidadeAberta:    true,
  lembreteMetadePrazo:      true,
  lembrete90Prazo:          true,
  encerramentoNaoPreencheu: true,
  encerramentoResumoLider:  true,
  escalaPublicada:          true,
  sextaSemConfirmacao:      true,
  sabadoSemConfirmacao:     true,
  sabadoAlertaLider:        true,
  trocaSolicitada:          true,
  trocaAprovada:            true,
  trocaRecusada:            true,
  segundaVisita:            true,
  tarjaNegativaAlerta:      true,
  aniversario:              true,
  novoCadastroPendente:     true,
  midiaPendente:            true,
  membroAprovado:           true,
  cicloFaseAgradecimento:   true,
  cicloFasePendencia:       true,
}

export const DEFAULT_CONDITIONS = {
  sendAfterHour:           8,
  sendBeforeHour:          21,
  reminder1Pct:            50,
  reminder2Pct:            90,
  diasLembreteSexta:       2,
  diasLembreteSabado:      1,
  diasSemTarjaAlerta:      30,
  visitaAlertaAPartirDe:   2,
  prazoBriefingRegenteDias: 3,   // days given to regentes to fill briefing
  prazoBriefingLiderDias:   3,   // days given to function leaders to fill briefing
  prazoDisponibilidadeDias: 7,   // days given to members to fill availability
}

// ── Config cache invalidation ──────────────────────────────────────────────

export function invalidateWhatsAppConfig() {
  invalidateAppConfig()
  invalidateConfigCache()
}

// ── Template interpolation ─────────────────────────────────────────────────

/** Retorna apenas o primeiro nome de um nome completo */
function primeiroNome(nome) {
  return nome ? String(nome).trim().split(/\s+/)[0] : nome
}

function interpolate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`
  )
}

// ── Low-level send — delegates to src/services/whatsapp.js ────────────────

async function sendMessage(phone, text) {
  return _send({ numero: phone, mensagem: text })
}

// ── Template-based send (checks automation toggle + uses custom template) ──

async function sendTemplate(key, phone, vars) {
  const cfg = await loadAppConfig()

  const automations = cfg.whatsapp_automations || DEFAULT_AUTOMATIONS
  const messages    = cfg.whatsapp_messages    || {}
  const conditions  = cfg.whatsapp_conditions  || DEFAULT_CONDITIONS

  // Check automation toggle
  const isOn = automations[key] !== undefined ? automations[key] : true
  if (!isOn) {
    console.log('[WhatsApp] automation disabled:', key)
    return { skipped: true }
  }

  // Check send window
  const now  = new Date()
  const hour = now.getHours()
  const after  = conditions.sendAfterHour  ?? DEFAULT_CONDITIONS.sendAfterHour
  const before = conditions.sendBeforeHour ?? DEFAULT_CONDITIONS.sendBeforeHour
  if (hour < after || hour >= before) {
    console.log('[WhatsApp] outside send window:', hour, `(${after}–${before})`)
    return { skipped: true, reason: 'outside_window' }
  }

  // Get template
  const template = messages[key] || DEFAULT_MESSAGES[key] || ''
  if (!template) {
    console.warn('[WhatsApp] no template for key:', key)
    return { error: 'no_template' }
  }

  // Usa primeiro nome em todas as variáveis de nome
  const resolvedVars = { ...vars }
  for (const k of ['nome', 'solicitante', 'membro', 'enviado_por']) {
    if (resolvedVars[k]) resolvedVars[k] = primeiroNome(resolvedVars[k])
  }

  // URL pública configurada em Configurações, ou origin atual como fallback
  const appUrl = cfg.app_url || window.location.origin

  const text = interpolate(template, { ...resolvedVars, app_url: appUrl })
  return sendMessage(phone, text)
}

// ── Public notify API ─────────────────────────────────────────────────────

export const notify = {

  briefingRegentesAberto: (phone, nome, prazo) =>
    sendTemplate('briefingRegentesAberto', phone, { nome, prazo }),

  briefingLideresAberto: (phone, nome, subdep, prazo) =>
    sendTemplate('briefingLideresAberto', phone, { nome, subdep, prazo }),

  disponibilidadeAberta: (phone, nome, prazo) =>
    sendTemplate('disponibilidadeAberta', phone, { nome, prazo }),

  lembreteMetadePrazo: (phone, nome, tipo) =>
    sendTemplate('lembreteMetadePrazo', phone, { nome, tipo }),

  lembrete90Prazo: (phone, nome, tipo) =>
    sendTemplate('lembrete90Prazo', phone, { nome, tipo }),

  encerramentoNaoPreencheu: (phone, nome, tipo) =>
    sendTemplate('encerramentoNaoPreencheu', phone, { nome, tipo }),

  encerramentoResumoLider: (phone, tipo, total, preencheram, naoPreencher) =>
    sendTemplate('encerramentoResumoLider', phone, {
      tipo, total, preencheram,
      qtd: naoPreencher.length,
      naoPreencher: naoPreencher.join(', '),
    }),

  escalaPublicada: (phone, nome, escalas) =>
    sendTemplate('escalaPublicada', phone, {
      nome,
      lista: escalas.map(e => `• ${e.domingo} — ${e.subdepartamento}`).join('\n'),
    }),

  sextaSemConfirmacao: (phone, nome, domingo) =>
    sendTemplate('sextaSemConfirmacao', phone, { nome, domingo }),

  sabadoSemConfirmacao: (phone, nome, domingo) =>
    sendTemplate('sabadoSemConfirmacao', phone, { nome, domingo }),

  sabadoAlertaLider: (phone, domingo, pendentes) =>
    sendTemplate('sabadoAlertaLider', phone, {
      domingo,
      qtd: pendentes.length,
      pendentes: pendentes.join(', '),
    }),

  trocaSolicitada: (phone, solicitante, domingo, motivo) =>
    sendTemplate('trocaSolicitada', phone, { solicitante, domingo, motivo }),

  trocaAprovada: (phone, nome, domingo) =>
    sendTemplate('trocaAprovada', phone, { nome, domingo }),

  trocaRecusada: (phone, nome, domingo, motivo) =>
    sendTemplate('trocaRecusada', phone, { nome, domingo, motivo: motivo || 'Não informado' }),

  segundaVisita: (phone, visitante, data) =>
    sendTemplate('segundaVisita', phone, { visitante, data }),

  tarjaNegativaAlerta: (phone, membro, tarja, diasSemAlteracao) =>
    sendTemplate('tarjaNegativaAlerta', phone, { membro, tarja, diasSemAlteracao }),

  aniversario: (phone, membro, data) =>
    sendTemplate('aniversario', phone, { membro, data }),

  novoCadastroPendente: (phone, nome, subdep) =>
    sendTemplate('novoCadastroPendente', phone, { nome, subdep }),

  midiaPendente: (phone, descricao, enviado_por) =>
    sendTemplate('midiaPendente', phone, { descricao, enviado_por }),

  membroAprovado: (phone, nome) =>
    sendTemplate('membroAprovado', phone, { nome }),

  cicloFaseAgradecimento: (phone, nome, tipo) =>
    sendTemplate('cicloFaseAgradecimento', phone, { nome, tipo }),

  cicloFasePendencia: (phone, nome, tipo) =>
    sendTemplate('cicloFasePendencia', phone, { nome, tipo }),
}
