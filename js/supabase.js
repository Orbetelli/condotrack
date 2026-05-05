// ============================================================
//  supabase.js — configuração e cliente do Supabase
//  Importado por todas as páginas antes dos outros scripts
// ============================================================

const SUPABASE_URL = 'https://ihaeqbtoylxcfwmdcjfg.supabase.co'
const SUPABASE_KEY = 'sb_publishable_tkRXIWO0dgIArNRHZ9RyGw_ewcUlAzD'

const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Helpers de autenticação ──────────────────────────────────

async function getSession() {
  const { data: { session } } = await db.auth.getSession()
  return session
}

// ── Cache do usuário logado (TTL: 5 minutos) ─────────────────
const CACHE_KEY = 'ct_usuario_cache'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos em ms

function _lerCacheUsuario() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { data, expiresAt } = JSON.parse(raw)
    if (Date.now() > expiresAt) {
      sessionStorage.removeItem(CACHE_KEY)
      return null
    }
    return data
  } catch {
    return null
  }
}

function _gravarCacheUsuario(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      data,
      expiresAt: Date.now() + CACHE_TTL,
    }))
  } catch { /* sessionStorage indisponível — sem cache */ }
}

function invalidarCacheUsuario() {
  sessionStorage.removeItem(CACHE_KEY)
}

async function getUsuarioLogado() {
  // Retorna do cache se ainda válido
  const cached = _lerCacheUsuario()
  if (cached) return cached

  const session = await getSession()
  if (!session) return null

  const { data, error } = await db
    .from('usuarios')
    .select(`
      *,
      condominios (*),
      apartamentos (*)
    `)
    .eq('auth_id', session.user.id)
    .single()

  if (error) { console.error('Erro ao buscar usuário:', error); return null }

  _gravarCacheUsuario(data)
  return data
}

// ── Caminho absoluto para o login — funciona de qualquer pasta ─
function rotaLogin() {
  // Detecta se está dentro de /pages/ ou na raiz e monta o path correto
  const base = window.location.pathname.includes('/pages/')
    ? '/pages/login.html'
    : window.location.pathname.replace(/\/[^/]*$/, '/pages/login.html')
  return window.location.origin + base
}

async function logout() {
  sessionStorage.removeItem('sa_impersonate_condo_id')
  sessionStorage.removeItem('sa_impersonate_condo_nome')
  invalidarCacheUsuario()
  await db.auth.signOut()
  window.location.href = rotaLogin()
}

// ── Guard: redireciona se não estiver logado ─────────────────
async function requireAuth(perfilEsperado = null) {
  const usuario = await getUsuarioLogado()

  if (!usuario) {
    window.location.href = rotaLogin()
    return null
  }

  if (perfilEsperado && !perfilEsperado.includes(usuario.perfil)) {
    window.location.href = rotaLogin()
    return null
  }

  return usuario
}

// ── Encerrar sessão ──────────────────────────────────────────
function encerrarSessao() {
  logout()
}