// ============================================================
//  admin.js — painel do admin/síndico · CondoTrack
//  Integração real com Supabase
// ============================================================

const STATUS_CFG = {
  aguardando:        { label: 'Aguardando',  bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  notificado:        { label: 'Notificado',  bg: '#EDE9FE', color: '#5B21B6', dot: '#A78BFA' },
  retirado:          { label: 'Retirado',    bg: '#F0FDF4', color: '#166534', dot: '#34D399' },
  ativo:             { label: 'Ativo',       bg: '#F0FDF4', color: '#166534' },
  inativo:           { label: 'Inativo',     bg: '#F5F5F5', color: '#737373' },
  pendente:          { label: 'Pendente',    bg: '#FEF3C7', color: '#92400E' },
  sem_email:         { label: 'Sem e-mail',  bg: '#FFF7ED', color: '#C2410C' },
  entregue_porteiro: { label: 'A confirmar', bg: '#ECFDF5', color: '#065F46', dot: '#10B981' },
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
  usuarioLogado = await requireAuth(['admin', 'superadmin'])
  if (!usuarioLogado) return

  // Verifica impersonação do superadmin
  const impersonateCondoId   = sessionStorage.getItem('sa_impersonate_condo_id')
  const impersonateCondoNome = sessionStorage.getItem('sa_impersonate_condo_nome')

  if (usuarioLogado.perfil === 'superadmin' && impersonateCondoId) {
    // Sobrescreve condominio_id e nome para o condomínio selecionado
    usuarioLogado.condominio_id = impersonateCondoId
    usuarioLogado.condominios   = { nome: impersonateCondoNome }

    // Busca dados completos do condomínio
    const { data: condoData } = await db
      .from('condominios')
      .select('*')
      .eq('id', impersonateCondoId)
      .single()
    if (condoData) usuarioLogado.condominios = condoData

    // Mostra banner de impersonação
    const banner = document.createElement('div')
    banner.id = 'banner-impersonacao'
    banner.style.cssText = `
      position:fixed;top:0;left:0;right:0;z-index:9999;
      background:#7C3AED;color:#fff;padding:8px 16px;
      display:flex;align-items:center;justify-content:space-between;
      font-size:12px;font-weight:600;
    `
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke="#fff" style="width:14px;height:14px">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        Visualizando como Super Admin — ${impersonateCondoNome}
      </div>
      <button onclick="voltarSuperAdmin()" style="background:rgba(255,255,255,.2);border:none;
              color:#fff;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:700;
              cursor:pointer;font-family:var(--font-sans)">
        ← Voltar ao Super Admin
      </button>
    `
    document.body.prepend(banner)
    // Ajusta o layout para não sobrepor o header
    document.querySelector('.shell').style.marginTop = '36px'
  } else if (usuarioLogado.perfil === 'superadmin' && !impersonateCondoId) {
    // Superadmin sem impersonação — volta para o painel
    window.location.href = 'superadmin.html'
    return
  }

  // Header
  document.getElementById('header-condo').textContent   = usuarioLogado.condominios?.nome || '—'
  document.getElementById('header-sindico').textContent = `Painel do síndico · ${usuarioLogado.nome}`

  // Avatar sidebar
  const iniciais = usuarioLogado.nome.split(' ').map(n => n[0]).slice(0, 2).join('')
  const sbAvatar = document.getElementById('sb-avatar')
  if (sbAvatar) sbAvatar.textContent = iniciais

  await renderTab('dashboard')
  bindEvents()
  verificarAlertas()

  // Tempo real — entregas, moradores e porteiros
  db.channel('admin-entregas')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, () => {
      cacheEntregas = []
      renderTab(tabAtiva)
    })
    .subscribe()

  db.channel('admin-usuarios')
    .on('postgres_changes', {
      event:  '*',
      schema: 'public',
      table:  'usuarios',
      filter: `condominio_id=eq.${usuarioLogado.condominio_id}`,
    }, () => {
      cacheMoradores  = []
      cachePorteiros  = []
      renderTab(tabAtiva)
    })
    .subscribe()
})

// ── Tabs ─────────────────────────────────────────────────────
function mudarTab(tab) {
  tabAtiva = tab
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'))
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active')

  // Sincroniza sidebar
  const tipMap = {
    dashboard:    'Dashboard',
    porteiros:    'Porteiros',
    moradores:    'Moradores',
    apartamentos: 'Apartamentos',
    relatorios:   'Relatórios',
    configuracoes:'Configurações',
  }
  document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'))
  const sbTip = tipMap[tab]
  if (sbTip) document.querySelector(`.sb-item[data-tip="${sbTip}"]`)?.classList.add('active')

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
  if (tab === 'dashboard')      await renderDashboard(body)
  if (tab === 'porteiros')      await renderPorteiros(body)
  if (tab === 'moradores')      await renderMoradores(body)
  if (tab === 'apartamentos')   await renderApartamentos(body)
  if (tab === 'entregas')       await renderEntregas(body)
  if (tab === 'relatorios')     renderRelatorios(body)
  if (tab === 'configuracoes')  renderConfiguracoes(body)
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
    .select('id, nome, email, status, apartamento_id, apartamentos(numero, bloco)')
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

  const bindMoradores = (container) => {
    container.querySelectorAll('[data-acao-detalhe]').forEach(btn =>
      btn.addEventListener('click', () => abrirDetalhesMorador(btn.dataset.acaoDetalhe))
    )
    container.querySelectorAll('[data-acao-email]').forEach(btn =>
      btn.addEventListener('click', () =>
        abrirAdicionarEmail(btn.dataset.acaoEmail, btn.dataset.nome)
      )
    )
  }

  const listaEl = document.getElementById('lista-moradores')
  bindMoradores(listaEl)

  document.getElementById('busca-morador')?.addEventListener('input', function() {
    const q = this.value.toLowerCase()
    const filtrado = moradores.filter(m =>
      m.nome.toLowerCase().includes(q) ||
      m.apto.toLowerCase().includes(q) ||
      (m.email || '').toLowerCase().includes(q))
    listaEl.innerHTML = moradorRows(filtrado)
    bindMoradores(listaEl)
  })
}

function moradorRows(lista) {
  if (lista.length === 0) return '<div class="panel-empty">Nenhum morador encontrado</div>'
  const rows = lista.map(m => {
    const cfg = STATUS_CFG[m.status] || STATUS_CFG.pendente
    const ini = m.nome.split(' ').map(n => n[0]).slice(0, 2).join('')
    const semEmail = m.status === 'sem_email' || !m.email

    return `
      <div class="panel-row" id="row-morador-${m.id}">
        <div class="panel-avatar" style="background:#EFF6FF;color:#1D4ED8">${ini}</div>
        <div class="panel-row-info">
          <div class="panel-row-name">${m.nome}</div>
          <div class="panel-row-sub">
            Apto ${m.apto} ·
            ${semEmail
              ? `<span style="color:#D97706;font-weight:600">sem e-mail</span>`
              : m.email}
          </div>
        </div>
        <span class="panel-row-badge" style="background:${cfg.bg};color:${cfg.color}">
          ${cfg.label}
        </span>
        ${semEmail ? `
          <button class="panel-row-btn"
                  title="Adicionar e-mail"
                  data-acao-email="${m.id}"
                  data-nome="${m.nome.replace(/"/g,'&quot;')}"
                  style="background:#FEF3C7;border-color:#FDE68A">
            <svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke="#92400E"
                 style="width:11px;height:11px">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </button>` : ''}
        <button class="panel-row-btn" title="Ver detalhes" data-acao-detalhe="${m.id}">
          <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>`
  }).join('')

  return `
    <div class="panel-card-head">
      <div class="panel-card-title">
        <div class="panel-card-title-dot" style="background:#60A5FA"></div>
        Moradores
      </div>
      <span style="font-size:11px;color:var(--n-400)">${lista.length} cadastrados</span>
    </div>
    ${rows}
  `
}

// ── Adicionar e-mail a morador sem_email ──────────────────────
let emailMoradorId = null

function abrirAdicionarEmail(moradorId, nome) {
  emailMoradorId = moradorId
  document.getElementById('add-email-nome').textContent  = nome
  document.getElementById('add-email-input').value       = ''
  document.getElementById('err-add-email').style.display = 'none'
  document.getElementById('modal-add-email').classList.add('open')
  setTimeout(() => document.getElementById('add-email-input')?.focus(), 50)
}

async function salvarEmailMorador() {
  const email = document.getElementById('add-email-input').value.trim()
  limparErro('err-add-email')

  if (!email)               { mostrarErro('err-add-email', 'Informe o e-mail.'); return }
  if (!isEmailValido(email)){ mostrarErro('err-add-email', 'E-mail inválido.'); return }

  const btn = document.getElementById('btn-salvar-add-email')
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  // Verifica duplicado
  const { data: existente } = await db
    .from('usuarios').select('id').eq('email', email).maybeSingle()

  if (existente) {
    mostrarErro('err-add-email', 'Este e-mail já está cadastrado no sistema.')
    if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar e-mail' }
    return
  }

  const { error } = await db
    .from('usuarios')
    .update({ email, status: 'pendente' })
    .eq('id', emailMoradorId)
    .eq('condominio_id', usuarioLogado.condominio_id)

  if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar e-mail' }

  if (error) {
    mostrarErro('err-add-email', 'Erro ao salvar. Tente novamente.')
    return
  }

  cacheMoradores = []
  fecharModal()
  mostrarToast('E-mail adicionado! Morador pode receber convite agora.')
  registrarAudit({
    acao:       'editar',
    tabela:     'usuarios',
    registroId: emailMoradorId,
    descricao:  `E-mail adicionado ao morador sem e-mail`,
    valorDepois: { email, status: 'pendente' },
  })
  renderTab(tabAtiva)
}

// ── Apartamentos ──────────────────────────────────────────────
async function renderApartamentos(body) {
  const aptos = await getApartamentos()
  const blocos = [...new Set(aptos.map(a => a.bloco))].sort()
  if (!blocos.includes(blocoAtivo)) blocoAtivo = blocos[0] || 'A'

  body.innerHTML = `
    <div style="margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:var(--n-900);margin-bottom:10px">Apartamentos por bloco</div>
      <div class="apto-filter" id="bloco-filter"></div>
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

  // Botões de bloco via addEventListener — sem onclick inline
  const blocoFilter = document.getElementById('bloco-filter')
  blocos.forEach(b => {
    const btn = document.createElement('button')
    btn.className   = 'apto-filter-btn' + (b === blocoAtivo ? ' active' : '')
    btn.textContent = `Bloco ${b}`
    btn.addEventListener('click', () => mudarBloco(b))
    blocoFilter.appendChild(btn)
  })

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
  grid.innerHTML = ''

  lista.forEach(a => {
    const oc  = a.status === 'ocupado'
    const div = document.createElement('div')
    div.className   = `apto-item ${oc ? 'ocupado' : 'disponivel'}`
    div.title       = oc ? 'Clique para ver o morador' : 'Disponível'
    div.textContent = a.numero
    if (oc) {
      div.style.cursor = 'pointer'
      div.addEventListener('click', () =>
        abrirDetalhesPorApto(a.id, `${a.bloco}-${a.numero}`)
      )
    }
    grid.appendChild(div)
  })

  const ocQtd = lista.filter(a => a.status === 'ocupado').length
  if (info) info.textContent =
    `Bloco ${blocoAtivo}: ${ocQtd} ocupados · ${lista.length - ocQtd} disponíveis`
}

// ── Detalhe do morador (via lista) ───────────────────────────
async function abrirDetalhesMorador(moradorId) {
  // Busca dados completos do morador (cache pode não ter telefone/cpf)
  const { data: m } = await db
    .from('usuarios')
    .select('id, nome, email, telefone, cpf, status, apartamentos(numero, bloco)')
    .eq('id', moradorId)
    .single()
  if (!m) return
  await preencherModalMorador(m, m.apartamentos
    ? `${m.apartamentos.bloco}-${m.apartamentos.numero}` : '—')
}

// ── Detalhe do morador (via clique no apartamento) ────────────
async function abrirDetalhesPorApto(aptoId, aptoLabel) {
  const { data: m } = await db
    .from('usuarios')
    .select('id, nome, email, telefone, cpf, status')
    .eq('apartamento_id', aptoId)
    .eq('perfil', 'morador')
    .single()

  if (!m) {
    // Apartamento ocupado mas sem morador vinculado na tabela usuarios
    mostrarToast('Morador não encontrado para este apartamento.', 'erro')
    return
  }
  await preencherModalMorador(m, aptoLabel)
}

// ── Preenche e abre o modal de detalhe ───────────────────────
async function preencherModalMorador(m, aptoLabel) {
  const ini = m.nome.split(' ').map(n => n[0]).slice(0, 2).join('')
  const cfg = STATUS_CFG[m.status] || STATUS_CFG.pendente

  document.getElementById('det-mor-avatar').textContent    = ini
  document.getElementById('det-mor-nome').textContent      = m.nome
  document.getElementById('det-mor-status').textContent    = cfg.label
  document.getElementById('det-mor-status').style.color    = cfg.color
  document.getElementById('det-mor-apto').textContent      = aptoLabel
  document.getElementById('det-mor-email').textContent     = mascararEmail(m.email)
  document.getElementById('det-mor-tel').textContent       = mascararTelefone(m.telefone)

  // CPF mascarado — síndico vê formato parcial (LGPD)
  const cpfNum = (m.cpf || '').replace(/\D/g, '')
  document.getElementById('det-mor-cpf').textContent = mascararCPF(cpfNum)

  // Carrega últimas 5 entregas deste morador
  const entregasEl = document.getElementById('det-mor-entregas')
  entregasEl.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--n-400)">Carregando...</div>'

  document.getElementById('modal-detalhe-morador').classList.add('open')

  const { data: entregas } = await db
    .from('entregas')
    .select('transportadora, status, recebido_em, volumes')
    .eq('morador_id', m.id)
    .order('recebido_em', { ascending: false })
    .limit(5)

  if (!entregas?.length) {
    entregasEl.innerHTML =
      '<div style="padding:10px 14px;font-size:12px;color:var(--n-400)">Nenhuma entrega registrada</div>'
    return
  }

  entregasEl.innerHTML = entregas.map((e, i) => {
    const cfg = STATUS_CFG[e.status] || STATUS_CFG.aguardando
    const data = new Date(e.recebido_em).toLocaleDateString('pt-BR',
      { day: '2-digit', month: '2-digit', year: '2-digit' })
    const borda = i < entregas.length - 1 ? 'border-bottom:1px solid var(--n-100);' : ''
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:9px 14px;${borda}">
        <div style="width:7px;height:7px;border-radius:50%;background:${cfg.dot||'#ccc'};flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;color:var(--n-900)">${e.transportadora}</div>
          <div style="font-size:11px;color:var(--n-500)">${data} · ${e.volumes} volume${e.volumes > 1 ? 's' : ''}</div>
        </div>
        <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:99px;
                     background:${cfg.bg};color:${cfg.color};white-space:nowrap">${cfg.label}</span>
      </div>`
  }).join('')
}

// ── Relatórios ────────────────────────────────────────────────
async function renderRelatorios(body) {
  body.innerHTML = `<div style="text-align:center;padding:40px;color:var(--n-400)">Carregando relatórios...</div>`

  const hoje     = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString()
  const inicioSemana = new Date(hoje - 7 * 86400000).toISOString()

  // Busca todos os dados em paralelo
  const [
    { data: entregas },
    { data: moradores },
    { data: porteiros },
    { data: aptos },
  ] = await Promise.all([
    db.from('entregas')
      .select('id, status, transportadora, recebido_em, retirado_em, apartamentos(bloco, numero)')
      .eq('condominio_id', usuarioLogado.condominio_id)
      .order('recebido_em', { ascending: false }),
    db.from('usuarios')
      .select('id, nome, status, apartamentos(bloco, numero)')
      .eq('condominio_id', usuarioLogado.condominio_id)
      .eq('perfil', 'morador'),
    db.from('usuarios')
      .select('id, nome, turno, periodo, status')
      .eq('condominio_id', usuarioLogado.condominio_id)
      .eq('perfil', 'porteiro'),
    db.from('apartamentos')
      .select('id, bloco, numero, status')
      .eq('condominio_id', usuarioLogado.condominio_id),
  ])

  const e  = entregas  || []
  const m  = moradores || []
  const p  = porteiros || []
  const a  = aptos     || []

  // Métricas de entregas
  const eMes      = e.filter(x => x.recebido_em >= inicioMes)
  const eSemana   = e.filter(x => x.recebido_em >= inicioSemana)
  const eAguar    = e.filter(x => ['aguardando','notificado','entregue_porteiro'].includes(x.status))
  const eRetirado = e.filter(x => x.status === 'retirado')
  const eExpirado = e.filter(x => x.status === 'expirado')

  // Transportadoras mais frequentes
  const transCont = {}
  e.forEach(x => { transCont[x.transportadora] = (transCont[x.transportadora] || 0) + 1 })
  const topTrans = Object.entries(transCont).sort((a,b) => b[1]-a[1]).slice(0, 5)

  // Tempo médio de retirada (em horas)
  const comRetirada = e.filter(x => x.retirado_em && x.recebido_em)
  const tempoMedio  = comRetirada.length
    ? Math.round(comRetirada.reduce((acc, x) => {
        return acc + (new Date(x.retirado_em) - new Date(x.recebido_em)) / 3600000
      }, 0) / comRetirada.length)
    : null

  // Métricas de moradores
  const mAtivos   = m.filter(x => x.status === 'ativo').length
  const mPendente = m.filter(x => x.status === 'pendente').length
  const mSemEmail = m.filter(x => x.status === 'sem_email').length

  // Ocupação
  const aOcupados    = a.filter(x => x.status === 'ocupado').length
  const aDisponiveis = a.length - aOcupados
  const pctOcupacao  = a.length ? Math.round((aOcupados / a.length) * 100) : 0

  const barLargura = (v, total) =>
    `<div style="height:6px;border-radius:99px;background:var(--n-100);overflow:hidden;margin-top:4px">
       <div style="height:100%;width:${total ? Math.round(v/total*100) : 0}%;background:var(--p-500);border-radius:99px"></div>
     </div>`

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
      ${[
        ['Entregas este mês',  eMes.length,      '#FEF3C7','#92400E', 'Mês atual'],
        ['Esta semana',        eSemana.length,    '#EDE9FE','#5B21B6', '7 dias'],
        ['Aguardando retirada',eAguar.length,     '#FEF2F2','#991B1B', 'Pendentes'],
        ['Taxa de retirada',   e.length ? Math.round(eRetirado.length/e.length*100)+'%' : '—', '#F0FDF4','#166534', 'Do total'],
      ].map(([l,v,bg,c,sub]) => `
        <div style="background:var(--n-0);border:1px solid var(--n-200);border-radius:var(--radius-lg);padding:14px 16px">
          <div style="font-size:26px;font-weight:700;color:var(--n-900);line-height:1">${v}</div>
          <div style="font-size:12px;color:var(--n-500);margin-top:4px">${l}</div>
          <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:99px;
                       background:${bg};color:${c};margin-top:6px;display:inline-block">${sub}</span>
        </div>`).join('')}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
      <!-- Transportadoras -->
      <div style="background:var(--n-0);border:1px solid var(--n-200);border-radius:var(--radius-lg);overflow:hidden">
        <div style="padding:12px 16px;border-bottom:1px solid var(--n-100);font-size:11px;font-weight:700;
                    text-transform:uppercase;letter-spacing:.06em;color:var(--n-500)">
          Top transportadoras
        </div>
        <div style="padding:8px 0">
          ${topTrans.length === 0
            ? '<div style="padding:16px;text-align:center;font-size:12px;color:var(--n-400)">Sem dados</div>'
            : topTrans.map(([t,v]) => `
              <div style="padding:8px 16px">
                <div style="display:flex;justify-content:space-between;font-size:13px">
                  <span style="font-weight:600;color:var(--n-900)">${t}</span>
                  <span style="color:var(--n-500)">${v} entrega${v>1?'s':''}</span>
                </div>
                ${barLargura(v, e.length)}
              </div>`).join('')}
        </div>
      </div>

      <!-- Moradores e Ocupação -->
      <div style="display:flex;flex-direction:column;gap:14px">
        <div style="background:var(--n-0);border:1px solid var(--n-200);border-radius:var(--radius-lg);overflow:hidden">
          <div style="padding:12px 16px;border-bottom:1px solid var(--n-100);font-size:11px;font-weight:700;
                      text-transform:uppercase;letter-spacing:.06em;color:var(--n-500)">Moradores</div>
          <div style="padding:12px 16px;display:flex;flex-direction:column;gap:8px">
            ${[
              ['Ativos',      mAtivos,   '#F0FDF4','#166534'],
              ['Pendentes',   mPendente, '#FEF3C7','#92400E'],
              ['Sem e-mail',  mSemEmail, '#FFF7ED','#C2410C'],
            ].map(([l,v,bg,c]) => `
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:13px;color:var(--n-600)">${l}</span>
                <span style="font-size:13px;font-weight:700;padding:2px 10px;border-radius:99px;
                             background:${bg};color:${c}">${v}</span>
              </div>`).join('')}
          </div>
        </div>
        <div style="background:var(--n-0);border:1px solid var(--n-200);border-radius:var(--radius-lg);padding:14px 16px">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
                      color:var(--n-500);margin-bottom:10px">Ocupação dos apartamentos</div>
          <div style="font-size:28px;font-weight:700;color:var(--p-600)">${pctOcupacao}%</div>
          <div style="font-size:12px;color:var(--n-500);margin-bottom:8px">
            ${aOcupados} ocupados · ${aDisponiveis} disponíveis de ${a.length}
          </div>
          ${barLargura(aOcupados, a.length)}
        </div>
      </div>
    </div>

    <!-- Estatísticas adicionais -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
      ${[
        ['Total de entregas',       e.length],
        ['Retiradas com sucesso',   eRetirado.length],
        ['Expiradas',               eExpirado.length],
        ['Porteiros cadastrados',   p.filter(x=>x.status==='ativo').length],
        ['Tempo médio de retirada', tempoMedio !== null ? tempoMedio+'h' : '—'],
        ['Apartamentos cadastrados',a.length],
      ].map(([l,v]) => `
        <div style="background:var(--n-0);border:1px solid var(--n-200);
                    border-radius:var(--radius-lg);padding:14px 16px">
          <div style="font-size:22px;font-weight:700;color:var(--n-900)">${v}</div>
          <div style="font-size:12px;color:var(--n-500);margin-top:3px">${l}</div>
        </div>`).join('')}
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
  document.getElementById('p-turno').value   = editando?.turno   || 'A'
  document.getElementById('p-periodo').value = editando?.periodo || 'Manhã'
  limparTodosErros('err-p-nome', 'err-p-email', 'err-p-senha')

  // Campo senha só aparece ao criar novo porteiro
  document.getElementById('campo-senha-porteiro').style.display = editando ? 'none' : 'block'

  // Reseta a caixa de credenciais
  document.getElementById('credenciais-box').style.display  = 'none'
  document.getElementById('credenciais-texto').textContent  = ''
  const actions = document.querySelector('#form-porteiro .modal-actions')
  if (actions) actions.style.display = 'flex'

  document.getElementById('modal-porteiro').classList.add('open')
  document.getElementById('modal-porteiro').dataset.editId = id || ''
}

async function salvarPorteiro(e) {
  e.preventDefault()
  limparTodosErros('err-p-nome', 'err-p-email')
  const nome    = document.getElementById('p-nome').value.trim()
  const email   = document.getElementById('p-email').value.trim()
  const turno   = document.getElementById('p-turno').value
  const periodo = document.getElementById('p-periodo').value
  let ok = true
  if (!nome)                 { mostrarErro('err-p-nome',  'Informe o nome.'); ok = false }
  if (!isEmailValido(email)) { mostrarErro('err-p-email', 'Informe um e-mail válido.'); ok = false }
  if (!ok) return

  const btn = e.submitter
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  const editId = document.getElementById('modal-porteiro').dataset.editId

  if (editId) {
    const { error } = await db
      .from('usuarios')
      .update({ nome, email, turno, periodo })
      .eq('id', editId)
      .eq('condominio_id', usuarioLogado.condominio_id) // segurança: só edita do próprio condomínio
    if (error) {
      mostrarErro('err-p-nome', 'Erro ao salvar. Tente novamente.')
      if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar porteiro' }
      return
    }
  } else {
    // Gera senha temporária segura
    const senhaTemp = Math.random().toString(36).slice(-6).toUpperCase() +
                      Math.random().toString(36).slice(-6) + 'A1!'

    const { data: authData, error: authError } = await db.auth.signUp({
      email,
      password: senhaTemp,
    })

    if (authError) {
      mostrarErro('err-p-email', 'Erro ao criar conta: ' + authError.message)
      if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar porteiro' }
      return
    }

    const userId = authData.user?.id ?? authData.session?.user?.id
    if (!userId) {
      mostrarErro('err-p-email', 'Não foi possível criar a conta. Verifique se o e-mail já está cadastrado.')
      if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar porteiro' }
      return
    }

    const { error: dbError } = await db.from('usuarios').insert({
      auth_id:       userId,
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

    // Exibe credenciais para o síndico copiar/compartilhar
    cachePorteiros = []
    const textoCredenciais =
      `Porteiro: ${nome}\nE-mail: ${email}\nSenha temporária: ${senhaTemp}\n\nAcesso: ${window.location.origin}/pages/login.html`
    document.getElementById('credenciais-texto').textContent = textoCredenciais
    document.getElementById('credenciais-box').style.display = 'block'
    document.getElementById('campo-senha-porteiro').style.display = 'none'
    // Esconde os botões de ação enquanto exibe credenciais
    const actions = document.querySelector('#form-porteiro .modal-actions')
    if (actions) actions.style.display = 'none'
    if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar porteiro' }
    return
  }

  cachePorteiros = []
  fecharModal()
  renderTab(tabAtiva)
}

function copiarCredenciais() {
  const texto = document.getElementById('credenciais-texto')?.textContent || ''
  navigator.clipboard.writeText(texto).then(() => {
    const btnCopiar = document.getElementById('btn-copiar-texto')
    if (btnCopiar) {
      btnCopiar.textContent = '✓ Copiado!'
      setTimeout(() => { btnCopiar.textContent = 'Copiar credenciais' }, 2000)
    }
  }).catch(() => {
    // Fallback para navegadores sem clipboard API
    const ta = document.createElement('textarea')
    ta.value = texto
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    const btnCopiar = document.getElementById('btn-copiar-texto')
    if (btnCopiar) {
      btnCopiar.textContent = '✓ Copiado!'
      setTimeout(() => { btnCopiar.textContent = 'Copiar credenciais' }, 2000)
    }
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

  if (!nome) { mostrarErro('err-m-nome', 'Informe o nome.'); ok = false }

  // E-mail é opcional — se informado, precisa ser válido
  if (email && !isEmailValido(email)) {
    mostrarErro('err-m-email', 'E-mail informado é inválido.')
    ok = false
  }

  if (!apto) { mostrarErro('err-m-apto', 'Informe o apartamento.'); ok = false }
  if (!ok) return

  const btn = e.submitter
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  // Verifica e-mail duplicado (apenas se informado)
  if (email) {
    const { data: existente } = await db
      .from('usuarios')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existente) {
      mostrarErro('err-m-email', 'Este e-mail já está cadastrado no sistema.')
      if (btn) { btn.disabled = false; btn.innerHTML = 'Pré-cadastrar' }
      return
    }
  }

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
    nome,
    email:          email || null,
    cpf:            cpf   || null,
    // Sem e-mail → pendente (sem acesso ainda); com e-mail → convite pode ser enviado
    status:         email ? 'pendente' : 'sem_email',
  })

  if (error) {
    mostrarErro('err-m-nome', 'Erro ao pré-cadastrar. Tente novamente.')
    if (btn) { btn.disabled = false; btn.innerHTML = 'Pré-cadastrar' }
    return
  }

  cacheMoradores = []
  fecharModal()
  renderTab(tabAtiva)

  // Feedback visual informando sobre o status do cadastro
  if (!email) {
    mostrarToast('Morador cadastrado sem e-mail — acesso pendente.', 'aviso')
  } else {
    mostrarToast('Morador pré-cadastrado com sucesso!')
  }
}

// ── Fechar modais ─────────────────────────────────────────────
function fecharModal() {
  const temCredenciais =
    document.getElementById('credenciais-box')?.style.display === 'block'
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'))
  modalAtivo = null
  // Se fechou após criar porteiro (credenciais visíveis), atualiza a lista
  if (temCredenciais) renderTab(tabAtiva)
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


// ── Configurações — Perfil do síndico ─────────────────────────
function renderConfiguracoes(body) {
  const apto  = usuarioLogado.apartamentos
  const condo = usuarioLogado.condominios

  body.innerHTML = `
    <div style="max-width:560px">
      <div style="font-size:13px;font-weight:700;color:var(--n-900);margin-bottom:14px">Meu perfil</div>

      <!-- Card perfil -->
      <div style="background:var(--n-0);border:1px solid var(--n-200);border-radius:var(--radius-lg);
                  overflow:hidden;margin-bottom:14px">
        <div style="padding:16px;border-bottom:1px solid var(--n-100);display:flex;align-items:center;gap:12px">
          <div style="width:48px;height:48px;border-radius:50%;background:var(--p-100);color:var(--p-700);
                      font-size:18px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${usuarioLogado.nome.split(' ').map(n=>n[0]).slice(0,2).join('')}
          </div>
          <div style="flex:1">
            <div style="font-size:15px;font-weight:700;color:var(--n-900)">${usuarioLogado.nome}</div>
            <div style="font-size:12px;color:var(--n-500)">${condo?.nome || '—'} · Síndico</div>
          </div>
          <button onclick="abrirEditarPerfilSindico()"
                  style="font-size:11px;font-weight:600;color:var(--p-600);background:var(--p-50);
                         border:1px solid var(--p-200);border-radius:var(--radius-md);
                         padding:5px 10px;cursor:pointer;font-family:var(--font-sans)">
            Editar
          </button>
        </div>
        ${[
          ['Nome',      usuarioLogado.nome || '—'],
          ['E-mail',    usuarioLogado.email || '—'],
          ['Telefone',  usuarioLogado.telefone || '—'],
          ['Condomínio', condo?.nome || '—'],
        ].map(([l,v]) => `
          <div style="display:flex;justify-content:space-between;padding:11px 16px;border-bottom:1px solid var(--n-100)">
            <span style="font-size:13px;color:var(--n-500)">${l}</span>
            <span style="font-size:13px;font-weight:600;color:var(--n-900);text-align:right;max-width:60%">${v}</span>
          </div>`).join('')}
      </div>

      <!-- Trocar senha -->
      <div style="background:var(--n-0);border:1px solid var(--n-200);border-radius:var(--radius-lg);
                  padding:14px 16px;margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--n-900)">Senha de acesso</div>
            <div style="font-size:12px;color:var(--n-500);margin-top:2px">Altere sua senha quando quiser</div>
          </div>
          <button onclick="abrirTrocarSenhaSindico()"
                  style="font-size:11px;font-weight:600;color:var(--p-600);background:var(--p-50);
                         border:1px solid var(--p-200);border-radius:var(--radius-md);
                         padding:5px 10px;cursor:pointer;font-family:var(--font-sans)">
            Trocar senha
          </button>
        </div>
      </div>

      <!-- Sair -->
      <button onclick="logout()"
              style="width:100%;padding:11px;background:var(--n-50);border:1px solid var(--n-200);
                     border-radius:var(--radius-md);font-size:13px;font-weight:600;color:var(--n-600);
                     cursor:pointer;font-family:var(--font-sans);display:flex;align-items:center;
                     justify-content:center;gap:7px">
        <svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke="currentColor" style="width:15px;height:15px">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Sair da conta
      </button>
    </div>
  `
}

function abrirEditarPerfilSindico() {
  document.getElementById('sindico-nome').value  = usuarioLogado.nome || ''
  document.getElementById('sindico-tel').value   = usuarioLogado.telefone || ''
  document.getElementById('sindico-email').value = usuarioLogado.email || ''
  limparTodosErros('err-sindico-nome','err-sindico-email')
  aplicarMascaraTelefone('sindico-tel')
  document.getElementById('modal-perfil-sindico').classList.add('open')
}

async function salvarPerfilSindico() {
  limparTodosErros('err-sindico-nome','err-sindico-email')
  const nome     = document.getElementById('sindico-nome').value.trim()
  const telefone = document.getElementById('sindico-tel').value.trim()
  const email    = document.getElementById('sindico-email').value.trim()
  let ok = true

  if (!nome)                { mostrarErro('err-sindico-nome',  'Informe seu nome.'); ok = false }
  if (!isEmailValido(email)){ mostrarErro('err-sindico-email', 'E-mail inválido.');  ok = false }
  if (!ok) return

  const btn = document.getElementById('btn-salvar-perfil-sindico')
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  const { error } = await db
    .from('usuarios')
    .update({ nome, telefone, email })
    .eq('id', usuarioLogado.id)

  if (error) {
    mostrarErro('err-sindico-nome', 'Erro ao salvar. Tente novamente.')
    if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar alterações' }
    return
  }

  usuarioLogado.nome     = nome
  usuarioLogado.telefone = telefone
  usuarioLogado.email    = email

  document.getElementById('header-sindico').textContent = `Painel do síndico · ${nome}`
  const iniciais = nome.split(' ').map(n => n[0]).slice(0, 2).join('')
  const sbAvatar = document.getElementById('sb-avatar')
  if (sbAvatar) sbAvatar.textContent = iniciais

  fecharModal()
  renderTab('configuracoes')
}

function abrirTrocarSenhaSindico() {
  document.getElementById('sindico-senha-atual').value    = ''
  document.getElementById('sindico-senha-nova').value     = ''
  document.getElementById('sindico-senha-confirma').value = ''
  limparTodosErros('err-sindico-senha-atual','err-sindico-senha-nova','err-sindico-senha-confirma')
  document.getElementById('modal-senha-sindico').classList.add('open')
}

async function salvarSenhaSindico() {
  limparTodosErros('err-sindico-senha-atual','err-sindico-senha-nova','err-sindico-senha-confirma')
  const atual    = document.getElementById('sindico-senha-atual').value
  const nova     = document.getElementById('sindico-senha-nova').value
  const confirma = document.getElementById('sindico-senha-confirma').value
  let ok = true

  if (!atual)           { mostrarErro('err-sindico-senha-atual',    'Informe a senha atual.'); ok = false }
  if (nova.length < 6)  { mostrarErro('err-sindico-senha-nova',     'Mínimo 6 caracteres.');   ok = false }
  if (nova !== confirma){ mostrarErro('err-sindico-senha-confirma', 'Senhas não coincidem.');   ok = false }
  if (!ok) return

  const btn = document.getElementById('btn-salvar-senha-sindico')
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  // Verifica senha atual via re-login
  const { error: loginError } = await db.auth.signInWithPassword({
    email:    usuarioLogado.email,
    password: atual,
  })

  if (loginError) {
    mostrarErro('err-sindico-senha-atual', 'Senha atual incorreta.')
    if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar nova senha' }
    return
  }

  const { error } = await db.auth.updateUser({ password: nova })

  if (error) {
    mostrarErro('err-sindico-senha-nova', 'Erro ao alterar senha.')
    if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar nova senha' }
    return
  }

  fecharModal()
  mostrarToast('Senha alterada com sucesso!')
}

function voltarSuperAdmin() {
  sessionStorage.removeItem('sa_impersonate_condo_id')
  sessionStorage.removeItem('sa_impersonate_condo_nome')
  window.location.href = 'superadmin.html'
}

// ── Log simples (fire-and-forget) ────────────────────────────
async function registrarLog(tipo, descricao) {
  try {
    await db.from('acessos').insert({
      usuario_id:    usuarioLogado?.id,
      condominio_id: usuarioLogado?.condominio_id,
      perfil:        usuarioLogado?.perfil,
      nome:          descricao,
      status:        'sucesso',
    })
  } catch (_) {}
}

// ── Toast de feedback (substitui alert) ──────────────────────
function mostrarToast(msg, tipo = 'sucesso') {
  const cores = {
    sucesso: { bg: '#F0FDF4', border: '#BBF7D0', color: '#166534', icon: '✓' },
    erro:    { bg: '#FEF2F2', border: '#FECACA', color: '#991B1B', icon: '✕' },
  }
  const c = cores[tipo] || cores.sucesso
  const toast = document.createElement('div')
  toast.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    background:${c.bg};border:1.5px solid ${c.border};color:${c.color};
    padding:12px 18px;border-radius:var(--radius-md);
    font-size:13px;font-weight:600;font-family:var(--font-sans);
    display:flex;align-items:center;gap:8px;
    box-shadow:0 4px 16px rgba(0,0,0,.12);
    animation:fadeUp .2s ease both;
  `
  toast.innerHTML = `<span>${c.icon}</span><span>${msg}</span>`
  document.body.appendChild(toast)
  setTimeout(() => toast.remove(), 3000)
}