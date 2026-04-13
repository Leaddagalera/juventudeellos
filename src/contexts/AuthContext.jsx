import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase.js'

const AuthContext = createContext(null)

// ── Cache de perfil em localStorage ──────────────────────────────────────────
// Permite que o app abra instantaneamente ao retornar: exibe o perfil cacheado
// imediatamente enquanto a sessão e o perfil atualizado chegam em segundo plano.
const PROFILE_CACHE_KEY = 'ellos-profile-v1'

function getCachedProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function setCachedProfile(data) {
  try {
    if (data) localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data))
    else localStorage.removeItem(PROFILE_CACHE_KEY)
  } catch {}
}

export function AuthProvider({ children }) {
  // Inicializa perfil com o cache — app abre sem spinner na volta
  const [session,          setSession]          = useState(null)
  const [profile,          setProfile]          = useState(() => getCachedProfile())
  const [loading,          setLoading]          = useState(true)
  const [profileLoading,   setProfileLoading]   = useState(false)
  // Se há cache, considera que já tentamos buscar o perfil (evita tela de loading)
  const [profileAttempted, setProfileAttempted] = useState(() => !!getCachedProfile())
  const initializedRef = useRef(false)

  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('ellos-dark')
    if (stored !== null) return stored === 'true'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('ellos-dark', darkMode)
  }, [darkMode])

  const fetchProfile = useCallback(async (userId, { silent = false } = {}) => {
    if (!silent) setProfileLoading(true)
    try {
      const { data, error } = await supabase
        .from('users').select('*').eq('id', userId).single()
      if (error) throw error
      setProfile(data)
      setCachedProfile(data)   // salva no cache para próxima abertura
      return data
    } catch (err) {
      console.warn('[Auth] Could not fetch profile:', err.message)
      // Só limpa o perfil se não houver cache válido (evita tela de erro por rede ruim)
      if (!getCachedProfile()) {
        setProfile(null)
        setCachedProfile(null)
      }
      return null
    } finally {
      if (!silent) setProfileLoading(false)
      setProfileAttempted(true)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const cached = getCachedProfile()

        const { data: { session } } = await supabase.auth.getSession()
        if (!mounted) return

        setSession(session)

        if (!session?.user) {
          // Sem sessão — limpa cache e perfil
          if (cached) { setProfile(null); setCachedProfile(null) }
          setLoading(false)
          initializedRef.current = true
          return
        }

        // Há sessão válida
        if (cached) {
          // Cache disponível → libera o loading imediatamente e busca em segundo plano
          setLoading(false)
          initializedRef.current = true
          fetchProfile(session.user.id, { silent: true })
        } else {
          // Primeira abertura sem cache → aguarda busca normal
          await fetchProfile(session.user.id)
          if (mounted) {
            setLoading(false)
            initializedRef.current = true
          }
        }
      } catch (err) {
        console.warn('[Auth] init failed:', err)
        if (mounted) {
          setLoading(false)
          initializedRef.current = true
        }
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return
        if (event === 'INITIAL_SESSION') return

        if (event === 'SIGNED_OUT') {
          // Verify the sign-out is real before clearing state.
          // Background token refresh failures can emit a spurious SIGNED_OUT.
          try {
            const { data } = await supabase.auth.getSession()
            if (!mounted) return
            if (data.session) {
              // Still have a valid session — the SIGNED_OUT was spurious, ignore it
              return
            }
          } catch { /* ignore — treat as real sign-out */ }
          setSession(null)
          setProfile(null)
          setProfileAttempted(false)
          return
        }

        if (event === 'TOKEN_REFRESHED') {
          // Token silently refreshed — only update the session object, never re-fetch
          // the profile (it hasn't changed) and never reset profileAttempted (would
          // cause a loading flash while the profile re-fetches).
          setSession(newSession)
          return
        }

        // SIGNED_IN, USER_UPDATED, etc. — fetch fresh profile
        setSession(newSession)
        if (newSession?.user) {
          setProfileAttempted(false)
          await fetchProfile(newSession.user.id)
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error

    // Block unapproved users at login — never let them establish a real session
    if (data.user) {
      const { data: userRow } = await supabase
        .from('users').select('ativo').eq('id', data.user.id).single()
      if (userRow?.ativo === false) {
        await supabase.auth.signOut()
        throw new Error('PENDING_APPROVAL')
      }
    }

    return data
  }

  const signUp = async (email, password, profileData) => {
    // Pass all profile data via metadata so the DB trigger can create
    // the public.users row even when email confirmation is enabled
    // (in that case there's no active session, so client-side INSERT would fail RLS).
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: {
        data: {
          nome:            profileData.nome,
          whatsapp:        profileData.whatsapp,
          data_nascimento: profileData.data_nascimento,
          estado_civil:    profileData.estado_civil,
          endereco:        profileData.endereco,
          subdepartamento: profileData.subdepartamento,
          instrumento:     profileData.instrumento || [],
          data_entrada:    profileData.data_entrada,
        }
      }
    })
    if (error) throw error

    // Destroy the auto-created session immediately — unapproved users
    // must not stay logged in. The DB trigger already created their row.
    await supabase.auth.signOut()

    return data
  }

  const signOut = () => {
    // 1. Remove token e cache do localStorage imediatamente
    Object.keys(localStorage)
      .filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
      .forEach(k => localStorage.removeItem(k))
    setCachedProfile(null)
    // 2. Fire-and-forget server-side invalidation
    supabase.auth.signOut().catch(() => {})
    // 3. Limpa estado React e navega imediatamente
    setSession(null)
    setProfile(null)
    setProfileAttempted(false)
    window.location.href = '/login'
  }

  const refreshProfile = () => {
    if (session?.user) fetchProfile(session.user.id)
  }

  const value = {
    session,
    profile,
    loading,
    profileLoading,
    profileAttempted,
    darkMode,
    setDarkMode,
    signIn,
    signUp,
    signOut,
    refreshProfile,
    isLiderGeral:  profile?.role === 'lider_geral',
    isLiderFuncao: profile?.role === 'lider_funcao',
    isMembroServe: profile?.role === 'membro_serve',
    isObservador:  profile?.role === 'membro_observador',
    canEdit:       ['lider_geral', 'lider_funcao', 'membro_serve'].includes(profile?.role),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
