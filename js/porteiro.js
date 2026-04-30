// ============================================================
//  porteiro.js — painel do porteiro com Supabase real
// ============================================================

const STATUS_CONFIG = {
  aguardando: { label: 'Aguardando', bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  notificado: { label: 'Notificado', bg: '#EDE9FE', color: '#5B21B6', dot: '#A78BFA' },
  retirado:   { label: 'Retirado',   bg: '#F0FDF4', color: '#166534', dot: '#34D399' },
  expirado:   { label: 'Expirado',   bg: '#FEF2F2', color: '#991B1B', dot: '#F87171' },
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

  db.channel('entregas-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, () => {
      carregarEntregas()
    })
    .subscribe()
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
    .select('id, nome, email, status, apartamentos(numero, bloco)')
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
          <div class="entry-sub">Apto ${m.apto} · ${m.email || 'Sem e-mail'}</div>
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
async function carregarEntregas() {
  const { data, error } = await db
    .from('entregas')
    .select(`
      id, transportadora, volumes, status, obs,
      recebido_em, retirado_em,
      apartamentos ( numero, bloco ),
      usuarios!porteiro_id ( nome )
    `)
    .eq('condominio_id', usuarioLogado.condominio_id)
    .order('recebido_em', { ascending: false })

  if (error) { console.error('Erro ao carregar entregas:', error); return }

  todasEntregas = (data || []).map(e => ({
    id:      e.id,
    apto:    e.apartamentos ? `${e.apartamentos.bloco}-${e.apartamentos.numero}` : '—',
    morador: '—',
    trans:   e.transportadora,
    data:    new Date(e.recebido_em).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }),
    hora:    new Date(e.recebido_em).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }),
    volumes: e.volumes,
    status:  e.status,
    obs:     e.obs || '',
  }))

  const body = document.getElementById('tab-body-porteiro')
  if (!body) return
  if (tabPorteiroAtiva === 'dashboard') renderDashboard(body)
  else if (tabPorteiroAtiva === 'entregas') renderEntregas(body)
}

// ── Stats ─────────────────────────────────────────────────────
function renderStats() {
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val }
  set('stat-aguardando', todasEntregas.filter(e => e.status === 'aguardando' || e.status === 'notificado').length)
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
  const pendentes = filtradas.filter(e => ['aguardando','notificado','expirado'].includes(e.status))
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

// ── Busca moradores do apartamento digitado ───────────────────
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

// ── Nova entrega ──────────────────────────────────────────────
function abrirModalNova() {
  document.getElementById('modal-nova').classList.add('open')
  document.getElementById('form-nova').reset()
  document.getElementById('campo-morador').style.display = 'none'
  limparTodosErros('err-apto','err-trans','err-volumes','err-morador')
}

function fecharModalNova() {
  document.getElementById('modal-nova').classList.remove('open')
}

async function salvarEntrega(e) {
  e.preventDefault()
  limparTodosErros('err-apto','err-trans','err-volumes','err-morador')

  const aptoTexto = document.getElementById('nova-apto').value.trim()
  const trans     = document.getElementById('nova-trans').value.trim()
  const volumes   = parseInt(document.getElementById('nova-volumes').value) || 0
  const obs       = document.getElementById('nova-obs').value.trim()
  const moradorId = document.getElementById('nova-morador')?.value || ''
  let valido      = true

  if (!aptoTexto) { mostrarErro('err-apto',    'Informe o apartamento.'); valido = false }
  if (!trans)     { mostrarErro('err-trans',   'Informe a transportadora.'); valido = false }
  if (!volumes)   { mostrarErro('err-volumes', 'Informe a quantidade.'); valido = false }
  if (document.getElementById('campo-morador').style.display !== 'none' && !moradorId) {
    mostrarErro('err-morador', 'Selecione o destinatário.'); valido = false
  }
  if (!valido) return

  const btn = e.submitter
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  const [bloco, numero] = aptoTexto.toUpperCase().split('-')
  const { data: aptoData } = await db
    .from('apartamentos')
    .select('id')
    .eq('condominio_id', usuarioLogado.condominio_id)
    .eq('bloco', bloco || 'A')
    .eq('numero', numero || aptoTexto)
    .single()

  if (!aptoData) {
    mostrarErro('err-apto', 'Apartamento não encontrado.')
    if (btn) { btn.disabled = false; btn.innerHTML = 'Registrar entrega' }
    return
  }

  const { data: novaEntrega, error } = await db.from('entregas').insert({
    condominio_id:  usuarioLogado.condominio_id,
    apartamento_id: aptoData.id,
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
    const notifs = [
      db.functions.invoke('notificar-entrega',  { body: { entrega_id: novaEntrega.id, morador_id: moradorId || null } }),
      db.functions.invoke('notificar-whatsapp', { body: { entrega_id: novaEntrega.id, morador_id: moradorId || null } }),
    ]
    Promise.allSettled(notifs).then(results => {
      results.forEach((r, i) => {
        if (r.status === 'rejected')
          console.warn(`Notificação ${i === 0 ? 'e-mail' : 'WhatsApp'} não enviada:`, r.reason)
      })
    })
  }

  fecharModalNova()
  await carregarEntregas()
}

// ── Detalhe ───────────────────────────────────────────────────
function abrirDetalhe(id) {
  const e = todasEntregas.find(x => x.id === id)
  if (!e) return
  entregaDetalhe = e
  const cfg = STATUS_CONFIG[e.status]

  document.getElementById('detalhe-titulo').textContent  = `Entrega #${e.id.slice(0,8)}`
  document.getElementById('detalhe-apto').textContent    = e.apto
  document.getElementById('detalhe-morador').textContent = e.morador
  document.getElementById('detalhe-trans').textContent   = e.trans
  document.getElementById('detalhe-data').textContent    = `${e.data} às ${e.hora}`
  document.getElementById('detalhe-volumes').textContent = e.volumes
  document.getElementById('detalhe-obs').textContent     = e.obs || '—'
  document.getElementById('detalhe-status').textContent  = cfg.label
  document.getElementById('detalhe-status').style.background = cfg.bg
  document.getElementById('detalhe-status').style.color      = cfg.color

  const btnConf = document.getElementById('btn-confirmar-retirada')
  btnConf.style.display = ['aguardando','notificado'].includes(e.status) ? 'flex' : 'none'
  document.getElementById('modal-detalhe').classList.add('open')
}

function fecharDetalhe() {
  document.getElementById('modal-detalhe').classList.remove('open')
  entregaDetalhe = null
}

async function confirmarRetirada() {
  if (!entregaDetalhe) return

  const { error } = await db
    .from('entregas')
    .update({ status: 'retirado', retirado_em: new Date().toISOString() })
    .eq('id', entregaDetalhe.id)

  if (error) { alert('Erro ao confirmar retirada.'); return }

  fecharDetalhe()
  await carregarEntregas()
}

function ativarFiltro(chip, status) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'))
  chip.classList.add('active')
  filtroAtivo = status
  renderCards()
}

function ativarSidebar(item) {
  document.querySelectorAll('.sb-item').forEach(i => i.classList.remove('active'))
  item.classList.add('active')
}

function bindEvents() {
  document.getElementById('btn-nova-entrega')?.addEventListener('click', abrirModalNova)
  document.getElementById('modal-nova')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-nova')) fecharModalNova()
  })
  document.getElementById('modal-detalhe')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-detalhe')) fecharDetalhe()
  })
  document.getElementById('form-nova')?.addEventListener('submit', salvarEntrega)
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { fecharModalNova(); fecharDetalhe() }
  })
}