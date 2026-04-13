import { useState, useEffect, useRef } from 'react'
import { Save, LogOut, Moon, Sun, Camera, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { Card, CardSection, Avatar } from '../components/ui/Card.jsx'
import { Badge, SubdepBadge, RoleBadge, TarjaBadge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Input, Select } from '../components/ui/Input.jsx'
import { formatDate, subdepLabel, getAge } from '../lib/utils.js'

const ESTADO_CIVIL_LABELS = {
  solteiro: 'Solteiro(a)', casado: 'Casado(a)', divorciado: 'Divorciado(a)', viuvo: 'Viúvo(a)'
}

const TARJA_OPTS = [
  { value: '', label: 'Sem tarja' },
  { value: 'discipulo', label: 'Discípulo' },
  { value: 'nicodemos', label: 'Nicodemos' },
  { value: 'prodigo',   label: 'Filho Pródigo' },
]

export default function Profile() {
  const { profile, signOut, darkMode, setDarkMode, refreshProfile, isLiderGeral } = useAuth()
  const [editing, setEditing] = useState(false)
  const [form,    setForm]    = useState({
    nome:           profile?.nome || '',
    whatsapp:       profile?.whatsapp || '',
    endereco:       profile?.endereco || '',
    estado_civil:   profile?.estado_civil || '',
    tarja:          profile?.tarja || '',
  })
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [photoLoading, setPhotoLoading] = useState(false)
  const fileRef = useRef(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoLoading(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = `${profile.id}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = `${data.publicUrl}?t=${Date.now()}`
      await supabase.from('users').update({ foto_url: url }).eq('id', profile.id)
      refreshProfile()
    } catch (err) {
      alert('Erro ao enviar foto: ' + err.message)
    } finally {
      setPhotoLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updates = {
        nome:         form.nome,
        whatsapp:     form.whatsapp,
        endereco:     form.endereco,
        estado_civil: form.estado_civil,
      }
      if (isLiderGeral && form.tarja !== profile?.tarja) {
        updates.tarja = form.tarja
        updates.tarja_atualizada_em = new Date().toISOString()
      }
      await supabase.from('users').update(updates).eq('id', profile.id)
      refreshProfile()
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!profile) return null

  const age = getAge(profile.data_nascimento)

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-lg mx-auto">
      {/* Avatar + name */}
      <Card>
        <div className="flex items-center gap-4">
          {/* Foto clicável */}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handlePhotoChange}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={photoLoading}
            className="relative group flex-shrink-0"
            title="Alterar foto de perfil"
          >
            <div className="w-16 h-16 rounded-full overflow-hidden bg-primary-600 flex items-center justify-center text-white text-xl font-semibold">
              {profile.foto_url
                ? <img src={profile.foto_url} alt={profile.nome} className="w-full h-full object-cover" />
                : <span>{(profile.nome || '?').trim().split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()}</span>
              }
            </div>
            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {photoLoading
                ? <Loader2 size={18} className="text-white animate-spin" />
                : <Camera size={18} className="text-white" />
              }
            </div>
          </button>

          <div>
            <h2 className="text-base font-semibold text-[var(--color-text-1)]">{profile.nome}</h2>
            <p className="text-xs text-[var(--color-text-3)] mb-2">{profile.email}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <RoleBadge role={profile.role} />
              {profile.subdepartamento && <SubdepBadge subdep={profile.subdepartamento} />}
              {isLiderGeral && profile.tarja && <TarjaBadge tarja={profile.tarja} />}
            </div>
          </div>
        </div>
      </Card>

      {/* Personal info */}
      <Card>
        <CardSection
          title="Dados pessoais"
          action={
            !editing
              ? <Button size="xs" variant="secondary" onClick={() => setEditing(true)}>Editar</Button>
              : <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
          }
        >
          {!editing ? (
            <div className="space-y-2">
              {[
                { label: 'WhatsApp',     value: profile.whatsapp },
                { label: 'Nascimento',   value: profile.data_nascimento ? `${formatDate(profile.data_nascimento)}${age ? ` (${age} anos)` : ''}` : null },
                { label: 'Estado civil', value: ESTADO_CIVIL_LABELS[profile.estado_civil] },
                { label: 'Endereço',     value: profile.endereco },
                { label: 'Subdep.',      value: subdepLabel(profile.subdepartamento) },
                { label: 'Entrada',      value: formatDate(profile.data_entrada, { month: 'long', year: 'numeric' }) },
                profile.instrumento?.length > 0 && { label: 'Instrumento(s)', value: profile.instrumento.join(', ') },
              ].filter(Boolean).map(item => item.value && (
                <div key={item.label} className="flex justify-between gap-4">
                  <span className="text-xs text-[var(--color-text-3)]">{item.label}</span>
                  <span className="text-xs font-medium text-[var(--color-text-1)] text-right">{item.value}</span>
                </div>
              ))}

              {isLiderGeral && (
                <div className="flex justify-between gap-4 pt-1 border-t border-[var(--color-border)] mt-2">
                  <span className="text-xs text-[var(--color-text-3)]">Tarja pastoral</span>
                  <TarjaBadge tarja={profile.tarja} />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <Input label="Nome" value={form.nome} onChange={e => set('nome', e.target.value)} />
              <Input label="WhatsApp" value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} />
              <Input label="Endereço" value={form.endereco} onChange={e => set('endereco', e.target.value)} />
              <Select label="Estado civil" value={form.estado_civil} onChange={e => set('estado_civil', e.target.value)}>
                <option value="">Selecione...</option>
                {Object.entries(ESTADO_CIVIL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>

              {isLiderGeral && (
                <Select label="Tarja pastoral" value={form.tarja} onChange={e => set('tarja', e.target.value)}>
                  {TARJA_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" onClick={handleSave} loading={saving}>
                  <Save size={13} /> Salvar
                </Button>
                {saved && <span className="text-xs text-success-500">✓ Salvo</span>}
              </div>
            </div>
          )}
        </CardSection>
      </Card>

      {/* Service history */}
      <ServiceHistory userId={profile.id} />

      {/* Settings */}
      <Card>
        <CardSection title="Configurações">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="flex items-center justify-between w-full py-2"
          >
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-2)]">
              {darkMode ? <Sun size={15} /> : <Moon size={15} />}
              {darkMode ? 'Modo claro' : 'Modo escuro'}
            </div>
            <div className={`w-9 h-5 rounded-full transition-colors ${darkMode ? 'bg-primary-600' : 'bg-[var(--color-bg-3)]'} relative`}>
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${darkMode ? 'translate-x-4' : ''}`} />
            </div>
          </button>
        </CardSection>
      </Card>

      {/* Sign out */}
      <Button variant="danger" fullWidth onClick={signOut}>
        <LogOut size={15} />
        Sair da conta
      </Button>

      <p className="text-center text-2xs text-[var(--color-text-3)] pb-2">
        Ellos Juventude v1.0 · AD · {new Date().getFullYear()}
      </p>
    </div>
  )
}

function ServiceHistory({ userId }) {
  const [history, setHistory] = useState(null)

  useEffect(() => {
    if (!userId) return
    supabase.from('escalas')
      .select('domingo, subdepartamento, status_confirmacao')
      .eq('user_id', userId)
      .order('domingo', { ascending: false })
      .limit(20)
      .then(({ data }) => setHistory(data || []))
  }, [userId])

  if (!history) return null

  return (
    <Card>
      <CardSection title="Histórico de serviço">
        {history.length === 0 ? (
          <p className="text-xs text-[var(--color-text-3)]">Nenhum serviço registrado</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {history.map((h, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)] last:border-0">
                <div>
                  <p className="text-xs font-medium text-[var(--color-text-1)]">
                    {new Date(h.domingo + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                  <p className="text-2xs text-[var(--color-text-3)]">{subdepLabel(h.subdepartamento)}</p>
                </div>
                <Badge variant={h.status_confirmacao === 'confirmado' ? 'green' : h.status_confirmacao === 'recusado' ? 'red' : 'gray'}>
                  {h.status_confirmacao === 'confirmado' ? 'Confirmado' : h.status_confirmacao === 'recusado' ? 'Faltou' : 'Pendente'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardSection>
    </Card>
  )
}
