/**
 * pushNotifications.js
 *
 * Helpers para Web Push no lado do cliente:
 *   - Verificar suporte e estado da permissão
 *   - Subscrever e salvar endpoint no Supabase
 *   - Cancelar subscrição e remover do Supabase
 *
 * Usage:
 *   import { getPushState, subscribeToPush, unsubscribeFromPush } from '../lib/pushNotifications.js'
 */

import { supabase } from './supabase.js'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// Converte a VAPID public key de base64url para Uint8Array
// (exigido pela API pushManager.subscribe)
function urlB64ToUint8Array(b64) {
  const padding = '='.repeat((4 - b64.length % 4) % 4)
  const base64  = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

/**
 * Retorna o estado atual das notificações push para este dispositivo.
 * Estados:
 *   'unsupported' — browser não suporta SW/Push
 *   'denied'      — usuário bloqueou a permissão
 *   'subscribed'  — ativo e subscrito
 *   'default'     — suportado mas não subscrito ainda
 */
export async function getPushState() {
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return 'unsupported'
  }

  if (Notification.permission === 'denied') return 'denied'

  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return sub ? 'subscribed' : 'default'
  } catch {
    return 'default'
  }
}

/**
 * Solicita permissão, cria a subscrição push e salva no Supabase.
 * Lança Error se o usuário negar ou ocorrer alguma falha.
 */
export async function subscribeToPush(userId) {
  if (!VAPID_PUBLIC_KEY) {
    throw new Error('VITE_VAPID_PUBLIC_KEY não configurada.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Permissão de notificações negada.')
  }

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly:      true,
    applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
  })

  const { endpoint, keys } = sub.toJSON()

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ user_id: userId, endpoint, keys }, { onConflict: 'endpoint' })

  if (error) throw error
  return sub
}

/**
 * Cancela a subscrição push deste dispositivo e remove do Supabase.
 */
export async function unsubscribeFromPush(userId) {
  if (!('serviceWorker' in navigator)) return

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return

  const { endpoint } = sub.toJSON()
  await sub.unsubscribe()

  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
}
