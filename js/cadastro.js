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

  lista.innerHTML = ''
  data.forEach(c => {
    const div = document.createElement('div')
    div.className = 'condo-option'
    div.dataset.id    = c.id
    div.dataset.nome  = c.nome
    div.dataset.local = `${c.cidade} — ${c.uf}`

    const titulo = document.createElement('div')
    titulo.style.cssText = 'font-size:13px;font-weight:600;color:var(--n-900)'
    titulo.textContent = c.nome

    const sub = document.createElement('div')
    sub.style.cssText = 'font-size:11px;color:var(--n-500);margin-top:2px'
    sub.textContent = `${c.endereco}, ${c.cidade} — ${c.uf}`

    div.appendChild(titulo)
    div.appendChild(sub)
    div.addEventListener('click', () =>
      selecionarCondo(div.dataset.id, div.dataset.nome, div.dataset.local)
    )
    lista.appendChild(div)
  })
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

  // Ordena naturalmente (101 antes de 102, não alfabético)
  const sorted = [...TODOS_APTOS].sort((a, b) => {
    if (a.bloco !== b.bloco) return a.bloco.localeCompare(b.bloco)
    return a.numero.localeCompare(b.numero, undefined, { numeric: true })
  })

  const lista = filtro
    ? sorted.filter(a => formatarApto(a).toLowerCase().includes(filtro.toLowerCase()))
    : sorted

  if (!lista.length) {
    grid.innerHTML = '<div style="grid-column:span 5;text-align:center;font-size:12px;color:var(--n-400);padding:16px">Nenhum apartamento encontrado.</div>'
    return
  }

  lista.forEach(a => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'apt-btn'
    btn.textContent = formatarApto(a)
    btn.title = `Bloco ${a.bloco} · Apto ${a.numero}`

    if (OCUPADOS_SET.has(a.id)) {
      btn.disabled = true
    } else {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.apt-btn').forEach(b => b.classList.remove('selected'))
        btn.classList.add('selected')
        estado.aptoSelecionado = formatarApto(a)
        estado.aptoId          = a.id
        limparErro('apto-err')
      })
    }
    grid.appendChild(btn)
  })
}

// Formata o apto de forma consistente:
// Se o número já começa com a letra do bloco (ex: bloco "A", numero "A101") → mostra só numero
// Caso contrário → mostra "Bloco-Numero" (ex: "A-101")
function formatarApto(a) {
  if (a.numero.toUpperCase().startsWith(a.bloco.toUpperCase())) return a.numero
  return `${a.bloco}-${a.numero}`
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

  // Só recarrega apartamentos se chegou no passo 2 vindo de frente
  // ou se o condomínio mudou (TODOS_APTOS vazio ou condoId diferente)
  if (estado.stepAtual === 2) {
    const condoMudou = TODOS_APTOS.length === 0 ||
      TODOS_APTOS[0]?.condominio_id !== estado.condominioId
    if (condoMudou) await carregarApartamentos()
  }

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
      const msg = (
        authError.message?.toLowerCase().includes('already registered') ||
        authError.message?.toLowerCase().includes('already exists') ||
        authError.status === 422
      )
        ? 'Este e-mail já está cadastrado. Tente fazer login.'
        : 'Erro ao criar conta: ' + authError.message
      mostrarErro('senha-err', msg)
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
    document.getElementById('step-3').style.display      = 'none'
    document.getElementById('stepper').style.display     = 'none'
    document.getElementById('reg-header').style.display  = 'none'
    document.getElementById('success-msg').innerHTML     =
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