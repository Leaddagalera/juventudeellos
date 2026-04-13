/**
 * InstallPrompt — solicita ao usuário que adicione o app à tela inicial.
 *
 * Android/Chrome: usa o evento nativo `beforeinstallprompt`.
 * iOS/Safari:     mostra instrução manual (Share → Adicionar à Tela).
 *
 * Regras:
 *  - Só aparece em dispositivos móveis
 *  - Não aparece se o app já está instalado (standalone)
 *  - Não aparece se o usuário dispensou nos últimos 14 dias
 *  - Aparece 3 segundos após o app carregar (não interrompe o fluxo)
 */
import { useState, useEffect } from 'react'
import { X, Share, Plus } from 'lucide-react'
import { FlameLogo } from './Logo.jsx'

const STORAGE_KEY  = 'ellos-install-dismissed'
const DISMISS_DAYS = 14

function wasDismissedRecently() {
  try {
    const ts = localStorage.getItem(STORAGE_KEY)
    if (!ts) return false
    return Date.now() - Number(ts) < DISMISS_DAYS * 24 * 60 * 60 * 1000
  } catch { return false }
}

function dismiss() {
  try { localStorage.setItem(STORAGE_KEY, String(Date.now())) } catch {}
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function isIOS() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function InstallPrompt() {
  const [show,        setShow]        = useState(false)
  const [ios,         setIos]         = useState(false)
  const [deferredEvt, setDeferredEvt] = useState(null)

  useEffect(() => {
    // Não mostrar se já instalado, não for mobile, ou foi dispensado recentemente
    if (isStandalone() || !isMobile() || wasDismissedRecently()) return

    if (isIOS()) {
      // iOS não tem evento nativo — aguarda 3s e mostra instrução
      const t = setTimeout(() => { setIos(true); setShow(true) }, 3000)
      return () => clearTimeout(t)
    }

    // Android/Chrome: aguarda o evento beforeinstallprompt
    const handler = (e) => {
      e.preventDefault()
      setDeferredEvt(e)
      const t = setTimeout(() => setShow(true), 3000)
      return () => clearTimeout(t)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredEvt) return
    deferredEvt.prompt()
    const { outcome } = await deferredEvt.userChoice
    if (outcome === 'accepted') {
      setShow(false)
    } else {
      handleDismiss()
    }
  }

  const handleDismiss = () => {
    dismiss()
    setShow(false)
  }

  if (!show) return null

  return (
    <>
      {/* Backdrop escurecido */}
      <div
        className="fixed inset-0 z-[90] bg-black/30 backdrop-blur-sm"
        onClick={handleDismiss}
      />

      {/* Banner deslizando da base */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[91] animate-slide-up"
        style={{ maxWidth: 480, margin: '0 auto' }}
      >
        <div
          className="m-3 rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: 'linear-gradient(135deg, #0F2A4A 0%, #1E3A5F 100%)' }}
        >
          {/* Cabeçalho */}
          <div className="flex items-start justify-between p-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                <FlameLogo size={28} color="white" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm leading-tight">Ellos Juventude</p>
                <p className="text-white/60 text-xs mt-0.5">Adicionar à tela inicial</p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors flex-shrink-0 mt-0.5"
            >
              <X size={14} />
            </button>
          </div>

          {/* Conteúdo */}
          {ios ? (
            <div className="px-4 pb-4">
              <p className="text-white/80 text-sm leading-relaxed mb-3">
                Instale o app para acesso rápido — sem precisar abrir o navegador.
              </p>
              <div className="bg-white/10 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">1</span>
                  </div>
                  <p className="text-white/90 text-xs">
                    Toque em <strong className="text-white">Compartilhar</strong>{' '}
                    <span className="inline-flex items-center gap-0.5 align-middle">
                      <Share size={12} className="text-white/80" />
                    </span>{' '}
                    na barra do Safari
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">2</span>
                  </div>
                  <p className="text-white/90 text-xs">
                    Selecione{' '}
                    <strong className="text-white inline-flex items-center gap-0.5">
                      <Plus size={11} /> Adicionar à Tela de Início
                    </strong>
                  </p>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">3</span>
                  </div>
                  <p className="text-white/90 text-xs">
                    Toque em <strong className="text-white">Adicionar</strong> para confirmar
                  </p>
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="w-full mt-3 py-2 rounded-xl text-white/60 text-xs hover:text-white/80 transition-colors"
              >
                Agora não
              </button>
            </div>
          ) : (
            <div className="px-4 pb-4">
              <p className="text-white/80 text-sm leading-relaxed mb-4">
                Instale o app para acesso rápido, notificações e uso offline — direto na sua tela inicial.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDismiss}
                  className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/70 text-sm font-medium hover:bg-white/5 transition-colors"
                >
                  Agora não
                </button>
                <button
                  onClick={handleInstall}
                  className="flex-1 py-2.5 rounded-xl bg-white text-[#0F2A4A] text-sm font-semibold hover:bg-white/90 transition-colors"
                >
                  Instalar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
