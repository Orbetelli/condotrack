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
      .select('nome')
      .eq('id', condoId)
      .single()
    if (data) {
      document.getElementById('nome-condo-convite').textContent = data.nome
    } else {
      document.getElementById('nome-condo-convite').textContent = 'condomínio não encontrado'
    }
    document.getElementById('nome-condo-convite').dataset.condoId = condoId
  } else {
    // Link de convite inválido ou acessado diretamente sem parâmetro
    document.getElementById('nome-condo-convite').textContent = '—'
    document.getElementById('nome-condo-convite').dataset.condoId = ''
    mostrarErro('err-email', 'Link de convite inválido. Solicite um novo link ao administrador.')
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
  if (el) el.innerHTML =
    `Criando conta para <strong>${dadosSindico.nome}</strong><br>
     <span style="font-size:12px;color:var(--p-600)">${dadosSindico.email}</span>`
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

  const condoId = document.getElementById('nome-condo-convite')?.dataset.condoId || null

  // Bloqueia o botão durante o processo
  const btnFinalizar = document.querySelector('#step-1 .ct-btn-primary')
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
      const msg = authError.message === 'User already registered'
        ? 'Este e-mail já possui uma conta.'
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
    document.getElementById('step-1').style.display      = 'none'
    document.getElementById('stepper').style.display     = 'none'
    document.getElementById('reg-header').style.display  = 'none'
    document.getElementById('success-screen').style.display = 'block'

  } catch (err) {
    console.error('Erro inesperado:', err)
    mostrarErro('err-senha', 'Erro inesperado. Tente novamente.')
    if (btnFinalizar) { btnFinalizar.disabled = false; btnFinalizar.innerHTML = 'Acessar o painel' }
  }
}