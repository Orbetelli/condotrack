// ============================================================
//  supabase.js — configuração e cliente do Supabase
//  Importado por todas as páginas antes dos outros scripts
// ============================================================

const SUPABASE_URL = 'https://ihaeqbtoylxcfwmdcjfg.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloYWVxYnRveWx4Y2Z3bWRjamZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNTA4NTUsImV4cCI6MjA5MjgyNjg1NX0.Tyn5D4LeCsPWMFh8Crk6zb9gQD9IlR4fjG_v_xfnMPE'

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
    .select(`
      *,
      condominios (*),
      apartamentos (*)
    `)
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

// ── Encerrar sessão ──────────────────────────────────────────
function encerrarSessao() {
  logout()
}