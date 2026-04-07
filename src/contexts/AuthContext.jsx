import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session,  setSession]  = useState(null)
  const [profile,  setProfile]  = useState(null)
  const [loading,  setLoading]  = useState(true)
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
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()
      if (error) throw error
      setProfile(data)
      return data
    } catch (err) {
      console.warn('[Auth] Could not fetch profile:', err.message)
      setProfile(null)
      return null
    }
  }, [])

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('auth-timeout')), 6000)
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
      } finally {
        if (mounted) {
          setLoading(false)
          initializedRef.current = true
        }
      }
    }

    init()

    // Only react to real auth events (sign in, sign out, token refresh)
    // Skip INITIAL_SESSION — handled by init() above
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return
        if (event === 'INITIAL_SESSION') return

        setSession(session)
        if (session?.user) {
          await fetchProfile(session.user.id)
        } else {
          setProfile(null)
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
    return data
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    window.location.href = '/login'
  }

  const refreshProfile = () => {
    if (session?.user) fetchProfile(session.user.id)
  }

  const value = {
    session,
    profile,
    loading,
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
