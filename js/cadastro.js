// ============================================================
//  cadastro.js — cadastro do morador via Supabase
//  Fluxo: Condomínio → Dados pessoais → Apartamento → Senha
// ============================================================

const TODOS_APTOS  = []
const OCUPADOS_SET = new Set()

const estado = {
  stepAtual:       0,
  condominioId:    '',
  condominioNome:  '',
  aptoSelecionado: '',
  aptoId:          '',
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  aplicarMascaraCPF('cpf')
  aplicarMascaraTelefone('tel')
  iniciarBuscaCondo()
})

// ── Passo 0: Busca de condomínio ──────────────────────────────
function iniciarBuscaCondo() {
  const input = document.getElementById('busca-condo')
  const lista = document.getElementById('lista-condos')
  if (!input || !lista) return

  let timer = null
  input.addEventListener('input', () => {
    clearTimeout(timer)
    const q = input.value.trim()
    if (q.length < 2) {
      lista.innerHTML = ''
      lista.style.display = 'none'
      return
    }
    timer = setTimeout(() => buscarCondominios(q), 300)
  })

  document.addEventListener('click', e => {
    if (!e.target.closest('.condo-search-wrap')) {
      lista.style.display = 'none'
    }
  })
}

async function buscarCondominios(q) {
  const lista = document.getElementById('lista-condos')
  lista.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--n-400)">Buscando...</div>'
  lista.style.display = 'block'

  const { data, error } = await db
    .from('condominios')
    .select('id, nome, endereco, cidade, uf')
    .ilike('nome', `%${q}%`)
    .eq('status', 'ativo')
    .limit(6)

  if (error || !data?.length) {
    lista.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--n-400)">Nenhum condomínio encontrado.</div>'
    return
  }

  lista.innerHTML = data.map(c => `
    <div class="condo-option" onclick="selecionarCondo('${c.id}', '${c.nome.replace(/'/g, "\\'")}', '${c.cidade} — ${c.uf}')">
      <div style="font-size:13px;font-weight:600;color:var(--n-900)">${c.nome}</div>
      <div style="font-size:11px;color:var(--n-500);margin-top:2px">${c.endereco}, ${c.cidade} — ${c.uf}</div>
    </div>
  `).join('')
}

function selecionarCondo(id, nome, local) {
  estado.condominioId   = id
  estado.condominioNome = nome

  document.getElementById('busca-condo').value = nome
  document.getElementById('lista-condos').style.display = 'none'
  document.getElementById('condo-selecionado').style.display = 'flex'
  document.getElementById('condo-selecionado-nome').textContent = nome
  document.getElementById('condo-selecionado-local').textContent = local
  limparErro('condo-err')
}

function limparCondo() {
  estado.condominioId   = ''
  estado.condominioNome = ''
  document.getElementById('busca-condo').value = ''
  document.getElementById('condo-selecionado').style.display = 'none'
}

// ── Carrega apartamentos filtrados pelo condomínio ────────────
async function carregarApartamentos() {
  const grid = document.getElementById('apt-grid')
  if (!grid) return

  TODOS_APTOS.length = 0
  OCUPADOS_SET.clear()

  grid.innerHTML = '<div style="grid-column:span 5;text-align:center;font-size:12px;color:var(--n-400);padding:16px">Carregando apartamentos...</div>'

  const { data, error } = await db
    .from('apartamentos')
    .select('id, numero, bloco, status, condominio_id')
    .eq('condominio_id', estado.condominioId)
    .order('bloco').order('numero')

  if (error || !data?.length) {
    grid.innerHTML = '<div style="grid-column:span 5;text-align:center;font-size:12px;color:var(--c-danger);padding:16px">Erro ao carregar apartamentos.</div>'
    return
  }

  data.forEach(a => {
    TODOS_APTOS.push(a)
    if (a.status === 'ocupado') OCUPADOS_SET.add(a.id)
  })

  renderizarGradeAptos()
  iniciarBuscaApto()
}

function renderizarGradeAptos(filtro = '') {
  const grid = document.getElementById('apt-grid')
  if (!grid) return
  grid.innerHTML = ''

  const lista = filtro
    ? TODOS_APTOS.filter(a => `${a.bloco}-${a.numero}`.toLowerCase().includes(filtro.toLowerCase()))
    : TODOS_APTOS

  if (!lista.length) {
    grid.innerHTML = '<div style="grid-column:span 5;text-align:center;font-size:12px;color:var(--n-400);padding:16px">Nenhum apartamento encontrado.</div>'
    return
  }

  lista.forEach(a => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'apt-btn'
    btn.textContent = `${a.bloco}-${a.numero}`
    btn.title = `Bloco ${a.bloco} · Apto ${a.numero}`

    if (OCUPADOS_SET.has(a.id)) {
      btn.disabled = true
    } else {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.apt-btn').forEach(b => b.classList.remove('selected'))
        btn.classList.add('selected')
        estado.aptoSelecionado = `${a.bloco}-${a.numero}`
        estado.aptoId          = a.id
        limparErro('apto-err')
      })
    }
    grid.appendChild(btn)
  })
}

function iniciarBuscaApto() {
  const input = document.getElementById('busca-apto')
  if (!input) return
  input.addEventListener('input', () => {
    estado.aptoSelecionado = ''
    estado.aptoId          = ''
    renderizarGradeAptos(input.value.trim())
  })
}

// ── Stepper ───────────────────────────────────────────────────
function atualizarStepper(step) {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById('dot-' + i)
    const lbl = document.getElementById('lbl-' + i)
    if (!dot || !lbl) continue
    dot.className   = 'step-circle ' + (i < step ? 'done' : i === step ? 'active' : 'idle')
    dot.textContent = i < step ? '✓' : String(i + 1)
    lbl.className   = 'step-label' + (i === step ? ' active' : '')
  }
  for (let i = 0; i < 3; i++) {
    const line = document.getElementById('line-' + i)
    if (line) line.className = 'step-line' + (i < step ? ' done' : '')
  }
}

async function irPasso(destino) {
  if (destino > estado.stepAtual && !await validarPasso(estado.stepAtual)) return
  document.getElementById('step-' + estado.stepAtual).style.display = 'none'
  estado.stepAtual = destino
  document.getElementById('step-' + estado.stepAtual).style.display = 'block'
  atualizarStepper(estado.stepAtual)

  if (estado.stepAtual === 2) await carregarApartamentos()

  if (estado.stepAtual === 3) {
    const nome = document.getElementById('nome').value
    document.getElementById('summary-box').innerHTML =
      `<strong>${nome}</strong> · Apto ${estado.aptoSelecionado}<br>
       <span style="font-size:12px;color:var(--p-600)">${estado.condominioNome}</span>`
  }
}

// ── Validação ────────────────────────────────────────────────
async function validarPasso(step) {
  let valido = true
  if (step === 0) {
    limparErro('condo-err')
    if (!estado.condominioId) { mostrarErro('condo-err', 'Selecione seu condomínio.'); valido = false }
  }
  if (step === 1) {
    limparTodosErros('nome-err','cpf-err','tel-err','email-err')
    const nome  = document.getElementById('nome').value.trim()
    const cpf   = document.getElementById('cpf').value.trim()
    const tel   = document.getElementById('tel').value.trim()
    const email = document.getElementById('email').value.trim()
    if (!nome)                { mostrarErro('nome-err',  'Informe seu nome.'); valido = false }
    if (!isCPFValido(cpf))    { mostrarErro('cpf-err',   'CPF inválido.');     valido = false }
    if (!tel)                 { mostrarErro('tel-err',   'Informe o telefone.'); valido = false }
    if (!isEmailValido(email)){ mostrarErro('email-err', 'E-mail inválido.');   valido = false }
  }
  if (step === 2) {
    limparErro('apto-err')
    if (!estado.aptoSelecionado) { mostrarErro('apto-err', 'Selecione seu apartamento.'); valido = false }
  }
  return valido
}

// ── Finalizar cadastro ────────────────────────────────────────
async function finalizar() {
  limparTodosErros('senha-err','confirma-err')
  const senha    = document.getElementById('senha').value
  const confirma = document.getElementById('confirma').value

  if (senha.length < 6)   { mostrarErro('senha-err',    'Mínimo 6 caracteres.'); return }
  if (senha !== confirma) { mostrarErro('confirma-err', 'Senhas não coincidem.'); return }

  const nome  = document.getElementById('nome').value.trim()
  const cpf   = document.getElementById('cpf').value.trim()
  const tel   = document.getElementById('tel').value.trim()
  const email = document.getElementById('email').value.trim()

  setBtnCarregando('btn-finalizar', true)

  try {
    // 1. Cria no Supabase Auth
    const { data: authData, error: authError } = await db.auth.signUp({ email, password: senha })

    if (authError) {
      mostrarErro('senha-err', authError.message === 'User already registered'
        ? 'Este e-mail já está cadastrado.' : 'Erro ao criar conta: ' + authError.message)
      setBtnCarregando('btn-finalizar', false)
      return
    }

    const userId = authData.user?.id ?? authData.session?.user?.id
    if (!userId) {
      mostrarErro('senha-err', 'Confirme seu e-mail antes de continuar.')
      setBtnCarregando('btn-finalizar', false)
      return
    }

    // 2. Insere na tabela usuarios
    const { error: userError } = await db.from('usuarios').insert({
      auth_id:        userId,
      condominio_id:  estado.condominioId,
      apartamento_id: estado.aptoId,
      perfil:         'morador',
      nome,
      email,
      cpf:            cpf.replace(/\D/g, ''),
      telefone:       tel,
      status:         'ativo',
    })

    if (userError) {
      console.error('Erro ao salvar usuário:', userError)
      mostrarErro('senha-err', 'Erro ao salvar dados. Tente novamente.')
      setBtnCarregando('btn-finalizar', false)
      return
    }

    // 3. Marca apartamento como ocupado
    await db.from('apartamentos').update({ status: 'ocupado' }).eq('id', estado.aptoId)

    // 4. Sucesso
    document.getElementById('step-3').style.display     = 'none'
    document.getElementById('stepper').style.display    = 'none'
    document.getElementById('success-msg').innerHTML    =
      `Sua conta foi criada para o <strong>Apto ${estado.aptoSelecionado}</strong>, ${nome}.<br>
       Confirme seu e-mail se necessário e faça o login.`
    document.getElementById('success-screen').style.display = 'block'

  } catch (err) {
    console.error(err)
    mostrarErro('senha-err', 'Erro inesperado. Tente novamente.')
    setBtnCarregando('btn-finalizar', false)
  }
}

function alternarSenha(inputId, iconId) {
  toggleSenha(inputId, iconId)
}