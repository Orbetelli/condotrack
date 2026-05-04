// ============================================================
//  admin-cadastro.js — cadastro do síndico · CondoTrack
//  O condomínio já foi criado pelo Super Admin.
//  O síndico recebe o link de convite, completa seus dados
//  e define a senha para acessar o painel.
// ============================================================

// Dados coletados no passo 0, usados no finalizar()
const dadosSindico = {
  nome:     '',
  cpf:      '',
  telefone: '',
  email:    '',
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  aplicarMascaraCPF('cpf')
  aplicarMascaraTelefone('telefone')

  // Tenta pegar o condomínio do convite via query string
  // Ex: admin-cadastro.html?condo=UUID-DO-CONDOMINIO
  const params    = new URLSearchParams(window.location.search)
  const condoId   = params.get('condo')

  if (condoId) {
    const { data } = await db
      .from('condominios')
      .select('nome, status')
      .eq('id', condoId)
      .single()

    if (data && data.status === 'ativo') {
      document.getElementById('nome-condo-convite').textContent = data.nome
      document.getElementById('nome-condo-convite').dataset.condoId = condoId
    } else {
      document.getElementById('nome-condo-convite').textContent = 'condomínio não encontrado'
      document.getElementById('nome-condo-convite').dataset.condoId = ''
      document.getElementById('erro-link').textContent =
        'Este link de convite é inválido ou o condomínio está inativo. Solicite um novo link ao administrador.'
      document.getElementById('erro-link').style.display = 'block'
      // Desabilita o formulário inteiro
      document.querySelectorAll('#step-0 input, #step-0 button').forEach(el => el.disabled = true)
    }
  } else {
    document.getElementById('nome-condo-convite').textContent = '—'
    document.getElementById('nome-condo-convite').dataset.condoId = ''
    document.getElementById('erro-link').textContent =
      'Link de convite inválido. Solicite um novo link ao administrador.'
    document.getElementById('erro-link').style.display = 'block'
    document.querySelectorAll('#step-0 input, #step-0 button').forEach(el => el.disabled = true)
  }

  renderStep(0)
})

let stepAtual = 0

// ── Stepper ───────────────────────────────────────────────────
function renderStep(step) {
  for (let i = 0; i < 2; i++) {
    const dot = document.getElementById('dot-' + i)
    const lbl = document.getElementById('lbl-' + i)
    if (!dot || !lbl) continue
    dot.className   = 'step-circle ' + (i < step ? 'done' : i === step ? 'active' : 'idle')
    dot.textContent = i < step ? '✓' : String(i + 1)
    lbl.className   = 'step-label' + (i === step ? ' active' : '')
  }
  const line = document.getElementById('line-0')
  if (line) line.className = 'step-line' + (step > 0 ? ' done' : '')

  for (let i = 0; i < 2; i++) {
    const el = document.getElementById('step-' + i)
    if (el) el.style.display = i === step ? 'block' : 'none'
  }

  stepAtual = step
}

// ── Navegação ────────────────────────────────────────────────
function avancar() {
  if (!validarPasso0()) return
  // Salva dados para usar no finalizar()
  dadosSindico.nome     = document.getElementById('nome').value.trim()
  dadosSindico.cpf      = document.getElementById('cpf').value.trim()
  dadosSindico.telefone = document.getElementById('telefone').value.trim()
  dadosSindico.email    = document.getElementById('email').value.trim()
  preencherResumo()
  renderStep(1)
}

function voltar() {
  renderStep(0)
}

// ── Validação passo 0 ────────────────────────────────────────
function validarPasso0() {
  limparTodosErros('err-nome', 'err-cpf', 'err-tel', 'err-email')
  let ok = true
  const nome  = document.getElementById('nome').value.trim()
  const cpf   = document.getElementById('cpf').value.trim()
  const tel   = document.getElementById('telefone').value.trim()
  const email = document.getElementById('email').value.trim()
  if (!nome)              { mostrarErro('err-nome',  'Informe seu nome completo.'); ok = false }
  if (!isCPFValido(cpf))  { mostrarErro('err-cpf',   'Informe um CPF válido.');     ok = false }
  if (!tel)               { mostrarErro('err-tel',   'Informe seu telefone.');       ok = false }
  if (!isEmailValido(email)) { mostrarErro('err-email', 'Informe um e-mail válido.'); ok = false }
  return ok
}

function preencherResumo() {
  const el = document.getElementById('resumo-box')
  if (!el) return
  el.textContent = ''

  const linha1 = document.createElement('div')
  const strong = document.createElement('strong')
  strong.textContent = dadosSindico.nome
  linha1.appendChild(document.createTextNode('Criando conta para '))
  linha1.appendChild(strong)

  const linha2 = document.createElement('span')
  linha2.style.cssText = 'font-size:12px;color:var(--p-600);display:block;margin-top:2px'
  linha2.textContent = dadosSindico.email

  el.appendChild(linha1)
  el.appendChild(linha2)
}

// ── Finalizar — salva no Supabase ────────────────────────────
async function finalizar() {
  limparTodosErros('err-senha', 'err-confirma')
  const senha    = document.getElementById('senha').value
  const confirma = document.getElementById('confirma').value
  let ok = true
  if (senha.length < 6)   { mostrarErro('err-senha',    'Mínimo 6 caracteres.'); ok = false }
  if (senha !== confirma) { mostrarErro('err-confirma', 'As senhas não coincidem.'); ok = false }
  if (!ok) return

  const condoId     = document.getElementById('nome-condo-convite')?.dataset.condoId || null
  const btnFinalizar = document.getElementById('btn-finalizar')

  // Segurança extra: bloqueia se condoId estiver vazio
  if (!condoId) {
    mostrarErro('err-senha', 'Link de convite inválido. Não é possível concluir o cadastro.')
    return
  }

  if (btnFinalizar) {
    btnFinalizar.disabled = true
    btnFinalizar.innerHTML = '<span class="spinner"></span>'
  }

  try {
    // 1. Cria a conta no Supabase Auth
    const { data: authData, error: authError } = await db.auth.signUp({
      email:    dadosSindico.email,
      password: senha,
    })

    if (authError) {
      const msg = (
        authError.message?.toLowerCase().includes('already registered') ||
        authError.message?.toLowerCase().includes('already exists') ||
        authError.status === 422
      )
        ? 'Este e-mail já possui uma conta. Tente fazer login.'
        : 'Erro ao criar conta: ' + authError.message
      mostrarErro('err-senha', msg)
      if (btnFinalizar) { btnFinalizar.disabled = false; btnFinalizar.innerHTML = 'Acessar o painel' }
      return
    }

    // Supabase retorna user:null quando confirmação de e-mail está ativa
    const userId = authData.user?.id ?? authData.session?.user?.id
    if (!userId) {
      mostrarErro('err-senha', 'Confirme seu e-mail antes de continuar. Verifique sua caixa de entrada.')
      if (btnFinalizar) { btnFinalizar.disabled = false; btnFinalizar.innerHTML = 'Acessar o painel' }
      return
    }

    // 2. Insere na tabela usuarios
    const { error: dbError } = await db.from('usuarios').insert({
      auth_id:       userId,
      condominio_id: condoId,
      perfil:        'admin',
      nome:          dadosSindico.nome,
      email:         dadosSindico.email,
      cpf:           dadosSindico.cpf.replace(/\D/g, ''),
      telefone:      dadosSindico.telefone,
      status:        'ativo',
    })

    if (dbError) {
      console.error('Erro ao salvar usuário:', dbError)
      mostrarErro('err-senha', 'Erro ao salvar seus dados. Tente novamente.')
      if (btnFinalizar) { btnFinalizar.disabled = false; btnFinalizar.innerHTML = 'Acessar o painel' }
      return
    }

    // 3. Tela de sucesso
    const nomeCondo = document.getElementById('nome-condo-convite')?.textContent || ''
    document.getElementById('step-1').style.display       = 'none'
    document.getElementById('stepper').style.display      = 'none'
    document.getElementById('reg-header').style.display   = 'none'
    document.getElementById('success-msg').textContent    =
      `Olá, ${dadosSindico.nome}! Seu acesso ao painel do ${nomeCondo} foi criado. Confirme seu e-mail se necessário e faça o login.`
    document.getElementById('success-screen').style.display = 'block'

  } catch (err) {
    console.error('Erro inesperado:', err)
    mostrarErro('err-senha', 'Erro inesperado. Tente novamente.')
    if (btnFinalizar) { btnFinalizar.disabled = false; btnFinalizar.innerHTML = 'Acessar o painel' }
  }
}