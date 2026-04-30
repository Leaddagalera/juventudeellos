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

  // 5. Load active members with full profile — membro_serve + líderes que também servem
  const { data: membros, error: e3 } = await supabase
    .from('users')
    .select('*')
    .eq('ativo', true)
    .in('role', ['membro_serve', 'lider_geral', 'lider_funcao'])
  if (e3) throw e3

  // 6. Load recent schedule history (configurable window for priority)
  const historyDays = sysConfig.history_days ?? 90
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - historyDays)
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
    sundaysCovered[domingo]._ensaio = isEnsaioSunday(domingo, ensaioWeek)

    // Regência é processada primeiro para que soloistas já estejam em escalaRows
    // antes do matching de instrumentos do Louvor
    for (const subdep of ['regencia', 'louvor', 'ebd', 'recepcao', 'midia']) {
      // Find briefing for this sunday + subdep
      // Louvor usa o briefing da regência (mesmo registro, sem duplicata)
      // Exclui tipo='ensaio' para não confundir com o briefing normal do domingo
      const briefingSubdep = subdep === 'louvor' ? 'regencia' : subdep
      const briefing = briefings?.find(
        b => b.domingo === domingo && b.subdepartamento === briefingSubdep && b.tipo !== 'ensaio'
      )
      if (!briefing) {
        alertas.push({ domingo, subdep, tipo: 'sem_briefing', info: 'Briefing não preenchido' })
        sundaysCovered[domingo][subdep] = 'sem_briefing'
        continue
      }

      // ── Regência: pinned do briefing — regente + solistas, sem filtro de disponibilidade ──
      // Extrai também do briefing de ensaio (tipo='ensaio') quando existir
      if (subdep === 'regencia') {
        const allRegBriefings = (briefings || []).filter(
          b => b.domingo === domingo && b.subdepartamento === 'regencia'
        )

        // Deduplica por chave `userId:rowSubdep`
        const pinned = new Map()

        for (const b of allRegBriefings) {
          const d = b.dados_json || {}

          if (b.tipo === 'ensaio' && Array.isArray(d.hinos)) {
            // Domingo de ensaio: extrair de cada hino individualmente
            for (const hino of d.hinos) {
              if (hino.regente_id)   pinned.set(`${hino.regente_id}:regencia`,  { user_id: hino.regente_id,   subdepartamento: 'regencia' })
              if (hino.solista_1_id) pinned.set(`${hino.solista_1_id}:louvor`,  { user_id: hino.solista_1_id, subdepartamento: 'louvor'   })
              if (hino.solista_2_id) pinned.set(`${hino.solista_2_id}:louvor`,  { user_id: hino.solista_2_id, subdepartamento: 'louvor'   })
            }
          } else {
            // Domingo normal: regente + até 2 solistas
            if (d.regente_id) pinned.set(`${d.regente_id}:regencia`, { user_id: d.regente_id, subdepartamento: 'regencia' })
            if (d.solo_1_id)  pinned.set(`${d.solo_1_id}:louvor`,   { user_id: d.solo_1_id,  subdepartamento: 'louvor'   })
            if (d.solo_2_id)  pinned.set(`${d.solo_2_id}:louvor`,   { user_id: d.solo_2_id,  subdepartamento: 'louvor'   })
          }
        }

        if (pinned.size === 0) {
          alertas.push({ domingo, subdep, tipo: 'sem_cobertura', info: 'Regente/solistas não preenchidos no briefing' })
          sundaysCovered[domingo][subdep] = 'sem_cobertura'
          continue
        }

        for (const { user_id, subdepartamento: rowSubdep } of pinned.values()) {
          escalaRows.push({
            ciclo_id: cicloId,
            user_id,
            domingo,
            subdepartamento: rowSubdep,
            status_confirmacao: 'pendente',
          })
          markAssigned(user_id, rowSubdep, domingo)
        }

        sundaysCovered[domingo][subdep] = 'ok'
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
      // selectedIds é pré-populado com soloistas já escalados via briefing de regência
      if (subdep === 'louvor' && briefing.dados_json?.instrumentos_necessarios) {
        const needed = briefing.dados_json.instrumentos_necessarios

        // Soloistas pinned na regência já adicionados a escalaRows — não duplicar
        const selectedIds = new Set(
          escalaRows
            .filter(r => r.domingo === domingo && r.subdepartamento === 'louvor')
            .map(r => r.user_id)
        )
        // Instrumentos já cobertos pelos soloistas pinned
        const coveredInstruments = new Set(
          [...selectedIds].flatMap(uid => membros.find(m => m.id === uid)?.instrumento ?? [])
        )

        const selected = []

        for (const instrumento of needed) {
          if (coveredInstruments.has(instrumento)) continue // já coberto por solista do briefing

          // Ordenação para matching de instrumento:
          // 1º Especialização: quem toca MENOS instrumentos tem prioridade no próprio
          //    (violonista nativo antes do curinga que também sabe violão)
          // 2º Rotatividade: quem serviu há mais tempo no louvor
          // 3º Rotatividade global: quem serviu há mais tempo em qualquer subdep
          const candidates = pool
            .filter(m =>
              !selectedIds.has(m.id) &&
              Array.isArray(m.instrumento) &&
              m.instrumento.includes(instrumento)
            )
            .sort((a, b) => {
              const specA = a.instrumento?.length ?? 99
              const specB = b.instrumento?.length ?? 99
              if (specA !== specB) return specA - specB

              const lastSubdepA = lastServiceDateForSubdep(a.id, subdep, historico || [])
              const lastSubdepB = lastServiceDateForSubdep(b.id, subdep, historico || [])
              if (lastSubdepA !== lastSubdepB) return lastSubdepA.localeCompare(lastSubdepB)

              return lastServiceDate(a.id, historico || []).localeCompare(
                     lastServiceDate(b.id, historico || []))
            })
          const candidate = candidates[0]
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

        // Louvor tem cobertura se há instrumentistas disponíveis OU soloistas já pinned
        const pinnedLouvorCount = escalaRows.filter(
          r => r.domingo === domingo && r.subdepartamento === 'louvor'
        ).length
        sundaysCovered[domingo][subdep] = (selected.length > 0 || pinnedLouvorCount > 0) ? 'ok' : 'sem_cobertura'
        continue
      }

      // ── Recepção: idealmente 1 homem + 1 mulher
      if (subdep === 'recepcao') {
        const homens   = sortByPriority(pool.filter(m => m.genero === 'M'), historico || [], subdep)
        const mulheres = sortByPriority(pool.filter(m => m.genero === 'F'), historico || [], subdep)

        const temGenero = pool.some(m => m.genero === 'M' || m.genero === 'F')

        if (temGenero && (homens.length === 0 || mulheres.length === 0)) {
          // Gênero cadastrado mas faltando um dos dois — bloqueia
          alertas.push({
            domingo, subdep,
            tipo: 'recepcao_incompleta',
            info: `Falta: ${homens.length === 0 ? 'homem' : 'mulher'}`
          })
          sundaysCovered[domingo][subdep] = 'sem_cobertura'
          continue
        }

        let selecionados
        if (temGenero) {
          // Par completo por gênero
          selecionados = [homens[0], mulheres[0]]
        } else {
          // Gênero não cadastrado — fallback: top 2 por rotatividade + alerta não-crítico
          alertas.push({
            domingo, subdep,
            tipo: 'recepcao_sem_genero',
            info: 'Gênero não cadastrado — escalado por rotatividade'
          })
          selecionados = sortByPriority(pool, historico || [], subdep).slice(0, SLOTS[subdep] ?? 2)
        }

        if (selecionados.length === 0) {
          alertas.push({ domingo, subdep, tipo: 'sem_cobertura', info: 'Sem disponíveis' })
          sundaysCovered[domingo][subdep] = 'sem_cobertura'
          continue
        }

        for (const m of selecionados) {
          escalaRows.push({ ciclo_id: cicloId, user_id: m.id, domingo, subdepartamento: subdep, status_confirmacao: 'pendente' })
          markAssigned(m.id, subdep, domingo)
        }
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
