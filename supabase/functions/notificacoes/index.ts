// Supabase Edge Function — scheduled WhatsApp notifications
// Triggered by pg_cron for: Friday reminders, Saturday alerts, deadline checks, birthdays
// Calls Evolution API directly (no browser needed)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// ── Evolution API send ────────────────────────────────────────────────────────

async function sendWpp(numero: string, mensagem: string) {
  const { data: cfg } = await supabase
    .from('configuracoes')
    .select('chave, valor')
    .in('chave', ['evolution_url', 'evolution_api_key', 'evolution_instance'])

  const map: Record<string, string> = {}
  for (const r of (cfg || [])) map[r.chave] = r.valor

  const url      = map.evolution_url      || Deno.env.get('VITE_EVOLUTION_BASE_URL') || ''
  const apiKey   = map.evolution_api_key  || Deno.env.get('VITE_EVOLUTION_API_KEY')  || ''
  const instance = map.evolution_instance || Deno.env.get('VITE_EVOLUTION_INSTANCE') || ''

  if (!url || !apiKey || !instance) {
    console.log('[DEMO] →', numero, ':', mensagem)
    return
  }

  const digits = numero.replace(/\D/g, '')
  const withCC = digits.startsWith('55') ? digits : `55${digits}`

  const res = await fetch(`${url.replace(/\/$/, '')}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: apiKey },
    body: JSON.stringify({ number: withCC, text: mensagem }),
  })
  if (!res.ok) console.error('[WPP] Erro', res.status, await res.text())
  await new Promise(r => setTimeout(r, 1200))
}

// ── App URL ───────────────────────────────────────────────────────────────────

const APP_URL = Deno.env.get('APP_URL') || 'https://ellos.vercel.app'

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleSextaLembrete() {
  // Find next Sunday
  const now = new Date()
  const daysUntilSunday = (7 - now.getDay()) % 7 || 7
  const nextSunday = new Date(now)
  nextSunday.setDate(now.getDate() + daysUntilSunday)
  const domingoStr = nextSunday.toISOString().split('T')[0]
  const domingoFmt = nextSunday.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })

  const { data: escalas } = await supabase
    .from('escalas')
    .select('user_id, users(nome, whatsapp)')
    .eq('domingo', domingoStr)
    .eq('status_confirmacao', 'pendente')

  for (const e of (escalas || [])) {
    const u = (e as any).users
    if (u?.whatsapp) {
      await sendWpp(u.whatsapp, `⚠️ *${u.nome}*, você ainda não confirmou presença para o culto de *${domingoFmt}*.\nPor favor, confirme ou solicite troca até amanhã: ${APP_URL}`)
    }
  }
}

async function handleSabadoLembrete() {
  const now = new Date()
  const daysUntilSunday = (7 - now.getDay()) % 7 || 7
  const nextSunday = new Date(now)
  nextSunday.setDate(now.getDate() + daysUntilSunday)
  const domingoStr = nextSunday.toISOString().split('T')[0]
  const domingoFmt = nextSunday.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })

  const { data: escalas } = await supabase
    .from('escalas')
    .select('user_id, users(nome, whatsapp)')
    .eq('domingo', domingoStr)
    .eq('status_confirmacao', 'pendente')

  const pendentes: string[] = []
  for (const e of (escalas || [])) {
    const u = (e as any).users
    if (u?.whatsapp) {
      pendentes.push(u.nome)
      await sendWpp(u.whatsapp, `🚨 *${u.nome}*, o culto de *${domingoFmt}* é amanhã e você ainda não confirmou!\nConfirme agora: ${APP_URL}`)
    }
  }

  // Alert Líder Geral with summary
  if (pendentes.length > 0) {
    const { data: lideres } = await supabase
      .from('users').select('whatsapp').eq('role', 'lider_geral').eq('ativo', true)
    for (const l of (lideres || [])) {
      if ((l as any).whatsapp) {
        await sendWpp((l as any).whatsapp,
          `🚨 *Alerta — Sábado*\n\nCulto de *${domingoFmt}* com ${pendentes.length} confirmação(ões) pendente(s):\n${pendentes.join(', ')}\n\nPainel: ${APP_URL}`)
      }
    }
  }
}

async function handleAniversarios() {
  const today = new Date()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')

  const { data: users } = await supabase
    .from('users').select('nome, data_nascimento').eq('ativo', true)

  const aniversariantes = (users || []).filter(u => {
    if (!(u as any).data_nascimento) return false
    const [, bMm, bDd] = ((u as any).data_nascimento as string).split('-')
    return bMm === mm && bDd === dd
  })

  if (aniversariantes.length === 0) return

  const { data: lideres } = await supabase
    .from('users').select('whatsapp').eq('role', 'lider_geral').eq('ativo', true)
  for (const aniv of aniversariantes) {
    const nome = (aniv as any).nome
    const data = `${dd}/${mm}`
    for (const l of (lideres || [])) {
      if ((l as any).whatsapp) {
        await sendWpp((l as any).whatsapp,
          `🎂 *Aniversário hoje!*\n\n*${nome}* faz aniversário em *${data}*.\nLembre-se de parabenizá-lo(a)! 🎉`)
      }
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const { job } = await req.json().catch(() => ({}))

  const hour = new Date().getHours()
  if (hour < 8 || hour >= 21) {
    return new Response(JSON.stringify({ skipped: 'outside_window' }), { status: 200 })
  }

  const handlers: Record<string, () => Promise<void>> = {
    sexta:       handleSextaLembrete,
    sabado:      handleSabadoLembrete,
    aniversario: handleAniversarios,
  }

  const fn = handlers[job]
  if (!fn) return new Response(JSON.stringify({ error: 'unknown job' }), { status: 400 })

  await fn()
  return new Response(JSON.stringify({ ok: true, job }), { status: 200 })
})
