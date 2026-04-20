/**
 * Motor de escala — roda no dia 21 do ciclo
 * Regras completas conforme especificação Ellos Juventude
 */
import { supabase } from './supabase.js'
import { parseISO, getDate, differenceInDays } from 'date-fns'
import { getSysConfig } from './sysConfig.js'


// ── Helpers ──────────────────────────────────────────────────────────────────

function getSundaysBetween(startStr, endStr) {
  const sundays = []
  const d = new Date(startStr)
  // Advance to first Sunday
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1)
  const end = new Date(endStr)
  while (d <= end) {
    sundays.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 7)
  }
  return sundays
}

export function isEnsaioSunday(dateStr, ensaioWeek = 2) {
  const d = parseISO(dateStr)
  const weekNum = Math.ceil(getDate(d) / 7)
  return weekNum === ensaioWeek
}

function lastServiceDate(userId, historico) {
  const entries = historico
    .filter(h => h.user_id === userId)
    .sort((a, b) => b.domingo.localeCompare(a.domingo))
  return entries[0]?.domingo || '1970-01-01'
}

function lastServiceDateForSubdep(userId, subdep, historico) {
  const entries = historico
    .filter(h => h.user_id === userId && h.subdepartamento === subdep)
    .sort((a, b) => b.domingo.localeCompare(a.domingo))
  return entries[0]?.domingo || '1970-01-01'
}

/**
 * Ordenação com rotatividade entre subdepartamentos.
 * Para membros em múltiplos subdeps, prioriza quem está há mais tempo
 * sem servir NESTE subdepartamento específico. Em caso de empate,
 * usa a última vez que serviu em qualquer subdep.
 */
function sortByPriority(pool, historico, subdep) {
  return [...pool].sort((a, b) => {
    // 1º critério: última vez que serviu NESTE subdep (rotatividade)
    const lastSubdepA = lastServiceDateForSubdep(a.id, subdep, historico)
    const lastSubdepB = lastServiceDateForSubdep(b.id, subdep, historico)
    if (lastSubdepA !== lastSubdepB) return lastSubdepA.localeCompare(lastSubdepB)

    // 2º critério (desempate): última vez que serviu em qualquer subdep
    const lastA = lastServiceDate(a.id, historico)
    const lastB = lastServiceDate(b.id, historico)
    return lastA.localeCompare(lastB)
  })
}

// ── Main Engine ───────────────────────────────────────────────────────────────

export async function runScheduleEngine(cicloId) {
  const alertas = []

  // 0. Load system config
  const sysConfig = await getSysConfig()
  const ensaioWeek = sysConfig.ensaio_week ?? 2
  const SLOTS = sysConfig.slots

  // 1. Load cycle
  const { data: ciclo, error: cicloErr } = await supabase
    .from('ciclos').select('*').eq('id', cicloId).single()
  if (cicloErr) return { success: false, error: cicloErr.message }

  // 2. Get all Sundays
  const domingos = getSundaysBetween(ciclo.inicio, ciclo.fim)

  // 3. Load briefings
  const { data: briefings, error: e1 } = await supabase
    .from('briefings').select('*').eq('ciclo_id', cicloId)
  if (e1) throw e1

  // 4. Load availability
  const { data: disponibilidades, error: e2 } = await supabase
    .from('disponibilidades').select('*').eq('ciclo_id', cicloId)
  if (e2) throw e2

  // 5. Load active serve-members with full profile
  const { data: membros, error: e3 } = await supabase
    .from('users')
    .select('*')
    .eq('ativo', true)
    .eq('role', 'membro_serve')
  if (e3) throw e3

  // 6. Load recent schedule history (last 90 days for priority)
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  const { data: historico, error: e4 } = await supabase
    .from('escalas')
    .select('user_id, domingo, subdepartamento')
    .gte('domingo', ninetyDaysAgo.toISOString().split('T')[0])
  if (e4) throw e4

  const escalaRows = []
  const sundaysCovered = {}

  // Tracks which members are already assigned on each Sunday and to which subdep,
  // so we can enforce same-day exclusivity for recepcao/midia.
  const assignedOnDay = {} // { [domingo]: Set<userId> }
  const assignedSubdepOnDay = {} // { [domingo]: { [userId]: string } }

  const EXCLUSIVE_SUBDEPS = ['recepcao', 'midia']

  function isAvailableForSubdep(userId, subdep, domingo) {
    const assigned = assignedSubdepOnDay[domingo]?.[userId]
    if (!assigned) return true
    // If already assigned to an exclusive subdep, or trying to assign to one — block
    if (EXCLUSIVE_SUBDEPS.includes(assigned) || EXCLUSIVE_SUBDEPS.includes(subdep)) return false
    return true
  }

  function markAssigned(userId, subdep, domingo) {
    if (!assignedOnDay[domingo]) assignedOnDay[domingo] = new Set()
    if (!assignedSubdepOnDay[domingo]) assignedSubdepOnDay[domingo] = {}
    assignedOnDay[domingo].add(userId)
    assignedSubdepOnDay[domingo][userId] = subdep
  }

  for (const domingo of domingos) {
    sundaysCovered[domingo] = {}

    // ── Regência: ensaio Sunday is rehearsal (configurable week)
    const ensaioRegencia = isEnsaioSunday(domingo, ensaioWeek)

    for (const subdep of ['louvor', 'regencia', 'ebd', 'recepcao', 'midia']) {
      // Regência rehearsal Sunday: skip non-regência
      if (ensaioRegencia && subdep !== 'regencia') {
        alertas.push({ domingo, subdep, tipo: 'domingo_ensaio', info: 'Bloqueado para ensaio de regentes' })
        sundaysCovered[domingo][subdep] = 'ensaio'
        continue
      }

      // Find briefing for this sunday + subdep
      const briefing = briefings?.find(b => b.domingo === domingo && b.subdepartamento === subdep)
      if (!briefing) {
        alertas.push({ domingo, subdep, tipo: 'sem_briefing', info: 'Briefing não preenchido' })
        sundaysCovered[domingo][subdep] = 'sem_briefing'
        continue
      }

      // Available members on this Sunday
      const disponiveisIds = new Set(
        (disponibilidades || [])
          .filter(d => d.domingo === domingo && d.disponivel)
          .map(d => d.user_id)
      )

      // Members of this subdepartamento who are available and not blocked by same-day exclusivity
      let pool = (membros || []).filter(m => {
        const inSubdep = Array.isArray(m.subdepartamento)
          ? m.subdepartamento.includes(subdep)
          : m.subdepartamento === subdep
        return inSubdep && disponiveisIds.has(m.id) && isAvailableForSubdep(m.id, subdep, domingo)
      })

      // ── EBD: professores só entram no pool da sua turma fixa
      if (subdep === 'ebd') {
        const turma = briefing.dados_json?.turma
        if (turma) {
          pool = pool.filter(m => m.turma_ebd === turma)
        }
      }

      // ── Louvor: cruzar instrumento necessário × instrumento do membro
      if (subdep === 'louvor' && briefing.dados_json?.instrumentos_necessarios) {
        const needed = briefing.dados_json.instrumentos_necessarios
        // For each needed instrument, find at least one available member
        const selectedIds = new Set()
        const selected = []

        for (const instrumento of needed) {
          const candidate = sortByPriority(
            pool.filter(m =>
              !selectedIds.has(m.id) &&
              Array.isArray(m.instrumento) &&
              m.instrumento.includes(instrumento)
            ),
            historico || [],
            subdep
          )[0]
          if (candidate) {
            selectedIds.add(candidate.id)
            selected.push({ member: candidate, instrumento })
          } else {
            alertas.push({
              domingo, subdep,
              tipo: 'instrumento_sem_cobertura',
              info: `Instrumento sem cobertura: ${instrumento}`
            })
          }
        }

        for (const { member } of selected) {
          escalaRows.push({
            ciclo_id: cicloId,
            user_id: member.id,
            domingo,
            subdepartamento: subdep,
            status_confirmacao: 'pendente',
          })
          markAssigned(member.id, subdep, domingo)
        }

        sundaysCovered[domingo][subdep] = selected.length > 0 ? 'ok' : 'sem_cobertura'
        continue
      }

      // ── Recepção: obrigatório 1 homem + 1 mulher
      if (subdep === 'recepcao') {
        const homens   = sortByPriority(pool.filter(m => m.genero === 'M'), historico || [], subdep)
        const mulheres = sortByPriority(pool.filter(m => m.genero === 'F'), historico || [], subdep)

        if (homens.length === 0 || mulheres.length === 0) {
          alertas.push({
            domingo, subdep,
            tipo: 'recepcao_incompleta',
            info: `Falta: ${homens.length === 0 ? 'homem' : 'mulher'}`
          })
          sundaysCovered[domingo][subdep] = 'sem_cobertura'
          continue
        }

        escalaRows.push(
          { ciclo_id: cicloId, user_id: homens[0].id,   domingo, subdepartamento: subdep, status_confirmacao: 'pendente' },
          { ciclo_id: cicloId, user_id: mulheres[0].id, domingo, subdepartamento: subdep, status_confirmacao: 'pendente' },
        )
        markAssigned(homens[0].id, subdep, domingo)
        markAssigned(mulheres[0].id, subdep, domingo)
        sundaysCovered[domingo][subdep] = 'ok'
        continue
      }

      // ── Generic subdepartamento
      const slots = SLOTS[subdep] ?? 1
      const sorted = sortByPriority(pool, historico || [], subdep)
      const selected = sorted.slice(0, slots)

      if (selected.length < slots) {
        alertas.push({
          domingo, subdep,
          tipo: 'cobertura_insuficiente',
          info: `Disponíveis: ${selected.length}/${slots}`
        })
        if (selected.length === 0) {
          sundaysCovered[domingo][subdep] = 'sem_cobertura'
          continue
        }
      }

      for (const member of selected) {
        escalaRows.push({
          ciclo_id: cicloId,
          user_id: member.id,
          domingo,
          subdepartamento: subdep,
          status_confirmacao: 'pendente',
        })
        markAssigned(member.id, subdep, domingo)
      }
      sundaysCovered[domingo][subdep] = selected.length >= slots ? 'ok' : 'parcial'
    }
  }

  // 7. Check for any sunday completely without coverage → block publication
  const criticalAlerts = alertas.filter(a =>
    a.tipo === 'cobertura_insuficiente' || a.tipo === 'sem_cobertura' || a.tipo === 'recepcao_incompleta'
  )

  if (criticalAlerts.length > 0) {
    // Log alerts to DB but do NOT publish
    await supabase.from('notificacoes_log').insert(
      criticalAlerts.map(a => ({
        tipo: 'escala_sem_cobertura',
        mensagem: `${a.domingo} / ${a.subdep}: ${a.info}`,
        enviado_em: new Date().toISOString(),
      }))
    )
    return {
      success: false,
      reason: 'cobertura_insuficiente',
      alertas,
      sundaysCovered,
    }
  }

  // 8. Insert schedule rows
  const { error: insertErr } = await supabase
    .from('escalas')
    .insert(escalaRows)
  if (insertErr) return { success: false, error: insertErr.message }

  // 9. Update cycle status
  await supabase
    .from('ciclos')
    .update({ status: 'escala_publicada' })
    .eq('id', cicloId)

  return {
    success: true,
    escalas: escalaRows,
    alertas,
    sundaysCovered,
    totalEscalados: escalaRows.length,
  }
}

// ── Notification job (call after runScheduleEngine) ──────────────────────────
export async function notifySchedulePublished(cicloId, notifyFn) {
  const { data: escalas } = await supabase
    .from('escalas')
    .select('user_id, domingo, subdepartamento, users(nome, whatsapp)')
    .eq('ciclo_id', cicloId)

  const byUser = {}
  for (const e of escalas || []) {
    if (!byUser[e.user_id]) {
      byUser[e.user_id] = { user: e.users, escalas: [] }
    }
    byUser[e.user_id].escalas.push({ domingo: e.domingo, subdepartamento: e.subdepartamento })
  }

  for (const { user, escalas: userEscalas } of Object.values(byUser)) {
    if (user?.whatsapp) {
      await notifyFn.escalaPublicada(user.whatsapp, user.nome, userEscalas)
    }
  }
}
