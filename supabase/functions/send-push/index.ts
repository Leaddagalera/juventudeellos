/**
 * Edge Function: send-push
 *
 * Envia Web Push notifications para membros com base no destinatário do comunicado.
 * Usa o protocolo Web Push (RFC 8030/8291/8292) com VAPID para autenticação.
 *
 * Body esperado: { title, body, url?, destinatario }
 *   destinatario: 'todos' | 'lideres' | 'louvor' | 'regencia' | 'ebd' | 'recepcao' | 'midia'
 *
 * Requer secrets no Supabase:
 *   VAPID_PUBLIC_KEY   — chave pública VAPID (base64url, 65 bytes)
 *   VAPID_PRIVATE_KEY  — chave privada VAPID (base64url, 32 bytes)
 *   VAPID_SUBJECT      — mailto: ou URL do app
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:ellos@ad.com.br'

// ── Utilitários base64url ─────────────────────────────────────────────────────

function b64urlDecode(s: string): Uint8Array {
  const padding = '='.repeat((4 - s.length % 4) % 4)
  const b64     = (s + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(b64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let binary  = ''
  bytes.forEach(b => (binary += String.fromCharCode(b)))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

const enc = new TextEncoder()

// ── VAPID JWT ─────────────────────────────────────────────────────────────────

async function buildVapidJWT(audience: string): Promise<{ header: string; publicKey: string }> {
  const now     = Math.floor(Date.now() / 1000)
  const header  = b64urlEncode(enc.encode(JSON.stringify({ alg: 'ES256', typ: 'JWT' })))
  const payload = b64urlEncode(enc.encode(JSON.stringify({
    aud: audience,
    exp: now + 43_200, // 12 horas
    sub: VAPID_SUBJECT,
  })))

  // Constrói JWK a partir das chaves VAPID raw
  const pubBytes = b64urlDecode(VAPID_PUBLIC_KEY) // 65 bytes: 0x04 || x (32) || y (32)
  const x = b64urlEncode(pubBytes.slice(1, 33))
  const y = b64urlEncode(pubBytes.slice(33, 65))

  const privKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d: VAPID_PRIVATE_KEY, key_ops: ['sign'], ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privKey,
    enc.encode(`${header}.${payload}`),
  )

  return {
    header:    `${header}.${payload}.${b64urlEncode(sig)}`,
    publicKey: VAPID_PUBLIC_KEY,
  }
}

// ── Criptografia AES128GCM (RFC 8291) ─────────────────────────────────────────

async function encryptPayload(
  plaintext: string,
  p256dhB64: string,
  authB64: string,
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const uaPublic = b64urlDecode(p256dhB64)   // chave pública do browser (65 bytes)
  const uaAuth   = b64urlDecode(authB64)     // auth secret do browser (16 bytes)

  // 1. Gerar par de chaves ECDH efêmero do servidor
  const serverKP = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  )

  const serverPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKP.publicKey))

  // 2. Importar a chave pública do UA para ECDH
  const uaPublicKey = await crypto.subtle.importKey(
    'raw', uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, [],
  )

  // 3. Derivar IKM via ECDH
  const ecdhBits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaPublicKey },
    serverKP.privateKey,
    256,
  ))

  // 4. Derivar PRK via HKDF-SHA256 usando uaAuth como salt
  const prkKey = await crypto.subtle.importKey('raw', uaAuth, 'HKDF', false, ['deriveKey', 'deriveBits'])
  const prk    = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: ecdhBits, info: buildInfo('WebPush: info', uaPublic, serverPublicRaw) },
    prkKey,
    256,
  ))

  // 5. Gerar salt aleatório de 16 bytes
  const salt = crypto.getRandomValues(new Uint8Array(16))

  // 6. Derivar CEK e nonce
  const ikmKey = await crypto.subtle.importKey('raw', prk, 'HKDF', false, ['deriveKey', 'deriveBits'])

  const cek = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: buildCEKInfo() },
    ikmKey, 128,
  ))
  const nonce = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: buildNonceInfo() },
    ikmKey, 96,
  ))

  // 7. Encriptar com AES-128-GCM
  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const record  = buildRecord(enc.encode(plaintext))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, record)

  return { ciphertext: new Uint8Array(encrypted), salt, serverPublicKey: serverPublicRaw }
}

function buildInfo(type: string, ua: Uint8Array, as: Uint8Array): Uint8Array {
  const t    = enc.encode(type)
  const buf  = new Uint8Array(t.length + 1 + 2 + ua.length + 2 + as.length)
  let off    = 0
  buf.set(t, off); off += t.length
  buf[off++] = 0x00
  // ua length (big-endian u16)
  buf[off++] = (ua.length >> 8) & 0xff; buf[off++] = ua.length & 0xff
  buf.set(ua, off); off += ua.length
  buf[off++] = (as.length >> 8) & 0xff; buf[off++] = as.length & 0xff
  buf.set(as, off)
  return buf
}

function buildCEKInfo(): Uint8Array {
  const label = enc.encode('Content-Encoding: aes128gcm')
  const buf   = new Uint8Array(label.length + 2)
  buf.set(label); buf[label.length] = 0x00; buf[label.length + 1] = 0x01
  return buf
}

function buildNonceInfo(): Uint8Array {
  const label = enc.encode('Content-Encoding: nonce')
  const buf   = new Uint8Array(label.length + 2)
  buf.set(label); buf[label.length] = 0x00; buf[label.length + 1] = 0x01
  return buf
}

function buildRecord(plaintext: Uint8Array): Uint8Array {
  // padding delimiter = 0x02, no padding
  const buf = new Uint8Array(plaintext.length + 1)
  buf.set(plaintext)
  buf[plaintext.length] = 0x02
  return buf
}

// ── Enviar uma notificação para um endpoint ───────────────────────────────────

async function sendToSubscription(
  endpoint: string,
  keys: { p256dh: string; auth: string },
  payload: string,
): Promise<number> {
  const url      = new URL(endpoint)
  const audience = `${url.protocol}//${url.host}`

  const { header: jwt, publicKey } = await buildVapidJWT(audience)
  const { ciphertext, salt, serverPublicKey } = await encryptPayload(payload, keys.p256dh, keys.auth)

  // Montar cabeçalho AES128GCM
  const rs    = 4096
  const klen  = serverPublicKey.length // 65
  const header = new Uint8Array(16 + 4 + 1 + klen)
  header.set(salt)
  // rs em big-endian u32
  header[16] = (rs >> 24) & 0xff
  header[17] = (rs >> 16) & 0xff
  header[18] = (rs >> 8)  & 0xff
  header[19] = rs         & 0xff
  header[20] = klen
  header.set(serverPublicKey, 21)

  const body = new Uint8Array(header.length + ciphertext.length)
  body.set(header)
  body.set(ciphertext, header.length)

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: {
      'Authorization':      `vapid t=${jwt},k=${publicKey}`,
      'Content-Type':       'application/octet-stream',
      'Content-Encoding':   'aes128gcm',
      'TTL':                '86400',
      'Content-Length':     String(body.length),
    },
    body,
  })

  return res.status
}

// ── Entry point ───────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  // Verificar JWT do caller
  const authHeader = req.headers.get('Authorization') ?? ''
  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  )
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: CORS })
  }

  // Apenas líderes podem disparar push
  const { data: caller } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (!['lider_geral', 'lider_funcao'].includes(caller?.role ?? '')) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: CORS })
  }

  const { title, body: msgBody, url = '/', destinatario = 'todos', tag = 'comunicado' } =
    await req.json() as { title: string; body: string; url?: string; destinatario?: string; tag?: string }

  if (!title || !msgBody) {
    return new Response(JSON.stringify({ error: 'title e body são obrigatórios' }), { status: 400, headers: CORS })
  }

  // Determinar destinatários
  let usersQ = supabase.from('users').select('id').eq('ativo', true)
  if (destinatario === 'lideres') {
    usersQ = usersQ.in('role', ['lider_geral', 'lider_funcao'])
  } else if (destinatario !== 'todos') {
    usersQ = usersQ.contains('subdepartamento', [destinatario])
  }

  const { data: targets } = await usersQ
  const userIds = (targets ?? []).map((u: { id: string }) => u.id)
  if (userIds.length === 0) {
    return new Response(JSON.stringify({ sent: 0, failed: 0 }), { headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  // Buscar subscrições
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, keys, user_id')
    .in('user_id', userIds)

  const payload      = JSON.stringify({ title, body: msgBody, url, tag })
  let sent           = 0
  let failed         = 0
  const stale: string[] = []

  for (const sub of (subs ?? [])) {
    try {
      const status = await sendToSubscription(sub.endpoint, sub.keys, payload)
      if (status === 201 || status === 200) {
        sent++
      } else if (status === 404 || status === 410) {
        // Subscrição expirada
        stale.push(sub.endpoint)
        failed++
      } else {
        console.warn('[send-push] status inesperado:', status, sub.endpoint)
        failed++
      }
    } catch (e) {
      console.error('[send-push] erro:', e)
      failed++
    }
  }

  // Limpar subscrições expiradas
  if (stale.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', stale)
  }

  return new Response(
    JSON.stringify({ sent, failed, stale: stale.length }),
    { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
  )
})
