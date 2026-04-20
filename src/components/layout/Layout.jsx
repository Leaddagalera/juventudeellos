import { useState, useEffect, useRef } from 'react'
import { Outlet, useLocation, Link } from 'react-router-dom'
import { Menu, X, Bell, BellOff, BellRing, HelpCircle, ExternalLink, ChevronDown, ChevronRight, LogOut, User, Check } from 'lucide-react'
import { Sidebar } from './Sidebar.jsx'
import { MobileNav } from './MobileNav.jsx'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { Avatar } from '../ui/Card.jsx'
import { subdepLabel } from '../../lib/utils.js'

const PAGE_TITLES = {
  '/dashboard':     'Dashboard',
  '/members':       'Membros',
  '/schedule':      'Escalas',
  '/briefing':      'Briefing',
  '/availability':  'Disponibilidade',
  '/visitors':      'Visitantes',
  '/reports':       'Relatórios',
  '/media':         'Mídia',
  '/announcements': 'Comunicados',
  '/profile':       'Perfil',
}

const PROBLEMAS_RECORRENTES = [
  {
    pergunta: 'O app fica em tela de carregamento infinito',
    resposta: 'Saia do app e abra novamente. Se persistir, limpe o cache: no Chrome/Android acesse Configurações → Apps → Chrome → Armazenamento → Limpar cache. No iPhone, acesse Configurações → Safari → Limpar histórico e dados. Depois faça login novamente. Verifique também sua conexão com a internet.',
  },
  {
    pergunta: 'Minha foto de perfil não aparece',
    resposta: 'Acesse Perfil, toque no avatar e selecione uma foto. Certifique-se de que a imagem tem menos de 5 MB. Se o problema continuar, saia e entre novamente.',
  },
  {
    pergunta: 'Minha escala não aparece no dashboard',
    resposta: 'A escala só é exibida quando o Líder Geral publica o ciclo. Verifique se você preencheu a disponibilidade no período correto.',
  },
  {
    pergunta: 'Não consigo confirmar presença na escala',
    resposta: 'O botão "Confirmar" só aparece quando o ciclo está em fase de confirmações. Aguarde o Líder Geral abrir essa fase.',
  },
  {
    pergunta: 'Cadastrei minha conta mas não consigo entrar',
    resposta: 'Seu cadastro precisa ser aprovado pelo Líder Geral. Aguarde uma notificação no WhatsApp confirmar sua aprovação.',
  },
  {
    pergunta: 'O ícone do app na tela inicial ficou errado',
    resposta: 'Remova o atalho da tela inicial e adicione novamente pelo navegador (menu → "Adicionar à tela inicial").',
  },
  {
    pergunta: 'Não estou vendo a aba de Visitantes',
    resposta: 'A aba Visitantes é exibida automaticamente para membros do subdepartamento de Recepção. Peça ao Líder Geral para verificar seu cadastro.',
  },
]

function HelpModal({ onClose }) {
  const [expanded, setExpanded] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end pt-14 px-2 lg:px-4">
      <div
        ref={ref}
        className="w-full max-w-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-xl overflow-hidden animate-slide-up"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <p className="text-sm font-semibold text-[var(--color-text-1)]">Central de Ajuda</p>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-3)] hover:bg-[var(--color-bg-2)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[70vh]">
          <div className="px-4 py-3 border-b border-[var(--color-border)]">
            <p className="text-xs font-semibold text-[var(--color-text-3)] uppercase tracking-wide mb-2">Tutoriais em vídeo</p>
            <button
              onClick={() => window.open('https://drive.google.com/drive/folders/1R0CTJHesKHHtbKLQNcT69rI9_92YkeMf', '_blank', 'noopener,noreferrer')}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
            >
              <span className="text-xs font-medium flex-1 text-left">Assistir tutoriais no Google Drive</span>
              <ExternalLink size={13} className="flex-shrink-0" />
            </button>
          </div>

          <div className="px-4 py-3">
            <p className="text-xs font-semibold text-[var(--color-text-3)] uppercase tracking-wide mb-2">Problemas frequentes</p>
            <div className="space-y-1">
              {PROBLEMAS_RECORRENTES.map((item, i) => (
                <div key={i} className="rounded-xl overflow-hidden border border-[var(--color-border)]">
                  <button
                    onClick={() => setExpanded(expanded === i ? null : i)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--color-bg-2)] transition-colors"
                  >
                    {expanded === i
                      ? <ChevronDown size={13} className="flex-shrink-0 text-primary-500" />
                      : <ChevronRight size={13} className="flex-shrink-0 text-[var(--color-text-3)]" />
                    }
                    <span className="text-xs font-medium text-[var(--color-text-1)]">{item.pergunta}</span>
                  </button>
                  {expanded === i && (
                    <div className="px-3 pb-3">
                      <p className="text-xs text-[var(--color-text-2)] leading-relaxed border-t border-[var(--color-border)] pt-2">
                        {item.resposta}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [helpOpen,    setHelpOpen]    = useState(false)
  const { profile, isLiderGeral, signOut } = useAuth()
  const [userMenuOpen,  setUserMenuOpen]  = useState(false)
  const [notifMenuOpen, setNotifMenuOpen] = useState(false)
  const [notifPerm,     setNotifPerm]     = useState(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )
  const userMenuRef  = useRef(null)
  const notifMenuRef = useRef(null)

  // Fecha menus ao clicar fora
  useEffect(() => {
    const handler = (e) => {
      if (userMenuRef.current  && !userMenuRef.current.contains(e.target))  setUserMenuOpen(false)
      if (notifMenuRef.current && !notifMenuRef.current.contains(e.target)) setNotifMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [])

  async function requestNotifPermission() {
    if (typeof Notification === 'undefined') return
    const result = await Notification.requestPermission()
    setNotifPerm(result)
  }
  const location = useLocation()

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') { setSidebarOpen(false); setHelpOpen(false) } }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const title = PAGE_TITLES[location.pathname] || 'Ellos Juventude'

  return (
    <div className="flex h-dvh bg-[var(--color-bg)]">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex flex-shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-10 flex animate-slide-up">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Help modal */}
      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Top bar — safe-pt is outer padding so the notch sits ABOVE the 56-px bar */}
        <header className="flex-shrink-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] safe-pt">
          <div className="h-14 flex items-center justify-between px-4">
            <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-2)] hover:bg-[var(--color-bg-2)] transition-colors"
            >
              <Menu size={18} />
            </button>
            <h1 className="text-sm font-semibold text-[var(--color-text-1)]">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHelpOpen(v => !v)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-2)] hover:bg-[var(--color-bg-2)] transition-colors"
              title="Ajuda"
            >
              <HelpCircle size={17} />
            </button>
            {/* Sino + dropdown de notificações */}
            <div ref={notifMenuRef} className="relative">
              <button
                onClick={() => { setNotifMenuOpen(v => !v); setUserMenuOpen(false) }}
                className="relative w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-2)] hover:bg-[var(--color-bg-2)] transition-colors"
                title="Notificações"
              >
                <Bell size={16} />
                {/* Ponto vermelho: lider com pendências OU notificações não habilitadas */}
                {(isLiderGeral || notifPerm !== 'granted') && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-danger-500 animate-pulse-dot" />
                )}
              </button>

              {notifMenuOpen && (
                <div className="absolute right-0 top-10 z-50 w-72 rounded-2xl shadow-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden animate-fade-in">

                  {/* Cabeçalho */}
                  <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-2)]">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-3)]">Notificações</p>
                  </div>

                  <div className="p-4 space-y-3">
                    {notifPerm === 'unsupported' && (
                      <div className="flex items-start gap-3">
                        <BellOff size={18} className="text-[var(--color-text-3)] flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-[var(--color-text-3)] leading-snug">
                          Seu navegador não suporta notificações.
                        </p>
                      </div>
                    )}

                    {notifPerm === 'granted' && (
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-full bg-success-100 dark:bg-success-900/30 flex items-center justify-center flex-shrink-0">
                          <Check size={15} className="text-success-600 dark:text-success-400" />
                        </span>
                        <div>
                          <p className="text-sm font-medium text-[var(--color-text-1)]">Notificações ativadas</p>
                          <p className="text-xs text-[var(--color-text-3)]">Você receberá alertas deste app.</p>
                        </div>
                      </div>
                    )}

                    {notifPerm === 'default' && (
                      <>
                        <div className="flex items-start gap-3">
                          <span className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                            <BellRing size={15} className="text-amber-600 dark:text-amber-400" />
                          </span>
                          <div>
                            <p className="text-sm font-medium text-[var(--color-text-1)]">Ativar notificações</p>
                            <p className="text-xs text-[var(--color-text-3)] leading-snug">
                              Receba alertas de escalas, comunicados e confirmações de presença.
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={requestNotifPermission}
                          className="w-full py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white text-sm font-semibold transition-colors"
                        >
                          Permitir notificações
                        </button>
                      </>
                    )}

                    {notifPerm === 'denied' && (
                      <div className="space-y-2">
                        <div className="flex items-start gap-3">
                          <span className="w-8 h-8 rounded-full bg-danger-100 dark:bg-danger-900/30 flex items-center justify-center flex-shrink-0">
                            <BellOff size={15} className="text-danger-600 dark:text-danger-400" />
                          </span>
                          <div>
                            <p className="text-sm font-medium text-[var(--color-text-1)]">Notificações bloqueadas</p>
                            <p className="text-xs text-[var(--color-text-3)] leading-snug">
                              Você bloqueou as notificações. Para reativar, acesse as configurações do navegador e permita notificações para este site.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            {/* Avatar clicável + dropdown de perfil */}
            <div ref={userMenuRef} className="relative lg:hidden">
              <button
                onClick={() => setUserMenuOpen(v => !v)}
                className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                aria-label="Menu do usuário"
              >
                <Avatar nome={profile?.nome} src={profile?.foto_url} size="sm" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-10 z-50 w-64 rounded-2xl shadow-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden animate-fade-in">

                  {/* Cabeçalho com foto e nome */}
                  <div className="flex items-center gap-3 px-4 py-4 bg-[var(--color-bg-2)]">
                    <Avatar nome={profile?.nome} src={profile?.foto_url} size="lg" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--color-text-1)] truncate">
                        {profile?.nome?.split(' ').slice(0, 2).join(' ')}
                      </p>
                      <p className="text-xs text-[var(--color-text-3)] truncate">
                        {(() => {
                          const subs = Array.isArray(profile?.subdepartamento)
                            ? profile.subdepartamento
                            : profile?.subdepartamento ? [profile.subdepartamento] : []
                          return subs.length > 0
                            ? subs.map(s => subdepLabel(s)).join(' · ')
                            : isLiderGeral ? 'Líder Geral' : 'Membro'
                        })()}
                      </p>
                    </div>
                  </div>

                  <div className="p-2 space-y-0.5">
                    {/* Link para perfil */}
                    <Link
                      to="/profile"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[var(--color-text-2)] hover:bg-[var(--color-bg-2)] transition-colors"
                    >
                      <User size={15} className="text-[var(--color-text-3)]" />
                      Editar perfil
                    </Link>

                    {/* Divisor */}
                    <div className="h-px bg-[var(--color-border)] my-1" />

                    {/* Logout */}
                    <button
                      onClick={() => { setUserMenuOpen(false); signOut() }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-danger-600 dark:text-danger-400 hover:bg-danger-50 dark:hover:bg-danger-950/30 transition-colors"
                    >
                      <LogOut size={15} />
                      Sair da conta
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-16 lg:pb-0">
          <div className="page-enter">
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom nav */}
        <div className="lg:hidden">
          <MobileNav />
        </div>
      </div>
    </div>
  )
}
