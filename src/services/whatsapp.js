/**
 * src/services/whatsapp.js
 * Low-level WhatsApp send service via Evolution API.
 *
 * Config priority:
 *   1. `configuracoes` table (Supabase) — updated from Settings UI
 *   2. VITE_EVOLUTION_* env vars         — .env.local fallback
 *
 * Usage:
 *   import { sendWhatsApp, sendWhatsAppBulk } from '@/services/whatsapp'
 *   await sendWhatsApp({ numero: '5531999999999', mensagem: 'Olá!' })
 */

import { supabase } from '../lib/supabase.js'

// ── Config loader ─────────────────────────────────────────────────────────────

let _configCache   = null
let _cacheExpiresAt = 0
const CACHE_TTL_MS  = 5 * 60 * 1000   // 5 min

async function getConfig() {
  const now = Date.now()
  if (_configCache && now < _cacheExpiresAt) return _configCache

  try {
    const { data } = await supabase
      .from('app_config')
      .select('key, value')
      .eq('key', 'whatsapp_connection')
      .single()

    const conn = data?.value && typeof data.value === 'object' ? data.value : {}

    _configCache = {
      url:      conn.base_url  || import.meta.env.VITE_EVOLUTION_BASE_URL || '',
      apiKey:   conn.api_key   || import.meta.env.VITE_EVOLUTION_API_KEY  || '',
      instance: conn.instance  || import.meta.env.VITE_EVOLUTION_INSTANCE || '',
    }
    _cacheExpiresAt = now + CACHE_TTL_MS
  } catch {
    // DB unavailable — fall back to env vars
    _configCache = {
      url:      import.meta.env.VITE_EVOLUTION_BASE_URL || '',
      apiKey:   import.meta.env.VITE_EVOLUTION_API_KEY  || '',
      instance: import.meta.env.VITE_EVOLUTION_INSTANCE || '',
    }
    _cacheExpiresAt = now + 30_000   // retry sooner on error
  }

  return _configCache
}

/** Force reload config on next call (call after saving Settings) */
export function invalidateConfigCache() {
  _configCache    = null
  _cacheExpiresAt = 0
}

// ── Send ──────────────────────────────────────────────────────────────────────

/**
 * Send a WhatsApp text message via Evolution API.
 * In demo mode (no URL configured), logs to console instead.
 *
 * @param {{ numero: string, mensagem: string }} params
 * @returns {Promise<{ key?: { id: string }, demo?: boolean }>}
 */
export async function sendWhatsApp({ numero, mensagem }) {
  const { url, apiKey, instance } = await getConfig()

  // Normalize number — strip non-digits, add Brazil country code if missing
  const digits   = numero.replace(/\D/g, '')
  const withCC   = digits.startsWith('55') ? digits : `55${digits}`

  if (!url || !apiKey || !instance) {
    console.log('[WhatsApp DEMO] →', withCC, ':', mensagem)
    return { demo: true }
  }

  if (withCC.length < 12) {
    console.warn('[WhatsApp] Número inválido:', numero)
    return { invalid: true }
  }

  try {
    const res = await fetch(
      `${url.replace(/\/$/, '')}/message/sendText/${instance}`,
      {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
          'ngrok-skip-browser-warning': 'true',
        },
        body:    JSON.stringify({ number: withCC, text: mensagem }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('[WhatsApp] Erro', res.status, err)
      throw new Error(`Evolution API ${res.status}: ${err}`)
    }

    const data = await res.json()
    console.log('[WhatsApp] Enviado →', withCC, '| ID:', data?.key?.id)

    // Rate-limit guard: avoid flooding the API
    await new Promise(r => setTimeout(r, 1200))

    return data
  } catch (err) {
    console.error('[WhatsApp] Falha:', err)
    throw err
  }
}

/**
 * Send multiple messages sequentially with 1.2s gap between each.
 *
 * @param {Array<{ numero: string, mensagem: string }>} mensagens
 */
export async function sendWhatsAppBulk(mensagens) {
  const results = []
  for (const msg of mensagens) {
    results.push(await sendWhatsApp(msg).catch(e => ({ error: e.message })))
  }
  return results
}

// ── Connection test ───────────────────────────────────────────────────────────

/**
 * Test Evolution API connectivity for a given config.
 * Returns { status: 'open'|'close'|'connecting'|'not_found'|'error', message: string }
 */
export async function testConnection({ url, apiKey, instance } = {}) {
  const cfg = url ? { url, apiKey, instance } : await getConfig()

  if (!cfg.url || !cfg.apiKey || !cfg.instance) {
    return { status: 'error', message: 'Preencha URL, API Key e nome da instância.' }
  }

  try {
    const res = await fetch(
      `${cfg.url.replace(/\/$/, '')}/instance/fetchInstances`,
      { headers: { apikey: cfg.apiKey, 'ngrok-skip-browser-warning': 'true' } }
    )

    if (!res.ok) {
      const txt = await res.text()
      return { status: 'error', message: `HTTP ${res.status}: ${txt.slice(0, 120)}` }
    }

    const instances = await res.json()
    const found = Array.isArray(instances)
      ? instances.find(i => i.name === cfg.instance || i.instanceName === cfg.instance)
      : null

    if (!found) {
      return {
        status: 'not_found',
        message: `Instância "${cfg.instance}" não encontrada. Instâncias disponíveis: ${
          (Array.isArray(instances) ? instances.map(i => i.name || i.instanceName) : []).join(', ') || '—'
        }`,
      }
    }

    const state = found.connectionStatus || found.state || 'close'
    const labels = {
      open:       '✓ WhatsApp conectado e ativo!',
      connecting: '⚠ API alcançada — WhatsApp ainda não conectado.',
      close:      '⚠ API alcançada — WhatsApp desconectado.',
    }

    return {
      status:  state,
      message: labels[state] || `Estado: ${state}`,
      instance: found,
    }
  } catch (err) {
    return {
      status: 'error',
      message: `Não foi possível alcançar a API: ${err.message}`,
    }
  }
}
