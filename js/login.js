// ============================================================
//  login.js — autenticação real via Supabase
//  Identifica o perfil automaticamente pelo e-mail
// ============================================================

const ROTAS = {
  superadmin: 'superadmin.html',
  admin:      'admin.html',
  porteiro:   'porteiro.html',
  morador:    'morador.html',
}

function alternarSenha() {
  toggleSenha('senha', 'eye-icon')
}

async function handleLogin(e) {
  e.preventDefault()
  limparTodosErros('email-error', 'senha-error', 'form-error')

  const email = document.getElementById('email').value.trim()
  const senha = document.getElementById('senha').value
  let valido  = true

  if (!email || !isEmailValido(email)) {
    mostrarErro('email-error', 'Informe um e-mail válido.')
    valido = false
  }
  if (!senha || senha.length < 6) {
    mostrarErro('senha-error', 'Mínimo 6 caracteres.')
    valido = false
  }
  if (!valido) return

  setBtnCarregando('login-btn', true)

  try {
    // 1. Login no Supabase Auth
    const { data: authData, error: authError } = await db.auth.signInWithPassword({
      email,
      password: senha,
    })

    if (authError) {
      mostrarErro('form-error', 'E-mail ou senha incorretos.')
      setBtnCarregando('login-btn', false)
      return
    }

    // 2. Busca o perfil automaticamente
    const { data: usuario, error: userError } = await db
      .from('usuarios')
      .select('id, perfil, condominio_id, nome, status')
      .eq('auth_id', authData.user.id)
      .single()

    if (userError || !usuario) {
      mostrarErro('form-error', 'Usuário não encontrado no sistema.')
      await db.auth.signOut()
      setBtnCarregando('login-btn', false)
      return
    }

    if (usuario.status === 'inativo') {
      mostrarErro('form-error', 'Sua conta está inativa. Entre em contato com o administrador.')
      await db.auth.signOut()
      setBtnCarregando('login-btn', false)
      return
    }

    // 3. Registra histórico de acesso
    db.from('acessos').insert({
      usuario_id:    usuario.id,
      condominio_id: usuario.condominio_id,
      perfil:        usuario.perfil,
      nome:          usuario.nome,
      status:        'sucesso',
    }).then(() => {}).catch(() => {})

    // 4. Redireciona automaticamente para o painel correto
    salvarSessao(usuario.perfil, { email, perfil: usuario.perfil })
    window.location.href = ROTAS[usuario.perfil]

  } catch (err) {
    console.error('Erro no login:', err)
    mostrarErro('form-error', 'Erro inesperado. Tente novamente.')
    setBtnCarregando('login-btn', false)
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-form')?.addEventListener('submit', handleLogin)
})