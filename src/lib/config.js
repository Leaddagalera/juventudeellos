/**
 * App config cache — reads/writes from public.app_config in Supabase
 * Keys: whatsapp_connection | whatsapp_messages | whatsapp_automations | whatsapp_conditions
 */
import { supabase } from './supabase.js'

let _cache = null
let _promise = null

export async function loadAppConfig(force = false) {
  if (_cache && !force) return _cache
  if (_promise && !force) return _promise

  _promise = supabase
    .from('app_config')
    .select('key, value')
    .then(({ data }) => {
      const cfg = {}
      for (const row of (data || [])) cfg[row.key] = row.value
      _cache = cfg
      _promise = null
      return cfg
    })
    .catch(() => {
      _promise = null
      return _cache || {}
    })

  return _promise
}

export function invalidateAppConfig() {
  _cache = null
  _promise = null
}

export async function saveAppConfig(key, value) {
  const { error } = await supabase
    .from('app_config')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return { error }
  invalidateAppConfig()
  return { error: null }
}
