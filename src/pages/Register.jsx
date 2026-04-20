import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Music, CheckCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Input, Select, ChipSelect } from '../components/ui/Input.jsx'

const SUBDEPS = [
  { value: 'louvor',     label: 'Louvor' },
  { value: 'regencia',   label: 'Regência' },
  { value: 'ebd',        label: 'EBD' },
  { value: 'recepcao',   label: 'Recepção' },
  { value: 'midia',      label: 'Mídia' },
  { value: 'observador', label: 'Membro Observador' },
]

// "observador" é exclusivo — não acumula com outros subdeps

const INSTRUMENTOS = [
  { value: 'violao',   label: 'Violão' },
  { value: 'guitarra', label: 'Guitarra' },
  { value: 'baixo',    label: 'Baixo' },
  { value: 'teclado',  label: 'Teclado' },
  { value: 'bateria',  label: 'Bateria' },
  { value: 'voz',      label: 'Voz' },
  { value: 'flauta',   label: 'Flauta' },
  { value: 'trompete', label: 'Trompete' },
]

const ESTADO_CIVIL = [
  { value: 'solteiro',  label: 'Solteiro(a)' },
  { value: 'casado',    label: 'Casado(a)' },
  { value: 'divorciado',label: 'Divorciado(a)' },
  { value: 'viuvo',     label: 'Viúvo(a)' },
]

export default function Register() {
  const [step,     setStep]     = useState(1)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [done,     setDone]     = useState(false)
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    nome: '', email: '', password: '', password2: '',
    whatsapp: '', data_nascimento: '', estado_civil: '',
    endereco: '', subdepartamento: [], instrumento: [],
    data_entrada: new Date().toISOString().split('T')[0],
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const validateStep1 = () => {
    if (!form.nome.trim()) return 'Informe seu nome completo'
    if (!form.email.trim()) return 'Informe seu e-mail'
    if (form.password.length < 6) return 'A senha deve ter pelo menos 6 caracteres'
    if (form.password !== form.password2) return 'As senhas não coincidem'
    return null
  }

  const validateStep2 = () => {
    if (!form.whatsapp.trim()) return 'Informe seu WhatsApp'
    if (!form.data_nascimento) return 'Informe sua data de nascimento'
    if (!form.estado_civil) return 'Selecione o estado civil'
    return null
  }

  const isObservadorSelected = form.subdepartamento.includes('observador')

  // "observador" é exclusivo — limpa outros ao ser selecionado e vice-versa
  const handleSubdepChange = (v) => {
    const wasObs = form.subdepartamento.includes('observador')
    const selectingObs = v.includes('observador') && !wasObs
    if (selectingObs) { set('subdepartamento', ['observador']); return }
    if (wasObs && v.length > 1) { set('subdepartamento', v.filter(s => s !== 'observador')); return }
    set('subdepartamento', v)
  }

  const validateStep3 = () => {
    if (!form.subdepartamento.length) return 'Selecione ao menos um subdepartamento ou "Membro Observador"'
    return null
  }

  const handleNext = () => {
    const err = step === 1 ? validateStep1() : step === 2 ? validateStep2() : validateStep3()
    if (err) { setError(err); return }
    setError('')
    setStep(s => s + 1)
  }

  const handleSubmit = async () => {
    const err = validateStep3()
    if (err) { setError(err); return }
    setLoading(true)
    setError('')
    try {
      const submitForm = {
        ...form,
        subdepartamento: isObservadorSelected ? [] : form.subdepartamento,
      }
      await signUp(form.email, form.password, submitForm)
      setDone(true)
    } catch (err) {
      setError(
        err.message === 'User already registered'
          ? 'E-mail já cadastrado. Tente entrar.'
          : err.message || 'Erro ao cadastrar. Tente novamente.'
      )
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-6">
        <div className="max-w-sm w-full text-center animate-slide-up">
          <div className="w-14 h-14 rounded-2xl bg-[#EAF3DE] flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={28} className="text-[#27500A]" />
          </div>
          <h2 className="text-xl font-semibold text-[var(--color-text-1)] mb-2">Cadastro enviado!</h2>
          <p className="text-sm text-[var(--color-text-2)] mb-6">
            Seu cadastro foi recebido e está aguardando aprovação do líder.
            Você receberá um WhatsApp quando for aprovado.
          </p>
          <Button variant="primary" onClick={() => navigate('/login')}>
            Voltar ao login
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-8 bg-[var(--color-bg)]">
      <div className="w-full max-w-md animate-slide-up">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-9 h-9 rounded-xl topbar-gradient flex items-center justify-center">
            <Music size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-[var(--color-text-1)]">Ellos Juventude</h1>
            <p className="text-2xs text-[var(--color-text-3)]">Primeiro acesso</p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 transition-colors
                ${step > s ? 'bg-success-500 text-white' : step === s ? 'bg-primary-600 text-white' : 'bg-[var(--color-bg-3)] text-[var(--color-text-3)]'}`}>
                {step > s ? '✓' : s}
              </div>
              {s < 3 && <div className={`h-0.5 flex-1 rounded transition-colors ${step > s ? 'bg-success-500' : 'bg-[var(--color-bg-3)]'}`} />}
            </div>
          ))}
        </div>

        <div className="surface rounded-2xl p-6 shadow-card-md">
          {/* Step 1: Acesso */}
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              <h2 className="text-base font-semibold text-[var(--color-text-1)] mb-4">Dados de acesso</h2>
              <Input label="Nome completo" placeholder="Seu nome completo" value={form.nome} onChange={e => set('nome', e.target.value)} />
              <Input label="E-mail" type="email" placeholder="seu@email.com" value={form.email} onChange={e => set('email', e.target.value)} />
              <Input label="Senha" type="password" placeholder="Mínimo 6 caracteres" value={form.password} onChange={e => set('password', e.target.value)} />
              <Input label="Confirmar senha" type="password" placeholder="Repita a senha" value={form.password2} onChange={e => set('password2', e.target.value)} />
            </div>
          )}

          {/* Step 2: Perfil */}
          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <h2 className="text-base font-semibold text-[var(--color-text-1)] mb-4">Dados pessoais</h2>
              <Input label="WhatsApp" type="tel" placeholder="(11) 99999-9999" value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} />
              <Input label="Data de nascimento" type="date" value={form.data_nascimento} onChange={e => set('data_nascimento', e.target.value)} />
              <Select label="Estado civil" value={form.estado_civil} onChange={e => set('estado_civil', e.target.value)}>
                <option value="">Selecione...</option>
                {ESTADO_CIVIL.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
              <Input label="Endereço / Bairro" placeholder="Rua, número — Bairro" value={form.endereco} onChange={e => set('endereco', e.target.value)} />
            </div>
          )}

          {/* Step 3: Ministério */}
          {step === 3 && (
            <div className="space-y-4 animate-fade-in">
              <h2 className="text-base font-semibold text-[var(--color-text-1)] mb-4">Ministério</h2>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--color-text-2)]">
                  Participação no departamento
                </label>
                <ChipSelect
                  options={SUBDEPS}
                  selected={form.subdepartamento}
                  onChange={handleSubdepChange}
                />
                {isObservadorSelected && (
                  <p className="text-xs text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg px-3 py-2 leading-relaxed">
                    Você participará apenas dos ensaios. Nenhum subdepartamento necessário — o líder definirá seu perfil na aprovação.
                  </p>
                )}
              </div>

              {form.subdepartamento.includes('louvor') && !isObservadorSelected && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-[var(--color-text-2)]">Instrumentos</label>
                  <ChipSelect
                    options={INSTRUMENTOS}
                    selected={form.instrumento}
                    onChange={v => set('instrumento', v)}
                  />
                </div>
              )}

              <Input
                label="Data de entrada no conjunto"
                type="date"
                value={form.data_entrada}
                onChange={e => set('data_entrada', e.target.value)}
                hint="Quando começou a servir neste departamento"
              />
            </div>
          )}

          {error && <div className="alert-strip danger mt-4">{error}</div>}

          {/* Actions */}
          <div className="flex gap-2 mt-6">
            {step > 1 && (
              <Button variant="secondary" onClick={() => { setStep(s => s - 1); setError('') }}>
                Voltar
              </Button>
            )}
            {step < 3 ? (
              <Button fullWidth onClick={handleNext}>Continuar</Button>
            ) : (
              <Button fullWidth loading={loading} onClick={handleSubmit}>
                Enviar cadastro
              </Button>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-[var(--color-text-3)]">
          Já tem acesso?{' '}
          <Link to="/login" className="text-primary-600 dark:text-primary-400 font-medium hover:underline">Entrar</Link>
        </p>
      </div>
    </div>
  )
}
