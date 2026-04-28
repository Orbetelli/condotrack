// ============================================================
//  admin.js — painel do admin/síndico · CondoTrack
//  Integração real com Supabase
// ============================================================

const STATUS_CFG = {
  aguardando: { label: 'Aguardando', bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  notificado: { label: 'Notificado', bg: '#EDE9FE', color: '#5B21B6', dot: '#A78BFA' },
  retirado:   { label: 'Retirado',   bg: '#F0FDF4', color: '#166534', dot: '#34D399' },
  ativo:      { label: 'Ativo',      bg: '#F0FDF4', color: '#166534' },
  inativo:    { label: 'Inativo',    bg: '#F5F5F5', color: '#737373' },
  pendente:   { label: 'Pendente',   bg: '#FEF3C7', color: '#92400E' },
}

// ── Estado ───────────────────────────────────────────────────
let usuarioLogado = null
let tabAtiva      = 'dashboard'
let blocoAtivo    = 'A'
let modalAtivo    = null

// Cache local (evita re-fetches desnecessários)
let cachePorteiros  = []
let cacheMoradores  = []
let cacheEntregas   = []
let cacheApartamentos = []

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  usuarioLogado = await requireAuth(['admin'])
  if (!usuarioLogado) return

  // Header
  document.getElementById('header-condo').textContent   = usuarioLogado.condominios?.nome || '—'
  document.getElementById('header-sindico').textContent = `Painel do síndico · ${usuarioLogado.nome}`

  // Avatar sidebar
  const iniciais = usuarioLogado.nome.split(' ').map(n => n[0]).slice(0, 2).join('')
  const sbAvatar = document.getElementById('sb-avatar')
  if (sbAvatar) sbAvatar.textContent = iniciais

  await renderTab('dashboard')
  bindEvents()

  // Tempo real — entregas
  db.channel('admin-entregas')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, () => {
      cacheEntregas = []
      renderTab(tabAtiva)
    })
    .subscribe()
})

// ── Tabs ─────────────────────────────────────────────────────
function mudarTab(tab) {
  tabAtiva = tab
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'))
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active')

  const acoes = {
    dashboard:    null,
    porteiros:    { label: '+ Novo porteiro', fn: 'abrirModalPorteiro()' },
    moradores:    { label: '+ Novo morador',  fn: 'abrirModalMorador()' },
    apartamentos: null,
    relatorios:   null,
  }
  const btn  = document.getElementById('btn-acao')
  const acao = acoes[tab]
  if (acao) {
    btn.innerHTML = acao.label
    btn.setAttribute('onclick', acao.fn)
    btn.style.display = 'flex'
  } else {
    btn.style.display = 'none'
  }

  renderTab(tab) // fire-and-forget intencional — spinner já cobre o loading
}

async function renderTab(tab) {
  const body = document.getElementById('tab-body')
  body.innerHTML = '<div style="padding:40px;text-align:center"><div class="spinner" style="border-color:var(--p-200);border-top-color:var(--p-600);margin:0 auto"></div></div>'
  if (tab === 'dashboard')    await renderDashboard(body)
  if (tab === 'porteiros')    await renderPorteiros(body)
  if (tab === 'moradores')    await renderMoradores(body)
  if (tab === 'apartamentos') await renderApartamentos(body)
  if (tab === 'relatorios')   renderRelatorios(body)
}

// ── Helpers de fetch com cache ────────────────────────────────
async function getPorteiros() {
  if (cachePorteiros.length) return cachePorteiros
  const { data } = await db
    .from('usuarios')
    .select('id, nome, email, turno, periodo, status')
    .eq('condominio_id', usuarioLogado.condominio_id)
    .eq('perfil', 'porteiro')
    .order('nome')
  cachePorteiros = data || []
  return cachePorteiros
}

async function getMoradores() {
  if (cacheMoradores.length) return cacheMoradores
  const { data } = await db
    .from('usuarios')
    .select('id, nome, email, status, apartamentos(numero, bloco)')
    .eq('condominio_id', usuarioLogado.condominio_id)
    .eq('perfil', 'morador')
    .order('nome')
  cacheMoradores = (data || []).map(m => ({
    ...m,
    apto: m.apartamentos ? `${m.apartamentos.bloco}-${m.apartamentos.numero}` : '—',
  }))
  return cacheMoradores
}

async function getEntregas(limite = 5) {
  if (cacheEntregas.length) return cacheEntregas.slice(0, limite)
  const { data } = await db
    .from('entregas')
    .select('id, transportadora, status, recebido_em, apartamentos(numero, bloco)')
    .eq('condominio_id', usuarioLogado.condominio_id)
    .order('recebido_em', { ascending: false })
    .limit(20)
  cacheEntregas = (data || []).map(e => ({
    id:     e.id,
    apto:   e.apartamentos ? `${e.apartamentos.bloco}-${e.apartamentos.numero}` : '—',
    trans:  e.transportadora,
    hora:   new Date(e.recebido_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    status: e.status,
  }))
  return cacheEntregas.slice(0, limite)
}

async function getApartamentos() {
  if (cacheApartamentos.length) return cacheApartamentos
  const { data } = await db
    .from('apartamentos')
    .select('id, numero, bloco, status')
    .eq('condominio_id', usuarioLogado.condominio_id)
    .order('bloco').order('numero')
  cacheApartamentos = data || []
  return cacheApartamentos
}

// ── Dashboard ────────────────────────────────────────────────
async function renderDashboard(body) {
  const [porteiros, moradores, entregas] = await Promise.all([
    getPorteiros(), getMoradores(), getEntregas(4),
  ])

  const ativos  = porteiros.filter(p => p.status === 'ativo').length
  const mAtivos = moradores.filter(m => m.status === 'ativo').length
  const pendentes = cacheEntregas.filter(e => e.status === 'aguardando' || e.status === 'notificado').length
  const totalAptos = usuarioLogado.condominios?.total_aptos || '—'

  body.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-top">
          <div class="stat-num">${ativos}</div>
          <div class="stat-icon" style="background:#EDE9FE">
            <svg viewBox="0 0 24 24" stroke="#5B21B6" stroke-width="2" fill="none"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
          </div>
        </div>
        <div class="stat-label">Porteiros ativos</div>
        <span class="stat-badge" style="background:#EDE9FE;color:#5B21B6">Turno</span>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <div class="stat-num">${mAtivos}</div>
          <div class="stat-icon" style="background:#EFF6FF">
            <svg viewBox="0 0 24 24" stroke="#1D4ED8" stroke-width="2" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          </div>
        </div>
        <div class="stat-label">Moradores cadastrados</div>
        <span class="stat-badge" style="background:#EFF6FF;color:#1D4ED8">Ativos</span>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <div class="stat-num">${pendentes}</div>
          <div class="stat-icon" style="background:#FEF3C7">
            <svg viewBox="0 0 24 24" stroke="#92400E" stroke-width="2" fill="none"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
          </div>
        </div>
        <div class="stat-label">Entregas pendentes</div>
        <span class="stat-badge" style="background:#FEF3C7;color:#92400E">Hoje</span>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <div class="stat-num">${totalAptos}</div>
          <div class="stat-icon" style="background:#F0FDF4">
            <svg viewBox="0 0 24 24" stroke="#166534" stroke-width="2" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
        </div>
        <div class="stat-label">Apartamentos</div>
        <span class="stat-badge" style="background:#F0FDF4;color:#166534">Total</span>
      </div>
    </div>

    <div class="cards-grid">
      <div class="panel-card">
        <div class="panel-card-head">
          <div class="panel-card-title">
            <div class="panel-card-title-dot" style="background:#A78BFA"></div>
            Porteiros
          </div>
          <button class="panel-card-btn" onclick="mudarTab('porteiros')">Ver todos</button>
        </div>
        ${porteiros.slice(0, 4).map(p => porteirRowHTML(p)).join('') || '<div class="panel-empty">Nenhum porteiro cadastrado</div>'}
      </div>
      <div class="panel-card">
        <div class="panel-card-head">
          <div class="panel-card-title">
            <div class="panel-card-title-dot" style="background:#F59E0B"></div>
            Últimas entregas
          </div>
          <button class="panel-card-btn" onclick="window.location.href='porteiro.html'">Ver no porteiro</button>
        </div>
        ${entregas.map(e => entregaRowHTML(e)).join('') || '<div class="panel-empty">Nenhuma entrega recente</div>'}
      </div>
    </div>
  `
}

// ── Porteiros ────────────────────────────────────────────────
async function renderPorteiros(body) {
  const porteiros = await getPorteiros()
  body.innerHTML = `
    <div class="panel-card">
      <div class="panel-card-head">
        <div class="panel-card-title">
          <div class="panel-card-title-dot" style="background:#A78BFA"></div>
          Porteiros cadastrados
        </div>
        <button class="panel-card-btn" onclick="abrirModalPorteiro()">+ Novo porteiro</button>
      </div>
      ${porteiros.length === 0
        ? '<div class="panel-empty">Nenhum porteiro cadastrado ainda</div>'
        : porteiros.map(p => porteirRowHTML(p, true)).join('')}
    </div>
  `
}

function porteirRowHTML(p, comAcoes = false) {
  const cfg      = STATUS_CFG[p.status] || STATUS_CFG.inativo
  const initials = p.nome.split(' ').map(n => n[0]).slice(0, 2).join('')
  return `
    <div class="panel-row">
      <div class="panel-avatar">${initials}</div>
      <div class="panel-row-info">
        <div class="panel-row-name">${p.nome}</div>
        <div class="panel-row-sub">Turno ${p.turno || '—'} · ${p.periodo || '—'} · ${p.email || '—'}</div>
      </div>
      <span class="panel-row-badge" style="background:${cfg.bg};color:${cfg.color}">${cfg.label}</span>
      ${comAcoes ? `
        <button class="panel-row-btn" onclick="abrirModalPorteiro('${p.id}')" title="Editar">
          <svg viewBox="0 0 24 24" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>` : ''}
    </div>
  `
}

// ── Moradores ────────────────────────────────────────────────
async function renderMoradores(body) {
  const moradores = await getMoradores()
  body.innerHTML = `
    <div style="margin-bottom:12px">
      <input class="search-box" type="text" id="busca-morador"
             placeholder="Buscar por nome, apartamento ou e-mail..." />
    </div>
    <div class="panel-card" id="lista-moradores">
      ${moradorRows(moradores)}
    </div>
  `
  document.getElementById('busca-morador')?.addEventListener('input', function() {
    const q = this.value.toLowerCase()
    const filtrado = moradores.filter(m =>
      m.nome.toLowerCase().includes(q) ||
      m.apto.toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q))
    document.getElementById('lista-moradores').innerHTML = moradorRows(filtrado)
  })
}

function moradorRows(lista) {
  if (lista.length === 0) return '<div class="panel-empty">Nenhum morador encontrado</div>'
  return `
    <div class="panel-card-head">
      <div class="panel-card-title">
        <div class="panel-card-title-dot" style="background:#60A5FA"></div>
        Moradores
      </div>
      <span style="font-size:11px;color:var(--n-400)">${lista.length} cadastrados</span>
    </div>
    ${lista.map(m => {
      const cfg = STATUS_CFG[m.status] || STATUS_CFG.pendente
      const ini = m.nome.split(' ').map(n => n[0]).slice(0, 2).join('')
      return `
        <div class="panel-row">
          <div class="panel-avatar" style="background:#EFF6FF;color:#1D4ED8">${ini}</div>
          <div class="panel-row-info">
            <div class="panel-row-name">${m.nome}</div>
            <div class="panel-row-sub">Apto ${m.apto} · ${m.email || '—'}</div>
          </div>
          <span class="panel-row-badge" style="background:${cfg.bg};color:${cfg.color}">${cfg.label}</span>
          <button class="panel-row-btn" title="Ver detalhes">
            <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        </div>`
    }).join('')}
  `
}

// ── Apartamentos ──────────────────────────────────────────────
async function renderApartamentos(body) {
  const aptos = await getApartamentos()
  const blocos = [...new Set(aptos.map(a => a.bloco))].sort()
  if (!blocos.includes(blocoAtivo)) blocoAtivo = blocos[0] || 'A'

  body.innerHTML = `
    <div style="margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:var(--n-900);margin-bottom:10px">Apartamentos por bloco</div>
      <div class="apto-filter" id="bloco-filter">
        ${blocos.map(b =>
          `<button class="apto-filter-btn${b === blocoAtivo ? ' active' : ''}"
                   onclick="mudarBloco('${b}')">Bloco ${b}</button>`
        ).join('')}
      </div>
      <div style="display:flex;gap:14px;margin-bottom:14px">
        ${[
          ['background:var(--p-50);border-color:var(--p-200);color:var(--p-700)', 'Ocupado'],
          ['background:var(--n-50);color:var(--n-400)', 'Disponível'],
        ].map(([s, l]) =>
          `<div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--n-400)">
             <span style="width:12px;height:12px;border-radius:3px;border:1px solid;display:inline-block;${s}"></span>${l}
           </div>`
        ).join('')}
      </div>
    </div>
    <div class="apto-grid-admin" id="apto-grid"></div>
    <div style="font-size:11px;color:var(--n-400);margin-top:10px" id="apto-info"></div>
  `
  renderGradeAptos(aptos)
}

function mudarBloco(b) {
  blocoAtivo = b
  document.querySelectorAll('.apto-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent === 'Bloco ' + b)
  })
  renderGradeAptos(cacheApartamentos)
}

function renderGradeAptos(aptos) {
  const grid = document.getElementById('apto-grid')
  const info = document.getElementById('apto-info')
  if (!grid) return
  const lista = aptos.filter(a => a.bloco === blocoAtivo)
  grid.innerHTML = lista.map(a => {
    const oc = a.status === 'ocupado'
    return `<div class="apto-item ${oc ? 'ocupado' : 'disponivel'}" title="${oc ? 'Ocupado' : 'Disponível'}">${a.numero}</div>`
  }).join('')
  const ocQtd = lista.filter(a => a.status === 'ocupado').length
  if (info) info.textContent = `Bloco ${blocoAtivo}: ${ocQtd} ocupados · ${lista.length - ocQtd} disponíveis`
}

// ── Relatórios ────────────────────────────────────────────────
function renderRelatorios(body) {
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">
      ${[
        ['Relatório de entregas',  'Histórico completo de todas as entregas do condomínio', '#EDE9FE', '#5B21B6'],
        ['Relatório de moradores', 'Lista de moradores ativos, inativos e apartamentos',    '#EFF6FF', '#1D4ED8'],
        ['Relatório de porteiros', 'Turnos, atividades e registros por porteiro',           '#F0FDF4', '#166534'],
      ].map(([t, d, bg, c]) => `
        <div style="background:var(--n-0);border:1px solid var(--n-200);border-radius:var(--radius-lg);padding:20px;cursor:pointer"
             onmouseenter="this.style.boxShadow='0 4px 14px rgba(109,40,217,.1)'"
             onmouseleave="this.style.boxShadow='none'">
          <div style="width:36px;height:36px;border-radius:10px;background:${bg};display:flex;align-items:center;justify-content:center;margin-bottom:12px">
            <svg viewBox="0 0 24 24" stroke="${c}" stroke-width="2" fill="none" style="width:17px;height:17px">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
          </div>
          <div style="font-size:14px;font-weight:700;color:var(--n-900);margin-bottom:5px">${t}</div>
          <div style="font-size:12px;color:var(--n-500);line-height:1.5;margin-bottom:14px">${d}</div>
          <div style="font-size:12px;font-weight:600;color:${c};display:flex;align-items:center;gap:5px">
            Gerar relatório
            <svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke="${c}" style="width:13px;height:13px" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>
        </div>`
      ).join('')}
    </div>
  `
}

// ── Linha de entrega ──────────────────────────────────────────
function entregaRowHTML(e) {
  const cfg = STATUS_CFG[e.status] || STATUS_CFG.aguardando
  return `
    <div class="panel-row">
      <div class="panel-dot" style="background:${cfg.dot || '#ccc'}"></div>
      <div class="panel-row-info">
        <div class="panel-row-name">Apto ${e.apto}</div>
        <div class="panel-row-sub">${e.trans} · ${e.hora}</div>
      </div>
      <span class="panel-row-badge" style="background:${cfg.bg};color:${cfg.color}">${cfg.label}</span>
    </div>`
}

// ── Modal porteiro ────────────────────────────────────────────
function abrirModalPorteiro(id = null) {
  modalAtivo = 'porteiro'
  const editando = id ? cachePorteiros.find(p => p.id === id) : null
  document.getElementById('modal-port-title').textContent = editando ? 'Editar porteiro' : 'Novo porteiro'
  document.getElementById('p-nome').value    = editando?.nome    || ''
  document.getElementById('p-email').value   = editando?.email   || ''
  document.getElementById('p-senha').value   = ''
  document.getElementById('p-turno').value   = editando?.turno   || 'A'
  document.getElementById('p-periodo').value = editando?.periodo || 'Manhã'
  document.getElementById('credenciais-box').style.display = 'none'
  limparTodosErros('err-p-nome', 'err-p-email', 'err-p-senha')
  document.getElementById('modal-porteiro').classList.add('open')
  document.getElementById('modal-porteiro').dataset.editId = id || ''
}

async function salvarPorteiro(e) {
  e.preventDefault()
  limparTodosErros('err-p-nome', 'err-p-email', 'err-p-senha')
  const nome    = document.getElementById('p-nome').value.trim()
  const email   = document.getElementById('p-email').value.trim()
  const senha   = document.getElementById('p-senha').value
  const turno   = document.getElementById('p-turno').value
  const periodo = document.getElementById('p-periodo').value
  const editId  = document.getElementById('modal-porteiro').dataset.editId
  let ok = true

  if (!nome)                 { mostrarErro('err-p-nome',  'Informe o nome.'); ok = false }
  if (!isEmailValido(email)) { mostrarErro('err-p-email', 'Informe um e-mail válido.'); ok = false }
  if (!editId && senha.length < 6) { mostrarErro('err-p-senha', 'Mínimo 6 caracteres.'); ok = false }
  if (!ok) return

  const btn = e.submitter
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  if (editId) {
    const { error } = await db
      .from('usuarios')
      .update({ nome, email, turno, periodo })
      .eq('id', editId)
    if (error) {
      mostrarErro('err-p-nome', 'Erro ao salvar. Tente novamente.')
      if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar porteiro' }
      return
    }
    cachePorteiros = []
    fecharModal()
    renderTab(tabAtiva)
  } else {
    const { data: authData, error: authError } = await db.auth.signUp({
      email,
      password: senha,
    })

    if (authError) {
      mostrarErro('err-p-email', 'Erro ao criar conta: ' + authError.message)
      if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar porteiro' }
      return
    }

    const { error: dbError } = await db.from('usuarios').insert({
      auth_id:       authData.user?.id,
      condominio_id: usuarioLogado.condominio_id,
      perfil:        'porteiro',
      nome, email, turno, periodo,
      status:        'ativo',
    })

    if (dbError) {
      mostrarErro('err-p-nome', 'Erro ao salvar porteiro.')
      if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar porteiro' }
      return
    }

    // Mostra credenciais para copiar
    const saudacao = periodo === 'Manhã' ? 'bom dia' : periodo === 'Tarde' ? 'boa tarde' : 'boa noite'
    const template = `Olá, ${nome.split(' ')[0]}! 👋\n\nSeja bem-vindo ao CondoTrack. Aqui estão suas credenciais de acesso:\n\n🌐 Link: ${window.location.origin}/pages/login.html\n📧 E-mail: ${email}\n🔑 Senha: ${senha}\n🕐 Turno ${turno} · ${periodo}\n\nAo entrar, selecione o perfil "Porteiro".\n\n${saudacao.charAt(0).toUpperCase() + saudacao.slice(1)} e bom trabalho! 😊`

    document.getElementById('credenciais-texto').textContent = template
    document.getElementById('credenciais-box').style.display = 'block'
    if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar porteiro' }

    cachePorteiros = []
    renderTab(tabAtiva)
  }
}

function copiarCredenciais() {
  const texto = document.getElementById('credenciais-texto').textContent
  navigator.clipboard.writeText(texto).then(() => {
    const btnTexto = document.getElementById('btn-copiar-texto')
    btnTexto.textContent = '✓ Copiado!'
    setTimeout(() => { btnTexto.textContent = 'Copiar credenciais' }, 2000)
  })
}

// ── Modal morador (pré-cadastro) ──────────────────────────────
function abrirModalMorador() {
  modalAtivo = 'morador'
  document.getElementById('form-morador').reset()
  limparTodosErros('err-m-nome', 'err-m-email', 'err-m-apto')
  document.getElementById('modal-morador').classList.add('open')
}

async function salvarMorador(e) {
  e.preventDefault()
  limparTodosErros('err-m-nome', 'err-m-email', 'err-m-apto')
  const nome  = document.getElementById('m-nome').value.trim()
  const email = document.getElementById('m-email').value.trim()
  const apto  = document.getElementById('m-apto').value.trim().toUpperCase()
  const cpf   = document.getElementById('m-cpf')?.value.replace(/\D/g, '') || null
  let ok = true
  if (!nome)                 { mostrarErro('err-m-nome',  'Informe o nome.'); ok = false }
  if (!isEmailValido(email)) { mostrarErro('err-m-email', 'Informe um e-mail válido.'); ok = false }
  if (!apto)                 { mostrarErro('err-m-apto',  'Informe o apartamento.'); ok = false }
  if (!ok) return

  const btn = e.submitter
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  const partes = apto.split('-')
  const bloco  = partes[0]
  const numero = partes[1] || apto

  const { data: aptoData } = await db
    .from('apartamentos')
    .select('id, status')
    .eq('condominio_id', usuarioLogado.condominio_id)
    .eq('bloco', bloco)
    .eq('numero', numero)
    .single()

  if (!aptoData) {
    mostrarErro('err-m-apto', 'Apartamento não encontrado.')
    if (btn) { btn.disabled = false; btn.innerHTML = 'Pré-cadastrar' }
    return
  }
  if (aptoData.status === 'ocupado') {
    mostrarErro('err-m-apto', 'Apartamento já está ocupado.')
    if (btn) { btn.disabled = false; btn.innerHTML = 'Pré-cadastrar' }
    return
  }

  const { error } = await db.from('usuarios').insert({
    condominio_id:  usuarioLogado.condominio_id,
    apartamento_id: aptoData.id,
    perfil:         'morador',
    nome, email,
    cpf:            cpf || null,
    status:         'pendente',
  })

  if (error) {
    mostrarErro('err-m-nome', 'Erro ao pré-cadastrar. Tente novamente.')
    if (btn) { btn.disabled = false; btn.innerHTML = 'Pré-cadastrar' }
    return
  }

  cacheMoradores = []
  fecharModal()
  renderTab(tabAtiva)
}

// ── Fechar modais ─────────────────────────────────────────────
function fecharModal() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'))
  modalAtivo = null
}

// ── Sidebar ───────────────────────────────────────────────────
function ativarSidebar(item) {
  document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'))
  item.classList.add('active')
}

// ── Bind ──────────────────────────────────────────────────────
function bindEvents() {
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) fecharModal() })
  })
  document.getElementById('form-porteiro')?.addEventListener('submit', salvarPorteiro)
  document.getElementById('form-morador')?.addEventListener('submit', salvarMorador)
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal() })
}