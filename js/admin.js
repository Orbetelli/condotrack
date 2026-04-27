// ============================================================
//  admin.js — painel do admin/síndico · CondoTrack
// ============================================================

// ── Dados simulados (Supabase no tópico 2) ──────────────────
const CONDO = {
  nome:    'Res. das Palmeiras',
  sindico: 'João Silva',
  blocos:  ['A','B'],
  aptos:   80,
}

const PORTEIROS = [
  { id:'p1', nome:'Carlos Porteiro', turno:'A', periodo:'Manhã',  email:'carlos@condo.com', status:'ativo'   },
  { id:'p2', nome:'Marcos Rocha',    turno:'B', periodo:'Tarde',  email:'marcos@condo.com', status:'ativo'   },
  { id:'p3', nome:'João Noite',      turno:'C', periodo:'Noite',  email:'joao@condo.com',   status:'inativo' },
]

const MORADORES = [
  { id:'m1', nome:'Maria Costa',   apto:'204-B', email:'maria@email.com',  status:'ativo'   },
  { id:'m2', nome:'João Silva',    apto:'101-A', email:'joao@email.com',   status:'ativo'   },
  { id:'m3', nome:'Pedro Rocha',   apto:'308-C', email:'pedro@email.com',  status:'ativo'   },
  { id:'m4', nome:'Ana Ferreira',  apto:'512-A', email:'ana@email.com',    status:'ativo'   },
  { id:'m5', nome:'Lucas Mendes',  apto:'103-B', email:'lucas@email.com',  status:'pendente'},
]

const ENTREGAS_RECENTES = [
  { apto:'101-A', morador:'João Silva',   trans:'Correios',      hora:'09:12', status:'aguardando' },
  { apto:'204-B', morador:'Maria Costa',  trans:'Mercado Livre', hora:'10:45', status:'notificado' },
  { apto:'308-C', morador:'Pedro Rocha',  trans:'Amazon',        hora:'11:22', status:'retirado'   },
  { apto:'512-A', morador:'Ana Ferreira', trans:'Shein',         hora:'13:10', status:'aguardando' },
]

const APARTAMENTOS = (() => {
  const aptos = {}
  CONDO.blocos.forEach(b => {
    aptos[b] = []
    for (let a = 1; a <= 5; a++) {
      for (let u = 1; u <= 4; u++) {
        aptos[b].push(`${b}-${a}0${u}`)
      }
    }
  })
  return aptos
})()

const STATUS_CFG = {
  aguardando: { label:'Aguardando', bg:'#FEF3C7', color:'#92400E', dot:'#F59E0B' },
  notificado: { label:'Notificado', bg:'#EDE9FE', color:'#5B21B6', dot:'#A78BFA' },
  retirado:   { label:'Retirado',   bg:'#F0FDF4', color:'#166534', dot:'#34D399' },
  ativo:      { label:'Ativo',      bg:'#F0FDF4', color:'#166534' },
  inativo:    { label:'Inativo',    bg:'#F5F5F5', color:'#737373' },
  pendente:   { label:'Pendente',   bg:'#FEF3C7', color:'#92400E' },
}

// ── Estado ───────────────────────────────────────────────────
let tabAtiva      = 'dashboard'
let blocoAtivo    = 'A'
let modalAtivo    = null

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('header-condo').textContent  = CONDO.nome
  document.getElementById('header-sindico').textContent = `Painel do síndico · ${CONDO.sindico}`
  renderTab('dashboard')
  bindEvents()
})

// ── Tabs ─────────────────────────────────────────────────────
function mudarTab(tab) {
  tabAtiva = tab
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'))
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active')

  // Atualiza botão de ação no header
  const acoes = {
    dashboard:    null,
    porteiros:    { label:'+ Novo porteiro',  fn:'abrirModalPorteiro()' },
    moradores:    { label:'+ Novo morador',   fn:'abrirModalMorador()' },
    apartamentos: null,
    relatorios:   null,
  }
  const btn = document.getElementById('btn-acao')
  const acao = acoes[tab]
  if (acao) {
    btn.textContent = acao.label
    btn.setAttribute('onclick', acao.fn)
    btn.style.display = 'flex'
  } else {
    btn.style.display = 'none'
  }

  renderTab(tab)
}

function renderTab(tab) {
  const body = document.getElementById('tab-body')
  if (tab === 'dashboard')    renderDashboard(body)
  if (tab === 'porteiros')    renderPorteiros(body)
  if (tab === 'moradores')    renderMoradores(body)
  if (tab === 'apartamentos') renderApartamentos(body)
  if (tab === 'relatorios')   renderRelatorios(body)
}

// ── Dashboard ────────────────────────────────────────────────
function renderDashboard(body) {
  const ativos   = PORTEIROS.filter(p => p.status === 'ativo').length
  const mAtivos  = MORADORES.filter(m => m.status === 'ativo').length
  const entHoje  = ENTREGAS_RECENTES.filter(e => e.status !== 'retirado').length

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
          <div class="stat-num">${entHoje}</div>
          <div class="stat-icon" style="background:#FEF3C7">
            <svg viewBox="0 0 24 24" stroke="#92400E" stroke-width="2" fill="none"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
          </div>
        </div>
        <div class="stat-label">Entregas pendentes</div>
        <span class="stat-badge" style="background:#FEF3C7;color:#92400E">Hoje</span>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <div class="stat-num">${CONDO.aptos}</div>
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
        ${PORTEIROS.map(p => porteirRowHTML(p)).join('')}
      </div>
      <div class="panel-card">
        <div class="panel-card-head">
          <div class="panel-card-title">
            <div class="panel-card-title-dot" style="background:#F59E0B"></div>
            Últimas entregas
          </div>
          <button class="panel-card-btn" onclick="window.location.href='porteiro.html'">Ver no porteiro</button>
        </div>
        ${ENTREGAS_RECENTES.map(e => entregaRowHTML(e)).join('')}
      </div>
    </div>
  `
}

// ── Porteiros ────────────────────────────────────────────────
function renderPorteiros(body) {
  body.innerHTML = `
    <div class="panel-card">
      <div class="panel-card-head">
        <div class="panel-card-title">
          <div class="panel-card-title-dot" style="background:#A78BFA"></div>
          Porteiros cadastrados
        </div>
        <button class="panel-card-btn" onclick="abrirModalPorteiro()">+ Novo porteiro</button>
      </div>
      ${PORTEIROS.length === 0
        ? '<div class="panel-empty">Nenhum porteiro cadastrado ainda</div>'
        : PORTEIROS.map(p => porteirRowHTML(p, true)).join('')}
    </div>
  `
}

function porteirRowHTML(p, comAcoes = false) {
  const cfg = STATUS_CFG[p.status]
  const initials = p.nome.split(' ').map(n => n[0]).slice(0,2).join('')
  return `
    <div class="panel-row">
      <div class="panel-avatar">${initials}</div>
      <div class="panel-row-info">
        <div class="panel-row-name">${p.nome}</div>
        <div class="panel-row-sub">Turno ${p.turno} · ${p.periodo} · ${p.email}</div>
      </div>
      <span class="panel-row-badge" style="background:${cfg.bg};color:${cfg.color}">${cfg.label}</span>
      ${comAcoes ? `
        <button class="panel-row-btn" onclick="editarPorteiro('${p.id}')" title="Editar">
          <svg viewBox="0 0 24 24" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>` : ''}
    </div>
  `
}

// ── Moradores ────────────────────────────────────────────────
function renderMoradores(body) {
  body.innerHTML = `
    <div style="margin-bottom:12px">
      <input class="search-box" type="text" id="busca-morador"
             placeholder="Buscar por nome, apartamento ou e-mail..." />
    </div>
    <div class="panel-card" id="lista-moradores">
      ${moradorRows(MORADORES)}
    </div>
  `
  document.getElementById('busca-morador')?.addEventListener('input', function() {
    const q = this.value.toLowerCase()
    const filtrado = MORADORES.filter(m =>
      m.nome.toLowerCase().includes(q) ||
      m.apto.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q))
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
      const cfg = STATUS_CFG[m.status]
      const ini = m.nome.split(' ').map(n=>n[0]).slice(0,2).join('')
      return `
        <div class="panel-row">
          <div class="panel-avatar" style="background:#EFF6FF;color:#1D4ED8">${ini}</div>
          <div class="panel-row-info">
            <div class="panel-row-name">${m.nome}</div>
            <div class="panel-row-sub">Apto ${m.apto} · ${m.email}</div>
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
function renderApartamentos(body) {
  const ocupados = new Set(MORADORES.map(m => m.apto))
  body.innerHTML = `
    <div style="margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:var(--n-900);margin-bottom:10px">Apartamentos por bloco</div>
      <div class="apto-filter" id="bloco-filter">
        ${CONDO.blocos.map(b =>
          `<button class="apto-filter-btn${b === blocoAtivo ? ' active' : ''}"
                   onclick="mudarBloco('${b}')">${'Bloco ' + b}</button>`
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
  renderGradeAptos(ocupados)
}

function mudarBloco(b) {
  blocoAtivo = b
  document.querySelectorAll('.apto-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent === 'Bloco ' + b)
  })
  const ocupados = new Set(MORADORES.map(m => m.apto))
  renderGradeAptos(ocupados)
}

function renderGradeAptos(ocupados) {
  const grid = document.getElementById('apto-grid')
  const info = document.getElementById('apto-info')
  if (!grid) return
  const lista = APARTAMENTOS[blocoAtivo] || []
  grid.innerHTML = lista.map(a => {
    const oc = ocupados.has(a)
    return `<div class="apto-item ${oc ? 'ocupado' : 'disponivel'}" title="${oc ? 'Ocupado' : 'Disponível'}">${a.split('-')[1]}</div>`
  }).join('')
  const ocQtd = lista.filter(a => ocupados.has(a)).length
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
        <div style="background:var(--n-0);border:1px solid var(--n-200);border-radius:var(--radius-lg);padding:20px;cursor:pointer;transition:box-shadow .15s"
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
    <div style="background:var(--p-50);border:1.5px solid var(--p-200);border-radius:var(--radius-md);padding:14px 16px;margin-top:16px;font-size:13px;color:var(--p-700)">
      Os relatórios completos estarão disponíveis após a integração com o banco de dados (tópico 2).
    </div>
  `
}

// ── Linha de entrega ──────────────────────────────────────────
function entregaRowHTML(e) {
  const cfg = STATUS_CFG[e.status]
  return `
    <div class="panel-row">
      <div class="panel-dot" style="background:${cfg.dot}"></div>
      <div class="panel-row-info">
        <div class="panel-row-name">Apto ${e.apto} · ${e.morador}</div>
        <div class="panel-row-sub">${e.trans} · ${e.hora}</div>
      </div>
      <span class="panel-row-badge" style="background:${cfg.bg};color:${cfg.color}">${cfg.label}</span>
    </div>`
}

// ── Modal porteiro ────────────────────────────────────────────
function abrirModalPorteiro(id = null) {
  modalAtivo = 'porteiro'
  const editando = id ? PORTEIROS.find(p => p.id === id) : null
  document.getElementById('modal-port-title').textContent = editando ? 'Editar porteiro' : 'Novo porteiro'
  document.getElementById('p-nome').value    = editando?.nome    || ''
  document.getElementById('p-email').value   = editando?.email   || ''
  document.getElementById('p-turno').value   = editando?.turno   || 'A'
  document.getElementById('p-periodo').value = editando?.periodo || 'Manhã'
  limparTodosErros('err-p-nome','err-p-email')
  document.getElementById('modal-porteiro').classList.add('open')
  document.getElementById('modal-porteiro').dataset.editId = id || ''
}

function editarPorteiro(id) { abrirModalPorteiro(id) }

function salvarPorteiro(e) {
  e.preventDefault()
  limparTodosErros('err-p-nome','err-p-email')
  const nome   = document.getElementById('p-nome').value.trim()
  const email  = document.getElementById('p-email').value.trim()
  const turno  = document.getElementById('p-turno').value
  const periodo = document.getElementById('p-periodo').value
  let ok = true
  if (!nome)             { mostrarErro('err-p-nome',  'Informe o nome.'); ok = false }
  if (!isEmailValido(email)) { mostrarErro('err-p-email', 'Informe um e-mail válido.'); ok = false }
  if (!ok) return

  const editId = document.getElementById('modal-porteiro').dataset.editId
  if (editId) {
    const p = PORTEIROS.find(x => x.id === editId)
    if (p) { p.nome = nome; p.email = email; p.turno = turno; p.periodo = periodo }
  } else {
    PORTEIROS.push({ id: 'p'+Date.now(), nome, email, turno, periodo, status:'ativo' })
  }
  fecharModal()
  renderTab(tabAtiva)
}

// ── Modal morador ─────────────────────────────────────────────
function abrirModalMorador() {
  modalAtivo = 'morador'
  document.getElementById('form-morador').reset()
  limparTodosErros('err-m-nome','err-m-email','err-m-apto')
  document.getElementById('modal-morador').classList.add('open')
}

function salvarMorador(e) {
  e.preventDefault()
  limparTodosErros('err-m-nome','err-m-email','err-m-apto')
  const nome  = document.getElementById('m-nome').value.trim()
  const email = document.getElementById('m-email').value.trim()
  const apto  = document.getElementById('m-apto').value.trim()
  let ok = true
  if (!nome)             { mostrarErro('err-m-nome',  'Informe o nome.'); ok = false }
  if (!isEmailValido(email)) { mostrarErro('err-m-email', 'Informe um e-mail válido.'); ok = false }
  if (!apto)             { mostrarErro('err-m-apto',  'Informe o apartamento.'); ok = false }
  if (!ok) return
  MORADORES.push({ id:'m'+Date.now(), nome, email, apto, status:'pendente' })
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
