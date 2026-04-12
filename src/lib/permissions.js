/**
 * Permissions system — reads from `perfis` table in Supabase.
 * Falls back to DEFAULT_PERMISSIONS when DB is unavailable.
 *
 * Usage:
 *   const { can, hasScreen, canSee, loaded } = usePermissions()
 *   can('editar_membro')      → boolean
 *   hasScreen('relatorios')   → boolean
 *   canSee('tarja')           → boolean
 */

import { useState, useEffect } from 'react'
import { supabase } from './supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'

// ── Static catalogs ───────────────────────────────────────────────────────────

export const TELAS = [
  { id: 'dashboard',       label: 'Dashboard' },
  { id: 'escalas',         label: 'Escalas' },
  { id: 'briefings',       label: 'Briefings' },
  { id: 'disponibilidade', label: 'Disponibilidade' },
  { id: 'visitantes',      label: 'Visitantes' },
  { id: 'membros',         label: 'Membros' },
  { id: 'relatorios',      label: 'Relatórios' },
  { id: 'comunicados',     label: 'Comunicados' },
  { id: 'midia_login',     label: 'Mídia da página de login' },
  { id: 'configuracoes',   label: 'Configurações' },
]

export const ACOES = [
  { id: 'aprovar_cadastro',    label: 'Aprovar cadastros' },
  { id: 'aprovar_troca',       label: 'Aprovar trocas' },
  { id: 'aprovar_midia',       label: 'Aprovar conteúdo de mídia' },
  { id: 'editar_membro',       label: 'Editar membros' },
  { id: 'excluir_membro',      label: 'Excluir membros' },
  { id: 'promover_membro',     label: 'Promover membros' },
  { id: 'editar_tarja',        label: 'Editar tarjas' },
  { id: 'preencher_briefing',  label: 'Preencher briefing' },
  { id: 'confirmar_presenca',  label: 'Confirmar presença' },
  { id: 'solicitar_troca',     label: 'Solicitar troca' },
  { id: 'registrar_visitante', label: 'Registrar visitante' },
  { id: 'criar_comunicado',    label: 'Criar comunicado' },
  { id: 'ver_relatorios',      label: 'Ver relatórios' },
  { id: 'gerenciar_perfis',    label: 'Gerenciar perfis' },
]

export const CAMPOS = [
  { id: 'tarja',             label: 'Tarja pastoral' },
  { id: 'dados_pessoais',    label: 'Dados pessoais completos' },
  { id: 'historico_servico', label: 'Histórico de serviço' },
  { id: 'escala_geral',      label: 'Escala geral do departamento' },
  { id: 'escala_propria',    label: 'Somente escala própria' },
  { id: 'briefing_completo', label: 'Briefing completo' },
  { id: 'saude_subdeps',     label: 'Saúde dos subdepartamentos' },
  { id: 'alertas_sistema',   label: 'Alertas do sistema' },
  { id: 'dados_visitantes',  label: 'Dados de visitantes' },
]

// ── Default permissions (fallback) ────────────────────────────────────────────

const _allTelas  = TELAS.map(t => t.id)
const _allAcoes  = ACOES.map(a => a.id)
const _allCampos = CAMPOS.map(c => c.id)

export const DEFAULT_PERMISSIONS = {
  lider_geral: {
    telas:           _allTelas,
    acoes:           _allAcoes,
    campos_visiveis: _allCampos,
  },
  lider_funcao: {
    telas:           ['dashboard', 'escalas', 'briefings', 'disponibilidade', 'comunicados'],
    acoes:           ['preencher_briefing', 'confirmar_presenca', 'solicitar_troca'],
    campos_visiveis: ['historico_servico', 'escala_geral', 'briefing_completo', 'saude_subdeps'],
  },
  membro_serve: {
    telas:           ['dashboard', 'escalas', 'disponibilidade'],
    acoes:           ['confirmar_presenca', 'solicitar_troca'],
    campos_visiveis: ['historico_servico', 'escala_propria'],
  },
  membro_observador: {
    telas:           ['dashboard', 'escalas', 'briefings'],
    acoes:           [],
    campos_visiveis: ['escala_geral', 'briefing_completo'],
  },
}

// ── Profile labels cache ──────────────────────────────────────────────────────

const _labelsCache = {}
let _labelsCacheAt = 0

export async function loadProfileLabels() {
  const now = Date.now()
  if (Object.keys(_labelsCache).length > 0 && (now - _labelsCacheAt) < CACHE_TTL) {
    return _labelsCache
  }
  try {
    const { data } = await supabase.from('perfis').select('nome, label')
    if (data) {
      for (const p of data) _labelsCache[p.nome] = p.label
      _labelsCacheAt = now
    }
  } catch (e) {
    console.warn('[Permissions] erro ao carregar labels:', e?.message)
  }
  return _labelsCache
}

export function getProfileLabel(role) {
  return _labelsCache[role] || null
}

// ── Module-level cache (5 min TTL) ────────────────────────────────────────────

const _cache    = {}
const _cacheAt  = {}
const CACHE_TTL = 5 * 60 * 1000

export async function getPerfilPermissions(role) {
  const now = Date.now()
  if (_cache[role] && (now - (_cacheAt[role] || 0)) < CACHE_TTL) {
    return _cache[role]
  }

  try {
    const { data, error } = await supabase
      .from('perfis')
      .select('telas, acoes, campos_visiveis')
      .eq('nome', role)
      .maybeSingle()   // maybeSingle → retorna null (não erro) quando não encontrado

    // Erros de tabela inexistente (42P01) ou schema cache → cair no fallback
    if (error) {
      const code = error?.code || ''
      if (code !== '42P01' && code !== 'PGRST116') {
        // Erro real — logamos mas não crashamos
        console.warn('[Permissions] erro ao buscar perfil:', error.message)
      }
      return DEFAULT_PERMISSIONS[role] || { telas: [], acoes: [], campos_visiveis: [] }
    }

    if (data) {
      _cache[role]   = data
      _cacheAt[role] = now
      return data
    }
  } catch (e) {
    console.warn('[Permissions] exceção ao buscar perfil:', e?.message)
  }

  // Fallback: defaults hardcoded
  return DEFAULT_PERMISSIONS[role] || { telas: [], acoes: [], campos_visiveis: [] }
}

export function invalidatePermissionsCache(role) {
  if (role) {
    delete _cache[role]
    delete _cacheAt[role]
  } else {
    for (const k of Object.keys(_cache))  delete _cache[k]
    for (const k of Object.keys(_cacheAt)) delete _cacheAt[k]
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePermissions() {
  const { profile } = useAuth()
  const role = profile?.role
  const fallback = DEFAULT_PERMISSIONS[role] || { telas: [], acoes: [], campos_visiveis: [] }

  const [perms,  setPerms]  = useState(fallback)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!role) return
    let cancelled = false
    setPerms(DEFAULT_PERMISSIONS[role] || { telas: [], acoes: [], campos_visiveis: [] })
    setLoaded(false)

    Promise.all([
      getPerfilPermissions(role),
      loadProfileLabels(),
    ]).then(([p]) => {
      if (!cancelled) { setPerms(p); setLoaded(true) }
    })

    return () => { cancelled = true }
  }, [role])

  return {
    /** Can the current user perform this action? */
    can:       (action) => perms.acoes?.includes(action)           ?? false,
    /** Does the current user have access to this screen? */
    hasScreen: (screen) => perms.telas?.includes(screen)           ?? false,
    /** Can the current user see this field/section? */
    canSee:    (field)  => perms.campos_visiveis?.includes(field)  ?? false,
    permissions: perms,
    loaded,
  }
}
