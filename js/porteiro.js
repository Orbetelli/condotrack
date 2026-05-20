// ============================================================
//  porteiro.js — painel do porteiro com Supabase real
// ============================================================

const STATUS_CONFIG = {
  aguardando:         { label: 'Aguardando',          bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  notificado:         { label: 'Notificado',           bg: '#EDE9FE', color: '#5B21B6', dot: '#A78BFA' },
  entregue_porteiro:  { label: 'Entregue — Confirmar', bg: '#ECFDF5', color: '#065F46', dot: '#10B981' },
  retirado:           { label: 'Retirado',             bg: '#F0FDF4', color: '#166534', dot: '#34D399' },
  expirado:           { label: 'Expirado',             bg: '#FEF2F2', color: '#991B1B', dot: '#F87171' },
}

let usuarioLogado      = null
let entregaDetalhe     = null
let filtroAtivo        = 'todos'
let buscaAtual         = ''
let todasEntregas      = []
let tabPorteiroAtiva   = 'dashboard'
let filtroEntregasAtivo = 'todos'

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  usuarioLogado = await requireAuth(['porteiro', 'admin'])
  if (!usuarioLogado) return

  const saud = (() => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite' })()
  document.querySelector('.header-greeting').textContent = `${saud}, ${usuarioLogado.nome.split(' ')[0]} 👋`
  document.querySelector('.header-sub').textContent      = `${usuarioLogado.condominios?.nome || 'Condomínio'} · Turno ${usuarioLogado.turno || 'A'}`

  const iniciais = usuarioLogado.nome.split(' ').map(n => n[0]).slice(0, 2).join('')
  const sbAvatar = document.getElementById('sb-avatar')
  if (sbAvatar) sbAvatar.textContent = iniciais

  await carregarEntregas()
  bindEvents()
  verificarAlertas()

  db.channel('entregas-realtime')
    .on('postgres_changes', {
      event:  '*',
      schema: 'public',
      table:  'entregas',
      filter: `condominio_id=eq.${usuarioLogado.condominio_id}`,
    }, (payload) => {
      // Passa o ID do registro alterado para o delta — evita re-fetch completo
      const deltaId = payload.new?.id || payload.old?.id || null
      carregarEntregas(deltaId)
    })
    .subscribe()

  // Realtime — mensagens de moradores para o porteiro
  db.channel('chat-porteiro')
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'mensagens',
      filter: `condominio_id=eq.${usuarioLogado.condominio_id}`,
    }, payload => {
      const msg = payload.new
      if (msg.remetente_id === usuarioLogado.id) return
      if (chatPortMoradorId === msg.remetente_id) {
        chatPortMensagens.push(normalizarMsgPort(msg))
        renderMensagensPort()
      } else {
        const badge = document.getElementById('chat-badge-port')
        if (badge) badge.style.display = 'inline'
      }
    })
    .subscribe()

  // Verifica turno ativo salvo na sessão
  const turnoSalvo = sessionStorage.getItem('ct_turno')
  if (turnoSalvo) {
    try {
      const t = JSON.parse(turnoSalvo)
      turnoAtivo    = true
      turnoInicioAt = t.inicio
      turnoAcessoId = t.acessoId
      renderBannerTurno()
    } catch (_) { sessionStorage.removeItem('ct_turno') }
  } else {
    setTimeout(() => sugerirInicioTurno(), 800)
  }
})

// ── Navegação entre abas ──────────────────────────────────────
function mudarTabPorteiro(tab) {
  tabPorteiroAtiva = tab
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'))
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active')
  renderTabPorteiro(tab)
}

function renderTabPorteiro(tab) {
  const body = document.getElementById('tab-body-porteiro')
  if (!body) return
  if (tab === 'dashboard') renderDashboard(body)
  if (tab === 'entregas')  renderEntregas(body)
  if (tab === 'moradores') renderMoradores(body)
  if (tab === 'historico') renderHistorico(body)
}

// ── Dashboard ─────────────────────────────────────────────────
function renderDashboard(body) {
  body.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-top">
          <div class="stat-num" id="stat-aguardando">—</div>
          <div class="stat-icon" style="background:#FEF3C7">
            <svg viewBox="0 0 24 24" stroke="#92400E" stroke-width="2" fill="none">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
          </div>
        </div>
        <div class="stat-label">Aguardando retirada</div>
        <span class="stat-badge" style="background:#FEF3C7;color:#92400E">Pendentes</span>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <div class="stat-num" id="stat-retirado">—</div>
          <div class="stat-icon" style="background:#F0FDF4">
            <svg viewBox="0 0 24 24" stroke="#166534" stroke-width="2.5" fill="none">
              <polyline points="20 6 9 17 4 12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>
        <div class="stat-label">Retiradas hoje</div>
        <span class="stat-badge" style="background:#F0FDF4;color:#166534">Concluído</span>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <div class="stat-num" id="stat-expirado">—</div>
          <div class="stat-icon" style="background:#FEF2F2">
            <svg viewBox="0 0 24 24" stroke="#991B1B" stroke-width="2" fill="none">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
        </div>
        <div class="stat-label">Expiradas (+5 dias)</div>
        <span class="stat-badge" style="background:#FEF2F2;color:#991B1B">Atenção</span>
      </div>
      <div class="stat-card">
        <div class="stat-top">
          <div class="stat-num" id="stat-total">—</div>
          <div class="stat-icon" style="background:#EDE9FE">
            <svg viewBox="0 0 24 24" stroke="#6D28D9" stroke-width="2" fill="none">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>
        <div class="stat-label">Total registrado</div>
        <span class="stat-badge" style="background:#EDE9FE;color:#5B21B6">Geral</span>
      </div>
    </div>
    <div class="search-row">
      <input class="search-box" type="text" id="busca"
             placeholder="Buscar por apartamento, morador ou transportadora..." />
      <span class="filter-chip active" onclick="ativarFiltro(this,'todos')">Todos</span>
      <span class="filter-chip" onclick="ativarFiltro(this,'aguardando')">Aguardando</span>
      <span class="filter-chip" onclick="ativarFiltro(this,'notificado')">Notificado</span>
      <span class="filter-chip" onclick="ativarFiltro(this,'retirado')">Retirado</span>
      <span class="filter-chip" onclick="ativarFiltro(this,'expirado')">Expirado</span>
    </div>
    <div class="cards-grid">
      <div class="status-card">
        <div class="status-card-head">
          <div class="status-card-title">
            <div class="status-dot" style="background:#F59E0B"></div>
            Aguardando / Notificado
          </div>
          <span class="status-count" id="count-pendentes" style="background:#FEF3C7;color:#92400E">0</span>
        </div>
        <div id="card-pendentes"></div>
      </div>
      <div class="status-card">
        <div class="status-card-head">
          <div class="status-card-title">
            <div class="status-dot" style="background:#34D399"></div>
            Retiradas hoje
          </div>
          <span class="status-count" id="count-retiradas" style="background:#F0FDF4;color:#166534">0</span>
        </div>
        <div id="card-retiradas"></div>
      </div>
    </div>
  `
  document.getElementById('busca')?.addEventListener('input', function() {
    buscaAtual = this.value
    renderCards()
  })
  renderStats()
  renderCards()
}

// ── Entregas ──────────────────────────────────────────────────
function renderEntregas(body) {
  body.innerHTML = `
    <div style="margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:var(--n-900);margin-bottom:12px">Todas as entregas</div>
      <div class="search-row">
        <input class="search-box" type="text" id="busca-entregas"
               placeholder="Buscar por apartamento ou transportadora..." />
        <span class="filter-chip active" onclick="ativarFiltroEntregas(this,'todos')">Todos</span>
        <span class="filter-chip" onclick="ativarFiltroEntregas(this,'aguardando')">Aguardando</span>
        <span class="filter-chip" onclick="ativarFiltroEntregas(this,'notificado')">Notificado</span>
        <span class="filter-chip" onclick="ativarFiltroEntregas(this,'retirado')">Retirado</span>
        <span class="filter-chip" onclick="ativarFiltroEntregas(this,'expirado')">Expirado</span>
      </div>
    </div>
    <div class="status-card" id="lista-entregas"></div>
  `
  renderListaEntregas('todos', '')
  document.getElementById('busca-entregas')?.addEventListener('input', function() {
    renderListaEntregas(filtroEntregasAtivo, this.value)
  })
}

function ativarFiltroEntregas(chip, status) {
  document.querySelectorAll('#tab-body-porteiro .filter-chip').forEach(c => c.classList.remove('active'))
  chip.classList.add('active')
  filtroEntregasAtivo = status
  const busca = document.getElementById('busca-entregas')?.value || ''
  renderListaEntregas(status, busca)
}

function renderListaEntregas(filtro, busca) {
  const lista = todasEntregas.filter(e => {
    const matchFiltro = filtro === 'todos' || e.status === filtro
    const termo = busca.toLowerCase()
    const matchBusca = !termo || e.apto.toLowerCase().includes(termo) || e.trans.toLowerCase().includes(termo)
    return matchFiltro && matchBusca
  })
  const container = document.getElementById('lista-entregas')
  if (!container) return
  if (lista.length === 0) {
    container.innerHTML = '<div class="entry-empty">Nenhuma entrega encontrada</div>'
    return
  }
  container.innerHTML = lista.map(entryHTML).join('')
  container.querySelectorAll('.entry-btn').forEach(btn => {
    btn.addEventListener('click', () => abrirDetalhe(btn.dataset.id))
  })
}

// ── Moradores ─────────────────────────────────────────────────
async function renderMoradores(body) {
  body.innerHTML = `<div style="padding:40px;text-align:center"><div class="spinner" style="border-color:var(--p-200);border-top-color:var(--p-600);margin:0 auto"></div></div>`

  const { data, error } = await db
    .from('usuarios')
    .select('id, nome, status, apartamentos(numero, bloco)')
    .eq('condominio_id', usuarioLogado.condominio_id)
    .eq('perfil', 'morador')
    .order('nome')

  if (error) { body.innerHTML = '<div class="entry-empty">Erro ao carregar moradores.</div>'; return }

  const moradores = (data || []).map(m => ({
    ...m,
    apto: m.apartamentos ? `${m.apartamentos.bloco}-${m.apartamentos.numero}` : '—'
  }))

  body.innerHTML = `
    <div style="margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:var(--n-900);margin-bottom:12px">
        Moradores cadastrados · <span style="color:var(--n-400);font-weight:400">${moradores.length} no total</span>
      </div>
      <input class="search-box" type="text" id="busca-moradores" style="width:100%"
             placeholder="Buscar por nome ou apartamento..." />
    </div>
    <div class="status-card" id="lista-moradores">
      ${moradorRowsPorteiro(moradores)}
    </div>
  `
  document.getElementById('busca-moradores')?.addEventListener('input', function() {
    const q = this.value.toLowerCase()
    const filtrado = moradores.filter(m =>
      m.nome.toLowerCase().includes(q) || m.apto.toLowerCase().includes(q))
    document.getElementById('lista-moradores').innerHTML = moradorRowsPorteiro(filtrado)
  })
}

function moradorRowsPorteiro(lista) {
  if (lista.length === 0) return '<div class="entry-empty">Nenhum morador encontrado</div>'
  return lista.map(m => {
    const ini = m.nome.split(' ').map(n => n[0]).slice(0, 2).join('')
    const ativo = m.status === 'ativo'
    return `
      <div class="entry">
        <div style="width:32px;height:32px;border-radius:50%;background:var(--p-100);color:var(--p-700);
                    font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${ini}</div>
        <div class="entry-info">
          <div class="entry-apto">${m.nome}</div>
          <div class="entry-sub">Apto ${m.apto}</div>
        </div>
        <span class="entry-badge" style="background:${ativo ? '#F0FDF4' : '#F5F5F5'};color:${ativo ? '#166534' : '#737373'}">
          ${ativo ? 'Ativo' : 'Pendente'}
        </span>
      </div>`
  }).join('')
}

// ── Histórico ─────────────────────────────────────────────────
function renderHistorico(body) {
  body.innerHTML = `
    <div style="font-size:13px;font-weight:700;color:var(--n-900);margin-bottom:12px">Histórico por apartamento</div>
    <div style="background:var(--n-0);border:1px solid var(--n-200);border-radius:var(--radius-lg);padding:20px;margin-bottom:14px">
      <div style="font-size:12px;color:var(--n-500);margin-bottom:12px">
        Informe o apartamento para consultar o histórico de entregas
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <div style="flex:1;min-width:100px">
          <label class="ct-label">Bloco</label>
          <input class="ct-input" type="text" id="hist-bloco" placeholder="Ex: A" maxlength="2"
                 style="text-transform:uppercase" />
        </div>
        <div style="flex:2;min-width:120px">
          <label class="ct-label">Número do Apto</label>
          <input class="ct-input" type="text" id="hist-numero" placeholder="Ex: 101" />
        </div>
        <div style="display:flex;align-items:flex-end">
          <button class="ct-btn-primary" onclick="buscarHistorico()" style="width:auto;padding:10px 20px">
            <svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke="currentColor" style="width:14px;height:14px">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35" stroke-linecap="round"/>
            </svg>
            Consultar
          </button>
        </div>
      </div>
    </div>
    <div id="resultado-historico"></div>
  `
}

async function buscarHistorico() {
  const bloco  = document.getElementById('hist-bloco').value.trim().toUpperCase()
  const numero = document.getElementById('hist-numero').value.trim()
  const result = document.getElementById('resultado-historico')

  if (!bloco || !numero) {
    result.innerHTML = '<div class="entry-empty">Informe o bloco e o número do apartamento.</div>'
    return
  }

  result.innerHTML = '<div style="padding:20px;text-align:center"><div class="spinner" style="border-color:var(--p-200);border-top-color:var(--p-600);margin:0 auto"></div></div>'

  const { data: aptoData } = await db
    .from('apartamentos')
    .select('id, numero, bloco')
    .eq('condominio_id', usuarioLogado.condominio_id)
    .eq('bloco', bloco)
    .eq('numero', numero)
    .single()

  if (!aptoData) {
    result.innerHTML = '<div class="entry-empty">Apartamento não encontrado.</div>'
    return
  }

  const { data: entregas, error } = await db
    .from('entregas')
    .select('id, transportadora, volumes, status, obs, recebido_em, retirado_em')
    .eq('apartamento_id', aptoData.id)
    .order('recebido_em', { ascending: false })
    .limit(50)

  if (error || !entregas?.length) {
    result.innerHTML = `
      <div class="status-card">
        <div class="entry-empty">Nenhuma entrega encontrada para o Apto ${bloco}-${numero}.</div>
      </div>`
    return
  }

  result.innerHTML = `
    <div style="font-size:12px;color:var(--n-500);margin-bottom:8px">
      <strong style="color:var(--n-900)">Apto ${bloco}-${numero}</strong> · ${entregas.length} entrega${entregas.length > 1 ? 's' : ''} encontrada${entregas.length > 1 ? 's' : ''}
    </div>
    <div class="status-card">
      ${entregas.map(e => {
        const cfg = STATUS_CONFIG[e.status] || STATUS_CONFIG.aguardando
        const dataReceb = new Date(e.recebido_em).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' })
        const horaReceb = new Date(e.recebido_em).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
        const dataRetir = e.retirado_em
          ? new Date(e.retirado_em).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' })
          : null
        return `
          <div class="entry">
            <div class="entry-dot" style="background:${cfg.dot}"></div>
            <div class="entry-info">
              <div class="entry-apto">${e.transportadora} · ${e.volumes} volume${e.volumes > 1 ? 's' : ''}</div>
              <div class="entry-sub">
                Recebido: ${dataReceb} ${horaReceb}
                ${dataRetir ? ` · Retirado: ${dataRetir}` : ''}
                ${e.obs ? ` · ${e.obs}` : ''}
              </div>
            </div>
            <span class="entry-badge" style="background:${cfg.bg};color:${cfg.color}">${cfg.label}</span>
          </div>`
      }).join('')}
    </div>
  `
}

// ── Carrega entregas do banco ─────────────────────────────────
async function carregarEntregas(deltaId = null) {
  // Se temos um ID específico (via realtime), busca só aquele registro
  // e aplica o delta no array local — muito mais eficiente
  if (deltaId && todasEntregas.length > 0) {
    const { data: delta, error } = await db
      .from('entregas')
      .select(`
        id, transportadora, volumes, status, obs,
        recebido_em, retirado_em, morador_id,
        apartamentos ( numero, bloco ),
        morador:usuarios!morador_id ( nome )
      `)
      .eq('id', deltaId)
      .single()

    if (!error && delta) {
      const novo = {
        id:        delta.id,
        apto:      delta.apartamentos ? `${delta.apartamentos.bloco}-${delta.apartamentos.numero}` : '—',
        morador:   delta.morador?.nome || '—',
        moradorId: delta.morador_id    || null,
        trans:     delta.transportadora,
        data:      new Date(delta.recebido_em).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }),
        hora:      new Date(delta.recebido_em).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }),
        volumes:   delta.volumes,
        status:    delta.status,
        obs:       delta.obs || '',
      }

      const idx = todasEntregas.findIndex(e => e.id === deltaId)
      if (idx >= 0) {
        // Atualiza registro existente
        todasEntregas[idx] = novo
      } else {
        // Nova entrega — adiciona no início (mais recente primeiro)
        todasEntregas.unshift(novo)
      }

      // Atualiza UI sem re-fetch completo
      const body = document.getElementById('tab-body-porteiro')
      if (body) {
        if (tabPorteiroAtiva === 'dashboard') { renderStats(); renderCards() }
        else if (tabPorteiroAtiva === 'entregas') renderEntregas(body)
      }
      atualizarDotNotif()
      return
    }
    // Se o delta falhou, cai no fetch completo abaixo
  }

  // Fetch completo — usado no carregamento inicial ou quando delta não disponível
  const { data, error } = await db
    .from('entregas')
    .select(`
      id, transportadora, volumes, status, obs,
      recebido_em, retirado_em, morador_id,
      apartamentos ( numero, bloco ),
      morador:usuarios!morador_id ( nome )
    `)
    .eq('condominio_id', usuarioLogado.condominio_id)
    .order('recebido_em', { ascending: false })

  if (error) { console.error('Erro ao carregar entregas:', error); return }

  todasEntregas = (data || []).map(e => ({
    id:        e.id,
    apto:      e.apartamentos ? `${e.apartamentos.bloco}-${e.apartamentos.numero}` : '—',
    morador:   e.morador?.nome || '—',
    moradorId: e.morador_id    || null,
    trans:     e.transportadora,
    data:      new Date(e.recebido_em).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }),
    hora:      new Date(e.recebido_em).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }),
    volumes:   e.volumes,
    status:    e.status,
    obs:       e.obs || '',
  }))

  const body = document.getElementById('tab-body-porteiro')
  if (!body) return

  if (tabPorteiroAtiva === 'dashboard') {
    if (document.getElementById('stat-aguardando')) {
      renderStats()
      renderCards()
    } else {
      renderDashboard(body)
    }
  } else if (tabPorteiroAtiva === 'entregas') {
    renderEntregas(body)
  }
  atualizarDotNotif()
}

// ── Stats ─────────────────────────────────────────────────────
function renderStats() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val }
  set('stat-aguardando', todasEntregas.filter(e => e.status === 'aguardando' || e.status === 'notificado' || e.status === 'entregue_porteiro').length)
  set('stat-retirado',   todasEntregas.filter(e => e.status === 'retirado').length)
  set('stat-expirado',   todasEntregas.filter(e => e.status === 'expirado').length)
  set('stat-total',      todasEntregas.length)
}

// ── Filtragem ─────────────────────────────────────────────────
function filtrar() {
  return todasEntregas.filter(e => {
    const matchFiltro = filtroAtivo === 'todos' || e.status === filtroAtivo
    const termo = buscaAtual.toLowerCase()
    const matchBusca = !termo ||
      e.apto.toLowerCase().includes(termo) ||
      e.trans.toLowerCase().includes(termo)
    return matchFiltro && matchBusca
  })
}

// ── Cards ─────────────────────────────────────────────────────
function renderCards() {
  const filtradas = filtrar()
  const pendentes = filtradas.filter(e => ['aguardando','notificado','expirado','entregue_porteiro'].includes(e.status))
  const retiradas = filtradas.filter(e => e.status === 'retirado')

  const cardPend = document.getElementById('card-pendentes')
  const cardRet  = document.getElementById('card-retiradas')
  const set      = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val }

  set('count-pendentes', pendentes.length)
  set('count-retiradas', retiradas.length)

  if (cardPend) cardPend.innerHTML = pendentes.length === 0
    ? '<div class="entry-empty">Nenhuma entrega pendente</div>'
    : pendentes.map(entryHTML).join('')

  if (cardRet) cardRet.innerHTML = retiradas.length === 0
    ? '<div class="entry-empty">Nenhuma retirada hoje</div>'
    : retiradas.map(entryHTML).join('')

  document.querySelectorAll('.entry-btn').forEach(btn => {
    btn.addEventListener('click', () => abrirDetalhe(btn.dataset.id))
  })
}

function entryHTML(e) {
  const cfg = STATUS_CONFIG[e.status]
  return `
    <div class="entry">
      <div class="entry-dot" style="background:${cfg.dot}"></div>
      <div class="entry-info">
        <div class="entry-apto">${e.apto}</div>
        <div class="entry-sub">${e.trans} · ${e.data} ${e.hora}${e.volumes > 1 ? ` · ${e.volumes} volumes` : ''}</div>
      </div>
      <span class="entry-badge" style="background:${cfg.bg};color:${cfg.color}">${cfg.label}</span>
      <button class="entry-btn" data-id="${e.id}">
        <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>`
}

// ── Modo de busca da entrega ──────────────────────────────────
let modoBuscaEntrega  = 'apto'
let moradorSelecionado = null // { id, nome, apto, aptoId, condoId }

function alternarBuscaEntrega(modo) {
  modoBuscaEntrega = modo
  document.getElementById('modo-busca-apto').style.display  = modo === 'apto'  ? 'block' : 'none'
  document.getElementById('modo-busca-nome').style.display  = modo === 'nome'  ? 'block' : 'none'

  const btnApto = document.getElementById('tab-busca-apto')
  const btnNome = document.getElementById('tab-busca-nome')
  btnApto.style.background  = modo === 'apto' ? 'var(--p-100)' : 'var(--n-0)'
  btnApto.style.color       = modo === 'apto' ? 'var(--p-700)' : 'var(--n-500)'
  btnApto.style.borderColor = modo === 'apto' ? 'var(--p-300)' : 'var(--n-200)'
  btnNome.style.background  = modo === 'nome' ? 'var(--p-100)' : 'var(--n-0)'
  btnNome.style.color       = modo === 'nome' ? 'var(--p-700)' : 'var(--n-500)'
  btnNome.style.borderColor = modo === 'nome' ? 'var(--p-300)' : 'var(--n-200)'
}

// ── Busca morador por nome ────────────────────────────────────
let timerNome = null
function buscarMoradorPorNome() {
  clearTimeout(timerNome)
  const q     = document.getElementById('busca-nome-morador').value.trim()
  const lista = document.getElementById('lista-busca-nome')

  if (q.length < 2) { lista.style.display = 'none'; return }

  timerNome = setTimeout(async () => {
    lista.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--n-400)">Buscando...</div>'
    lista.style.display = 'block'

    const { data, error } = await db
      .from('usuarios')
      .select('id, nome, apartamento_id, apartamentos(id, numero, bloco, condominio_id)')
      .eq('condominio_id', usuarioLogado.condominio_id)
      .eq('perfil', 'morador')
      .eq('status', 'ativo')
      .ilike('nome', `%${q}%`)
      .limit(8)

    if (error || !data?.length) {
      lista.innerHTML = '<div style="padding:10px 14px;font-size:12px;color:var(--n-400)">Nenhum morador encontrado.</div>'
      return
    }

    lista.innerHTML = ''
    data.forEach(m => {
      const apto = m.apartamentos
        ? `${m.apartamentos.bloco}-${m.apartamentos.numero}` : '—'

      const item = document.createElement('div')
      item.className = 'busca-nome-item'
      item.dataset.id      = m.id
      item.dataset.nome    = m.nome
      item.dataset.apto    = apto
      item.dataset.aptoId  = m.apartamentos?.id            || ''
      item.dataset.condoId = m.apartamentos?.condominio_id || ''

      const nomeEl = document.createElement('div')
      nomeEl.style.cssText = 'font-size:13px;font-weight:600;color:var(--n-900)'
      nomeEl.textContent   = m.nome

      const aptoEl = document.createElement('div')
      aptoEl.style.cssText = 'font-size:11px;color:var(--n-500);margin-top:2px'
      aptoEl.textContent   = `Apto ${apto}`

      item.appendChild(nomeEl)
      item.appendChild(aptoEl)

      item.addEventListener('click', () =>
        selecionarMoradorPorNome(
          item.dataset.id,
          item.dataset.nome,
          item.dataset.apto,
          item.dataset.aptoId,
          item.dataset.condoId,
        )
      )
      lista.appendChild(item)
    })
  }, 300)
}

function selecionarMoradorPorNome(id, nome, apto, aptoId, condoId) {
  moradorSelecionado = { id, nome, apto, aptoId, condoId }

  document.getElementById('busca-nome-morador').value = ''
  document.getElementById('lista-busca-nome').style.display = 'none'
  document.getElementById('morador-sel-nome-txt').textContent = nome
  document.getElementById('morador-sel-apto-txt').textContent = `Apto ${apto}`
  document.getElementById('morador-selecionado-nome').style.display = 'flex'
  limparErro('err-nome-morador')
}

function limparMoradorSelecionado() {
  moradorSelecionado = null
  document.getElementById('busca-nome-morador').value = ''
  document.getElementById('morador-selecionado-nome').style.display = 'none'
}

// ── Observações rápidas ───────────────────────────────────────
function adicionarObs(texto) {
  const input = document.getElementById('nova-obs')
  if (!input) return
  const atual = input.value.trim()
  input.value = atual ? `${atual}, ${texto}` : texto
  input.focus()
}

// ── Busca morador por nome ────────────────────────────────────
let timerApto = null
function buscarMoradoresApto() {
  clearTimeout(timerApto)
  timerApto = setTimeout(async () => {
    const aptoTexto = document.getElementById('nova-apto').value.trim().toUpperCase()
    const campo     = document.getElementById('campo-morador')
    const select    = document.getElementById('nova-morador')

    if (!aptoTexto || !aptoTexto.includes('-')) {
      campo.style.display = 'none'
      return
    }

    const [bloco, numero] = aptoTexto.split('-')
    const { data: aptoData } = await db
      .from('apartamentos')
      .select('id')
      .eq('condominio_id', usuarioLogado.condominio_id)
      .eq('bloco', bloco)
      .eq('numero', numero)
      .single()

    if (!aptoData) { campo.style.display = 'none'; return }

    const { data: moradores } = await db
      .from('usuarios')
      .select('id, nome, telefone')
      .eq('apartamento_id', aptoData.id)
      .eq('perfil', 'morador')
      .eq('status', 'ativo')

    if (!moradores?.length) { campo.style.display = 'none'; return }

    select.innerHTML = '<option value="">Selecione o destinatário...</option>' +
      moradores.map(m =>
        `<option value="${m.id}">${m.nome}${m.telefone ? ' · ' + m.telefone : ''}</option>`
      ).join('')

    campo.style.display = 'block'
    limparErro('err-morador')
  }, 500)
}

// ── Notificações ──────────────────────────────────────────────
let notifAberto = false
let notifLidas  = new Set(JSON.parse(sessionStorage.getItem('notif_lidas') || '[]'))

function toggleNotificacoes() {
  notifAberto = !notifAberto
  const dropdown = document.getElementById('notif-dropdown')
  if (!dropdown) return
  dropdown.style.display = notifAberto ? 'block' : 'none'
  if (notifAberto) renderNotificacoes()
}

function renderNotificacoes() {
  const lista = document.getElementById('notif-lista')
  if (!lista) return

  // Últimas 10 entregas aguardando ou notificadas
  const recentes = todasEntregas
    .filter(e => e.status === 'aguardando' || e.status === 'notificado')
    .slice(0, 10)

  if (!recentes.length) {
    lista.innerHTML = `
      <div style="padding:24px;text-align:center;font-size:13px;color:var(--n-400)">
        Nenhuma entrega pendente
      </div>`
    return
  }

  lista.innerHTML = recentes.map(e => {
    const lida = notifLidas.has(e.id)
    const cfg  = STATUS_CONFIG[e.status]
    return `
      <div onclick="abrirDetalheNotif('${e.id}')" style="display:flex;align-items:center;gap:10px;
           padding:11px 16px;border-bottom:1px solid var(--n-100);cursor:pointer;
           background:${lida ? 'var(--n-0)' : 'var(--p-50)'};transition:background .12s"
           onmouseenter="this.style.background='var(--p-50)'"
           onmouseleave="this.style.background='${lida ? 'var(--n-0)' : 'var(--p-50)'}'">
        <div style="width:8px;height:8px;border-radius:50%;background:${lida ? 'var(--n-200)' : cfg.dot};flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:${lida ? '400' : '600'};color:var(--n-900)">
            Apto ${e.apto} · ${e.trans}
          </div>
          <div style="font-size:11px;color:var(--n-500);margin-top:2px">
            ${e.data} às ${e.hora} · ${e.volumes} volume${e.volumes > 1 ? 's' : ''}
          </div>
        </div>
        <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:99px;
              background:${cfg.bg};color:${cfg.color};white-space:nowrap">${cfg.label}</span>
      </div>`
  }).join('')

  // Atualiza o dot
  atualizarDotNotif()
}

function abrirDetalheNotif(id) {
  notifLidas.add(id)
  sessionStorage.setItem('notif_lidas', JSON.stringify([...notifLidas]))
  toggleNotificacoes()
  abrirDetalhe(id)
  atualizarDotNotif()
}

function marcarTodasLidas() {
  todasEntregas.forEach(e => notifLidas.add(e.id))
  sessionStorage.setItem('notif_lidas', JSON.stringify([...notifLidas]))
  renderNotificacoes()
  atualizarDotNotif()
}

function atualizarDotNotif() {
  const naoLidas = todasEntregas.filter(
    e => (e.status === 'aguardando' || e.status === 'notificado') && !notifLidas.has(e.id)
  ).length
  const dot = document.getElementById('notif-dot')
  if (dot) dot.style.display = naoLidas > 0 ? 'block' : 'none'
}

// ── Notificações ──────────────────────────────────────────────
function abrirModalNova() {
  document.getElementById('modal-nova').classList.add('open')
  document.getElementById('form-nova').reset()
  document.getElementById('campo-morador').style.display = 'none'
  document.getElementById('morador-selecionado-nome').style.display = 'none'
  document.getElementById('lista-busca-nome').style.display = 'none'
  moradorSelecionado = null
  alternarBuscaEntrega('apto')
  limparTodosErros('err-apto','err-trans','err-volumes','err-morador','err-nome-morador','err-volumes-nome')
}

function fecharModalNova() {
  document.getElementById('modal-nova').classList.remove('open')
}

async function salvarEntrega(e) {
  e.preventDefault()
  limparTodosErros('err-apto','err-trans','err-volumes','err-morador','err-nome-morador','err-volumes-nome')

  const trans   = document.getElementById('nova-trans').value.trim()
  const obs     = document.getElementById('nova-obs').value.trim()
  let valido    = true
  let aptoId    = null
  let moradorId = null
  let volumes   = 0

  if (!trans) { mostrarErro('err-trans', 'Informe a transportadora.'); valido = false }

  if (modoBuscaEntrega === 'apto') {
    const aptoTexto = document.getElementById('nova-apto').value.trim()
    volumes = parseInt(document.getElementById('nova-volumes').value) || 0
    if (!aptoTexto) { mostrarErro('err-apto', 'Informe o apartamento.'); valido = false }
    if (!volumes)   { mostrarErro('err-volumes', 'Informe a quantidade.'); valido = false }
    if (document.getElementById('campo-morador').style.display !== 'none') {
      moradorId = document.getElementById('nova-morador')?.value || ''
      if (!moradorId) { mostrarErro('err-morador', 'Selecione o destinatário.'); valido = false }
    }
    if (!valido) return

    const [bloco, numero] = aptoTexto.toUpperCase().split('-')
    const { data: aptoData } = await db
      .from('apartamentos')
      .select('id')
      .eq('condominio_id', usuarioLogado.condominio_id)
      .eq('bloco', bloco || 'A')
      .eq('numero', numero || aptoTexto)
      .single()

    if (!aptoData) { mostrarErro('err-apto', 'Apartamento não encontrado.'); return }
    aptoId = aptoData.id

  } else {
    // Modo por nome
    volumes = parseInt(document.getElementById('nova-volumes-nome').value) || 0
    if (!moradorSelecionado) { mostrarErro('err-nome-morador', 'Selecione o morador.'); valido = false }
    if (!volumes)            { mostrarErro('err-volumes-nome', 'Informe a quantidade.'); valido = false }
    if (!valido) return

    // Segurança: verifica que o apartamento selecionado pertence ao condomínio do porteiro
    if (moradorSelecionado.condoId !== usuarioLogado.condominio_id) {
      mostrarErro('err-nome-morador', 'Apartamento não pertence a este condomínio.')
      return
    }

    aptoId    = moradorSelecionado.aptoId
    moradorId = moradorSelecionado.id
  }

  const btn = e.submitter
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  const { data: novaEntrega, error } = await db.from('entregas').insert({
    condominio_id:  usuarioLogado.condominio_id,
    apartamento_id: aptoId,
    porteiro_id:    usuarioLogado.id,
    morador_id:     moradorId || null,
    transportadora: trans,
    volumes,
    obs,
    status: 'aguardando',
  }).select('id').single()

  if (error) {
    mostrarErro('err-trans', 'Erro ao registrar. Tente novamente.')
    if (btn) { btn.disabled = false; btn.innerHTML = 'Registrar entrega' }
    return
  }

  if (novaEntrega?.id) {
    // Upload da foto em background (não bloqueia o fluxo)
    uploadFoto(novaEntrega.id).then(url => {
      if (url) {
        db.from('entregas').update({ foto_url: url }).eq('id', novaEntrega.id)
          .then(() => {}).catch(err => console.warn('Erro ao salvar foto_url:', err))
      }
    })
    fotoFile = null

    Promise.allSettled([
      db.functions.invoke('notificar-entrega',  { body: { entrega_id: novaEntrega.id, morador_id: moradorId || null } }),
      db.functions.invoke('notificar-whatsapp', { body: { entrega_id: novaEntrega.id, morador_id: moradorId || null } }),
    ]).then(results => {
      results.forEach((r, i) => {
        if (r.status === 'rejected')
          console.warn(`Notificação ${i === 0 ? 'e-mail' : 'WhatsApp'} não enviada:`, r.reason)
      })
    })
  }

  removerFoto()
  fecharModalNova()
  await carregarEntregas()
  // Garante que o porteiro veja a entrega recém-registrada no dashboard
  if (tabPorteiroAtiva !== 'dashboard') mudarTabPorteiro('dashboard')
}

// ── Detalhe ───────────────────────────────────────────────────
async function abrirDetalhe(id) {
  // Busca direto do banco — garante dados sempre atualizados,
  // mesmo que todasEntregas tenha sido substituído pelo realtime
  const { data: e, error } = await db
    .from('entregas')
    .select(`
      id, transportadora, volumes, status, obs,
      recebido_em, retirado_em, morador_id,
      apartamentos ( numero, bloco ),
      morador:usuarios!morador_id ( nome )
    `)
    .eq('id', id)
    .single()

  if (error || !e) {
    mostrarToast('Não foi possível carregar os detalhes desta entrega.', 'erro')
    return
  }

  // Normaliza para o mesmo formato do array local
  const entrega = {
    id:        e.id,
    apto:      e.apartamentos ? `${e.apartamentos.bloco}-${e.apartamentos.numero}` : '—',
    morador:   e.morador?.nome || '—',
    moradorId: e.morador_id   || null,
    trans:     e.transportadora,
    data:      new Date(e.recebido_em).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }),
    hora:      new Date(e.recebido_em).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }),
    volumes:   e.volumes,
    status:    e.status,
    obs:       e.obs || '',
  }

  entregaDetalhe = entrega
  const cfg = STATUS_CONFIG[entrega.status] || STATUS_CONFIG.aguardando

  document.getElementById('detalhe-titulo').textContent  = `Entrega #${entrega.id.slice(0,8)}`
  document.getElementById('detalhe-apto').textContent    = entrega.apto
  document.getElementById('detalhe-morador').textContent = entrega.morador
  document.getElementById('detalhe-trans').textContent   = entrega.trans
  document.getElementById('detalhe-data').textContent    = `${entrega.data} às ${entrega.hora}`
  document.getElementById('detalhe-volumes').textContent = entrega.volumes
  document.getElementById('detalhe-obs').textContent     = entrega.obs || '—'
  document.getElementById('detalhe-status').textContent       = cfg.label
  document.getElementById('detalhe-status').style.background  = cfg.bg
  document.getElementById('detalhe-status').style.color       = cfg.color

  const btnConf     = document.getElementById('btn-confirmar-retirada')
  const btnEntregue = document.getElementById('btn-entregue-porteiro')
  const pendente    = ['aguardando','notificado'].includes(entrega.status)
  btnConf.style.display     = pendente ? 'flex' : 'none'
  btnEntregue.style.display = pendente ? 'flex' : 'none'

  document.getElementById('modal-detalhe').classList.add('open')
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

// ── Fechar modal de detalhe ───────────────────────────────────
function fecharDetalhe() {
  document.getElementById('modal-detalhe').classList.remove('open')
  entregaDetalhe = null
}

async function registrarEntreguePorteiro() {
  if (!entregaDetalhe) return

  const btn = document.getElementById('btn-entregue-porteiro')
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  const { error } = await db
    .from('entregas')
    .update({
      status:      'entregue_porteiro',
      entregue_em: new Date().toISOString(),
      porteiro_id: usuarioLogado?.id || null,
    })
    .eq('id', entregaDetalhe.id)

  if (btn) { btn.disabled = false; btn.innerHTML = 'Entregue ao morador' }

  if (error) { mostrarToast('Erro ao registrar entrega.', 'erro'); return }

  // Notifica o morador para confirmar em 15 minutos (fire-and-forget)
  db.functions.invoke('confirmar-entrega', {
    body: {
      entrega_id: entregaDetalhe.id,
      morador_id: entregaDetalhe.moradorId || null,
    },
  }).catch(err => console.warn('Notificação não enviada:', err))

  mostrarToast('Entrega registrada! Morador será notificado.')
  fecharDetalhe()
  await carregarEntregas()
}

async function confirmarRetirada() {
  if (!entregaDetalhe) return

  const btn = document.getElementById('btn-confirmar-retirada')
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  const { error } = await db
    .from('entregas')
    .update({
      status:      'retirado',
      retirado_em: new Date().toISOString(),
      porteiro_id: usuarioLogado?.id || null,
    })
    .eq('id', entregaDetalhe.id)

  if (btn) { btn.disabled = false; btn.innerHTML = 'Confirmar retirada' }

  if (error) {
    mostrarToast('Erro ao confirmar retirada.', 'erro')
    return
  }

  // Notifica o morador que a entrega foi retirada (fire-and-forget)
  db.functions.invoke('notificar-porteiro-retirada', {
    body: {
      entrega_id: entregaDetalhe.id,
      morador_id: entregaDetalhe.moradorId || null,
      porteiro:   usuarioLogado?.nome      || 'Porteiro',
    },
  }).catch(err => console.warn('Notificação de retirada não enviada:', err))

  mostrarToast('Retirada confirmada com sucesso!')
  fecharDetalhe()
  await carregarEntregas()
}

function ativarFiltro(chip, status) {
  // Restringe ao container do dashboard para não afetar chips de outras abas
  const container = document.getElementById('tab-body-porteiro')
  container?.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'))
  chip.classList.add('active')
  filtroAtivo = status
  renderCards()
}

function ativarSidebar(item) {
  document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'))
  item.classList.add('active')
}

// ── Registro em lote ─────────────────────────────────────────
let loteContador = 0

function abrirModalLote() {
  fecharModalNova()
  loteContador = 0
  document.getElementById('lote-trans').value  = ''
  document.getElementById('lote-linhas').innerHTML = ''
  limparErro('err-lote-trans')
  limparErro('err-lote-geral')
  // Começa com 2 linhas
  adicionarLinhaLote()
  adicionarLinhaLote()
  document.getElementById('modal-lote').classList.add('open')
}

function fecharModalLote() {
  document.getElementById('modal-lote').classList.remove('open')
}

function previewFoto(input) {
  const file = input.files?.[0]
  if (!file) return
  fotoFile = file
  const reader = new FileReader()
  reader.onload = e => {
    document.getElementById('foto-preview-img').src = e.target.result
    document.getElementById('foto-preview').style.display = 'block'
  }
  reader.readAsDataURL(file)
}

function preencherTransLote(nome) {
  const input = document.getElementById('lote-trans')
  if (input) input.value = nome
}

function adicionarLinhaLote() {
  loteContador++
  const n   = loteContador
  const div = document.createElement('div')
  div.id    = `lote-linha-${n}`
  div.style.cssText = 'display:grid;grid-template-columns:1fr 80px 28px;gap:8px;margin-bottom:8px;align-items:end'
  div.innerHTML = `
    <div>
      ${n === 1 ? '<label class="ct-label">Apartamento</label>' : ''}
      <input class="ct-input" type="text" id="lote-apto-${n}"
             placeholder="Ex: A-204" style="text-transform:uppercase"
             oninput="this.value=this.value.toUpperCase()"/>
    </div>
    <div>
      ${n === 1 ? '<label class="ct-label">Volumes</label>' : ''}
      <input class="ct-input" type="number" id="lote-vol-${n}" placeholder="1" min="1" value="1"/>
    </div>
    <button type="button" onclick="removerLinhaLote(${n})"
            style="width:28px;height:38px;background:var(--n-100);border:1px solid var(--n-200);
                   border-radius:var(--radius-md);cursor:pointer;font-size:16px;color:var(--n-500);
                   display:flex;align-items:center;justify-content:center;
                   ${n <= 1 ? 'visibility:hidden' : ''}"
            id="lote-rm-${n}">×</button>
  `
  document.getElementById('lote-linhas').appendChild(div)
}

function removerLinhaLote(n) {
  document.getElementById(`lote-linha-${n}`)?.remove()
}

async function salvarLote() {
  limparErro('err-lote-trans')
  limparErro('err-lote-geral')

  const trans = document.getElementById('lote-trans').value.trim()
  if (!trans) { mostrarErro('err-lote-trans', 'Informe a transportadora.'); return }

  // Coleta todas as linhas visíveis
  const linhas = []
  for (let i = 1; i <= loteContador; i++) {
    const aptoEl = document.getElementById(`lote-apto-${i}`)
    const volEl  = document.getElementById(`lote-vol-${i}`)
    if (!aptoEl) continue // linha removida
    const aptoTxt = aptoEl.value.trim().toUpperCase()
    const vol     = parseInt(volEl?.value) || 1
    if (aptoTxt) linhas.push({ aptoTxt, vol })
  }

  if (!linhas.length) {
    mostrarErro('err-lote-geral', 'Adicione ao menos um apartamento.')
    return
  }

  const btn = document.getElementById('btn-lote-salvar')
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  let sucessos = 0
  const erros  = []

  for (const linha of linhas) {
    const [bloco, numero] = linha.aptoTxt.split('-')
    const { data: aptoData } = await db
      .from('apartamentos')
      .select('id')
      .eq('condominio_id', usuarioLogado.condominio_id)
      .eq('bloco', bloco || '')
      .eq('numero', numero || linha.aptoTxt)
      .single()

    if (!aptoData) { erros.push(`${linha.aptoTxt}: não encontrado`); continue }

    const { error } = await db.from('entregas').insert({
      condominio_id:  usuarioLogado.condominio_id,
      apartamento_id: aptoData.id,
      porteiro_id:    usuarioLogado.id,
      transportadora: trans,
      volumes:        linha.vol,
      status:         'aguardando',
    })

    if (error) { erros.push(`${linha.aptoTxt}: erro ao salvar`); continue }
    sucessos++
  }

  if (btn) { btn.disabled = false; btn.innerHTML = 'Registrar todas' }

  if (erros.length) {
    mostrarErro('err-lote-geral', `${sucessos} registrada(s). Erros: ${erros.join(', ')}`)
  } else {
    mostrarToast(`${sucessos} entrega${sucessos > 1 ? 's' : ''} registrada${sucessos > 1 ? 's' : ''} com sucesso!`)
    fecharModalLote()
  }

  if (sucessos > 0) {
    await carregarEntregas()
    if (tabPorteiroAtiva !== 'dashboard') mudarTabPorteiro('dashboard')
  }
}

// ── Início e fim de turno ─────────────────────────────────────
function sugerirInicioTurno() {
  // Exibe apenas se o porteiro ainda não iniciou turno e está no dashboard
  if (turnoAtivo || tabPorteiroAtiva !== 'dashboard') return
  const body = document.getElementById('tab-body-porteiro')
  if (!body || !document.getElementById('stat-aguardando')) return

  const banner = document.createElement('div')
  banner.id = 'banner-iniciar-turno'
  banner.style.cssText = `
    background:var(--p-50);border:1.5px solid var(--p-200);
    border-radius:var(--radius-lg);padding:12px 16px;
    display:flex;align-items:center;justify-content:space-between;
    gap:12px;margin-bottom:14px;
  `
  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px">
      <div style="width:32px;height:32px;border-radius:50%;background:var(--p-100);
                  display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke="var(--p-600)"
             style="width:15px;height:15px">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14" stroke-linecap="round"/>
        </svg>
      </div>
      <div>
        <div style="font-size:13px;font-weight:600;color:var(--p-800)">Seu turno ainda não foi iniciado</div>
        <div style="font-size:11px;color:var(--p-600);margin-top:2px">
          Registre o início para rastrear suas atividades
        </div>
      </div>
    </div>
    <button onclick="abrirModalTurno('iniciar')"
            style="background:var(--p-600);color:#fff;border:none;
                   border-radius:var(--radius-md);padding:8px 16px;
                   font-size:12px;font-weight:600;cursor:pointer;
                   font-family:var(--font-sans);white-space:nowrap;
                   transition:background .15s"
            onmouseenter="this.style.background='var(--p-700)'"
            onmouseleave="this.style.background='var(--p-600)'">
      Iniciar turno
    </button>
  `
  body.insertBefore(banner, body.firstChild)
}

function renderBannerTurno() {
  // Remove banner de sugestão se existir
  document.getElementById('banner-iniciar-turno')?.remove()

  // Exibe banner de turno ativo no header
  let banner = document.getElementById('banner-turno-ativo')
  if (!banner) {
    banner = document.createElement('div')
    banner.id = 'banner-turno-ativo'
    banner.style.cssText = `
      background:var(--p-800);color:rgba(255,255,255,.85);
      padding:6px 20px;font-size:11px;font-weight:500;
      display:flex;align-items:center;justify-content:space-between;gap:10px;
    `
    const main = document.querySelector('.main')
    const header = document.querySelector('.header')
    if (main && header) main.insertBefore(banner, header.nextSibling)
  }
  const duracao = turnoInicioAt ? calcDuracao(turnoInicioAt) : '0min'
  banner.innerHTML = `
    <span style="display:flex;align-items:center;gap:6px">
      <span style="width:6px;height:6px;border-radius:50%;background:#34D399;
                   display:inline-block;animation:pulse 2s infinite"></span>
      Turno em andamento · ${duracao}
    </span>
    <button onclick="abrirModalTurno('encerrar')"
            style="background:rgba(255,255,255,.15);border:none;cursor:pointer;
                   color:#fff;font-size:11px;font-weight:600;padding:3px 10px;
                   border-radius:5px;font-family:var(--font-sans)">
      Encerrar turno
    </button>
  `
  // Atualiza a cada minuto
  setTimeout(() => { if (turnoAtivo) renderBannerTurno() }, 60000)
}

function calcDuracao(isoStart) {
  const mins = Math.floor((Date.now() - new Date(isoStart)) / 60000)
  if (mins < 60) return `${mins}min`
  return `${Math.floor(mins / 60)}h${mins % 60 > 0 ? (mins % 60) + 'min' : ''}`
}

function abrirModalTurno(acao) {
  const titulo = document.getElementById('modal-turno-titulo')
  const msg    = document.getElementById('modal-turno-msg')
  const btn    = document.getElementById('btn-turno-confirmar')
  btn.dataset.acao = acao
  if (acao === 'iniciar') {
    titulo.textContent = 'Iniciar turno'
    msg.textContent    = 'Registre o início do seu turno para rastrear as entregas realizadas.'
    btn.textContent    = 'Iniciar turno'
  } else {
    titulo.textContent = 'Encerrar turno'
    msg.textContent    = `Turno iniciado há ${calcDuracao(turnoInicioAt)}. Confirma o encerramento?`
    btn.textContent    = 'Encerrar turno'
  }
  document.getElementById('modal-turno').classList.add('open')
}

function fecharModalTurno() {
  document.getElementById('modal-turno').classList.remove('open')
}

async function confirmarTurno() {
  const acao = document.getElementById('btn-turno-confirmar').dataset.acao
  fecharModalTurno()

  if (acao === 'iniciar') {
    turnoInicioAt = new Date().toISOString()
    turnoAtivo    = true

    const { data } = await db.from('acessos').insert({
      usuario_id:    usuarioLogado.id,
      condominio_id: usuarioLogado.condominio_id,
      perfil:        'porteiro',
      nome:          `Turno iniciado — ${usuarioLogado.nome}`,
      status:        'sucesso',
    }).select('id').single()

    turnoAcessoId = data?.id || null
    sessionStorage.setItem('ct_turno', JSON.stringify({
      inicio:   turnoInicioAt,
      acessoId: turnoAcessoId,
    }))
    renderBannerTurno()
    mostrarToast('Turno iniciado!')

  } else {
    // Registra fim do turno
    if (turnoAcessoId) {
      await db.from('acessos').update({
        nome: `Turno encerrado — ${usuarioLogado.nome} · Duração: ${calcDuracao(turnoInicioAt)}`,
      }).eq('id', turnoAcessoId)
    }

    turnoAtivo    = false
    turnoInicioAt = null
    turnoAcessoId = null
    sessionStorage.removeItem('ct_turno')
    document.getElementById('banner-turno-ativo')?.remove()
    mostrarToast('Turno encerrado!')
  }
}

// ── Chat porteiro com moradores ───────────────────────────────
function normalizarMsgPort(m) {
  return {
    id:          m.id,
    texto:       m.texto,
    remetenteId: m.remetente_id,
    criadoEm:    m.criado_em,
    minha:       m.remetente_id === usuarioLogado.id,
    hora:        new Date(m.criado_em).toLocaleTimeString('pt-BR', {
                   hour: '2-digit', minute: '2-digit'
                 }),
  }
}

async function renderChatLista(body) {
  // Remove badge
  const badge = document.getElementById('chat-badge-port')
  if (badge) badge.style.display = 'none'

  body.innerHTML = `<div style="padding:20px;text-align:center">
    <div class="spinner" style="border-color:var(--p-200);border-top-color:var(--p-600);margin:0 auto"></div>
  </div>`

  // Busca moradores que já trocaram mensagem com este condomínio
  const { data: msgs } = await db
    .from('mensagens')
    .select('remetente_id, usuarios!remetente_id(id, nome, apartamentos(numero, bloco))')
    .eq('condominio_id', usuarioLogado.condominio_id)
    .neq('remetente_id', usuarioLogado.id)
    .order('criado_em', { ascending: false })
    .limit(100)

  // Deduplica por morador
  const seen  = new Set()
  const lista = []
  for (const m of (msgs || [])) {
    const u = m.usuarios
    if (!u || seen.has(u.id)) continue
    seen.add(u.id)
    const apto = u.apartamentos ? `${u.apartamentos.bloco}-${u.apartamentos.numero}` : '—'
    lista.push({ id: u.id, nome: u.nome, apto })
  }

  if (!lista.length) {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;
                  justify-content:center;padding:48px 20px;text-align:center">
        <div style="width:56px;height:56px;border-radius:50%;background:var(--p-100);
                    display:flex;align-items:center;justify-content:center;margin-bottom:16px">
          <svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke="var(--p-600)"
               style="width:24px;height:24px">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div style="font-size:14px;font-weight:600;color:var(--n-700);margin-bottom:6px">
          Nenhuma mensagem ainda
        </div>
        <div style="font-size:13px;color:var(--n-400)">
          Mensagens de moradores aparecerão aqui
        </div>
      </div>`
    return
  }

  const ini = nome => nome.split(' ').map(n => n[0]).slice(0, 2).join('')

  body.innerHTML = `
    <div style="font-size:13px;font-weight:700;color:var(--n-900);margin-bottom:12px">
      Mensagens de moradores
    </div>
    <div class="status-card">
      ${lista.map(m => `
        <div class="entry" style="cursor:pointer" onclick="abrirChatPort('${m.id}','${m.nome.replace(/'/g,"\'")}','${m.apto}')">
          <div style="width:34px;height:34px;border-radius:50%;background:var(--p-100);
                      color:var(--p-700);font-size:12px;font-weight:700;flex-shrink:0;
                      display:flex;align-items:center;justify-content:center">
            ${ini(m.nome)}
          </div>
          <div class="entry-info">
            <div class="entry-apto">${m.nome}</div>
            <div class="entry-sub">Apto ${m.apto}</div>
          </div>
          <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round"
               style="width:14px;height:14px;stroke:var(--n-400);flex-shrink:0">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </div>`).join('')}
    </div>`
}

async function abrirChatPort(moradorId, moradorNome, moradorApto) {
  chatPortMoradorId   = moradorId
  chatPortMoradorNome = moradorNome
  chatPortMoradorApto = moradorApto

  const ini = moradorNome.split(' ').map(n => n[0]).slice(0, 2).join('')
  document.getElementById('chat-port-avatar').textContent   = ini
  document.getElementById('chat-port-nome').textContent     = moradorNome
  document.getElementById('chat-port-apto').textContent     = `Apto ${moradorApto}`
  document.getElementById('chat-port-mensagens').innerHTML  = `
    <div style="padding:20px;text-align:center">
      <div class="spinner" style="border-color:var(--p-200);border-top-color:var(--p-600);margin:0 auto"></div>
    </div>`
  document.getElementById('modal-chat-port').classList.add('open')

  // Carrega histórico
  const { data } = await db
    .from('mensagens')
    .select('id, texto, remetente_id, criado_em')
    .eq('condominio_id', usuarioLogado.condominio_id)
    .or(`remetente_id.eq.${moradorId},destinatario_id.eq.${moradorId}`)
    .order('criado_em', { ascending: true })
    .limit(100)

  chatPortMensagens = (data || []).map(normalizarMsgPort)
  renderMensagensPort()
}

function fecharChatPort() {
  document.getElementById('modal-chat-port').classList.remove('open')
  chatPortMoradorId = null
}

function renderMensagensPort() {
  const lista = document.getElementById('chat-port-mensagens')
  if (!lista) return

  if (!chatPortMensagens.length) {
    lista.innerHTML = `<div style="text-align:center;padding:24px;font-size:13px;color:var(--n-400)">
      Nenhuma mensagem ainda.
    </div>`
    return
  }

  lista.innerHTML = chatPortMensagens.map(m => `
    <div style="display:flex;flex-direction:column;
                align-items:${m.minha ? 'flex-end' : 'flex-start'}">
      <div style="
        max-width:78%;padding:9px 13px;
        border-radius:${m.minha ? '14px 14px 4px 14px' : '14px 14px 14px 4px'};
        background:${m.minha ? 'var(--p-600)' : 'var(--n-100)'};
        color:${m.minha ? '#fff' : 'var(--n-900)'};
        font-size:13px;line-height:1.5;word-break:break-word
      ">${m.texto}</div>
      <div style="font-size:10px;color:var(--n-400);margin-top:3px;padding:0 4px">${m.hora}</div>
    </div>
  `).join('')

  lista.scrollTop = lista.scrollHeight
}

async function enviarMensagemPort() {
  const input = document.getElementById('chat-port-input')
  const texto = input?.value.trim()
  if (!texto || !chatPortMoradorId) return

  const btn = document.getElementById('btn-chat-port-enviar')
  if (btn) btn.disabled = true
  input.value = ''
  input.style.height = 'auto'

  const { data, error } = await db.from('mensagens').insert({
    remetente_id:    usuarioLogado.id,
    destinatario_id: chatPortMoradorId,
    condominio_id:   usuarioLogado.condominio_id,
    texto,
  }).select().single()

  if (btn) btn.disabled = false

  if (error) {
    mostrarToast('Erro ao enviar mensagem.', 'erro')
    input.value = texto
    return
  }

  chatPortMensagens.push(normalizarMsgPort(data))
  renderMensagensPort()
}

function chatPortKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    enviarMensagemPort()
  }
}

function bindEvents() {
  document.getElementById('btn-nova-entrega')?.addEventListener('click', abrirModalNova)
  document.getElementById('modal-nova')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-nova')) fecharModalNova()
  })
  document.getElementById('modal-detalhe')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-detalhe')) fecharDetalhe()
  })
  document.getElementById('modal-lote')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-lote')) fecharModalLote()
  })
  document.getElementById('modal-chat-port')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-chat-port')) fecharChatPort()
  })
  document.getElementById('modal-turno')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-turno')) fecharModalTurno()
  })
  document.getElementById('form-nova')?.addEventListener('submit', salvarEntrega)
  document.addEventListener('keydown', e => {
    // Alt+N abre modal de nova entrega (atalho de teclado)
    if (e.altKey && e.key === 'n') { e.preventDefault(); abrirModalNova() }
    if (e.key === 'Escape') {
      fecharModalNova()
      fecharDetalhe()
      fecharModalLote()
      fecharChatPort()
      fecharModalTurno()
    }
  })
  // Fecha dropdown de notificações ao clicar fora
  document.addEventListener('click', e => {
    if (notifAberto && !e.target.closest('#btn-notif') && !e.target.closest('#notif-dropdown')) {
      notifAberto = false
      const dropdown = document.getElementById('notif-dropdown')
      if (dropdown) dropdown.style.display = 'none'
    }
  })
}