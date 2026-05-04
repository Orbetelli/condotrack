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

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-form')?.addEventListener('submit', handleLogin)
})

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
      // Correção 5: mensagem específica para e-mail não confirmado
      const msg = authError.message?.includes('Email not confirmed')
        ? 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.'
        : 'E-mail ou senha incorretos.'
      mostrarErro('form-error', msg)
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

    // Correção 4: rota inválida — perfil desconhecido
    if (!ROTAS[usuario.perfil]) {
      mostrarErro('form-error', 'Perfil de acesso não reconhecido. Contate o administrador.')
      await db.auth.signOut()
      setBtnCarregando('login-btn', false)
      return
    }

    // 3. Registra histórico de acesso (fire-and-forget)
    db.from('acessos').insert({
      usuario_id:    usuario.id,
      condominio_id: usuario.condominio_id,
      perfil:        usuario.perfil,
      nome:          usuario.nome,
      status:        'sucesso',
    }).then(() => {}).catch(() => {})

    // 4. Correção 6: salva sessão com dados completos
    salvarSessao(usuario.perfil, {
      id:     usuario.id,
      nome:   usuario.nome,
      email,
      perfil: usuario.perfil,
    })

    // 5. Redireciona para o painel correto
    window.location.href = ROTAS[usuario.perfil]

  } catch (err) {
    console.error('Erro no login:', err)
    mostrarErro('form-error', 'Erro inesperado. Tente novamente.')
    setBtnCarregando('login-btn', false)
  }
}

// ── Correção 1: Esqueci minha senha ──────────────────────────
function abrirEsqueciSenha() {
  const modal = document.getElementById('modal-reset')
  if (!modal) return
  // Reseta estado
  document.getElementById('reset-email').value        = ''
  document.getElementById('reset-email-error').style.display = 'none'
  document.getElementById('reset-form').style.display    = 'block'
  document.getElementById('reset-sucesso').style.display = 'none'
  // Pré-preenche o e-mail se já foi digitado
  const emailDigitado = document.getElementById('email')?.value.trim()
  if (emailDigitado) document.getElementById('reset-email').value = emailDigitado
  modal.style.display = 'flex'
  setTimeout(() => document.getElementById('reset-email')?.focus(), 50)
}

function fecharEsqueciSenha() {
  const modal = document.getElementById('modal-reset')
  if (modal) modal.style.display = 'none'
}

async function enviarResetSenha() {
  limparErro('reset-email-error')
  const email = document.getElementById('reset-email').value.trim()

  if (!email || !isEmailValido(email)) {
    mostrarErro('reset-email-error', 'Informe um e-mail válido.')
    return
  }

  // Botão carregando
  const btnTexto   = document.getElementById('reset-btn-texto')
  const btnSpinner = document.getElementById('reset-btn-spinner')
  const btn        = document.getElementById('btn-enviar-reset')
  btn.disabled          = true
  btnTexto.style.display   = 'none'
  btnSpinner.style.display = 'block'

  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/pages/login.html',
  })

  btn.disabled          = false
  btnTexto.style.display   = 'flex'
  btnSpinner.style.display = 'none'

  if (error) {
    mostrarErro('reset-email-error', 'Não foi possível enviar o link. Tente novamente.')
    return
  }

  // Mostra tela de sucesso
  document.getElementById('reset-form').style.display    = 'none'
  document.getElementById('reset-sucesso').style.display = 'block'
}

// Fecha modal ao clicar fora
document.addEventListener('click', e => {
  const modal = document.getElementById('modal-reset')
  if (modal && e.target === modal) fecharEsqueciSenha()
})

// Fecha modal com Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') fecharEsqueciSenha()
})