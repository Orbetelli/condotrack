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

  // Tenta obter a sessão — o Supabase pode demorar alguns ms
  // para propagar após um redirect de login
  const session = await getSession()
  if (!session?.user?.id) return null

  const { data, error } = await db
    .from('usuarios')
    .select(`
      *,
      condominios (*),
      apartamentos (*)
    `)
    .eq('auth_id', session.user.id)
    .single()

  if (error || !data) {
    console.error('Erro ao buscar usuário:', error)
    return null
  }

  _gravarCacheUsuario(data)
  return data
}

// ── Caminho absoluto para o login — funciona de qualquer pasta ─
function rotaLogin() {
  // Sempre usa caminho absoluto a partir da raiz do site
  return window.location.origin + '/pages/login.html'
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
  // Tenta até 3 vezes com pequeno delay — garante que a sessão
  // foi propagada após redirect do login (race condition comum)
  let usuario = null
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    invalidarCacheUsuario() // força re-fetch em cada tentativa
    usuario = await getUsuarioLogado()
    if (usuario) break
    // Aguarda 500ms antes de tentar de novo
    if (tentativa < 2) await new Promise(r => setTimeout(r, 500))
  }

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