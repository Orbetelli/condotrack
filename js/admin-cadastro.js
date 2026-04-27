// ============================================================
<<<<<<< HEAD
//  admin-cadastro.js — lógica do cadastro de admin
//  Multi-condomínio · CondoTrack
// ============================================================

// ── Estado global do formulário ──────────────────────────────
const state = {
  step: 0,

  // Passo 1: dados pessoais
  nome:     '',
  cpf:      '',
  email:    '',
  telefone: '',

  // Passo 2: dados do condomínio
  nomeCondominio: '',
  cep:            '',
  endereco:       '',
  cidade:         '',
  uf:             '',
  blocos:         1,
  andares:        5,
  aptosPorAndar:  4,

  // Passo 3: apartamentos
  blocoAtivo:   'A',
  apartamentos: {},   // { 'A': ['A-101', ...], 'B': [...] }
  removidos:    {},   // { 'A-101': true, ... }

  // Passo 4: senha
  senha:    '',
  confirma: '',
}

const LETRAS_BLOCO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// ── Inicialização ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  aplicarMascaraCPF('cpf')
  aplicarMascaraTelefone('telefone')
  aplicarMascaraCEP()
  renderStep(0)
})

// ── Stepper ───────────────────────────────────────────────────
function renderStep(step) {
  for (let i = 0; i < 4; i++) {
    const dot  = document.getElementById('dot-' + i)
    const lbl  = document.getElementById('lbl-' + i)
    if (!dot || !lbl) continue
    dot.className = 'step-circle ' +
      (i < step ? 'done' : i === step ? 'active' : 'idle')
    dot.textContent = i < step ? '✓' : String(i + 1)
    lbl.className = 'step-label' + (i === step ? ' active' : '')
  }
  for (let i = 0; i < 3; i++) {
    const line = document.getElementById('line-' + i)
    if (line) line.className = 'step-line' + (i < step ? ' done' : '')
  }

  // Mostra/oculta steps
  for (let i = 0; i < 4; i++) {
=======
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
>>>>>>> 68b0e0d (atualização)
    const el = document.getElementById('step-' + i)
    if (el) el.style.display = i === step ? 'block' : 'none'
  }

<<<<<<< HEAD
  state.step = step
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ── Navegação ─────────────────────────────────────────────────
function avancar() {
  if (!validar(state.step)) return
  if (state.step === 1) gerarApartamentos()
  renderStep(state.step + 1)
}

function voltar() {
  if (state.step > 0) renderStep(state.step - 1)
}

// ── Validação por passo ───────────────────────────────────────
function validar(step) {
  let ok = true

  if (step === 0) {
    limparTodosErros('err-nome','err-cpf','err-tel','err-email')
    const nome  = v('nome')
    const cpf   = v('cpf')
    const tel   = v('telefone')
    const email = v('email')
    if (!nome.trim())        { mostrarErro('err-nome',  'Informe seu nome completo.'); ok = false }
    if (!isCPFValido(cpf))   { mostrarErro('err-cpf',   'Informe um CPF válido.');     ok = false }
    if (!tel.trim())         { mostrarErro('err-tel',   'Informe seu telefone.');       ok = false }
    if (!isEmailValido(email)){ mostrarErro('err-email','Informe um e-mail válido.');  ok = false }
    if (ok) {
      state.nome = nome; state.cpf = cpf
      state.telefone = tel; state.email = email
    }
  }

  if (step === 1) {
    limparTodosErros('err-condo','err-cep','err-end','err-cidade')
    const nc  = v('nome-condo')
    const cep = v('cep')
    const end = v('endereco')
    const cid = v('cidade')
    const uf  = v('uf')
    const bl  = parseInt(v('blocos'))  || 0
    const an  = parseInt(v('andares')) || 0
    const ap  = parseInt(v('aptos-por-andar')) || 0
    if (!nc.trim()) { mostrarErro('err-condo',  'Informe o nome do condomínio.'); ok = false }
    if (!cep.trim()){ mostrarErro('err-cep',    'Informe o CEP.'); ok = false }
    if (!end.trim()){ mostrarErro('err-end',    'Informe o endereço.'); ok = false }
    if (!cid.trim()){ mostrarErro('err-cidade', 'Informe a cidade.'); ok = false }
    if (bl < 1 || bl > 26){ mostrarErro('err-condo', 'Blocos: entre 1 e 26.'); ok = false }
    if (ok) {
      state.nomeCondominio = nc; state.cep = cep
      state.endereco = end; state.cidade = cid; state.uf = uf
      state.blocos = bl; state.andares = an; state.aptosPorAndar = ap
    }
  }

  if (step === 3) {
    limparTodosErros('err-senha','err-confirma')
    const s = v('senha'); const c = v('confirma')
    if (s.length < 6) { mostrarErro('err-senha',    'Mínimo 6 caracteres.'); ok = false }
    if (s !== c)      { mostrarErro('err-confirma', 'As senhas não coincidem.'); ok = false }
    if (ok) { state.senha = s; state.confirma = c }
  }

  return ok
}

// ── Gera apartamentos ─────────────────────────────────────────
function gerarApartamentos() {
  state.apartamentos = {}
  state.removidos    = {}

  for (let b = 0; b < state.blocos; b++) {
    const letra = LETRAS_BLOCO[b]
    state.apartamentos[letra] = []
    for (let a = 1; a <= state.andares; a++) {
      for (let u = 1; u <= state.aptosPorAndar; u++) {
        const num = String(a).padStart(2,'0') + String(u).padStart(2,'0')
        state.apartamentos[letra].push(letra + '-' + num)
      }
    }
  }

  state.blocoAtivo = LETRAS_BLOCO[0]
  renderGrade()
  renderBlocoTags()
  renderInfoBox()
}

// ── Renderiza a grade de aptos ────────────────────────────────
function renderGrade() {
  const grid  = document.getElementById('apt-grid')
  const info  = document.getElementById('apt-info')
  if (!grid) return

  const aptos = state.apartamentos[state.blocoAtivo] || []
  grid.innerHTML = ''

  aptos.forEach(apto => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'apt-btn' + (state.removidos[apto] ? ' removed' : ' active')
    btn.textContent = apto.split('-')[1]
    btn.title = apto
    btn.addEventListener('click', () => toggleApto(apto, btn))
    grid.appendChild(btn)
  })

  const total   = totalAtivos()
  const blTotal = aptos.filter(a => !state.removidos[a]).length
  if (info) info.textContent =
    `Bloco ${state.blocoAtivo}: ${blTotal} de ${aptos.length} aptos · Total geral: ${total} apartamentos`
}

function toggleApto(apto, btn) {
  if (state.removidos[apto]) {
    delete state.removidos[apto]
    btn.className = 'apt-btn active'
  } else {
    state.removidos[apto] = true
    btn.className = 'apt-btn removed'
  }
  renderInfoBox()
  const info = document.getElementById('apt-info')
  const aptos = state.apartamentos[state.blocoAtivo] || []
  const blTotal = aptos.filter(a => !state.removidos[a]).length
  if (info) info.textContent =
    `Bloco ${state.blocoAtivo}: ${blTotal} de ${aptos.length} aptos · Total geral: ${totalAtivos()} apartamentos`
}

function totalAtivos() {
  let n = 0
  Object.values(state.apartamentos).forEach(lista => {
    lista.forEach(a => { if (!state.removidos[a]) n++ })
  })
  return n
}

// ── Bloco tags ────────────────────────────────────────────────
function renderBlocoTags() {
  const wrap = document.getElementById('bloco-tags')
  if (!wrap) return
  wrap.innerHTML = ''
  Object.keys(state.apartamentos).forEach(letra => {
    const tag = document.createElement('button')
    tag.type = 'button'
    tag.className = 'bloco-tag' + (letra === state.blocoAtivo ? ' active' : '')
    tag.textContent = 'Bloco ' + letra
    tag.addEventListener('click', () => {
      state.blocoAtivo = letra
      document.querySelectorAll('.bloco-tag').forEach(t => t.classList.remove('active'))
      tag.classList.add('active')
      renderGrade()
    })
    wrap.appendChild(tag)
  })
}

// ── Info box ──────────────────────────────────────────────────
function renderInfoBox() {
  const box = document.getElementById('info-box')
  if (!box) return
  const total  = totalAtivos()
  const blocos = state.blocos
  const andares = state.andares
  const apPorAndar = state.aptosPorAndar
  box.innerHTML = `Com <strong>${blocos} bloco${blocos > 1 ? 's' : ''}</strong>, 
    <strong>${andares} andares</strong> e <strong>${apPorAndar} aptos por andar</strong> 
    foram gerados <strong>${total} apartamentos</strong>. 
    Clique em qualquer apartamento para removê-lo da lista.`
}

// ── Finalizar ─────────────────────────────────────────────────
function finalizar() {
  if (!validar(3)) return

  // TODO (tópico 2): salvar no Supabase
  // await supabase.from('condominios').insert({ nome, endereco, ... })
  // await supabase.auth.signUp({ email, password, options: { data: { perfil: 'admin' } } })

  // Preenche tela de sucesso
  document.getElementById('suc-condo').textContent  = state.nomeCondominio
  document.getElementById('suc-blocos').textContent = state.blocos
  document.getElementById('suc-aptos').textContent  = totalAtivos()
  document.getElementById('suc-end').textContent    =
    `${state.endereco}, ${state.cidade} — ${state.uf}`

  // Esconde step 3, mostra sucesso
  document.getElementById('step-3').style.display   = 'none'
  document.getElementById('stepper').style.display  = 'none'
  document.getElementById('reg-header').style.display = 'none'
  document.getElementById('success-screen').style.display = 'block'
}

// ── Máscara CEP ───────────────────────────────────────────────
function aplicarMascaraCEP() {
  const input = document.getElementById('cep')
  if (!input) return
  input.addEventListener('input', function () {
    let v = this.value.replace(/\D/g, '').slice(0, 8)
    if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5)
    this.value = v
  })

  // Busca endereço pelo CEP ao sair do campo
  input.addEventListener('blur', async function () {
    const cep = this.value.replace(/\D/g, '')
    if (cep.length !== 8) return
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const data = await res.json()
      if (!data.erro) {
        const end = document.getElementById('endereco')
        const cid = document.getElementById('cidade')
        const uf  = document.getElementById('uf')
        if (end && !end.value) end.value = data.logradouro || ''
        if (cid) cid.value = data.localidade || ''
        if (uf)  uf.value  = data.uf || ''
      }
    } catch (_) {}
  })
}

// ── Preview dinâmico de apartamentos ────────────────────────
function atualizarPreview() {
  const bl = parseInt(document.getElementById('blocos')?.value) || 0
  const an = parseInt(document.getElementById('andares')?.value) || 0
  const ap = parseInt(document.getElementById('aptos-por-andar')?.value) || 0
  const total = bl * an * ap
  const prev  = document.getElementById('preview-total')
  if (prev) prev.textContent =
    total > 0 ? `Serão gerados ${total} apartamentos automaticamente` : ''
}

// ── Helpers ───────────────────────────────────────────────────
function v(id) {
  return (document.getElementById(id)?.value || '').trim()
}
=======
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

  document.getElementById('step-1').style.display    = 'none'
  document.getElementById('stepper').style.display   = 'none'
  document.getElementById('reg-header').style.display = 'none'
  document.getElementById('success-screen').style.display = 'block'
}
>>>>>>> 68b0e0d (atualização)
