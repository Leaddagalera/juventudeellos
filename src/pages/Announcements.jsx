import { useState, useEffect } from 'react'
import { Bell, Send, Users, User } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { Card, CardSection, EmptyState, Skeleton, Avatar } from '../components/ui/Card.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Select, Textarea } from '../components/ui/Input.jsx'
import { formatDate, subdepLabel } from '../lib/utils.js'

const DEST_OPTS = [
  { value: 'todos',    label: 'Todos os membros' },
  { value: 'louvor',   label: 'Louvor' },
  { value: 'regencia', label: 'Regência' },
  { value: 'ebd',      label: 'EBD' },
  { value: 'recepcao', label: 'Recepção' },
  { value: 'midia',    label: 'Mídia' },
  { value: 'lideres',  label: 'Apenas líderes' },
]

export default function Announcements() {
  const { profile, isLiderGeral, isLiderFuncao } = useAuth()
  const [comunicados, setComunicados] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [texto,       setTexto]       = useState('')
  const [dest,        setDest]        = useState('todos')
  const [sending,     setSending]     = useState(false)

  useEffect(() => { loadComunicados() }, [])

  async function loadComunicados() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('comunicados')
        .select('*, users(nome)')
        .order('criado_em', { ascending: false })
        .limit(50)
      setComunicados(data || [])
    } catch (err) {
      console.error('[Announcements]', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSend() {
    if (!texto.trim()) return
    setSending(true)
    try {
      await supabase.from('comunicados').insert({
        autor_id:    profile.id,
        destinatario: dest,
        texto,
        criado_em:   new Date().toISOString(),
      })
      setTexto('')
      loadComunicados()
    } catch (err) {
      alert(err.message)
    } finally {
      setSending(false)
    }
  }

  const canSend = isLiderGeral || isLiderFuncao

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-2xl mx-auto">
      <h2 className="text-lg font-semibold text-[var(--color-text-1)]">Comunicados</h2>

      {/* Send form */}
      {canSend && (
        <Card>
          <CardSection title="Novo comunicado">
            <div className="space-y-3">
              <Select label="Destinatário" value={dest} onChange={e => setDest(e.target.value)}>
                {DEST_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
              <Textarea
                label="Mensagem"
                placeholder="Digite o comunicado..."
                value={texto}
                onChange={e => setTexto(e.target.value)}
                rows={3}
              />
              <Button size="sm" onClick={handleSend} loading={sending} disabled={!texto.trim()}>
                <Send size={13} />
                Publicar comunicado
              </Button>
            </div>
          </CardSection>
        </Card>
      )}

      {/* List */}
      <Card>
        <CardSection title="Comunicados recentes">
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}
            </div>
          ) : comunicados.length === 0 ? (
            <EmptyState icon={Bell} title="Nenhum comunicado" description="Os comunicados dos líderes aparecerão aqui." />
          ) : comunicados.map(c => (
            <div key={c.id} className="py-3 border-b border-[var(--color-border)] last:border-0">
              <div className="flex items-start gap-2 mb-1">
                <Avatar nome={c.users?.nome} size="xs" className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-[var(--color-text-1)]">{c.users?.nome || 'Líder'}</span>
                    <Badge variant="default" className="text-2xs">
                      {DEST_OPTS.find(o => o.value === c.destinatario)?.label || c.destinatario}
                    </Badge>
                    <span className="text-2xs text-[var(--color-text-3)]">{formatDate(c.criado_em)}</span>
                  </div>
                  <p className="text-sm text-[var(--color-text-2)] mt-1">{c.texto}</p>
                </div>
              </div>
            </div>
          ))}
        </CardSection>
      </Card>
    </div>
  )
}
