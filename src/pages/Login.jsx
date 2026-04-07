import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Music, Eye, EyeOff, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import { Button } from '../components/ui/Button.jsx'
import { Input } from '../components/ui/Input.jsx'

// Fallback carousel slides for when no approved content exists
const FALLBACK_SLIDES = [
  { tipo: 'anuncio', descricao: 'Bem-vindo ao Ellos Juventude', texto: 'Sistema de gestão do departamento de jovens da Assembleia de Deus' },
  { tipo: 'anuncio', descricao: 'Conecte-se com seu subdepartamento', texto: 'Louvor · Regência · EBD · Recepção · Mídia' },
  { tipo: 'anuncio', descricao: 'Organização e comunhão', texto: 'Gerencie escalas, briefings e disponibilidade em um só lugar' },
]

function CarouselSlide({ slide, active }) {
  const isVideo = slide.tipo === 'video'
  const videoRef = useRef(null)

  // Play/pause video based on active state
  useEffect(() => {
    if (!videoRef.current) return
    if (active) {
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
    } else {
      videoRef.current.pause()
    }
  }, [active])

  return (
    <div className={`absolute inset-0 transition-opacity duration-700 ${active ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      {slide.url ? (
        isVideo ? (
          <video
            ref={videoRef}
            src={slide.url}
            className="w-full h-full object-cover"
            muted
            loop
            playsInline
          />
        ) : (
          <img src={slide.url} alt={slide.descricao} className="w-full h-full object-cover" />
        )
      ) : (
        <div className="w-full h-full topbar-gradient flex flex-col items-center justify-center p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center mb-4">
            <Music size={28} className="text-white" />
          </div>
          <h2 className="text-white font-semibold text-lg mb-2 text-balance">{slide.descricao}</h2>
          <p className="text-[#9BB5D0] text-sm text-balance">{slide.texto || slide.url}</p>
        </div>
      )}
      {/* Gradient overlay for text readability */}
      {slide.url && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      )}
    </div>
  )
}

export default function Login() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [slides,   setSlides]   = useState(FALLBACK_SLIDES)
  const [current,  setCurrent]  = useState(0)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  // Load approved media content for carousel
  useEffect(() => {
    supabase
      .from('conteudo_login')
      .select('*')
      .eq('status', 'aprovado')
      .order('criado_em', { ascending: false })
      .limit(6)
      .then(({ data }) => {
        if (data && data.length > 0) setSlides(data)
      })
      .catch(() => {}) // stay with fallback
  }, [])

  // Auto-advance carousel
  useEffect(() => {
    if (slides.length <= 1) return
    const timer = setInterval(() => setCurrent(c => (c + 1) % slides.length), 4000)
    return () => clearInterval(timer)
  }, [slides.length])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(
        err.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos.'
          : err.message === 'Email not confirmed'
          ? 'Confirme seu e-mail antes de entrar.'
          : err.message || 'Erro ao entrar. Tente novamente.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row bg-[var(--color-bg)]">

      {/* ── Left: Carousel (desktop) / Top banner (mobile) ── */}
      <div className="lg:flex-1 relative overflow-hidden bg-primary-800">
        {/* Slides */}
        <div className="relative w-full h-48 lg:h-full">
          {slides.map((slide, i) => (
            <CarouselSlide key={i} slide={slide} active={i === current} />
          ))}
        </div>

        {/* Dots */}
        {slides.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                  i === current ? 'bg-white w-4' : 'bg-white/40'
                }`}
              />
            ))}
          </div>
        )}

        {/* Prev / Next arrows */}
        {slides.length > 1 && (
          <>
            <button
              onClick={() => setCurrent(c => (c - 1 + slides.length) % slides.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 hover:bg-black/55 flex items-center justify-center text-white transition-colors backdrop-blur-sm"
              aria-label="Anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCurrent(c => (c + 1) % slides.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 hover:bg-black/55 flex items-center justify-center text-white transition-colors backdrop-blur-sm"
              aria-label="Próximo"
            >
              <ChevronRight size={16} />
            </button>
          </>
        )}

        {/* Slide caption overlay (desktop) */}
        <div className="hidden lg:block absolute bottom-12 left-6 right-6 text-white">
          <p className="text-xs text-white/60 uppercase tracking-wider mb-1 font-medium">
            {slides[current]?.tipo === 'foto' ? 'Foto' : slides[current]?.tipo === 'video' ? 'Vídeo' : 'Anúncio'}
          </p>
          <p className="text-sm font-medium text-white/90">{slides[current]?.descricao}</p>
        </div>
      </div>

      {/* ── Right: Login form ── */}
      <div className="flex-1 lg:max-w-sm xl:max-w-md flex flex-col justify-center px-6 py-8 lg:py-12">
        {/* Logo */}
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-xl topbar-gradient flex items-center justify-center shadow-glow-sm">
              <Music size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[var(--color-text-1)] leading-tight">Ellos Juventude</h1>
              <p className="text-2xs text-[var(--color-text-3)]">Assembleia de Deus</p>
            </div>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-[var(--color-text-1)] mb-1">Entrar na conta</h2>
        <p className="text-sm text-[var(--color-text-3)] mb-6">Use seu e-mail e senha cadastrados</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="E-mail"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            autoComplete="email"
            required
          />

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--color-text-2)]">Senha</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                placeholder="Sua senha"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="input-base pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-3)] hover:text-[var(--color-text-2)]"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="alert-strip danger">
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" fullWidth loading={loading} size="lg">
            Entrar
          </Button>
        </form>

        <div className="mt-4 text-center">
          <p className="text-sm text-[var(--color-text-3)]">
            Ainda não tem acesso?{' '}
            <Link to="/register" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">
              Primeiro acesso
            </Link>
          </p>
        </div>

        <p className="mt-8 text-center text-2xs text-[var(--color-text-3)]">
          © {new Date().getFullYear()} Ellos Juventude · AD
        </p>
      </div>
    </div>
  )
}
