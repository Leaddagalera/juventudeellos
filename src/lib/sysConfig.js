/**
 * System configuration service.
 *
 * Reads operational parameters from the `app_config` table
 * (keys prefixed with `sys_`). Falls back to SYS_DEFAULTS when
 * no value is stored, so the app always works out of the box.
 *
 * Usage in components:
 *   import { useSysConfig } from '../lib/sysConfig.js'
 *   const { config } = useSysConfig()
 *   // config.avail_window_start, config.cycle_duration, ...
 *
 * Usage in async code:
 *   import { getSysConfig } from '../lib/sysConfig.js'
 *   const cfg = await getSysConfig()
 */

import { useState, useEffect } from 'react'
import { supabase } from './supabase.js'

// ── Defaults (what the system used before the DevMode tab existed) ─────────────

export const SYS_DEFAULTS = {
  /** Total length of each service cycle, in days. */
  cycle_duration: 45,

  /** Day of the cycle on which the availability window opens (inclusive). */
  avail_window_start: 6,

  /** Day of the cycle on which the availability window closes (inclusive). */
  avail_window_end: 20,

  /** Day of the cycle on which the schedule engine becomes available. */
  schedule_day: 21,

  /** How many days of service history are considered when rotating members. */
  history_days: 90,

  /**
   * Which Sunday of the month is the Regência rehearsal (1-based).
   * Default: 2 = second Sunday.
   */
  ensaio_week: 2,

  /** Minimum number of members to assign per subdepartamento per Sunday. */
  slots: {
    louvor:   4,
    regencia: 1,
    ebd:      2,
    recepcao: 2,
    midia:    1,
  },

  /** Active subdepartamentos. Changing this list affects the whole app. */
  subdepartamentos: ['louvor', 'regencia', 'ebd', 'recepcao', 'midia'],
}

// ── Module-level cache (5-min TTL) ────────────────────────────────────────────

let _cache  = null
let _cacheAt = 0
const CACHE_TTL = 5 * 60 * 1000

export async function getSysConfig() {
  const now = Date.now()
  if (_cache && now - _cacheAt < CACHE_TTL) return _cache

  try {
    const SYS_KEYS = [
      'sys_cycle_duration',
      'sys_avail_window',
      'sys_schedule_day',
      'sys_history_days',
      'sys_ensaio_week',
      'sys_slots',
      'sys_subdepartamentos',
    ]

    const { data } = await supabase
      .from('app_config')
      .select('key, value')
      .in('key', SYS_KEYS)

    const map = {}
    for (const row of (data || [])) map[row.key] = row.value

    _cache = {
      cycle_duration:     map.sys_cycle_duration     ?? SYS_DEFAULTS.cycle_duration,
      avail_window_start: map.sys_avail_window?.start ?? SYS_DEFAULTS.avail_window_start,
      avail_window_end:   map.sys_avail_window?.end   ?? SYS_DEFAULTS.avail_window_end,
      schedule_day:       map.sys_schedule_day        ?? SYS_DEFAULTS.schedule_day,
      history_days:       map.sys_history_days        ?? SYS_DEFAULTS.history_days,
      ensaio_week:        map.sys_ensaio_week         ?? SYS_DEFAULTS.ensaio_week,
      slots:              { ...SYS_DEFAULTS.slots, ...(map.sys_slots ?? {}) },
      subdepartamentos:   map.sys_subdepartamentos    ?? SYS_DEFAULTS.subdepartamentos,
    }
    _cacheAt = now
  } catch (e) {
    console.warn('[sysConfig] erro ao carregar:', e?.message)
    _cache = { ...SYS_DEFAULTS, slots: { ...SYS_DEFAULTS.slots } }
    _cacheAt = now
  }

  return _cache
}

export function invalidateSysConfig() {
  _cache  = null
  _cacheAt = 0
}

// ── React hook ────────────────────────────────────────────────────────────────

export function useSysConfig() {
  const [config, setConfig] = useState({ ...SYS_DEFAULTS, slots: { ...SYS_DEFAULTS.slots } })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    getSysConfig().then(c => { if (active) { setConfig(c); setLoaded(true) } })
    return () => { active = false }
  }, [])

  return { config, loaded }
}
