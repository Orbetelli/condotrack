// ============================================================
//  supabase.js — configuração e cliente do Supabase
//  Importado por todas as páginas antes dos outros scripts
// ============================================================

const SUPABASE_URL = 'https://ihaeqbtoylxcfwmdcjfg.supabase.co'
const SUPABASE_KEY = 'sb_publishable_tkRXIWO0dgIArNRHZ9RyGw_ewcUlAzD'

// Carrega o cliente via CDN (declarado no HTML antes deste script)
const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Helpers de autenticação ──────────────────────────────────

async function getSession() {
  const { data: { session } } = await db.auth.getSession()
  return session
}

async function getUsuarioLogado() {
  const session = await getSession()
  if (!session) return null

  const { data, error } = await db
    .from('usuarios')
    .select('*, condominios(*)')
    .eq('auth_id', session.user.id)
    .single()

  if (error) { console.error('Erro ao buscar usuário:', error); return null }
  return data
}

async function logout() {
  await db.auth.signOut()
  window.location.href = '../pages/login.html'
}

// ── Guard: redireciona se não estiver logado ─────────────────
async function requireAuth(perfilEsperado = null) {
  const usuario = await getUsuarioLogado()

  if (!usuario) {
    window.location.href = 'login.html'
    return null
  }

  if (perfilEsperado && !perfilEsperado.includes(usuario.perfil)) {
    window.location.href = 'login.html'
    return null
  }

  return usuario
}