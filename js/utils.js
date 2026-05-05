// ============================================================
//  superadmin.js — painel completo do Super Admin
//  Todas as abas integradas com Supabase
// ============================================================

let usuarioLogado      = null
let tabAtiva           = 'dashboard'
let condominioEditando = null

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  usuarioLogado = await requireAuth(['superadmin'])
  if (!usuarioLogado) return

  // Avatar com iniciais
  const iniciais = usuarioLogado.nome.split(' ').map(n => n[0]).slice(0,2).join('')
  document.getElementById('sb-avatar').textContent    = iniciais
  document.getElementById('sb-avatar').title          = usuarioLogado.nome
  document.getElementById('header-user').textContent  = usuarioLogado.nome

  mudarTab('dashboard')
  aplicarMascaraCEP()
  aplicarMascaraCNPJ('c-cnpj')
  bindEvents()

  // Verifica alertas do sistema após carregar o painel
  verificarAlertas()
})

// ── Navegação entre abas ──────────────────────────────────────
async function mudarTab(tab) {
  tabAtiva = tab

  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'))
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active')

  // Sincroniza sidebar (item com mesmo data-tip que o label da aba)
  const tipMap = {
    dashboard:   'Dashboard',
    condominios: 'Condomínios',
    usuarios:    'Usuários',
    relatorios:  'Relatórios',
    equipe:      'Equipe interna',
    alertas:     'Alertas',
  }
  document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'))
  const sbTip = tipMap[tab]
  if (sbTip) {
    document.querySelector(`.sb-item[data-tip="${sbTip}"]`)?.classList.add('active')
  }

  // Atualiza botão de ação no header
  const acoes = {
    dashboard:    { label: '+ Novo condomínio', fn: 'abrirModalNovo()' },
    condominios:  { label: '+ Novo condomínio', fn: 'abrirModalNovo()' },
    usuarios:     { label: '+ Novo Super Admin', fn: 'abrirModalSA()' },
    relatorios:   null,
    equipe:       { label: '+ Novo Super Admin', fn: 'abrirModalSA()' },
  }
  const btn  = document.getElementById('btn-acao')
  const acao = acoes[tab]
  if (acao) {
    btn.textContent = ''
    btn.innerHTML   = `<svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" fill="none" stroke="currentColor" style="width:13px;height:13px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> ${acao.label}`
    btn.setAttribute('onclick', acao.fn)
    btn.style.display = 'flex'
  } else {
    btn.style.display = 'none'
  }

  // Renderiza a aba
  const body = document.getElementById('tab-body')
  body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--n-400)"><div class="spinner" style="border-color:var(--p-200);border-top-color:var(--p-600);margin:0 auto"></div></div>'

  if (tab === 'dashboard')   await renderDashboard(body)
  if (tab === 'condominios') await renderCondominios(body)
  if (tab === 'usuarios')    await renderUsuarios(body)
  if (tab === 'relatorios')  await renderRelatorios(body)
  if (tab === 'equipe')      await renderEquipe(body)
  if (tab === 'alertas')     await renderAlertas(body)
}

// ── DASHBOARD ────────────────────────────────────────────────
async function renderDashboard(body) {
  const [condos, moradores, porteiros, entregas] = await Promise.all([
    db.from('condominios').select('id, status'),
    db.from('usuarios').select('id', { count: 'exact' }).eq('perfil', 'morador'),
    db.from('usuarios').select('id', { count: 'exact' }).eq('perfil', 'porteiro'),
    db.from('entregas').select('id, status'),
  ])

  const total   = condos.data?.length || 0
  const ativos  = condos.data?.filter(c => c.status === 'ativo').length || 0
  const pend    = condos.data?.filter(c => c.status === 'pendente').length || 0
  const aguard  = entregas.data?.filter(e => e.status === 'aguardando').length || 0

  body.innerHTML = `
    <div class="stats-grid">
      ${statCard(total,             'Condomínios',         '#EDE9FE','#5B21B6', iconPredio())}
      ${statCard(moradores.count||0,'Moradores',           '#EFF6FF','#1D4ED8', iconPessoas())}
      ${statCard(porteiros.count||0,'Porteiros',           '#F0FDF4','#166534', iconPessoa())}
      ${statCard(aguard,            'Entregas pendentes',  '#FEF3C7','#92400E', iconCaixa())}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px">
      <div class="panel-card-sa">
        <div class="panel-card-sa-head">
          <span class="panel-card-sa-title">Status dos condomínios</span>
        </div>
        <div style="padding:16px;display:flex;flex-direction:column;gap:10px">
          ${statusBar('Ativos',    ativos, total, '#16A34A', '#F0FDF4')}
          ${statusBar('Pendentes', pend,   total, '#D97706', '#FEF3C7')}
          ${statusBar('Inativos',  total - ativos - pend, total, '#94A3B8', '#F8FAFC')}
        </div>
      </div>
      <div class="panel-card-sa">
        <div class="panel-card-sa-head">
          <span class="panel-card-sa-title">Acesso rápido</span>
        </div>
        <div style="padding:12px;display:flex;flex-direction:column;gap:6px">
          ${quickBtn('Ver todos os condomínios', "mudarTab('condominios')", '#EDE9FE','#5B21B6')}
          ${quickBtn('Gerenciar usuários',        "mudarTab('usuarios')",   '#EFF6FF','#1D4ED8')}
          ${quickBtn('Equipe interna',            "mudarTab('equipe')",     '#F0FDF4','#166534')}
          ${quickBtn('Relatórios',                "mudarTab('relatorios')", '#FEF3C7','#92400E')}
        </div>
      </div>
    </div>
  `
  // Carrega condomínios no dashboard
  await renderGridCondominios(body, true)
}

// ── CONDOMÍNIOS ───────────────────────────────────────────────
async function renderCondominios(body) {
  body.innerHTML = `
    <div style="margin-bottom:14px">
      <input class="search-box" type="text" id="busca-condo"
             placeholder="Buscar por nome ou cidade..." />
    </div>
    <div class="sec-header">
      <div class="sec-title">Todos os condomínios</div>
      <div class="sec-meta" id="condo-meta"></div>
    </div>
    <div class="condo-grid" id="condo-grid">
      <div class="condo-card-add" onclick="abrirModalNovo()">
        <div class="add-icon"><svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" fill="none" stroke="#fff"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>
        <div class="add-label">Novo condomínio</div>
      </div>
    </div>
  `
  await carregarCondominios()

  document.getElementById('busca-condo')?.addEventListener('input', function() {
    carregarCondominios(this.value)
  })
}

async function renderGridCondominios(body, isDashboard = false) {
  if (isDashboard) {
    body.insertAdjacentHTML('beforeend', `
      <div class="sec-header">
        <div class="sec-title">Condomínios cadastrados</div>
        <div class="sec-meta" id="condo-meta"></div>
      </div>
      <div class="condo-grid" id="condo-grid">
        <div class="condo-card-add" onclick="abrirModalNovo()">
          <div class="add-icon"><svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" fill="none" stroke="#fff"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>
          <div class="add-label">Novo condomínio</div>
        </div>
      </div>
    `)
  }
  await carregarCondominios()
}

async function carregarCondominios(filtro = '') {
  const grid = document.getElementById('condo-grid')
  if (!grid) return

  grid.querySelectorAll('.condo-card').forEach(el => el.remove())

  let query = db.from('condominios').select('*').order('criado_em', { ascending: false })
  if (filtro) query = query.ilike('nome', `%${filtro}%`)

  const { data } = await query
  const lista    = data || []
  const ativos   = lista.filter(c => c.status === 'ativo').length
  const pend     = lista.filter(c => c.status === 'pendente').length
  const meta     = document.getElementById('condo-meta')
  if (meta) meta.textContent = `${lista.length} total · ${ativos} ativo${ativos !== 1 ? 's' : ''} · ${pend} pendente${pend !== 1 ? 's' : ''}`

  const addCard = grid.querySelector('.condo-card-add')

  lista.forEach(c => {
    const card = document.createElement('div')
    card.className = 'condo-card'

    // Textos inseridos via textContent — sem risco de XSS
    const nomeEl  = document.createElement('div')
    nomeEl.className = 'condo-card-name'
    nomeEl.textContent = c.nome

    const addrEl  = document.createElement('div')
    addrEl.className = 'condo-card-addr'
    addrEl.textContent = `${c.endereco} · ${c.cidade}/${c.uf}`

    const pillEl  = document.createElement('span')
    pillEl.className = `status-pill s-${c.status}`
    pillEl.textContent = statusLabel(c.status)

    const topDiv  = document.createElement('div')
    topDiv.className = 'condo-card-top'
    const topInfo = document.createElement('div')
    topInfo.appendChild(nomeEl)
    topInfo.appendChild(addrEl)
    topDiv.appendChild(topInfo)
    topDiv.appendChild(pillEl)

    const statsDiv = document.createElement('div')
    statsDiv.className = 'condo-stats'
    statsDiv.innerHTML = `
      <div class="condo-stat">${iconAptos()} <strong>${c.total_aptos}</strong> aptos</div>
      <div class="condo-stat">${iconRelogio()} Criado: ${new Date(c.criado_em).toLocaleDateString('pt-BR')}</div>`

    const footerDiv = document.createElement('div')
    footerDiv.className = 'condo-footer'

    const btnDetalhe = document.createElement('button')
    btnDetalhe.className = 'mini-btn'
    btnDetalhe.textContent = 'Detalhes'
    btnDetalhe.addEventListener('click', () => abrirDetalhe(c.id))

    const btnEditar = document.createElement('button')
    btnEditar.className = 'mini-btn'
    btnEditar.textContent = 'Editar'
    btnEditar.addEventListener('click', () => editarCondo(c.id))

    // Botão contextual: reenviar convite (pendente) ou acessar painel (ativo)
    const btnAcao = document.createElement('button')
    btnAcao.className = 'mini-btn primary'

    if (c.status === 'pendente') {
      btnAcao.textContent = 'Reenviar convite'
      btnAcao.addEventListener('click', () => reenviarConvite(c.id, c.nome, btnAcao))
    } else {
      btnAcao.textContent = 'Acessar painel'
      btnAcao.addEventListener('click', () => acessarPainelCondo(c.id, c.nome))
    }

    footerDiv.appendChild(btnDetalhe)
    footerDiv.appendChild(btnEditar)
    footerDiv.appendChild(btnAcao)

    card.appendChild(topDiv)
    card.appendChild(statsDiv)
    card.appendChild(footerDiv)

    grid.insertBefore(card, addCard)
  })
}

// ── Reenviar convite ao síndico ───────────────────────────────
async function reenviarConvite(condoId, condoNome, btn) {
  const original = btn.textContent
  btn.disabled    = true
  btn.textContent = '...'

  try {
    const { data, error } = await db.functions.invoke('convidar-sindico', {
      body: { condominio_id: condoId },
    })

    if (error || data?.error) {
      mostrarToast(`Erro ao reenviar convite: ${data?.error || error?.message}`, 'erro')
    } else {
      mostrarToast(`Convite reenviado para ${condoNome}!`)
    }
  } catch (err) {
    console.error('Erro ao reenviar convite:', err)
    mostrarToast('Erro inesperado ao reenviar convite.', 'erro')
  }

  btn.disabled    = false
  btn.textContent = original
}

// ── USUÁRIOS ─────────────────────────────────────────────────
const USUARIOS_POR_PAGINA = 20
let paginaAtualUsuarios   = 1
let listaUsuariosFiltrada = []

async function renderUsuarios(body) {
  const { data, count } = await db
    .from('usuarios')
    .select('*, condominios(nome)', { count: 'exact' })
    .order('criado_em', { ascending: false })

  const lista = data || []
  listaUsuariosFiltrada = lista
  paginaAtualUsuarios   = 1

  const perfilCores = {
    superadmin: { bg:'#EDE9FE', color:'#5B21B6' },
    admin:      { bg:'#F3E8FF', color:'#6D28D9' },
    porteiro:   { bg:'#EFF6FF', color:'#1D4ED8' },
    morador:    { bg:'#F0FDFA', color:'#0F766E' },
  }

  body.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <input class="search-box" type="text" id="busca-user"
             placeholder="Buscar por nome ou e-mail..." style="flex:1;min-width:200px" />
      <select class="search-box" id="filtro-perfil" style="flex:none;width:160px">
        <option value="">Todos os perfis</option>
        <option value="superadmin">Super Admin</option>
        <option value="admin">Síndico</option>
        <option value="porteiro">Porteiro</option>
        <option value="morador">Morador</option>
      </select>
    </div>
    <div class="panel-card-sa" id="lista-usuarios">
      <div class="panel-card-sa-head">
        <span class="panel-card-sa-title">Usuários cadastrados</span>
        <span style="font-size:11px;color:var(--n-400)" id="users-count">${lista.length} total</span>
      </div>
      <div id="users-body"></div>
      <div id="users-paginacao" style="display:flex;align-items:center;justify-content:space-between;
           padding:12px 16px;border-top:1px solid var(--n-100);flex-wrap:wrap;gap:8px"></div>
    </div>
  `

  const bindAcoes = (container) => {
    container.querySelectorAll('.sa-btn-acao').forEach(btn => {
      btn.addEventListener('click', () => {
        const { acao, id, nome, perfil } = btn.dataset
        if (acao === 'vincular') abrirVincular(id, nome, perfil)
        if (acao === 'editar')   abrirEditarUsuario(id)
        if (acao === 'inativar') abrirInativar(id, nome)
        if (acao === 'reativar') reativarUsuario(id, nome)
      })
    })
  }

  const renderPagina = () => {
    const inicio   = (paginaAtualUsuarios - 1) * USUARIOS_POR_PAGINA
    const fim      = inicio + USUARIOS_POR_PAGINA
    const pagina   = listaUsuariosFiltrada.slice(inicio, fim)
    const total    = listaUsuariosFiltrada.length
    const totalPag = Math.ceil(total / USUARIOS_POR_PAGINA)

    const usersBody = document.getElementById('users-body')
    usersBody.innerHTML = pagina.map(u => userRowHTML(u, perfilCores)).join('') ||
      '<div class="panel-empty-sa">Nenhum usuário encontrado</div>'
    bindAcoes(usersBody)

    // Contador
    document.getElementById('users-count').textContent =
      `${total} resultado${total !== 1 ? 's' : ''}`

    // Paginação
    const pagEl = document.getElementById('users-paginacao')
    if (totalPag <= 1) { pagEl.innerHTML = ''; return }

    pagEl.innerHTML = ''

    // Info
    const info = document.createElement('span')
    info.style.cssText = 'font-size:12px;color:var(--n-400)'
    info.textContent   = `Página ${paginaAtualUsuarios} de ${totalPag} · ${total} usuários`
    pagEl.appendChild(info)

    // Botões
    const btns = document.createElement('div')
    btns.style.cssText = 'display:flex;gap:6px'

    const mkBtn = (label, disabled, onClick) => {
      const b = document.createElement('button')
      b.textContent  = label
      b.disabled     = disabled
      b.style.cssText = `
        padding:5px 12px;border-radius:var(--radius-md);
        border:1.5px solid ${disabled ? 'var(--n-200)' : 'var(--p-300)'};
        background:${disabled ? 'var(--n-50)' : 'var(--p-50)'};
        color:${disabled ? 'var(--n-300)' : 'var(--p-700)'};
        font-size:12px;font-weight:600;cursor:${disabled ? 'not-allowed' : 'pointer'};
        font-family:var(--font-sans);transition:all .12s;
      `
      if (!disabled) b.addEventListener('click', onClick)
      return b
    }

    btns.appendChild(mkBtn('← Anterior', paginaAtualUsuarios === 1, () => {
      paginaAtualUsuarios--; renderPagina()
    }))

    // Páginas numeradas (máximo 5 visíveis)
    const inicio2 = Math.max(1, paginaAtualUsuarios - 2)
    const fim2    = Math.min(totalPag, inicio2 + 4)
    for (let i = inicio2; i <= fim2; i++) {
      const atual = i === paginaAtualUsuarios
      const nb = mkBtn(String(i), false, () => { paginaAtualUsuarios = i; renderPagina() })
      if (atual) {
        nb.style.background   = 'var(--p-600)'
        nb.style.color        = '#fff'
        nb.style.borderColor  = 'var(--p-600)'
        nb.style.cursor       = 'default'
      }
      btns.appendChild(nb)
    }

    btns.appendChild(mkBtn('Próxima →', paginaAtualUsuarios === totalPag, () => {
      paginaAtualUsuarios++; renderPagina()
    }))

    pagEl.appendChild(btns)
  }

  renderPagina()

  // Filtros — reseta para página 1 ao filtrar
  const filtrar = () => {
    const q    = document.getElementById('busca-user').value.toLowerCase()
    const perf = document.getElementById('filtro-perfil').value
    listaUsuariosFiltrada = lista.filter(u =>
      (!q    || u.nome.toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)) &&
      (!perf || u.perfil === perf))
    paginaAtualUsuarios = 1
    renderPagina()
  }

  document.getElementById('busca-user')?.addEventListener('input', filtrar)
  document.getElementById('filtro-perfil')?.addEventListener('change', filtrar)
}

function userRowHTML(u, cores) {
  const cfg      = cores[u.perfil] || { bg:'#F8FAFC', color:'#64748B' }
  const iniciais = u.nome.split(' ').map(n => n[0]).slice(0,2).join('')
  const condo    = u.condominios?.nome || '—'
  const isMe     = u.auth_id === usuarioLogado?.auth_id
  const inativo  = u.status !== 'ativo'

  const perfilLabel = {
    superadmin: 'Super Admin',
    admin:      'Síndico',
    porteiro:   'Porteiro',
    morador:    'Morador',
  }

  return `
    <div class="panel-row-sa" style="${inativo ? 'opacity:.55' : ''}">
      <div class="panel-avatar-sa" style="background:${cfg.bg};color:${cfg.color}">${iniciais}</div>
      <div class="panel-row-info-sa">
        <div class="panel-row-name-sa">${u.nome}</div>
        <div class="panel-row-sub-sa">${u.email || '—'} · ${condo}</div>
      </div>

      <!-- Badge de perfil legível -->
      <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;
                   background:${cfg.bg};color:${cfg.color};white-space:nowrap;flex-shrink:0">
        ${perfilLabel[u.perfil] || u.perfil}
      </span>

      <!-- Badge de status -->
      <span style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:99px;
                   background:${inativo ? '#F4F4F5' : '#F0FDF4'};
                   color:${inativo ? '#A1A1AA' : '#166534'};
                   white-space:nowrap;flex-shrink:0">
        ${inativo ? 'Inativo' : 'Ativo'}
      </span>

      <!-- Ações (ocultas para o próprio usuário logado) -->
      ${!isMe ? `
        <div style="display:flex;gap:5px;flex-shrink:0">
          <!-- Amarelo: vincular condomínios -->
          <button class="sa-btn-acao"
                  data-acao="vincular" data-id="${u.id}" data-nome="${u.nome.replace(/"/g,'&quot;')}" data-perfil="${u.perfil}"
                  title="Vincular condomínios"
                  style="width:28px;height:28px;border-radius:7px;border:none;cursor:pointer;
                         background:#FEF3C7;color:#92400E;display:flex;align-items:center;
                         justify-content:center;transition:background .12s;flex-shrink:0"
                  onmouseenter="this.style.background='#FDE68A'"
                  onmouseleave="this.style.background='#FEF3C7'">
            <svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke="currentColor"
                 style="width:13px;height:13px">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </button>
          <!-- Azul: visualizar / editar -->
          <button class="sa-btn-acao"
                  data-acao="editar" data-id="${u.id}"
                  title="Visualizar / Editar perfil"
                  style="width:28px;height:28px;border-radius:7px;border:none;cursor:pointer;
                         background:#EFF6FF;color:#1D4ED8;display:flex;align-items:center;
                         justify-content:center;transition:background .12s;flex-shrink:0"
                  onmouseenter="this.style.background='#DBEAFE'"
                  onmouseleave="this.style.background='#EFF6FF'">
            <svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke="currentColor"
                 style="width:13px;height:13px">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <!-- Vermelho: inativar / Verde: reativar -->
          ${!inativo ? `
          <button class="sa-btn-acao"
                  data-acao="inativar" data-id="${u.id}" data-nome="${u.nome.replace(/"/g,'&quot;')}"
                  title="Inativar usuário"
                  style="width:28px;height:28px;border-radius:7px;border:none;cursor:pointer;
                         background:#FEF2F2;color:#DC2626;display:flex;align-items:center;
                         justify-content:center;transition:background .12s;flex-shrink:0"
                  onmouseenter="this.style.background='#FECACA'"
                  onmouseleave="this.style.background='#FEF2F2'">
            <svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke="currentColor"
                 style="width:13px;height:13px">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15" stroke-linecap="round"/>
              <line x1="9" y1="9" x2="15" y2="15" stroke-linecap="round"/>
            </svg>
          </button>` : `
          <button class="sa-btn-acao"
                  data-acao="reativar" data-id="${u.id}" data-nome="${u.nome.replace(/"/g,'&quot;')}"
                  title="Reativar usuário"
                  style="width:28px;height:28px;border-radius:7px;border:none;cursor:pointer;
                         background:#F0FDF4;color:#166534;display:flex;align-items:center;
                         justify-content:center;transition:background .12s;flex-shrink:0"
                  onmouseenter="this.style.background='#BBF7D0'"
                  onmouseleave="this.style.background='#F0FDF4'">
            <svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke="currentColor"
                 style="width:13px;height:13px">
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" stroke-linecap="round"/>
            </svg>
          </button>`}
        </div>` : ''}
    </div>`
}

// ── Vincular condomínios (amarelo) ────────────────────────────
let vincularUsuarioId = null

async function abrirVincular(userId, nome, perfil) {
  vincularUsuarioId = userId
  const perfilLabel = { superadmin:'Super Admin', admin:'Síndico', porteiro:'Porteiro', morador:'Morador' }
  const iniciais = nome.split(' ').map(n => n[0]).slice(0,2).join('')

  document.getElementById('vinc-avatar').textContent  = iniciais
  document.getElementById('vinc-nome').textContent    = nome
  document.getElementById('vinc-perfil-label').textContent = perfilLabel[perfil] || perfil
  document.getElementById('vinc-err').style.display   = 'none'

  // Carrega condomínios já vinculados (tabela usuario_condominios)
  const [{ data: vinculos }, { data: condos }] = await Promise.all([
    db.from('usuario_condominios')
      .select('condominio_id, condominios(nome)')
      .eq('usuario_id', userId),
    db.from('condominios')
      .select('id, nome')
      .eq('status', 'ativo')
      .order('nome'),
  ])

  // Lista de vinculados
  const listaEl = document.getElementById('vinc-lista')
  const vincIds = new Set((vinculos || []).map(v => v.condominio_id))

  if (!vinculos?.length) {
    listaEl.innerHTML = '<div style="padding:12px 16px;font-size:13px;color:var(--n-400)">Nenhum condomínio vinculado</div>'
  } else {
    listaEl.innerHTML = (vinculos || []).map((v, i) => {
      const borda = i < vinculos.length - 1 ? 'border-bottom:1px solid var(--n-100);' : ''
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;
                    padding:9px 14px;${borda}">
          <span style="font-size:13px;font-weight:600;color:var(--n-900)">${v.condominios?.nome || '—'}</span>
          <button onclick="removerVinculo('${userId}','${v.condominio_id}', this)"
                  style="font-size:11px;color:#DC2626;background:#FEF2F2;border:none;
                         border-radius:6px;padding:3px 8px;cursor:pointer;font-family:var(--font-sans);
                         font-weight:600">
            Remover
          </button>
        </div>`
    }).join('')
  }

  // Popula select com condos ainda não vinculados
  const select = document.getElementById('vinc-select')
  select.innerHTML = '<option value="">Selecione um condomínio...</option>' +
    (condos || [])
      .filter(c => !vincIds.has(c.id))
      .map(c => `<option value="${c.id}">${c.nome}</option>`)
      .join('')

  document.getElementById('modal-vincular').classList.add('open')
}

async function salvarVinculo() {
  const condoId = document.getElementById('vinc-select').value
  limparErro('vinc-err')
  if (!condoId) { mostrarErro('vinc-err', 'Selecione um condomínio.'); return }

  const { error } = await db.from('usuario_condominios').insert({
    usuario_id:    vincularUsuarioId,
    condominio_id: condoId,
  })

  if (error) {
    mostrarErro('vinc-err', 'Erro ao vincular. Tente novamente.')
    return
  }
  // Reabre o modal com dados atualizados
  const nome   = document.getElementById('vinc-nome').textContent
  const perfil = document.getElementById('vinc-perfil-label').textContent
  fecharModal()
  setTimeout(() => abrirVincular(vincularUsuarioId, nome, perfil), 150)
}

async function removerVinculo(userId, condoId, btn) {
  btn.disabled = true
  btn.textContent = '...'
  const { error } = await db.from('usuario_condominios')
    .delete()
    .eq('usuario_id', userId)
    .eq('condominio_id', condoId)
  if (!error) {
    btn.closest('div').remove()
  } else {
    btn.disabled = false
    btn.textContent = 'Remover'
  }
}

// ── Editar perfil do usuário (azul) ──────────────────────────
let editUsuarioId = null

async function abrirEditarUsuario(userId) {
  const { data: u } = await db
    .from('usuarios')
    .select('id, nome, email, telefone, perfil')
    .eq('id', userId)
    .single()

  if (!u) return
  editUsuarioId = userId

  document.getElementById('edit-user-titulo').textContent = `Editar — ${u.nome}`
  document.getElementById('edit-user-nome').value         = u.nome   || ''
  document.getElementById('edit-user-email').value        = u.email  || ''
  document.getElementById('edit-user-tel').value          = u.telefone || ''
  document.getElementById('edit-user-perfil').value       = u.perfil || 'morador'
  limparTodosErros('err-edit-user-nome', 'err-edit-user-email')
  aplicarMascaraTelefone('edit-user-tel')

  document.getElementById('modal-editar-usuario').classList.add('open')
}

async function salvarEdicaoUsuario() {
  limparTodosErros('err-edit-user-nome', 'err-edit-user-email')
  const nome   = document.getElementById('edit-user-nome').value.trim()
  const email  = document.getElementById('edit-user-email').value.trim()
  const tel    = document.getElementById('edit-user-tel').value.trim()
  const perfil = document.getElementById('edit-user-perfil').value
  let ok = true

  if (!nome)                { mostrarErro('err-edit-user-nome',  'Informe o nome.'); ok = false }
  if (!isEmailValido(email)){ mostrarErro('err-edit-user-email', 'E-mail inválido.'); ok = false }
  if (!ok) return

  const btn = document.getElementById('btn-salvar-edit-user')
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  const { error } = await db
    .from('usuarios')
    .update({ nome, email, telefone: tel, perfil })
    .eq('id', editUsuarioId)

  if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar alterações' }

  if (error) {
    mostrarErro('err-edit-user-nome', 'Erro ao salvar. Tente novamente.')
    return
  }

  fecharModal()
  mostrarToast('Perfil atualizado com sucesso!')
  // Se editou o próprio usuário logado, invalida o cache
  if (editUsuarioId === usuarioLogado?.id) invalidarCacheUsuario()
  renderTab(tabAtiva)
}

// ── Inativar usuário (vermelho) ───────────────────────────────
let inativarUsuarioId   = null
let inativarUsuarioNome = null

function abrirInativar(userId, nome) {
  inativarUsuarioId   = userId
  inativarUsuarioNome = nome
  document.getElementById('inativ-nome').textContent = nome
  document.getElementById('modal-inativar').classList.add('open')
}

async function confirmarInativacao() {
  const btn = document.getElementById('btn-confirmar-inativ')
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  const { error } = await db
    .from('usuarios')
    .update({ status: 'inativo' })
    .eq('id', inativarUsuarioId)

  if (btn) { btn.disabled = false; btn.innerHTML = 'Inativar usuário' }

  if (error) {
    mostrarToast('Erro ao inativar. Tente novamente.', 'erro')
    return
  }

  fecharModal()
  mostrarToast(`${inativarUsuarioNome} foi inativado.`, 'aviso')
  renderTab(tabAtiva)
}

async function reativarUsuario(userId, nome) {
  const { error } = await db
    .from('usuarios')
    .update({ status: 'ativo' })
    .eq('id', userId)

  if (error) { mostrarToast('Erro ao reativar. Tente novamente.', 'erro'); return }
  mostrarToast(`${nome} foi reativado!`)
  renderTab(tabAtiva)
}

// ── Reset de senha ────────────────────────────────────────────
let resetUsuarioId   = null
let resetUsuarioNome = null
let resetAuthId      = null

function abrirResetSenha(userId, nome, authId) {
  resetUsuarioId   = userId
  resetUsuarioNome = nome
  resetAuthId      = authId
  document.getElementById('reset-nome').textContent = nome
  document.getElementById('reset-nova').value    = ''
  document.getElementById('reset-confirma').value = ''
  document.getElementById('reset-resultado').style.display = 'none'
  limparTodosErros('err-reset-nova','err-reset-confirma')
  document.getElementById('modal-reset').classList.add('open')
}

async function salvarResetSenha(e) {
  e.preventDefault()
  limparTodosErros('err-reset-nova','err-reset-confirma')

  const nova     = document.getElementById('reset-nova').value
  const confirma = document.getElementById('reset-confirma').value
  let ok = true

  if (nova.length < 6)    { mostrarErro('err-reset-nova',    'Mínimo 6 caracteres.'); ok = false }
  if (nova !== confirma)  { mostrarErro('err-reset-confirma','Senhas não coincidem.'); ok = false }
  if (!ok) return

  const btn = e.submitter
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  try {
    // Usa a Edge Function reset-senha (service_role fica segura no backend)
    const { data, error } = await db.functions.invoke('reset-senha', {
      body: { auth_id: resetAuthId, nova_senha: nova },
    })

    if (error || data?.error) {
      const msg = data?.error || error?.message || 'Erro ao resetar senha.'
      mostrarErro('err-reset-nova', msg)
      if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar nova senha' }
      return
    }

    // Sucesso
    document.getElementById('reset-form').style.display      = 'none'
    document.getElementById('reset-resultado').style.display = 'block'
    document.getElementById('reset-resultado').innerHTML = `
      <div style="text-align:center;padding:16px 0">
        <div style="width:56px;height:56px;background:#F0FDF4;border-radius:50%;
                    display:flex;align-items:center;justify-content:center;margin:0 auto 14px">
          <svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round"
               stroke-linejoin="round" fill="none" stroke="#16A34A" style="width:28px;height:28px">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <div style="font-size:16px;font-weight:700;color:var(--n-900);margin-bottom:6px">Senha alterada!</div>
        <div style="font-size:13px;color:var(--n-500);margin-bottom:18px">
          A nova senha de <strong>${resetUsuarioNome}</strong> foi definida com sucesso.
        </div>
        <button onclick="fecharModal()" class="ct-btn-primary" style="width:auto;padding:9px 24px">Fechar</button>
      </div>`

  } catch (err) {
    console.error('Erro inesperado ao resetar senha:', err)
    mostrarErro('err-reset-nova', 'Erro inesperado. Tente novamente.')
    if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar nova senha' }
  }
}

// ── RELATÓRIOS ────────────────────────────────────────────────
async function renderRelatorios(body) {
  body.innerHTML = `<div style="text-align:center;padding:40px;color:var(--n-400)">Carregando relatórios...</div>`

  const hoje      = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString()

  const [condos, users, entregas] = await Promise.all([
    db.from('condominios').select('id, nome, status, total_aptos, cidade, uf'),
    db.from('usuarios').select('id, perfil, status, condominio_id'),
    db.from('entregas').select('id, status, recebido_em, condominio_id'),
  ])

  const condoData   = condos.data   || []
  const userData    = users.data    || []
  const entregaData = entregas.data || []

  const entMes  = entregaData.filter(e => e.recebido_em >= inicioMes)
  const eAguar  = entregaData.filter(e => ['aguardando','notificado'].includes(e.status))
  const eRetir  = entregaData.filter(e => e.status === 'retirado')

  // Entregas por condomínio (top 5)
  const entPorCondo = {}
  entregaData.forEach(e => { entPorCondo[e.condominio_id] = (entPorCondo[e.condominio_id] || 0) + 1 })
  const topCondos = condoData
    .map(c => ({ ...c, totalEntregas: entPorCondo[c.id] || 0 }))
    .sort((a, b) => b.totalEntregas - a.totalEntregas)
    .slice(0, 5)

  const maxEntregas = Math.max(...topCondos.map(c => c.totalEntregas), 1)

  const bar = (v, max, color = 'var(--p-500)') =>
    `<div style="height:8px;border-radius:99px;background:var(--n-100);overflow:hidden;margin-top:4px;flex:1">
       <div style="height:100%;width:${Math.round(v/max*100)}%;background:${color};border-radius:99px;
                   transition:width .4s ease"></div>
     </div>`

  body.innerHTML = `
    <!-- Stats globais -->
    <div class="stats-grid" style="margin-bottom:20px">
      ${statCard(condoData.filter(c=>c.status==='ativo').length,   'Condomínios ativos',  '#EDE9FE','#5B21B6', iconPredio())}
      ${statCard(userData.filter(u=>u.perfil==='morador').length,  'Moradores totais',    '#EFF6FF','#1D4ED8', iconPessoas())}
      ${statCard(entMes.length,                                    'Entregas este mês',   '#FEF3C7','#92400E', iconCaixa())}
      ${statCard(eAguar.length,                                    'Pendentes agora',     '#FEF2F2','#991B1B', iconAlerta())}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">

      <!-- Condomínios com mais entregas -->
      <div class="panel-card-sa">
        <div class="panel-card-sa-head">
          <span class="panel-card-sa-title">Condomínios — entregas totais</span>
        </div>
        <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
          ${topCondos.map(c => `
            <div>
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:2px">
                <span style="font-weight:600;color:var(--n-900)">${_escaparHTMLsa(c.nome)}</span>
                <span style="color:var(--n-500)">${c.totalEntregas}</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                ${bar(c.totalEntregas, maxEntregas)}
              </div>
            </div>`).join('') || '<div style="font-size:12px;color:var(--n-400)">Sem dados</div>'}
        </div>
      </div>

      <!-- Usuários por perfil -->
      <div class="panel-card-sa">
        <div class="panel-card-sa-head">
          <span class="panel-card-sa-title">Usuários por perfil</span>
          <span style="font-size:11px;color:var(--n-400)">${userData.length} total</span>
        </div>
        <div style="padding:16px;display:flex;flex-direction:column;gap:12px">
          ${[
            ['Super Admin', 'superadmin', '#EDE9FE','#5B21B6'],
            ['Síndicos',    'admin',      '#F3E8FF','#6D28D9'],
            ['Porteiros',   'porteiro',   '#EFF6FF','#1D4ED8'],
            ['Moradores',   'morador',    '#F0FDFA','#0F766E'],
          ].map(([l, p, bg, c]) => {
            const qtd   = userData.filter(u => u.perfil === p).length
            const ativos = userData.filter(u => u.perfil === p && u.status === 'ativo').length
            return `
              <div>
                <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px">
                  <span style="font-weight:600;color:var(--n-900)">${l}</span>
                  <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;
                               background:${bg};color:${c}">${qtd}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                  ${bar(ativos, qtd || 1, c)}
                  <span style="font-size:11px;color:var(--n-400);white-space:nowrap">${ativos} ativos</span>
                </div>
              </div>`
          }).join('')}
        </div>
      </div>
    </div>

    <!-- Resumo de condomínios -->
    <div class="panel-card-sa">
      <div class="panel-card-sa-head">
        <span class="panel-card-sa-title">Todos os condomínios</span>
        <span style="font-size:11px;color:var(--n-400)">${condoData.length} cadastrados</span>
      </div>
      <div>
        ${condoData.map((c, i) => {
          const moradores  = userData.filter(u => u.condominio_id === c.id && u.perfil === 'morador').length
          const porteiros  = userData.filter(u => u.condominio_id === c.id && u.perfil === 'porteiro').length
          const entTotal   = entPorCondo[c.id] || 0
          const entPend    = entregaData.filter(e => e.condominio_id === c.id &&
            ['aguardando','notificado'].includes(e.status)).length
          const borda = i < condoData.length - 1 ? 'border-bottom:1px solid var(--n-100);' : ''
          return `
            <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;${borda}">
              <div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;
                          background:${c.status==='ativo'?'#34D399':'#F59E0B'}"></div>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600;color:var(--n-900)">${_escaparHTMLsa(c.nome)}</div>
                <div style="font-size:11px;color:var(--n-500);margin-top:1px">
                  ${_escaparHTMLsa(c.cidade)}/${_escaparHTMLsa(c.uf)} ·
                  ${moradores} morador${moradores!==1?'es':''} ·
                  ${porteiros} porteiro${porteiros!==1?'s':''}
                </div>
              </div>
              <div style="display:flex;gap:8px;flex-shrink:0">
                <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;
                             background:#FEF3C7;color:#92400E">${entPend} pendente${entPend!==1?'s':''}</span>
                <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;
                             background:var(--n-100);color:var(--n-600)">${entTotal} entrega${entTotal!==1?'s':''}</span>
              </div>
            </div>`
        }).join('') || '<div class="panel-empty-sa">Nenhum condomínio cadastrado</div>'}
      </div>
    </div>

    <!-- Resumo global -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:14px">
      ${[
        ['Total de entregas',     entregaData.length],
        ['Retiradas com sucesso', eRetir.length],
        ['Taxa de retirada',      entregaData.length ? Math.round(eRetir.length/entregaData.length*100)+'%' : '—'],
        ['Aptos cadastrados',     condoData.reduce((s,c) => s + (c.total_aptos||0), 0)],
      ].map(([l,v]) => `
        <div style="background:var(--n-0);border:1px solid var(--n-200);
                    border-radius:var(--radius-lg);padding:14px 16px">
          <div style="font-size:22px;font-weight:700;color:var(--n-900)">${v}</div>
          <div style="font-size:12px;color:var(--n-500);margin-top:3px">${l}</div>
        </div>`).join('')}
    </div>
  `
}

// ── ALERTAS DE ATUALIZAÇÃO ────────────────────────────────────
async function renderAlertas(body) {
  const { data: alertas } = await db
    .from('alertas_sistema')
    .select('id, versao, titulo, descricao, tipo, ativo, criado_em')
    .order('criado_em', { ascending: false })

  const lista = alertas || []

  const TIPO_CFG = {
    info:    { label: 'Atualização', bg: 'var(--p-100)',  color: 'var(--p-700)' },
    aviso:   { label: 'Aviso',       bg: '#FEF3C7',       color: '#92400E'       },
    critico: { label: 'Crítico',     bg: '#FEF2F2',       color: '#DC2626'       },
  }

  body.innerHTML = `
    <div style="max-width:680px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--n-900)">Alertas de atualização</div>
          <div style="font-size:12px;color:var(--n-500);margin-top:2px">
            Gerencie os alertas exibidos a todos os usuários do sistema
          </div>
        </div>
        <button id="btn-novo-alerta"
                style="display:flex;align-items:center;gap:6px;
                       background:var(--p-600);color:#fff;border:none;
                       border-radius:var(--radius-md);padding:8px 16px;
                       font-size:12px;font-weight:600;cursor:pointer;
                       font-family:var(--font-sans);
                       box-shadow:0 2px 8px rgba(124,58,237,.35);
                       transition:background .15s">
          <svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" fill="none"
               stroke="currentColor" style="width:13px;height:13px">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Novo alerta
        </button>
      </div>

      ${lista.length === 0
        ? `<div class="panel-card-sa" style="padding:40px;text-align:center;color:var(--n-400)">
             Nenhum alerta criado ainda.
           </div>`
        : lista.map(a => {
            const cfg  = TIPO_CFG[a.tipo] || TIPO_CFG.info
            const data = new Date(a.criado_em).toLocaleDateString('pt-BR')
            return `
              <div class="panel-card-sa" style="margin-bottom:10px;${!a.ativo ? 'opacity:.55' : ''}">
                <div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px">
                  <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
                      <span style="font-size:14px;font-weight:700;color:var(--n-900)">${_escaparHTMLsa(a.titulo)}</span>
                      <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;
                                   background:${cfg.bg};color:${cfg.color}">${cfg.label}</span>
                      <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:99px;
                                   background:var(--p-50);color:var(--p-700)">v${_escaparHTMLsa(a.versao)}</span>
                      ${!a.ativo
                        ? `<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:99px;
                                        background:var(--n-100);color:var(--n-500)">Inativo</span>`
                        : `<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:99px;
                                        background:#F0FDF4;color:#166534">Ativo</span>`}
                    </div>
                    <div style="font-size:12px;color:var(--n-500);line-height:1.5;
                                white-space:pre-line;margin-bottom:6px">${_escaparHTMLsa(a.descricao)}</div>
                    <div style="font-size:11px;color:var(--n-400)">Criado em ${data}</div>
                  </div>
                  <div style="display:flex;gap:6px;flex-shrink:0;margin-top:2px">
                    <button data-alerta-preview="${a.id}"
                            title="Visualizar pop-up"
                            style="width:28px;height:28px;border-radius:7px;border:none;cursor:pointer;
                                   background:var(--p-100);color:var(--p-700);display:flex;
                                   align-items:center;justify-content:center">
                      <svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke="currentColor"
                           style="width:13px;height:13px">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    </button>
                    <button data-alerta-toggle="${a.id}" data-ativo="${a.ativo}"
                            title="${a.ativo ? 'Desativar' : 'Ativar'}"
                            style="width:28px;height:28px;border-radius:7px;border:none;cursor:pointer;
                                   background:${a.ativo ? '#FEF3C7' : '#F0FDF4'};
                                   color:${a.ativo ? '#92400E' : '#166534'};display:flex;
                                   align-items:center;justify-content:center">
                      <svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke="currentColor"
                           style="width:13px;height:13px">
                        ${a.ativo
                          ? '<path d="M18 6 6 18M6 6l12 12" stroke-linecap="round"/>'
                          : '<polyline points="20 6 9 17 4 12"/>'}
                      </svg>
                    </button>
                    <button data-alerta-del="${a.id}"
                            title="Excluir alerta"
                            style="width:28px;height:28px;border-radius:7px;border:none;cursor:pointer;
                                   background:#FEF2F2;color:#DC2626;display:flex;
                                   align-items:center;justify-content:center">
                      <svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke="currentColor"
                           style="width:13px;height:13px">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        <path d="M10 11v6M14 11v6"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>`
          }).join('')
      }
    </div>
  `

  // Bind botão novo alerta
  document.getElementById('btn-novo-alerta')
    ?.addEventListener('click', () => abrirModalAlerta())

  // Bind ações dos alertas existentes
  body.querySelectorAll('[data-alerta-preview]').forEach(btn =>
    btn.addEventListener('click', () => {
      const a = lista.find(x => x.id === btn.dataset.alertaPreview)
      if (a) exibirAlerta(a, new Set(), () => {})
    })
  )
  body.querySelectorAll('[data-alerta-toggle]').forEach(btn =>
    btn.addEventListener('click', () =>
      toggleAlerta(btn.dataset.alertaToggle, btn.dataset.ativo === 'true')
    )
  )
  body.querySelectorAll('[data-alerta-del]').forEach(btn =>
    btn.addEventListener('click', () => deletarAlerta(btn.dataset.alertaDel))
  )
}

function _escaparHTMLsa(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// ── Modal novo alerta ─────────────────────────────────────────
function abrirModalAlerta() {
  document.getElementById('modal-alerta').classList.add('open')
  document.getElementById('alerta-titulo').value   = ''
  document.getElementById('alerta-versao').value   = ''
  document.getElementById('alerta-tipo').value     = 'info'
  document.getElementById('alerta-descricao').value= ''
  limparTodosErros('err-alerta-titulo','err-alerta-versao','err-alerta-desc')
}

async function salvarAlerta() {
  limparTodosErros('err-alerta-titulo','err-alerta-versao','err-alerta-desc')
  const titulo    = document.getElementById('alerta-titulo').value.trim()
  const versao    = document.getElementById('alerta-versao').value.trim()
  const tipo      = document.getElementById('alerta-tipo').value
  const descricao = document.getElementById('alerta-descricao').value.trim()
  let ok = true

  if (!titulo)    { mostrarErro('err-alerta-titulo', 'Informe o título.'); ok = false }
  if (!versao)    { mostrarErro('err-alerta-versao', 'Informe a versão (ex: 1.2.0).'); ok = false }
  if (!descricao) { mostrarErro('err-alerta-desc',   'Informe a descrição.'); ok = false }
  if (!ok) return

  const btn = document.getElementById('btn-salvar-alerta')
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  const { error } = await db.from('alertas_sistema').insert({
    titulo, versao, tipo, descricao,
    ativo:      true,
    criado_por: usuarioLogado.id,
  })

  if (btn) { btn.disabled = false; btn.innerHTML = 'Publicar alerta' }

  if (error) {
    mostrarErro('err-alerta-titulo', 'Erro ao criar alerta. Tente novamente.')
    return
  }

  fecharModal()
  mostrarToast('Alerta publicado! Todos os usuários verão ao entrar.')
  mudarTab('alertas')
}

async function toggleAlerta(id, ativoAtual) {
  const { error } = await db
    .from('alertas_sistema')
    .update({ ativo: !ativoAtual })
    .eq('id', id)

  if (error) { mostrarToast('Erro ao atualizar alerta.', 'erro'); return }
  mostrarToast(ativoAtual ? 'Alerta desativado.' : 'Alerta ativado!', ativoAtual ? 'aviso' : 'sucesso')
  mudarTab('alertas')
}

async function deletarAlerta(id) {
  if (!confirm('Excluir este alerta permanentemente?')) return
  const { error } = await db.from('alertas_sistema').delete().eq('id', id)
  if (error) { mostrarToast('Erro ao excluir alerta.', 'erro'); return }
  mostrarToast('Alerta excluído.')
  mudarTab('alertas')
}

// ── EQUIPE INTERNA ────────────────────────────────────────────
async function renderEquipe(body) {
  const { data } = await db
    .from('usuarios')
    .select('*')
    .eq('perfil', 'superadmin')
    .order('criado_em')

  const lista = data || []

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:240px 1fr;gap:14px">
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--n-400);margin-bottom:10px">Super Admins</div>
        <div style="display:flex;flex-direction:column;gap:7px" id="lista-sa">
          ${lista.map(u => {
            const ini = u.nome.split(' ').map(n=>n[0]).slice(0,2).join('')
            const isMe = u.auth_id === usuarioLogado.auth_id
            return `
              <div class="panel-card-sa" style="padding:10px 12px;display:flex;align-items:center;gap:9px">
                <div class="panel-avatar-sa" style="background:#EDE9FE;color:#5B21B6;width:30px;height:30px;font-size:11px">${ini}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:600;color:var(--n-900)">${u.nome}</div>
                  <div style="font-size:10px;color:var(--n-500)">${new Date(u.criado_em).toLocaleDateString('pt-BR')}</div>
                </div>
                ${isMe ? `<span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:99px;background:#F0FDF4;color:#166534">Você</span>` : ''}
              </div>`
          }).join('')}
          <button class="condo-card-add" onclick="abrirModalSA()" style="min-height:60px;border-radius:var(--radius-lg)">
            <div class="add-icon" style="width:26px;height:26px"><svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" fill="none" stroke="#fff"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>
            <div class="add-label" style="font-size:12px">Novo Super Admin</div>
          </button>
        </div>
      </div>

      <div class="panel-card-sa">
        <div class="panel-card-sa-head">
          <span class="panel-card-sa-title">Adicionar Super Admin</span>
        </div>
        <div style="padding:16px">
          <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:var(--radius-md);padding:12px 14px;font-size:12px;color:#92400E;margin-bottom:16px;display:flex;gap:8px;align-items:flex-start">
            <svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke="#92400E" style="width:14px;height:14px;flex-shrink:0;margin-top:1px"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Super Admins têm acesso total ao sistema. Adicione apenas membros confiáveis da sua equipe.
          </div>
          <form id="form-sa" novalidate>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
              <div>
                <label class="ct-label" for="sa-nome">Nome completo</label>
                <input class="ct-input" type="text" id="sa-nome" placeholder="João da Silva" />
                <div class="ct-error" id="err-sa-nome" style="display:none"></div>
              </div>
              <div>
                <label class="ct-label" for="sa-email">E-mail de acesso</label>
                <input class="ct-input" type="email" id="sa-email" placeholder="joao@condotrack.com" />
                <div class="ct-error" id="err-sa-email" style="display:none"></div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
              <div>
                <label class="ct-label" for="sa-senha">Senha temporária</label>
                <input class="ct-input" type="password" id="sa-senha" placeholder="Mínimo 6 caracteres" />
                <div class="ct-error" id="err-sa-senha" style="display:none"></div>
              </div>
              <div>
                <label class="ct-label" for="sa-confirma">Confirmar senha</label>
                <input class="ct-input" type="password" id="sa-confirma" placeholder="Repita a senha" />
                <div class="ct-error" id="err-sa-confirma" style="display:none"></div>
              </div>
            </div>
            <button type="submit" class="ct-btn-primary">
              <svg viewBox="0 0 24 24" stroke-width="2.5" fill="none" stroke="currentColor" style="width:14px;height:14px" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              Criar Super Admin
            </button>
          </form>
        </div>
      </div>
    </div>
  `

  document.getElementById('form-sa')?.addEventListener('submit', salvarSuperAdmin)
}

// ── Salvar Super Admin ────────────────────────────────────────
async function salvarSuperAdmin(e) {
  e.preventDefault()
  limparTodosErros('err-sa-nome','err-sa-email','err-sa-senha','err-sa-confirma')

  const nome    = document.getElementById('sa-nome').value.trim()
  const email   = document.getElementById('sa-email').value.trim()
  const senha   = document.getElementById('sa-senha').value
  const confirma = document.getElementById('sa-confirma').value
  let ok = true

  if (!nome)              { mostrarErro('err-sa-nome',    'Informe o nome.'); ok = false }
  if (!isEmailValido(email)) { mostrarErro('err-sa-email', 'E-mail inválido.'); ok = false }
  if (senha.length < 6)   { mostrarErro('err-sa-senha',   'Mínimo 6 caracteres.'); ok = false }
  if (senha !== confirma) { mostrarErro('err-sa-confirma','Senhas não coincidem.'); ok = false }
  if (!ok) return

  const btn = e.submitter
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  try {
    // 1. Cria no Supabase Auth
    const { data: signUpData, error: signUpError } = await db.auth.signUp({
      email,
      password: senha,
    })

    if (signUpError) {
      mostrarErro('err-sa-email', signUpError.message === 'User already registered'
        ? 'E-mail já cadastrado.' : signUpError.message)
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" stroke-width="2.5" fill="none" stroke="currentColor" style="width:14px;height:14px" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Criar Super Admin' }
      return
    }

    const userId = signUpData.user?.id ?? signUpData.session?.user?.id
    if (!userId) {
      mostrarErro('err-sa-email', 'Confirme o e-mail antes de continuar.')
      if (btn) { btn.disabled = false; btn.innerHTML = 'Criar Super Admin' }
      return
    }

    // 2. Insere na tabela usuarios como superadmin
    const { error: dbError } = await db.from('usuarios').insert({
      auth_id: userId,
      perfil:  'superadmin',
      nome,
      status:  'ativo',
    })

    if (dbError) {
      mostrarErro('err-sa-nome', 'Erro ao salvar usuário: ' + dbError.message)
      if (btn) { btn.disabled = false; btn.innerHTML = 'Criar Super Admin' }
      return
    }

    // 3. Recarrega a aba
    await renderEquipe(document.getElementById('tab-body'))

  } catch (err) {
    console.error(err)
    mostrarErro('err-sa-email', 'Erro ao criar usuário.')
    if (btn) { btn.disabled = false; btn.innerHTML = 'Criar Super Admin' }
  }
}

// ── Toast de feedback ─────────────────────────────────────────
function mostrarToast(msg, tipo = 'sucesso') {
  const cores = {
    sucesso: { bg: '#F0FDF4', border: '#BBF7D0', color: '#166534', icon: '✓' },
    erro:    { bg: '#FEF2F2', border: '#FECACA', color: '#991B1B', icon: '✕' },
    aviso:   { bg: '#FFFBEB', border: '#FDE68A', color: '#92400E', icon: '!' },
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

// ── Modal: novo/editar condomínio ─────────────────────────────
function acessarPainelCondo(condoId, condoNome) {
  sessionStorage.setItem('sa_impersonate_condo_id',   condoId)
  sessionStorage.setItem('sa_impersonate_condo_nome', condoNome)
  window.location.href = 'admin.html'
}

function abrirModalNovo() {
  condominioEditando = null
  document.getElementById('modal-title').textContent = 'Novo condomínio'
  document.getElementById('form-condo').reset()
  limparTodosErros('err-nome-c','err-end-c','err-sindico','err-email-s','err-cnpj')
  document.getElementById('modal-condo').classList.add('open')
  // Reseta modo após abrir para garantir que os elementos existem no DOM
  setTimeout(() => {
    alternarModoApto('auto')
    const preview = document.getElementById('preview-aptos')
    if (preview) preview.style.display = 'none'
  }, 50)
}

async function editarCondo(id) {
  const { data } = await db.from('condominios').select('*').eq('id', id).single()
  if (!data) return
  condominioEditando = id
  document.getElementById('modal-title').textContent = 'Editar condomínio'
  document.getElementById('c-nome').value   = data.nome
  document.getElementById('c-end').value    = data.endereco
  document.getElementById('c-cidade').value = data.cidade
  document.getElementById('c-uf').value     = data.uf
  document.getElementById('c-cep').value    = data.cep || ''
  document.getElementById('c-blocos').value = data.blocos
  document.getElementById('c-aptos').value  = data.total_aptos
  document.getElementById('modal-condo').classList.add('open')
}

async function abrirModalSA() {
  // Se já está na aba equipe, só rola até o formulário
  if (tabAtiva === 'equipe') {
    const form = document.getElementById('form-sa')
    if (form) {
      form.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => document.getElementById('sa-nome')?.focus(), 350)
    }
    return
  }
  // Caso contrário, navega para a aba e depois foca
  await mudarTab('equipe')
  setTimeout(() => {
    const form = document.getElementById('form-sa')
    if (form) {
      form.scrollIntoView({ behavior: 'smooth', block: 'center' })
      document.getElementById('sa-nome')?.focus()
    }
  }, 150)
}

function fecharModal() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'))
}

async function salvarCondo(e) {
  e.preventDefault()
  limparTodosErros('err-nome-c','err-end-c','err-sindico','err-email-s','err-cnpj')

  const nome    = document.getElementById('c-nome').value.trim()
  const cnpj    = document.getElementById('c-cnpj')?.value.trim() || ''
  const razao   = document.getElementById('c-razao')?.value.trim() || ''
  const end     = document.getElementById('c-end').value.trim()
  const cidade  = document.getElementById('c-cidade').value.trim()
  const uf      = document.getElementById('c-uf').value.trim()
  const cep     = document.getElementById('c-cep').value.trim()
  const torres  = parseInt(document.getElementById('c-blocos').value) || 1
  const aptos   = parseInt(document.getElementById('c-aptos').value)  || 0
  const sindico = document.getElementById('c-sindico')?.value.trim() || ''
  const emailS  = document.getElementById('c-email-s')?.value.trim() || ''

  let ok = true
  if (!nome) { mostrarErro('err-nome-c', 'Informe o nome.'); ok = false }
  if (!end)  { mostrarErro('err-end-c',  'Informe o endereço.'); ok = false }
  if (!condominioEditando && !sindico)               { mostrarErro('err-sindico',  'Informe o síndico.'); ok = false }
  if (!condominioEditando && !isEmailValido(emailS)) { mostrarErro('err-email-s', 'E-mail inválido.'); ok = false }
  if (!ok) return

  const btn = document.querySelector('#modal-condo .ct-btn-primary[type="submit"]')
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  try {
    if (condominioEditando) {
      await db.from('condominios').update({
        nome, cnpj: cnpj || null, razao_social: razao || null,
        endereco: end, cidade, uf, cep, blocos: torres, total_aptos: aptos
      }).eq('id', condominioEditando)
    } else {
      // Cria o condomínio
      const { data: novoCondo, error: errCondo } = await db
        .from('condominios')
        .insert({
          nome, cnpj: cnpj || null, razao_social: razao || null,
          endereco: end, cidade, uf, cep,
          blocos: torres, total_aptos: aptos, status: 'ativo'
        })
        .select('id').single()

      if (errCondo || !novoCondo) {
        mostrarErro('err-nome-c', 'Erro ao criar condomínio.')
        if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar condomínio' }
        return
      }

      const condoId = novoCondo.id

      // Gera apartamentos conforme modo selecionado
      let listaAptos = []

      if (modoApto === 'auto') {
        const andares    = parseInt(document.getElementById('c-andares')?.value) || 0
        const porAndar   = parseInt(document.getElementById('c-aptos-andar')?.value) || 0
        const numInicial = parseInt(document.getElementById('c-num-inicial')?.value) ?? 1
        const formato    = document.getElementById('c-formato')?.value || 'numerico'
        if (andares && porAndar) {
          listaAptos = gerarListaAptos(torres, andares, porAndar, numInicial, formato)
        }
      } else {
        const texto = document.getElementById('c-lista-aptos')?.value || ''
        const nums  = texto.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
        listaAptos  = nums.map(n => ({ bloco: 'A', numero: n }))
      }

      // Insere apartamentos em lotes de 50
      if (listaAptos.length > 0) {
        const rows = listaAptos.map(a => ({
          condominio_id: condoId,
          numero: a.numero,
          bloco:  a.bloco,
          status: 'disponivel',
        }))
        for (let i = 0; i < rows.length; i += 50) {
          await db.from('apartamentos').insert(rows.slice(i, i + 50))
        }
      }

      // Cria o síndico com status pendente para completar o cadastro
      await db.from('usuarios').insert({
        condominio_id: condoId,
        perfil:        'admin',
        nome:          sindico,
        email:         emailS,
        status:        'pendente',
      })
    }

    fecharModal()
    mudarTab(tabAtiva)

  } catch (err) {
    console.error('Erro ao salvar condomínio:', err)
    mostrarErro('err-nome-c', 'Erro inesperado. Tente novamente.')
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar condomínio' }
  }
}

async function abrirDetalhe(id) {
  const { data: c } = await db.from('condominios').select('*').eq('id', id).single()
  if (!c) return

  document.getElementById('det-nome').textContent   = c.nome
  document.getElementById('det-status').textContent = statusLabel(c.status)
  document.getElementById('det-status').className   = `status-pill s-${c.status}`
  document.getElementById('det-criado').textContent = new Date(c.criado_em).toLocaleDateString('pt-BR')
  document.getElementById('det-end').textContent    = `${c.endereco}, ${c.cidade} — ${c.uf}`
  document.getElementById('det-blocos').textContent = c.blocos
  document.getElementById('det-aptos').textContent  = c.total_aptos

  // Valores provisórios enquanto carrega
  document.getElementById('det-sindico').textContent = '...'
  document.getElementById('det-email').textContent   = '...'
  document.getElementById('det-mord').textContent    = '...'
  document.getElementById('det-port').textContent    = '...'

  document.getElementById('modal-detalhe').classList.add('open')

  // Busca síndico, moradores e porteiros em paralelo
  const [sindRes, usersRes] = await Promise.all([
    db.from('usuarios')
      .select('nome, email')
      .eq('condominio_id', id)
      .eq('perfil', 'admin')
      .limit(1)
      .single(),
    db.from('usuarios')
      .select('perfil', { count: 'exact' })
      .eq('condominio_id', id)
      .in('perfil', ['morador', 'porteiro']),
  ])

  const sindico  = sindRes.data
  const usuarios = usersRes.data || []

  document.getElementById('det-sindico').textContent =
    sindico?.nome  || '—'
  document.getElementById('det-email').textContent   =
    sindico?.email || '—'
  document.getElementById('det-mord').textContent    =
    usuarios.filter(u => u.perfil === 'morador').length
  document.getElementById('det-port').textContent    =
    usuarios.filter(u => u.perfil === 'porteiro').length
}

// ── Helpers visuais ───────────────────────────────────────────
function statCard(num, label, bg, color, icon) {
  return `
    <div class="stat-card">
      <div class="stat-top">
        <div class="stat-num">${num}</div>
        <div class="stat-icon" style="background:${bg}">${icon}</div>
      </div>
      <div class="stat-label">${label}</div>
      <span class="stat-badge" style="background:${bg};color:${color}">Total</span>
    </div>`
}

function statusBar(label, val, total, color, bg) {
  const pct = total > 0 ? Math.round((val / total) * 100) : 0
  return `
    <div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span style="color:var(--n-600);font-weight:500">${label}</span>
        <span style="color:var(--n-900);font-weight:700">${val}</span>
      </div>
      <div style="height:6px;background:var(--n-100);border-radius:99px;overflow:hidden">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:99px;transition:width .4s ease"></div>
      </div>
    </div>`
}

function quickBtn(label, fn, bg, color) {
  return `
    <button onclick="${fn}" style="width:100%;padding:10px 14px;background:${bg};color:${color};border:none;border-radius:var(--radius-md);font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font-sans);text-align:left;display:flex;align-items:center;justify-content:space-between;transition:opacity .12s"
      onmouseenter="this.style.opacity='.8'" onmouseleave="this.style.opacity='1'">
      ${label}
      <svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke="${color}" style="width:13px;height:13px" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
    </button>`
}

function statusLabel(s) {
  return { ativo:'Ativo', pendente:'Pendente', inativo:'Inativo' }[s] || s
}

function iconPredio()  { return `<svg viewBox="0 0 24 24" stroke="#5B21B6" stroke-width="2" fill="none" style="width:15px;height:15px"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>` }
function iconPessoas() { return `<svg viewBox="0 0 24 24" stroke="#1D4ED8" stroke-width="2" fill="none" style="width:15px;height:15px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>` }
function iconPessoa()  { return `<svg viewBox="0 0 24 24" stroke="#166534" stroke-width="2" fill="none" style="width:15px;height:15px"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>` }
function iconCaixa()   { return `<svg viewBox="0 0 24 24" stroke="#92400E" stroke-width="2" fill="none" style="width:15px;height:15px"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>` }
function iconAlerta()  { return `<svg viewBox="0 0 24 24" stroke="#991B1B" stroke-width="2" fill="none" style="width:15px;height:15px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>` }
function iconAptos()   { return `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" style="width:12px;height:12px"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>` }
function iconRelogio() { return `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none" style="width:12px;height:12px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>` }

function ativarSidebar(item) {
  document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'))
  item.classList.add('active')
}

// ── Configuração de apartamentos ─────────────────────────────
let modoApto = 'auto'

function alternarModoApto(modo) {
  modoApto = modo
  document.getElementById('modo-auto').style.display   = modo === 'auto'   ? 'block' : 'none'
  document.getElementById('modo-manual').style.display = modo === 'manual' ? 'block' : 'none'

  const btnAuto   = document.getElementById('tab-auto')
  const btnManual = document.getElementById('tab-manual')
  if (btnAuto && btnManual) {
    btnAuto.style.background   = modo === 'auto'   ? 'var(--p-100)' : 'var(--n-0)'
    btnAuto.style.color        = modo === 'auto'   ? 'var(--p-700)' : 'var(--n-500)'
    btnAuto.style.borderColor  = modo === 'auto'   ? 'var(--p-300)' : 'var(--n-200)'
    btnManual.style.background = modo === 'manual' ? 'var(--p-100)' : 'var(--n-0)'
    btnManual.style.color      = modo === 'manual' ? 'var(--p-700)' : 'var(--n-500)'
    btnManual.style.borderColor= modo === 'manual' ? 'var(--p-300)' : 'var(--n-200)'
  }
}

function previewApartamentos() {
  const torres   = parseInt(document.getElementById('c-blocos')?.value) || 1
  const andares  = parseInt(document.getElementById('c-andares')?.value) || 0
  const porAndar = parseInt(document.getElementById('c-aptos-andar')?.value) || 0
  const numInicial = parseInt(document.getElementById('c-num-inicial')?.value) ?? 1
  const formato  = document.getElementById('c-formato')?.value || 'numerico'
  const preview  = document.getElementById('preview-aptos')
  const inicio   = document.getElementById('preview-inicio')

  if (inicio) {
    const primeiroNum = formato === 'simples' ? numInicial : (1 * 100) + numInicial
    inicio.textContent = String(primeiroNum)
  }

  if (!preview || !andares || !porAndar) {
    if (preview) preview.style.display = 'none'
    return
  }

  const aptos = gerarListaAptos(torres, andares, porAndar, numInicial, formato)
  const total = aptos.length

  // Atualiza campo total_aptos
  const campoTotal = document.getElementById('c-aptos')
  if (campoTotal) campoTotal.value = total

  // Preview dos primeiros aptos de cada torre
  const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let previewTexto = ''
  for (let t = 0; t < Math.min(torres, 4); t++) {
    const bloco      = torres > 1 ? `Torre ${LETRAS[t]}` : 'Bloco A'
    const aptosTorre = aptos.filter(a => a.bloco === LETRAS[t])
    const primeiros  = aptosTorre.slice(0, 3).map(a => a.numero).join(', ')
    const ultimos    = aptosTorre.length > 3 ? `... ${aptosTorre.slice(-1)[0].numero}` : ''
    previewTexto    += `<div style="margin-bottom:4px"><strong style="color:var(--p-700)">${bloco}:</strong> ${primeiros}${ultimos} <span style="color:var(--p-500)">(${aptosTorre.length} aptos)</span></div>`
  }
  if (torres > 4) previewTexto += `<div style="color:var(--p-500)">... e mais ${torres - 4} torre${torres - 4 > 1 ? 's' : ''}</div>`

  preview.innerHTML = `<strong>${total} apartamentos</strong> no total · ${torres} torre${torres > 1 ? 's' : ''} · ${andares} andar${andares > 1 ? 'es' : ''} · ${porAndar} apto${porAndar > 1 ? 's' : ''}/andar<br><div style="margin-top:8px">${previewTexto}</div>`
  preview.style.display = 'block'
}

function gerarListaAptos(torres, andares, porAndar, numInicial, formato) {
  const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lista  = []

  for (let t = 0; t < torres; t++) {
    const bloco = LETRAS[t]
    for (let a = 1; a <= andares; a++) {
      for (let u = 0; u < porAndar; u++) {
        let numero
        if (formato === 'simples') {
          // Sequencial global: 1, 2, 3, 4, 5...
          numero = String(numInicial + (t * andares * porAndar) + ((a - 1) * porAndar) + u)
        } else if (formato === 'dezena') {
          // Por dezena: andar 1 → 1,2,3,4 / andar 2 → 11,12,13,14 / andar 3 → 21,22,23,24
          numero = String(((a - 1) * 10) + numInicial + u)
        } else if (formato === 'letra') {
          // Com letra: 101A, 101B, 201A...
          const base = (a * 100) + numInicial
          numero = String(base) + LETRAS[u]
        } else {
          // Numérico padrão: andar 1 → 101,102 / andar 2 → 201,202...
          numero = String((a * 100) + numInicial + u)
        }
        lista.push({ bloco, numero })
      }
    }
  }
  return lista
}

function contarManual() {
  const texto = document.getElementById('c-lista-aptos')?.value || ''
  const aptos = texto.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
  const el    = document.getElementById('count-manual')
  if (el) el.textContent = aptos.length
  const campoTotal = document.getElementById('c-aptos')
  if (campoTotal) campoTotal.value = aptos.length
}

// aplicarMascaraCNPJ já definida em utils.js — não duplicar aqui



// ── Máscara CEP ───────────────────────────────────────────────
function aplicarMascaraCEP() {
  document.addEventListener('input', async function(e) {
    if (e.target.id !== 'c-cep') return
    let v = e.target.value.replace(/\D/g,'').slice(0,8)
    if (v.length > 5) v = v.slice(0,5) + '-' + v.slice(5)
    e.target.value = v
    if (v.replace('-','').length === 8) {
      try {
        const res  = await fetch(`https://viacep.com.br/ws/${v.replace('-','')}/json/`)
        const data = await res.json()
        if (!data.erro) {
          const end = document.getElementById('c-end')
          if (end && !end.value) end.value = data.logradouro || ''
          const cid = document.getElementById('c-cidade')
          if (cid) cid.value = data.localidade || ''
          const uf  = document.getElementById('c-uf')
          if (uf)  uf.value  = data.uf || ''
        }
      } catch (_) {}
    }
  })
}

// ── Bind ──────────────────────────────────────────────────────
function bindEvents() {
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) fecharModal() })
  })
  document.getElementById('form-condo')?.addEventListener('submit', salvarCondo)
  document.getElementById('c-lista-aptos')?.addEventListener('input', contarManual)
  document.getElementById('modal-reset')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-reset')) fecharModal()
  })
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal() })
}