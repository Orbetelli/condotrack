// ============================================================
//  login.js — autenticação real via Supabase
// ============================================================

const ROTAS = {
  superadmin: 'superadmin.html',
  admin:      'admin.html',
  porteiro:   'porteiro.html',
  morador:    'morador.html',
}

let perfilSelecionado = 'morador'

function selecionarPerfil(btn) {
  document.querySelectorAll('.profile-btn').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  perfilSelecionado = btn.dataset.profile
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

    // 2. Busca o perfil do usuário na tabela usuarios
    const { data: usuario, error: userError } = await db
      .from('usuarios')
      .select('perfil, condominio_id, status')
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

    // 3. Valida se o perfil selecionado bate com o perfil real
    // superadmin e admin compartilham o botão "Admin" no seletor
    const perfilReal = usuario.perfil
    const perfilBotao = perfilSelecionado

    const mapaValido = {
      morador:  ['morador'],
      porteiro: ['porteiro'],
      admin:    ['admin', 'superadmin'],
    }

    if (!mapaValido[perfilBotao]?.includes(perfilReal)) {
      mostrarErro('form-error', 'Perfil selecionado não corresponde à sua conta.')
      await db.auth.signOut()
      setBtnCarregando('login-btn', false)
      return
    }

    // 4. Redireciona para o painel correto
    salvarSessao(perfilReal, { email, perfil: perfilReal })
    window.location.href = ROTAS[perfilReal]

  } catch (err) {
    console.error('Erro no login:', err)
    mostrarErro('form-error', 'Erro inesperado. Tente novamente.')
    setBtnCarregando('login-btn', false)
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-form')?.addEventListener('submit', handleLogin)
})