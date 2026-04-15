import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Image, Video, Upload, Check, X, Trash2, Plus,
  FileImage, FileVideo, Loader2, Eye, GripVertical,
  ChevronLeft, ChevronRight, AlertCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { Card, CardSection, EmptyState, Skeleton, Avatar } from '../components/ui/Card.jsx'
import { Badge } from '../components/ui/Badge.jsx'
import { Button } from '../components/ui/Button.jsx'
import { Input } from '../components/ui/Input.jsx'
import { Modal, ConfirmModal } from '../components/ui/Modal.jsx'
import { formatDate, cn } from '../lib/utils.js'
import { notify } from '../lib/whatsapp.js'

const BUCKET = 'media-login'
const MAX_SIZE_MB = 50
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function mimeToTipo(mime) {
  if (!mime) return 'foto'
  return mime.startsWith('video/') ? 'video' : 'foto'
}

function getPublicUrl(path) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data?.publicUrl || ''
}

// ── Preview Modal ──────────────────────────────────────────────────────────────

function PreviewModal({ item, onClose }) {
  if (!item) return null
  return (
    <Modal open={!!item} onClose={onClose} title={item.descricao} size="lg">
      <div className="flex items-center justify-center bg-black rounded-xl overflow-hidden max-h-[70vh]">
        {item.tipo === 'video' ? (
          <video
            src={item.url}
            controls
            autoPlay
            className="max-w-full max-h-[70vh] object-contain"
          />
        ) : (
          <img
            src={item.url}
            alt={item.descricao}
            className="max-w-full max-h-[70vh] object-contain"
          />
        )}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-[var(--color-text-3)]">
        <span>{item.tipo === 'video' ? 'Vídeo' : 'Foto'} · {formatBytes(item.tamanho_bytes)}</span>
        <span>Enviado em {formatDate(item.criado_em)}</span>
      </div>
    </Modal>
  )
}

// ── Upload Zone ────────────────────────────────────────────────────────────────

function UploadZone({ onFile, disabled }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors',
        dragging
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'border-[var(--color-border)] hover:border-primary-400 hover:bg-[var(--color-bg-2)]',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div className="w-12 h-12 rounded-2xl bg-[var(--color-bg-2)] flex items-center justify-center">
        <Upload size={22} className="text-[var(--color-text-3)]" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-[var(--color-text-2)]">
          Arraste um arquivo ou <span className="text-primary-600 dark:text-primary-400">clique aqui</span>
        </p>
        <p className="text-xs text-[var(--color-text-3)] mt-1">
          Ideal: 1080×1920px · proporção 9:16 · Máx. {MAX_SIZE_MB} MB
        </p>
        <p className="text-2xs text-[var(--color-text-3)] mt-0.5">
          Imagens fora dessa proporção serão cortadas ao centro
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}
      />
    </div>
  )
}

// ── Media Card ─────────────────────────────────────────────────────────────────

function MediaCard({ item, onApprove, onReject, onDelete, onPreview, isLider }) {
  const isPending  = item.status === 'pendente'
  const isApproved = item.status === 'aprovado'
  const isVideo    = item.tipo === 'video'

  return (
    <Card className="group relative overflow-hidden">
      {/* Thumbnail */}
      <div
        className="w-full h-36 rounded-lg bg-[var(--color-bg-2)] border border-[var(--color-border)] overflow-hidden mb-3 relative cursor-pointer"
        onClick={() => item.url && onPreview(item)}
      >
        {item.url ? (
          isVideo ? (
            <video
              src={item.url}
              className="w-full h-full object-cover"
              muted
              playsInline
            />
          ) : (
            <img
              src={item.url}
              alt={item.descricao}
              className="w-full h-full object-cover"
            />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--color-text-3)]">
            {isVideo ? <FileVideo size={28} /> : <FileImage size={28} />}
          </div>
        )}

        {/* Overlay on hover */}
        {item.url && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <Eye size={16} className="text-white" />
            </div>
          </div>
        )}

        {/* Type badge */}
        <div className="absolute top-2 left-2">
          <span className={cn(
            'inline-flex items-center gap-1 text-2xs font-medium px-1.5 py-0.5 rounded',
            isVideo
              ? 'bg-violet-600/90 text-white'
              : 'bg-primary-600/90 text-white'
          )}>
            {isVideo ? <Video size={9} /> : <Image size={9} />}
            {isVideo ? 'Vídeo' : 'Foto'}
          </span>
        </div>
      </div>

      <p className="text-sm font-medium text-[var(--color-text-1)] leading-snug mb-0.5 line-clamp-2">
        {item.descricao}
      </p>
      {item.tamanho_bytes > 0 && (
        <p className="text-2xs text-[var(--color-text-3)]">{formatBytes(item.tamanho_bytes)}</p>
      )}
      <p className="text-2xs text-[var(--color-text-3)] mb-3">
        {formatDate(item.criado_em)}
      </p>

      <div className="flex items-center justify-between gap-2">
        <Badge variant={isPending ? 'amber' : isApproved ? 'green' : 'red'}>
          {isPending ? 'Aguardando' : isApproved ? 'Publicado' : 'Recusado'}
        </Badge>

        {isLider && (
          <div className="flex gap-1">
            {isPending && (
              <>
                <Button size="xs" variant="success" onClick={() => onApprove(item)}>
                  <Check size={11} /> Aprovar
                </Button>
                <Button size="xs" variant="danger" onClick={() => onReject(item.id)}>
                  <X size={11} />
                </Button>
              </>
            )}
            {(isApproved || item.status === 'recusado') && (
              <Button size="xs" variant="danger" onClick={() => onDelete(item)}>
                <Trash2 size={11} />
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Media() {
  const { profile, isLiderGeral } = useAuth()
  const [items,    setItems]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(false)
  const [preview,  setPreview]  = useState(null)
  const [delItem,  setDelItem]  = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Upload state
  const [file,       setFile]       = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [descricao,  setDescricao]  = useState('')
  const [progress,   setProgress]   = useState(0)
  const [uploading,  setUploading]  = useState(false)
  const [uploadErr,  setUploadErr]  = useState('')
  const [ratioWarn,  setRatioWarn]  = useState('')   // aspect-ratio warning

  // Gera e revoga o object URL do arquivo selecionado para evitar memory leak
  useEffect(() => {
    if (!file) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // ── Load ────────────────────────────────────────────────────────────────────
  const loadMedia = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('conteudo_login')
        .select('*')
        .order('criado_em', { ascending: false })
      setItems(data || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadMedia() }, [loadMedia])

  // ── File select ─────────────────────────────────────────────────────────────
  function handleFile(f) {
    setUploadErr('')
    setRatioWarn('')
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setUploadErr(`O arquivo excede ${MAX_SIZE_MB} MB.`)
      return
    }
    const allowed = ['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
    if (!allowed.includes(f.type)) {
      setUploadErr('Formato não suportado. Use JPG, PNG, WebP, GIF, MP4 ou WebM.')
      return
    }
    setFile(f)
    // Check aspect ratio for images
    if (f.type.startsWith('image/')) {
      const url = URL.createObjectURL(f)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        const ratio = img.naturalWidth / img.naturalHeight
        const ideal = 9 / 16
        if (Math.abs(ratio - ideal) > 0.05) {
          setRatioWarn(
            `Proporção detectada: ${img.naturalWidth}×${img.naturalHeight}px. ` +
            `Para melhor resultado use 1080×1920px (9:16). ` +
            `A imagem será cortada automaticamente nas laterais.`
          )
        }
      }
      img.src = url
    }
  }

  function resetModal() {
    setFile(null)
    setPreviewUrl(null)
    setDescricao('')
    setProgress(0)
    setUploading(false)
    setUploadErr('')
    setRatioWarn('')
    setModal(false)
  }

  // ── Upload & insert ─────────────────────────────────────────────────────────
  async function handleUpload() {
    if (!file) return
    if (!descricao.trim()) { setUploadErr('Adicione uma descrição.'); return }

    setUploading(true)
    setUploadErr('')
    setProgress(0)

    try {
      // Build unique path
      const ext  = file.name.split('.').pop()
      const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

      // Upload to Supabase Storage
      // Supabase JS v2 doesn't support upload progress natively — simulate it
      const uploadPromise = supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      })

      // Fake progress while waiting
      let fakeP = 0
      const ticker = setInterval(() => {
        fakeP = Math.min(fakeP + 8, 85)
        setProgress(fakeP)
      }, 200)

      const { error: uploadError } = await uploadPromise
      clearInterval(ticker)

      if (uploadError) throw uploadError
      setProgress(95)

      const publicUrl = getPublicUrl(path)

      // Insert record
      const { error: dbError } = await supabase.from('conteudo_login').insert({
        tipo:          mimeToTipo(file.type),
        mime_type:     file.type,
        storage_path:  path,
        url:           publicUrl,
        descricao:     descricao.trim(),
        status:        isLiderGeral ? 'aprovado' : 'pendente',
        criado_por:    profile.id,
        aprovado_por:  isLiderGeral ? profile.id : null,
        tamanho_bytes: file.size,
      })
      if (dbError) throw dbError

      setProgress(100)

      // Notify líder if not the líder himself uploading
      if (!isLiderGeral) {
        const { data: lider } = await supabase
          .from('users').select('whatsapp').eq('role', 'lider_geral').limit(1).single()
        if (lider?.whatsapp) {
          await notify.midiaPendente(lider.whatsapp, descricao.trim(), profile.nome).catch(() => {})
        }
      }

      resetModal()
      loadMedia()
    } catch (err) {
      setUploadErr(err.message || 'Erro no upload.')
    } finally {
      setUploading(false)
    }
  }

  // ── Approve ─────────────────────────────────────────────────────────────────
  async function handleApprove(item) {
    await supabase.from('conteudo_login')
      .update({ status: 'aprovado', aprovado_por: profile.id })
      .eq('id', item.id)
    loadMedia()
  }

  // ── Reject ──────────────────────────────────────────────────────────────────
  async function handleReject(id) {
    await supabase.from('conteudo_login').update({ status: 'recusado' }).eq('id', id)
    loadMedia()
  }

  // ── Delete (storage + DB) ───────────────────────────────────────────────────
  async function handleDelete() {
    if (!delItem) return
    setDeleting(true)
    try {
      // Remove from storage if has a path
      if (delItem.storage_path) {
        await supabase.storage.from(BUCKET).remove([delItem.storage_path])
      }
      await supabase.from('conteudo_login').delete().eq('id', delItem.id)
      setDelItem(null)
      loadMedia()
    } catch (err) {
      alert(err.message)
    } finally {
      setDeleting(false)
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const pendentes  = items.filter(i => i.status === 'pendente')
  const aprovados  = items.filter(i => i.status === 'aprovado')
  const recusados  = items.filter(i => i.status === 'recusado')

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-1)]">Mídia — Carrossel do Login</h2>
          <p className="text-xs text-[var(--color-text-3)]">
            {aprovados.length} {aprovados.length === 1 ? 'item publicado' : 'itens publicados'} · aparece na página de login
          </p>
        </div>
        <Button size="sm" onClick={() => setModal(true)}>
          <Plus size={14} /> Adicionar mídia
        </Button>
      </div>

      {/* Pending approval — visible only for lider_geral */}
      {isLiderGeral && pendentes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <AlertCircle size={13} />
            {pendentes.length} {pendentes.length === 1 ? 'item aguardando' : 'itens aguardando'} aprovação
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendentes.map(item => (
              <MediaCard
                key={item.id}
                item={item}
                onApprove={handleApprove}
                onReject={handleReject}
                onDelete={setDelItem}
                onPreview={setPreview}
                isLider={isLiderGeral}
              />
            ))}
          </div>
        </div>
      )}

      {/* Published */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[var(--color-text-2)]">
          Publicados ({aprovados.length})
        </p>
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
          </div>
        ) : aprovados.length === 0 ? (
          <EmptyState
            icon={Image}
            title="Nenhum conteúdo publicado"
            description="Adicione fotos ou vídeos para exibir no carrossel da página de login."
          />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {aprovados.map(item => (
              <MediaCard
                key={item.id}
                item={item}
                onApprove={handleApprove}
                onReject={handleReject}
                onDelete={setDelItem}
                onPreview={setPreview}
                isLider={isLiderGeral}
              />
            ))}
          </div>
        )}
      </div>

      {/* Rejected (only for lider_geral) */}
      {isLiderGeral && recusados.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[var(--color-text-2)]">
            Recusados ({recusados.length})
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recusados.map(item => (
              <MediaCard
                key={item.id}
                item={item}
                onApprove={handleApprove}
                onReject={handleReject}
                onDelete={setDelItem}
                onPreview={setPreview}
                isLider={isLiderGeral}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Upload Modal ──────────────────────────────────────────────────────── */}
      <Modal
        open={modal}
        onClose={uploading ? undefined : resetModal}
        title="Adicionar mídia ao carrossel"
        size="md"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={resetModal} disabled={uploading}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleUpload}
              loading={uploading}
              disabled={!file || !descricao.trim()}
            >
              {isLiderGeral ? 'Publicar' : 'Enviar para aprovação'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">

          {/* File picker / drop zone */}
          {!file ? (
            <div className="space-y-3">
              <UploadZone onFile={handleFile} disabled={uploading} />
              {/* Specs */}
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-2)] px-3 py-2.5 text-xs text-[var(--color-text-3)] space-y-1">
                <p><span className="font-medium text-[var(--color-text-2)]">Fotos:</span> JPG, PNG, WebP, GIF &nbsp;·&nbsp; Tamanho ideal: <span className="font-medium text-[var(--color-text-2)]">1080×1920px</span> (9:16 — vertical) &nbsp;·&nbsp; Mín. 720×1280px &nbsp;·&nbsp; Máx. {MAX_SIZE_MB} MB</p>
                <p><span className="font-medium text-[var(--color-text-2)]">Vídeos:</span> MP4, WebM &nbsp;·&nbsp; Proporção 9:16 (vertical) &nbsp;·&nbsp; Máx. {MAX_SIZE_MB} MB</p>
                <p className="text-2xs">A imagem será exibida em tela cheia no mobile — imagens fora do 9:16 serão cortadas ao centro.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {/* 9:16 crop preview */}
              <div className="rounded-xl border border-[var(--color-border)] overflow-hidden bg-black"
                style={{ aspectRatio: '9/16', maxHeight: 220, position: 'relative' }}>
                {file.type.startsWith('video/') ? (
                  <video
                    src={previewUrl}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
                    muted
                    controls
                  />
                ) : (
                  <img
                    src={previewUrl}
                    alt="preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
                  />
                )}
              </div>

              {/* Ratio warning */}
              {ratioWarn && (
                <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2">
                  <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                  <span>{ratioWarn}</span>
                </div>
              )}

              {/* File info + change button */}
              <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-[var(--color-bg-2)] border border-[var(--color-border)]">
                <div className="flex items-center gap-2 min-w-0">
                  {file.type.startsWith('video/')
                    ? <FileVideo size={14} className="text-violet-500 flex-shrink-0" />
                    : <FileImage size={14} className="text-primary-500 flex-shrink-0" />
                  }
                  <span className="text-xs text-[var(--color-text-2)] truncate">{file.name}</span>
                  <span className="text-2xs text-[var(--color-text-3)] flex-shrink-0">{formatBytes(file.size)}</span>
                </div>
                <button
                  onClick={() => { setFile(null); setRatioWarn('') }}
                  className="text-xs text-[var(--color-text-3)] hover:text-danger-500 flex-shrink-0 transition-colors"
                >
                  Trocar
                </button>
              </div>
            </div>
          )}

          {/* Description */}
          <Input
            label="Descrição / legenda"
            placeholder="Ex: Culto de Louvor — março 2025"
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            disabled={uploading}
            hint="Aparece como legenda no carrossel da página de login"
          />

          {/* Upload progress */}
          {uploading && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--color-text-3)]">Enviando...</span>
                <span className="font-medium text-[var(--color-text-2)]">{progress}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-[var(--color-bg-3)] overflow-hidden">
                <div
                  className="h-full bg-primary-600 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {uploadErr && (
            <div className="flex items-center gap-2 text-xs text-danger-600 dark:text-danger-400 bg-danger-50 dark:bg-danger-500/10 border border-danger-200 dark:border-danger-700 rounded-lg px-3 py-2">
              <AlertCircle size={13} className="flex-shrink-0" />
              {uploadErr}
            </div>
          )}

          {/* Info strip */}
          {!isLiderGeral && (
            <div className="flex items-center gap-2 text-xs text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg px-3 py-2">
              <AlertCircle size={13} className="flex-shrink-0" />
              O conteúdo será exibido após aprovação do líder geral.
            </div>
          )}
        </div>
      </Modal>

      {/* Preview Modal */}
      <PreviewModal item={preview} onClose={() => setPreview(null)} />

      {/* Delete confirm */}
      <ConfirmModal
        open={!!delItem}
        onClose={() => setDelItem(null)}
        onConfirm={handleDelete}
        title="Remover mídia"
        message={`Remover "${delItem?.descricao}" do carrossel? O arquivo também será excluído do armazenamento.`}
        danger
        loading={deleting}
      />
    </div>
  )
}
