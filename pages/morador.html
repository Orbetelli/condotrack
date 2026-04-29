// ============================================================
//  morador.js — painel do morador com Supabase real
// ============================================================

const STATUS_CFG = {
  aguardando: { label: 'Aguardando', bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  retirado:   { label: 'Retirado',   bg: '#F0FDF4', color: '#166534', dot: '#34D399' },
  expirado:   { label: 'Expirado',   bg: '#FEF2F2', color: '#991B1B', dot: '#F87171' },
}

let usuarioLogado   = null
let todasEntregas   = []
let tabAtiva        = 'pendentes'
let entregaConfirmar = null

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  usuarioLogado = await requireAuth(['morador'])
  if (!usuarioLogado) return

  renderHeader()
  await carregarEntregas()
  renderTab('pendentes')
  bindEvents()

  // Tempo real
  db.channel('entregas-morador')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, () => {
      carregarEntregas().then(() => renderTab(tabAtiva))
    })
    .subscribe()
})

function renderHeader() {
  const hora = new Date().getHours()
  const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  document.getElementById('header-greeting').textContent = saud + ','
  document.getElementById('header-name').textContent     = usuarioLogado.nome
  const apto = usuarioLogado.apartamentos
  document.getElementById('header-apto').textContent     =
    apto ? `Apto ${apto.bloco}-${apto.numero}` : '—'
  document.getElementById('header-condo').textContent    =
    usuarioLogado.condominios?.nome || '—'
}

async function carregarEntregas() {
  const { data, error } = await db
    .from('entregas')
    .select('id, transportadora, volumes, status, obs, recebido_em, retirado_em')
    .eq('apartamento_id', usuarioLogado.apartamento_id)
    .order('recebido_em', { ascending: false })

  if (error) { console.error(error); return }

  todasEntregas = (data || []).map(e => ({
    id:       e.id,
    trans:    e.transportadora,
    data:     new Date(e.recebido_em).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }),
    hora:     new Date(e.recebido_em).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }),
    volumes:  e.volumes,
    obs:      e.obs || '',
    status:   e.status,
    retiradoEm: e.retirado_em
      ? new Date(e.retirado_em).toLocaleDateString('pt-BR') + ' às ' +
        new Date(e.retirado_em).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
      : null,
  }))

  renderStats()
}

function renderStats() {
  document.getElementById('stat-pendentes').textContent =
    todasEntregas.filter(e => e.status === 'aguardando').length
  document.getElementById('stat-retiradas').textContent =
    todasEntregas.filter(e => e.status === 'retirado').length
  document.getElementById('stat-total').textContent     = todasEntregas.length
}

function mudarTab(tab) {
  tabAtiva = tab
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'))
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active')
  renderTab(tab)
}

async function renderTab(tab) {
  const body = document.getElementById('tab-body')
  if (tab === 'pendentes')    renderPendentes(body)
  if (tab === 'historico')    renderHistorico(body)
  if (tab === 'notificacoes') await renderNotificacoes(body)
  if (tab === 'perfil')       renderPerfil(body)
}

function renderPendentes(container) {
  const lista = todasEntregas.filter(e => e.status === 'aguardando' || e.status === 'expirado')
  container.innerHTML = ''
  if (!lista.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><svg viewBox="0 0 24 24" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div>
        <div class="empty-title">Nenhuma entrega pendente</div>
        <div class="empty-sub">Suas próximas encomendas aparecerão aqui</div>
      </div>`
    return
  }
  lista.forEach(e => {
    const cfg  = STATUS_CFG[e.status]
    const card = document.createElement('div')
    card.className = `entrega-card ${e.status}`
    card.innerHTML = `
      <div class="entrega-top">
        <div class="entrega-trans">${e.trans}</div>
        <span class="entrega-badge" style="background:${cfg.bg};color:${cfg.color}">${cfg.label}</span>
      </div>
      <div class="entrega-info">
        <div class="entrega-info-item">
          <svg viewBox="0 0 24 24" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${e.data} às ${e.hora}
        </div>
        <div class="entrega-info-item">
          <svg viewBox="0 0 24 24" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
          ${e.volumes} volume${e.volumes > 1 ? 's' : ''}
        </div>
      </div>
      ${e.obs ? `<div class="entrega-obs"><svg viewBox="0 0 24 24" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>${e.obs}</div>` : ''}
      ${e.status === 'aguardando'
        ? `<button class="btn-confirmar" onclick="abrirConfirmar('${e.id}')">
             <svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
             Confirmar retirada
           </button>`
        : `<div style="font-size:12px;color:var(--c-danger);font-weight:600">Prazo expirado — contate a portaria</div>`}
    `
    container.appendChild(card)
  })
}

function renderHistorico(container) {
  const retiradas = todasEntregas.filter(e => e.status === 'retirado')
  const expiradas = todasEntregas.filter(e => e.status === 'expirado')
  const lista     = [...retiradas, ...expiradas]

  container.innerHTML = `
    <div class="sec-title">Histórico de entregas</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div style="background:var(--n-0);border:1px solid var(--n-200);border-radius:var(--radius-lg);padding:14px 16px;text-align:center">
        <div style="font-size:26px;font-weight:700;color:#16A34A">${retiradas.length}</div>
        <div style="font-size:12px;color:var(--n-500);margin-top:3px">Retiradas</div>
      </div>
      <div style="background:var(--n-0);border:1px solid var(--n-200);border-radius:var(--radius-lg);padding:14px 16px;text-align:center">
        <div style="font-size:26px;font-weight:700;color:#DC2626">${expiradas.length}</div>
        <div style="font-size:12px;color:var(--n-500);margin-top:3px">Expiradas</div>
      </div>
    </div>
  `

  if (!lista.length) {
    container.innerHTML += `
      <div class="empty-state">
        <div class="empty-icon"><svg viewBox="0 0 24 24" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
        <div class="empty-title">Nenhum histórico</div>
        <div class="empty-sub">Suas entregas retiradas aparecerão aqui</div>
      </div>`
    return
  }

  const wrap = document.createElement('div')
  wrap.style.cssText = 'background:var(--n-0);border:1px solid var(--n-200);border-radius:var(--radius-lg);padding:4px 16px;'

  lista.forEach(e => {
    const cfg  = STATUS_CFG[e.status]
    const item = document.createElement('div')
    item.className = 'hist-item'
    item.innerHTML = `
      <div class="hist-dot" style="background:${cfg.dot}"></div>
      <div class="hist-info">
        <div class="hist-trans">${e.trans}</div>
        <div class="hist-data">
          📅 Recebido: ${e.data} às ${e.hora}
          ${e.retiradoEm ? ` · ✅ Retirado: ${e.retiradoEm}` : ''}
          · 📦 ${e.volumes} volume${e.volumes > 1 ? 's' : ''}
          ${e.obs ? ` · 📝 ${e.obs}` : ''}
        </div>
      </div>
      <span class="hist-badge" style="background:${cfg.bg};color:${cfg.color}">${cfg.label}</span>`
    wrap.appendChild(item)
  })
  container.appendChild(wrap)
}

async function renderNotificacoes(container) {
  container.innerHTML = `
    <div class="sec-title">Notificações</div>
    <div style="padding:20px;text-align:center">
      <div class="spinner" style="border-color:var(--p-200);border-top-color:var(--p-600);margin:0 auto"></div>
    </div>
  `

  // Busca todas as entregas do morador ordenadas por data
  const { data, error } = await db
    .from('entregas')
    .select('id, transportadora, volumes, status, recebido_em, retirado_em')
    .eq('apartamento_id', usuarioLogado.apartamento_id)
    .order('recebido_em', { ascending: false })
    .limit(30)

  container.innerHTML = '<div class="sec-title">Notificações</div>'

  if (error || !data?.length) {
    container.innerHTML += `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" stroke-width="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </div>
        <div class="empty-title">Nenhuma notificação</div>
        <div class="empty-sub">Você será notificado quando uma entrega chegar</div>
      </div>`
    return
  }

  const wrap = document.createElement('div')
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;'

  data.forEach(e => {
    const dataReceb = new Date(e.recebido_em).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      timeZone: 'America/Sao_Paulo'
    })
    const horaReceb = new Date(e.recebido_em).toLocaleTimeString('pt-BR', {
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Sao_Paulo'
    })

    const isRetirado = e.status === 'retirado'
    const isExpirado = e.status === 'expirado'

    const item = document.createElement('div')
    item.style.cssText = `
      background:var(--n-0);border:1px solid var(--n-200);
      border-left:4px solid ${isRetirado ? '#16A34A' : isExpirado ? '#DC2626' : 'var(--p-500)'};
      border-radius:var(--radius-lg);padding:14px 16px;
    `
    item.innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:18px">${isRetirado ? '✅' : isExpirado ? '⚠️' : '📦'}</span>
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--n-900)">
              ${isRetirado ? 'Entrega retirada' : isExpirado ? 'Entrega expirada' : 'Nova entrega chegou!'}
            </div>
            <div style="font-size:11px;color:var(--n-400);margin-top:1px">${dataReceb} às ${horaReceb}</div>
          </div>
        </div>
        <span style="font-size:10px;font-weight:600;padding:3px 8px;border-radius:99px;white-space:nowrap;
          background:${isRetirado ? '#F0FDF4' : isExpirado ? '#FEF2F2' : '#F5F3FF'};
          color:${isRetirado ? '#166534' : isExpirado ? '#991B1B' : 'var(--p-700)'}">
          ${isRetirado ? 'Retirado' : isExpirado ? 'Expirado' : 'Pendente'}
        </span>
      </div>
      <div style="font-size:12px;color:var(--n-600);line-height:1.6;padding-left:26px">
        🚚 <strong>${e.transportadora}</strong> · 
        📦 ${e.volumes} volume${e.volumes > 1 ? 's' : ''}
        ${isRetirado && e.retirado_em ? ` · ✅ Retirado em ${new Date(e.retirado_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}
      </div>
    `
    wrap.appendChild(item)
  })

  container.appendChild(wrap)
}

function renderPerfil(container) {
  const apto = usuarioLogado.apartamentos
  container.innerHTML = `
    <div class="sec-title">Meus dados</div>
    <div style="background:var(--n-0);border:1px solid var(--n-200);border-radius:var(--radius-lg);overflow:hidden;margin-bottom:14px">
      <div style="padding:14px 16px;border-bottom:1px solid var(--n-100);display:flex;align-items:center;gap:12px">
        <div style="width:44px;height:44px;border-radius:50%;background:var(--p-100);color:var(--p-700);font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${usuarioLogado.nome.split(' ').map(n=>n[0]).slice(0,2).join('')}
        </div>
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--n-900)">${usuarioLogado.nome}</div>
          <div style="font-size:12px;color:var(--n-500)">${usuarioLogado.condominios?.nome || '—'}</div>
        </div>
      </div>
      ${[
        ['Apartamento', apto ? `Bloco ${apto.bloco} · Apto ${apto.numero}` : '—'],
        ['Condomínio',  usuarioLogado.condominios?.nome || '—'],
      ].map(([l,v]) => `
        <div style="display:flex;justify-content:space-between;padding:11px 16px;border-bottom:1px solid var(--n-100)">
          <span style="font-size:13px;color:var(--n-500)">${l}</span>
          <span style="font-size:13px;font-weight:600;color:var(--n-900)">${v}</span>
        </div>`).join('')}
    </div>
    <button onclick="logout()" style="width:100%;padding:11px;background:var(--n-50);border:1px solid var(--n-200);border-radius:var(--radius-md);font-size:13px;font-weight:600;color:var(--n-600);cursor:pointer;font-family:var(--font-sans);display:flex;align-items:center;justify-content:center;gap:7px">
      <svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke="currentColor" style="width:15px;height:15px"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      Sair da conta
    </button>`
}

// ── Modal confirmar retirada ──────────────────────────────────
function abrirConfirmar(id) {
  const e = todasEntregas.find(x => x.id === id)
  if (!e) return
  entregaConfirmar = id
  document.getElementById('conf-trans').textContent = e.trans
  document.getElementById('conf-data').textContent  = `${e.data} às ${e.hora}`
  document.getElementById('conf-vol').textContent   = `${e.volumes} volume${e.volumes > 1 ? 's' : ''}`
  document.getElementById('modal-confirmar').classList.add('open')
}

function fecharModal() {
  document.getElementById('modal-confirmar').classList.remove('open')
  setTimeout(() => {
    document.getElementById('modal-form').style.display     = 'block'
    document.getElementById('confirm-success').style.display = 'none'
    entregaConfirmar = null
  }, 300)
}

async function confirmarRetirada() {
  if (!entregaConfirmar) return

  const { error } = await db
    .from('entregas')
    .update({
      status:      'retirado',
      retirado_em: new Date().toISOString(),
    })
    .eq('id', entregaConfirmar)

  if (error) { alert('Erro ao confirmar. Tente novamente.'); return }

  // O Realtime do porteiro vai detectar a mudança automaticamente.
  // Adicionalmente, dispara a Edge Function de notificação WhatsApp
  // para avisar o porteiro (reaproveitando o mesmo canal)
  db.functions.invoke('notificar-porteiro-retirada', {
    body: { entrega_id: entregaConfirmar },
  }).catch(err => console.warn('Notificação ao porteiro não enviada:', err))

  document.getElementById('modal-form').style.display      = 'none'
  document.getElementById('confirm-success').style.display = 'block'

  await carregarEntregas()
  setTimeout(() => { fecharModal(); renderTab(tabAtiva) }, 1800)
}

function bindEvents() {
  document.getElementById('modal-confirmar')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-confirmar')) fecharModal()
  })
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal() })
}