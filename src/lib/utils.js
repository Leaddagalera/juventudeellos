/**
 * Utility helpers
 */

export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

export function formatDate(dateStr, opts = {}) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''))
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', ...opts })
}

export function formatDateShort(dateStr) {
  return formatDate(dateStr, { day: '2-digit', month: 'short', year: undefined })
}

export function formatDomingo(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return `Dom ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
}

export function initials(nome) {
  if (!nome) return '?'
  const parts = nome.trim().split(' ')
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function cycleDayProgress(inicio, diaAtual = 45) {
  return Math.min(100, Math.round((diaAtual / 45) * 100))
}

export function getCyclePhase(diaAtual) {
  if (diaAtual <= 2)  return 'briefing_regente'
  if (diaAtual <= 5)  return 'briefing_lider'
  if (diaAtual <= 20) return 'disponibilidade'
  if (diaAtual === 21) return 'gerando_escala'
  return 'confirmacoes'
}

export function phaseLabel(phase) {
  const map = {
    briefing_regente: 'Briefing — Regentes',
    briefing_lider:   'Briefing — Líderes',
    disponibilidade:  'Janela de Disponibilidade',
    gerando_escala:   'Gerando Escala',
    escala_publicada: 'Escala Publicada',
    confirmacoes:     'Confirmações & Trocas',
  }
  return map[phase] || phase
}

export function subdepLabel(subdep) {
  const map = {
    louvor:   'Louvor',
    regencia: 'Regência',
    ebd:      'EBD',
    recepcao: 'Recepção',
    midia:    'Mídia',
  }
  if (Array.isArray(subdep)) return subdep.map(s => map[s] || s).join(', ')
  return map[subdep] || subdep
}

export function roleLabel(role) {
  const map = {
    lider_geral:       'Líder Geral',
    lider_funcao:      'Líder de Função',
    membro_serve:      'Membro que Serve',
    membro_observador: 'Observador',
  }
  return map[role] || role
}

export function tarjaLabel(tarja) {
  const map = { discipulo: 'Discípulo', nicodemos: 'Nicodemos', prodigo: 'Filho Pródigo' }
  return map[tarja] || tarja
}

export function getAge(dataNascimento) {
  if (!dataNascimento) return null
  const d = new Date(dataNascimento)
  const diff = Date.now() - d.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25))
}

export function isBirthdayThisWeek(dataNascimento) {
  if (!dataNascimento) return false
  const today = new Date()
  const bday = new Date(dataNascimento)
  // Compare month+day only
  for (let i = 0; i < 7; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    if (d.getMonth() === bday.getMonth() && d.getDate() === bday.getDate()) return true
  }
  return false
}

export function daysSince(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}
