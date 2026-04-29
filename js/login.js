// ============================================================
//  login.js — autenticação real via Supabase
//  UX: detecção automática de perfil + esqueci minha senha
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

// ── Detecta perfil ao sair do campo de e-mail ─────────────────
async function detectarPerfil() {
  const email = document.getElementById('email').value.trim()
  if (!isEmailValido(email)) return

  const { data } = await db
    .from('usuarios')
    .select('perfil')
    .eq('email', email)
    .single()

  if (!data?.perfil) return

  // Mapeia o perfil real para o botão correspondente
  const mapaBtn = {
    morador:    'morador',
    porteiro:   'porteiro',
    admin:      'admin',
    superadmin: 'admin',
  }

  const btnPerfil = mapaBtn[data.perfil]
  if (!btnPerfil) return

  // Seleciona automaticamente o perfil correto
  const btn = document.querySelector(`[data-profile="${btnPerfil}"]`)
  if (btn) {
    selecionarPerfil(btn)

    // Feedback visual sutil
    const hint = document.getElementById('perfil-hint')
    if (hint) {
      hint.textContent = `Perfil detectado: ${data.perfil === 'superadmin' ? 'Super Admin' : data.perfil.charAt(0).toUpperCase() + data.perfil.slice(1)}`
      hint.style.display = 'block'
    }
  }
}

// ── Login ─────────────────────────────────────────────────────
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

    // 2. Busca o perfil do usuário
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
    const perfilReal  = usuario.perfil
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

// ── Esqueci minha senha ───────────────────────────────────────
function abrirEsqueciSenha() {
  document.getElementById('modal-esqueci').classList.add('open')
  document.getElementById('reset-email').value = document.getElementById('email').value
  limparErro('reset-email-err')
  document.getElementById('reset-form-wrap').style.display  = 'block'
  document.getElementById('reset-sucesso-wrap').style.display = 'none'
}

function fecharEsqueciSenha() {
  document.getElementById('modal-esqueci').classList.remove('open')
}

async function enviarResetSenha(e) {
  e.preventDefault()
  limparErro('reset-email-err')

  const email = document.getElementById('reset-email').value.trim()
  if (!isEmailValido(email)) {
    mostrarErro('reset-email-err', 'Informe um e-mail válido.')
    return
  }

  const btn = e.submitter
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/pages/login.html',
  })

  if (error) {
    mostrarErro('reset-email-err', 'Erro ao enviar. Tente novamente.')
    if (btn) { btn.disabled = false; btn.innerHTML = 'Enviar link de redefinição' }
    return
  }

  document.getElementById('reset-form-wrap').style.display   = 'none'
  document.getElementById('reset-sucesso-wrap').style.display = 'block'
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('login-form')?.addEventListener('submit', handleLogin)

  // Detecta perfil ao sair do campo de e-mail
  document.getElementById('email')?.addEventListener('blur', detectarPerfil)

  // Fechar modal ao clicar fora
  document.getElementById('modal-esqueci')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-esqueci')) fecharEsqueciSenha()
  })

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') fecharEsqueciSenha()
  })
})