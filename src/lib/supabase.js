import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn('[Supabase] Missing env vars — running in demo mode')
}

export const supabase = createClient(
  supabaseUrl  || 'https://placeholder.supabase.co',
  supabaseKey  || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: { params: { eventsPerSecond: 10 } },
  }
)

// ── Helpers ─────────────────────────────────────────────────────────────────

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

export async function updateProfile(userId, updates) {
  const { data, error } = await supabase
    .from('users')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getActiveCycle() {
  const { data, error } = await supabase
    .from('ciclos')
    .select('*')
    .in('status', ['briefing_regente', 'briefing_lider', 'disponibilidade', 'escala_publicada'])
    .order('inicio', { ascending: false })
    .limit(1)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data || null
}

export async function getCycleSundays(cicloId) {
  const { data: ciclo } = await supabase
    .from('ciclos').select('inicio, fim').eq('id', cicloId).single()
  if (!ciclo) return []
  return getSundaysBetween(new Date(ciclo.inicio), new Date(ciclo.fim))
}

function getSundaysBetween(start, end) {
  const sundays = []
  const d = new Date(start)
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
  while (d <= end) {
    sundays.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 7)
  }
  return sundays
}
