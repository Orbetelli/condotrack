// ============================================================
//  admin-cadastro.js — cadastro simplificado do síndico
//  O condomínio já foi criado pelo Super Admin
//  O síndico só precisa: dados pessoais + senha
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  aplicarMascaraCPF('cpf')
  aplicarMascaraTelefone('telefone')
  renderStep(0)
})

let stepAtual = 0

function renderStep(step) {
  for (let i = 0; i < 2; i++) {
    const dot = document.getElementById('dot-' + i)
    const lbl = document.getElementById('lbl-' + i)
    if (!dot || !lbl) continue
    dot.className = 'step-circle ' + (i < step ? 'done' : i === step ? 'active' : 'idle')
    dot.textContent = i < step ? '✓' : String(i + 1)
    lbl.className = 'step-label' + (i === step ? ' active' : '')
  }
  const line = document.getElementById('line-0')
  if (line) line.className = 'step-line' + (step > 0 ? ' done' : '')

  for (let i = 0; i < 2; i++) {
    const el = document.getElementById('step-' + i)
    if (el) el.style.display = i === step ? 'block' : 'none'
  }

  stepAtual = step
}

function avancar() {
  if (!validarPasso0()) return
  preencherResumo()
  renderStep(1)
}

function voltar() {
  renderStep(0)
}

function validarPasso0() {
  limparTodosErros('err-nome','err-cpf','err-tel','err-email')
  let ok = true
  const nome  = document.getElementById('nome').value.trim()
  const cpf   = document.getElementById('cpf').value.trim()
  const tel   = document.getElementById('telefone').value.trim()
  const email = document.getElementById('email').value.trim()
  if (!nome.trim())         { mostrarErro('err-nome',  'Informe seu nome completo.'); ok = false }
  if (!isCPFValido(cpf))    { mostrarErro('err-cpf',   'Informe um CPF válido.');     ok = false }
  if (!tel.trim())          { mostrarErro('err-tel',   'Informe seu telefone.');       ok = false }
  if (!isEmailValido(email)){ mostrarErro('err-email', 'Informe um e-mail válido.');   ok = false }
  return ok
}

function preencherResumo() {
  const nome  = document.getElementById('nome').value.trim()
  const email = document.getElementById('email').value.trim()
  const el = document.getElementById('resumo-box')
  if (el) el.innerHTML =
    `Criando conta para <strong>${nome}</strong><br>
     <span style="font-size:12px;color:var(--p-600)">${email}</span>`
}

function finalizar() {
  limparTodosErros('err-senha','err-confirma')
  const senha    = document.getElementById('senha').value
  const confirma = document.getElementById('confirma').value
  let ok = true
  if (senha.length < 6)   { mostrarErro('err-senha',    'Mínimo 6 caracteres.'); ok = false }
  if (senha !== confirma) { mostrarErro('err-confirma', 'As senhas não coincidem.'); ok = false }
  if (!ok) return

  // TODO (tópico 2): supabase.auth.signUp(...)

  document.getElementById('step-1').style.display     = 'none'
  document.getElementById('stepper').style.display    = 'none'
  document.getElementById('reg-header').style.display = 'none'
  document.getElementById('success-screen').style.display = 'block'
}