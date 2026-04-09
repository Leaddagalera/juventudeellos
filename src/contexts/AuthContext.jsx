import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session,          setSession]          = useState(null)
  const [profile,          setProfile]          = useState(null)
  const [loading,          setLoading]          = useState(true)
  const [profileLoading,   setProfileLoading]   = useState(false)
  const [profileAttempted, setProfileAttempted] = useState(false)
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

  const fetchProfile = useCallback(async (userId) => {
    setProfileLoading(true)
    try {
      // 8s timeout — prevents hanging on Supabase cold starts (free tier can take 30s+)
      const { data, error } = await Promise.race([
        supabase.from('users').select('*').eq('id', userId).single(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('profile-timeout')), 8000)
        ),
      ])
      if (error) throw error
      setProfile(data)
      return data
    } catch (err) {
      console.warn('[Auth] Could not fetch profile:', err.message)
      setProfile(null)
      return null
    } finally {
      setProfileLoading(false)
      setProfileAttempted(true)  // always fires — even on error/timeout
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        // 15s timeout — generous enough for slow networks and Supabase cold starts
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('auth-timeout')), 15000)
        )
        const { data: { session } } = await Promise.race([
          supabase.auth.getSession(),
          timeout,
        ])
        if (!mounted) return
        setSession(session)
        if (session?.user) await fetchProfile(session.user.id)
      } catch (err) {
        if (err.message !== 'auth-timeout') console.warn('[Auth] init failed:', err)
        // On timeout: leave session/profile as null → user will see login
      } finally {
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
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { nome: profileData.nome } }
    })
    if (error) throw error

    if (data.user) {
      await supabase.from('users').insert({
        id:              data.user.id,
        email,
        nome:            profileData.nome,
        whatsapp:        profileData.whatsapp,
        data_nascimento: profileData.data_nascimento,
        estado_civil:    profileData.estado_civil,
        endereco:        profileData.endereco,
        subdepartamento: profileData.subdepartamento,
        instrumento:     profileData.instrumento || [],
        data_entrada:    profileData.data_entrada,
        role:            'membro_observador',
        ativo:           false,
      })
    }

    // KEY FIX: Destroy the auto-created session immediately.
    // signUp() creates a Supabase session automatically. We don't want
    // unapproved users to be logged in — sign them out right away.
    await supabase.auth.signOut()

    return data
  }

  const signOut = () => {
    // 1. Remove Supabase's stored token from localStorage immediately so the
    //    next page load doesn't pick it up, even if the network call is slow.
    Object.keys(localStorage)
      .filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
      .forEach(k => localStorage.removeItem(k))
    // 2. Fire-and-forget server-side invalidation (don't block navigation).
    supabase.auth.signOut().catch(() => {})
    // 3. Clear React state and navigate away immediately.
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
