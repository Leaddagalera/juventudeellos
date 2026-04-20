import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase.js'

const AuthContext = createContext(null)

// ── Cache de perfil em localStorage ──────────────────────────────────────────
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
  const cached = getCachedProfile()

  const [session,          setSession]          = useState(null)
  const [profile,          setProfile]          = useState(cached)
  const [profileLoading,   setProfileLoading]   = useState(false)
  const [profileAttempted, setProfileAttempted] = useState(!!cached)
  const initializedRef = useRef(false)

  // loading: true apenas na primeira abertura sem cache (sem dados para mostrar)
  const [loading,   setLoading]   = useState(!cached)

  // hydrating: true enquanto a sessão está sendo verificada com cache disponível.
  // Permite mostrar o conteúdo do cache sem redirecionar para login antes da resposta.
  const [hydrating, setHydrating] = useState(!!cached)

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
      // Só atualiza referência se os dados realmente mudaram
      setProfile(prev => JSON.stringify(prev) === JSON.stringify(data) ? prev : data)
      setCachedProfile(data)
      return data
    } catch (err) {
      console.warn('[Auth] Could not fetch profile:', err.message)
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
      const hasCached = !!getCachedProfile()

      try {
        // Timeout de 8s em getSession para evitar travamento em rede ruim.
        // Resolve com null no timeout em vez de rejeitar, para não cair no catch.
        let sessionData = null
        try {
          const result = await Promise.race([
            supabase.auth.getSession(),
            new Promise(resolve =>
              setTimeout(() => resolve({ data: { session: null }, timedOut: true }), 8000)
            ),
          ])

          if (result.timedOut) {
            // Timeout: se há cache, mantém hydrating=true e espera onAuthStateChange.
            // O Supabase vai retentar o refresh e emitir TOKEN_REFRESHED ou SIGNED_OUT.
            if (!mounted) return
            if (!hasCached) {
              // Sem cache e sem sessão confirmada → redireciona para login
              setLoading(false)
              setHydrating(false)
              initializedRef.current = true
            }
            // Com cache: mantém tudo como está, onAuthStateChange resolve
            return
          }

          sessionData = result.data?.session
        } catch (sessionErr) {
          console.warn('[Auth] getSession error:', sessionErr.message)
          if (mounted) {
            setHydrating(false)
            setLoading(false)
            initializedRef.current = true
          }
          return
        }

        if (!mounted) return
        setSession(prev => prev?.access_token === sessionData?.access_token ? prev : sessionData)

        if (!sessionData?.user) {
          // Sessão inválida ou expirada
          if (hasCached) {
            setProfile(null)
            setCachedProfile(null)
            setProfileAttempted(false)
          }
          setHydrating(false)
          setLoading(false)
          initializedRef.current = true
          return
        }

        // Sessão válida
        setHydrating(false)
        if (hasCached) {
          // Cache existe: UI já está visível, atualiza perfil silenciosamente
          setLoading(false)
          initializedRef.current = true
          fetchProfile(sessionData.user.id, { silent: true })
        } else {
          // Primeira abertura sem cache
          await fetchProfile(sessionData.user.id)
          if (mounted) {
            setLoading(false)
            initializedRef.current = true
          }
        }
      } catch (err) {
        console.warn('[Auth] init failed:', err)
        if (mounted) {
          setHydrating(false)
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
          // Se há cache/sessão local, ignora sign-out espúrio (comum no mobile)
          if (getCachedProfile()) return
          setSession(null)
          setProfile(null)
          setCachedProfile(null)
          setProfileAttempted(false)
          setHydrating(false)
          return
        }

        if (event === 'TOKEN_REFRESHED') {
          // Token renovado silenciosamente — atualiza sessão e encerra hydrating
          setSession(prev => prev?.access_token === newSession?.access_token ? prev : newSession)
          setHydrating(false)
          return
        }

        // SIGNED_IN, USER_UPDATED, etc.
        setSession(prev => prev?.access_token === newSession?.access_token ? prev : newSession)
        setHydrating(false)
        if (newSession?.user) {
          // Usa silent para não resetar profileAttempted/profileLoading,
          // o que causaria RequireAuth a desmontar a página (loop no mobile)
          fetchProfile(newSession.user.id, { silent: true })
        }
      }
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    // Nota: a verificação de ativo=false é feita por RequireAuth via fetchProfile,
    // evitando query extra ao banco que pode bloquear o login quando o pool está saturado.
    return data
  }, [])

  const signUp = useCallback(async (email, password, profileData) => {
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
    await supabase.auth.signOut()
    return data
  }, [])

  const signOut = useCallback(() => {
    Object.keys(localStorage)
      .filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
      .forEach(k => localStorage.removeItem(k))
    setCachedProfile(null)
    supabase.auth.signOut().catch(() => {})
    setSession(null)
    setProfile(null)
    setProfileAttempted(false)
    setHydrating(false)
    window.location.href = '/login'
  }, [])

  const refreshProfile = useCallback(() => {
    if (session?.user) fetchProfile(session.user.id)
  }, [session?.user?.id, fetchProfile])

  const role = profile?.role
  const profileId = profile?.id
  const sessionToken = session?.access_token
  const value = useMemo(() => ({
    session,
    profile,
    loading,
    hydrating,
    profileLoading,
    profileAttempted,
    darkMode,
    setDarkMode,
    signIn,
    signUp,
    signOut,
    refreshProfile,
    isLiderGeral:  role === 'lider_geral',
    isLiderFuncao: role === 'lider_funcao',
    isMembroServe: role === 'membro_serve',
    isObservador:  role === 'membro_observador',
    canEdit:       role === 'lider_geral' || role === 'lider_funcao' || role === 'membro_serve',
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sessionToken, profileId, role, loading, hydrating, profileLoading, profileAttempted, darkMode, signIn, signUp, signOut, refreshProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
