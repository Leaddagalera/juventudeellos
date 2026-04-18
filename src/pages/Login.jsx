import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Clock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import { EllosLogo } from '../components/ui/Logo.jsx'
import { TypewriterText } from '../components/ui/TypewriterText.jsx'

// Fallback when no approved media exists
const FALLBACK_SLIDES = [
  { tipo: 'anuncio', descricao: 'Bem-vindo ao Ellos Juventude' },
  { tipo: 'anuncio', descricao: 'Conecte-se com seu subdepartamento' },
  { tipo: 'anuncio', descricao: 'Organização e comunhão' },
]

export default function Login() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [pending,  setPending]  = useState(false)
  const [slides,   setSlides]   = useState(FALLBACK_SLIDES)
  const [current,  setCurrent]  = useState(0)
  const videoRef  = useRef(null)
  const { signIn } = useAuth()
  const navigate  = useNavigate()

  // Load approved media
  useEffect(() => {
    supabase
      .from('conteudo_login')
      .select('*')
      .eq('status', 'aprovado')
      .order('criado_em', { ascending: false })
      .limit(6)
      .then(({ data }) => { if (data?.length) setSlides(data) })
      .catch(() => {})
  }, [])

  // Auto-advance every 5s
  useEffect(() => {
    if (slides.length <= 1) return
    const t = setInterval(() => setCurrent(c => (c + 1) % slides.length), 5000)
    return () => clearInterval(t)
  }, [slides.length])

  // Play/pause video on slide change
  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.currentTime = 0
    videoRef.current.play().catch(() => {})
  }, [current])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      if (err.message === 'PENDING_APPROVAL') {
        setPending(true)
      } else {
        setError(
          err.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.'
            : err.message === 'Email not confirmed'   ? 'Confirme seu e-mail antes de entrar.'
            : err.message || 'Erro ao entrar. Tente novamente.'
        )
      }
    } finally {
      setLoading(false)
    }
  }

  const slide      = slides[current] || slides[0]
  const hasMedia   = !!slide?.url
  const isVideo    = slide?.tipo === 'video'

  // Pending approval overlay — shown after login attempt by unapproved user
  if (pending) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'linear-gradient(to bottom, #0f2744, #1E3A5F)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: 'rgba(251,191,36,0.15)',
            border: '1px solid rgba(251,191,36,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <Clock size={32} color="#FBB724" />
          </div>
          <p style={{ color: 'white', fontWeight: 700, fontSize: 20, margin: '0 0 12px' }}>
            Aguardando aprovação
          </p>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 1.6, margin: '0 0 8px' }}>
            Seu cadastro foi recebido com sucesso e está aguardando a aprovação do <strong style={{ color: 'rgba(255,255,255,0.9)' }}>Líder Geral</strong>.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: '0 0 32px' }}>
            Você receberá uma notificação no WhatsApp quando for aprovado.
          </p>
          <button
            onClick={() => setPending(false)}
            style={{
              padding: '12px 32px',
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 12, color: 'white',
              fontSize: 14, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Voltar ao login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height: '100svh', overflow: 'hidden', background: '#1E3A5F' }}>

      {/* ── LAYER 0: Background image / video ── */}
      {hasMedia && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          {slides.map((s, i) => (
            s.url ? (
              s.tipo === 'video' ? (
                <video
                  key={i}
                  ref={i === current ? videoRef : null}
                  src={s.url}
                  style={{
                    position: 'absolute', inset: 0,
                    width: '100%', height: '100%',
                    objectFit: 'cover', objectPosition: 'center top',
                    opacity: i === current ? 1 : 0,
                    transition: 'opacity 0.7s ease',
                  }}
                  muted loop playsInline
                />
              ) : (
                <img
                  key={i}
                  src={s.url}
                  alt={s.descricao}
                  style={{
                    position: 'absolute', inset: 0,
                    width: '100%', height: '100%',
                    objectFit: 'cover', objectPosition: 'center top',
                    opacity: i === current ? 1 : 0,
                    transition: 'opacity 0.7s ease',
                  }}
                />
              )
            ) : null
          ))}
        </div>
      )}

      {/* ── LAYER 1: Gradient overlay (always) ── */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1,
        background: hasMedia
          ? 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 30%, rgba(0,0,0,0.7) 60%, rgba(0,0,0,0.93) 100%)'
          : 'linear-gradient(to bottom, rgba(30,58,95,0.6) 0%, rgba(30,58,95,0.95) 100%)',
      }} />

      {/* ── LAYER 2: Story progress bars (top) ── */}
      {slides.length > 1 && (
        <div style={{
          position: 'absolute', top: 16, left: 0, right: 0,
          zIndex: 3, display: 'flex', gap: 4, padding: '0 16px',
        }}>
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              style={{
                flex: 1, height: 2, borderRadius: 2, border: 'none', padding: 0, cursor: 'pointer',
                background: i === current ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)',
                transition: 'background 0.3s',
              }}
            />
          ))}
        </div>
      )}

      {/* ── LAYER 3: Login form (bottom overlay) ── */}
      <div style={{
        position: 'absolute', bottom: 0,
        left: '50%', transform: 'translateX(-50%)',
        zIndex: 2, padding: '24px 24px 40px',
        maxWidth: 420, width: '100%',
      }}>

        {/* Logo */}
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
          <EllosLogo height={240} style={{ filter: 'brightness(0) invert(1) drop-shadow(0 2px 16px rgba(0,0,0,0.5))' }} />
        </div>

        {/* Slogan fixo */}
        <p style={{
          color: 'rgba(255,255,255,0.38)',
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          textAlign: 'center',
          margin: '0 0 2px',
        }}>
          O elo entre disponibilidade e serviço
        </p>

        {/* Animação de palavras — TypewriterText */}
        <TypewriterText style={{ marginBottom: 28 }} />

        {/* Slide caption */}
        {slide?.descricao && hasMedia && (
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginBottom: 16, fontStyle: 'italic' }}>
            {slide.descricao}
          </p>
        )}

        {/* Form heading */}
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>
          Entrar na conta
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            required
            style={inputStyle}
          />

          <div style={{ position: 'relative' }}>
            <input
              type={showPw ? 'text' : 'password'}
              placeholder="Senha"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              style={{ ...inputStyle, paddingRight: 42 }}
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                color: 'rgba(255,255,255,0.5)',
              }}
            >
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <p style={{
              color: '#FCA5A5', fontSize: 12, margin: 0,
              background: 'rgba(220,38,38,0.2)', padding: '8px 12px',
              borderRadius: 8, border: '1px solid rgba(220,38,38,0.3)',
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 2,
              padding: '13px 0',
              background: loading ? 'rgba(255,255,255,0.15)' : 'white',
              color: loading ? 'rgba(255,255,255,0.6)' : '#1E3A5F',
              border: 'none', borderRadius: 12,
              fontWeight: 600, fontSize: 15, cursor: loading ? 'default' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
          Ainda não tem acesso?{' '}
          <Link to="/register" style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 500, textDecoration: 'underline' }}>
            Primeiro acesso
          </Link>
        </p>
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '13px 14px',
  background: 'rgba(255,255,255,0.12)',
  backdropFilter: 'blur(8px)',
  border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: 12,
  color: 'white',
  fontSize: 16,
  outline: 'none',
  boxSizing: 'border-box',
}
