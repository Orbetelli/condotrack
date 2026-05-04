// ============================================================
//  morador.js — painel do morador com Supabase real
// ============================================================

const STATUS_CFG = {
  aguardando:        { label: 'Aguardando',          bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  notificado:        { label: 'Notificado',           bg: '#EDE9FE', color: '#5B21B6', dot: '#A78BFA' },
  entregue_porteiro: { label: 'Entregue — Confirmar', bg: '#ECFDF5', color: '#065F46', dot: '#10B981' },
  retirado:          { label: 'Retirado',             bg: '#F0FDF4', color: '#166534', dot: '#34D399' },
  expirado:          { label: 'Expirado',             bg: '#FEF2F2', color: '#991B1B', dot: '#F87171' },
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

  // Realtime filtrado pelo apartamento do morador
  db.channel('entregas-morador')
    .on('postgres_changes', {
      event:  '*',
      schema: 'public',
      table:  'entregas',
      filter: `apartamento_id=eq.${usuarioLogado.apartamento_id}`,
    }, () => {
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
    id:          e.id,
    trans:       e.transportadora,
    recebidoISO: e.recebido_em,
    data:        new Date(e.recebido_em).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }),
    hora:        new Date(e.recebido_em).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }),
    volumes:     e.volumes,
    obs:         e.obs || '',
    status:      e.status,
    retiradoEm:  e.retirado_em
      ? new Date(e.retirado_em).toLocaleDateString('pt-BR') + ' às ' +
        new Date(e.retirado_em).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
      : null,
  }))

  renderStats()
}

function renderStats() {
  document.getElementById('stat-pendentes').textContent =
    todasEntregas.filter(e => ['aguardando','notificado','entregue_porteiro'].includes(e.status)).length
  document.getElementById('stat-retiradas').textContent =
    todasEntregas.filter(e => e.status === 'retirado').length
  document.getElementById('stat-total').textContent = todasEntregas.length
  atualizarDotMorador()
}

function mudarTab(tab) {
  tabAtiva = tab
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'))
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active')
  renderTab(tab)
}

function renderTab(tab) {
  const body = document.getElementById('tab-body')
  if (tab === 'pendentes') renderPendentes(body)
  if (tab === 'historico') renderHistorico(body)
  if (tab === 'perfil')    renderPerfil(body)
}

function renderPendentes(container) {
  const lista = todasEntregas.filter(e =>
    ['aguardando','notificado','entregue_porteiro','expirado'].includes(e.status)
  )
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
    const cfg  = STATUS_CFG[e.status] || STATUS_CFG.aguardando
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
      ${e.status === 'aguardando' || e.status === 'notificado' || e.status === 'entregue_porteiro'
        ? `<button class="btn-confirmar" onclick="abrirConfirmar('${e.id}')">
             <svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
             Confirmar retirada
           </button>`
        : `<div style="font-size:12px;color:var(--c-danger);font-weight:600">Prazo expirado — contate a portaria</div>`}
    `
    container.appendChild(card)
  })
}

let filtroHistorico = 'todos'
let filtroPeriodo   = 'todos'

function renderHistorico(container) {
  container.innerHTML = `
    <div class="sec-title">Histórico de entregas</div>
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <select class="ct-input" id="filtro-status-hist" onchange="aplicarFiltroHist()"
              style="flex:1;min-width:120px;padding:8px 12px">
        <option value="todos">Todos os status</option>
        <option value="retirado">Retirados</option>
        <option value="expirado">Expirados</option>
      </select>
      <select class="ct-input" id="filtro-periodo-hist" onchange="aplicarFiltroHist()"
              style="flex:1;min-width:120px;padding:8px 12px">
        <option value="todos">Todo o período</option>
        <option value="7">Últimos 7 dias</option>
        <option value="30">Últimos 30 dias</option>
        <option value="90">Últimos 3 meses</option>
      </select>
    </div>
    <div id="lista-historico"></div>
  `
  aplicarFiltroHist()
}

function aplicarFiltroHist() {
  const status  = document.getElementById('filtro-status-hist')?.value  || 'todos'
  const periodo = document.getElementById('filtro-periodo-hist')?.value || 'todos'

  let lista = todasEntregas.filter(e => e.status === 'retirado' || e.status === 'expirado')

  if (status !== 'todos') {
    lista = lista.filter(e => e.status === status)
  }

  if (periodo !== 'todos') {
    const dias  = parseInt(periodo)
    const corte = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)
    lista = lista.filter(e => new Date(e.recebidoISO) >= corte)
  }

  const container = document.getElementById('lista-historico')
  if (!container) return

  if (!lista.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><svg viewBox="0 0 24 24" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
        <div class="empty-title">Nenhuma entrega encontrada</div>
        <div class="empty-sub">Tente ajustar os filtros</div>
      </div>`
    return
  }

  const wrap = document.createElement('div')
  wrap.style.cssText = 'background:var(--n-0);border:1px solid var(--n-200);border-radius:var(--radius-lg);padding:4px 16px;'

  lista.forEach(e => {
    const cfg  = STATUS_CFG[e.status] || STATUS_CFG.retirado
    const item = document.createElement('div')
    item.className = 'hist-item'
    item.innerHTML = `
      <div class="hist-dot" style="background:${cfg.dot}"></div>
      <div class="hist-info">
        <div class="hist-trans">${e.trans}</div>
        <div class="hist-data">
          Recebido: ${e.data} às ${e.hora}
          ${e.retiradoEm ? ` · Retirado: ${e.retiradoEm}` : ''}
          · ${e.volumes} volume${e.volumes > 1 ? 's' : ''}
        </div>
      </div>
      <span class="hist-badge" style="background:${cfg.bg};color:${cfg.color}">${cfg.label}</span>`
    wrap.appendChild(item)
  })

  // Resumo no rodapé
  const total    = lista.length
  const retiradas = lista.filter(e => e.status === 'retirado').length
  const resumo   = document.createElement('div')
  resumo.style.cssText = 'padding:10px 0;font-size:11px;color:var(--n-400);text-align:center;border-top:1px solid var(--n-100);margin-top:4px'
  resumo.textContent   = `${total} entrega${total !== 1 ? 's' : ''} · ${retiradas} retirada${retiradas !== 1 ? 's' : ''}`
  wrap.appendChild(resumo)

  container.innerHTML = ''
  container.appendChild(wrap)
}

function renderPerfil(container) {
  const apto = usuarioLogado.apartamentos
  container.innerHTML = `
    <div class="sec-title">Meus dados</div>

    <!-- Card de perfil -->
    <div style="background:var(--n-0);border:1px solid var(--n-200);border-radius:var(--radius-lg);overflow:hidden;margin-bottom:14px">
      <div style="padding:14px 16px;border-bottom:1px solid var(--n-100);display:flex;align-items:center;gap:12px">
        <div style="width:44px;height:44px;border-radius:50%;background:var(--p-100);color:var(--p-700);
                    font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          ${usuarioLogado.nome.split(' ').map(n=>n[0]).slice(0,2).join('')}
        </div>
        <div style="flex:1">
          <div style="font-size:15px;font-weight:700;color:var(--n-900)">${usuarioLogado.nome}</div>
          <div style="font-size:12px;color:var(--n-500)">${usuarioLogado.condominios?.nome || '—'}</div>
        </div>
        <button onclick="abrirEditarPerfil()" style="font-size:11px;font-weight:600;color:var(--p-600);
                background:var(--p-50);border:1px solid var(--p-200);border-radius:var(--radius-md);
                padding:5px 10px;cursor:pointer;font-family:var(--font-sans)">
          Editar
        </button>
      </div>
      ${[
        ['Apartamento', apto ? `Bloco ${apto.bloco} · Apto ${apto.numero}` : '—'],
        ['Condomínio',  usuarioLogado.condominios?.nome || '—'],
        ['Telefone',    usuarioLogado.telefone || '—'],
        ['E-mail',      usuarioLogado.email || '—'],
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
        <button onclick="abrirTrocarSenha()" style="font-size:11px;font-weight:600;color:var(--p-600);
                background:var(--p-50);border:1px solid var(--p-200);border-radius:var(--radius-md);
                padding:5px 10px;cursor:pointer;font-family:var(--font-sans)">
          Trocar senha
        </button>
      </div>
    </div>

    <!-- Sair -->
    <button onclick="logout()" style="width:100%;padding:11px;background:var(--n-50);border:1px solid var(--n-200);
            border-radius:var(--radius-md);font-size:13px;font-weight:600;color:var(--n-600);cursor:pointer;
            font-family:var(--font-sans);display:flex;align-items:center;justify-content:center;gap:7px">
      <svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke="currentColor" style="width:15px;height:15px">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
      Sair da conta
    </button>
  `
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

// ── Editar perfil ─────────────────────────────────────────────
function abrirEditarPerfil() {
  document.getElementById('edit-nome').value     = usuarioLogado.nome || ''
  document.getElementById('edit-telefone').value = usuarioLogado.telefone || ''
  document.getElementById('edit-email').value    = usuarioLogado.email || ''
  limparTodosErros('err-edit-nome','err-edit-email')
  aplicarMascaraTelefone('edit-telefone')
  document.getElementById('modal-editar-perfil').classList.add('open')
}

async function salvarPerfil() {
  limparTodosErros('err-edit-nome','err-edit-email')
  const nome     = document.getElementById('edit-nome').value.trim()
  const telefone = document.getElementById('edit-telefone').value.trim()
  const email    = document.getElementById('edit-email').value.trim()
  let ok = true

  if (!nome)                { mostrarErro('err-edit-nome',  'Informe seu nome.'); ok = false }
  if (!isEmailValido(email)){ mostrarErro('err-edit-email', 'E-mail inválido.');  ok = false }
  if (!ok) return

  const btn = document.getElementById('btn-salvar-perfil')
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  const { error } = await db
    .from('usuarios')
    .update({ nome, telefone, email })
    .eq('id', usuarioLogado.id)

  if (error) {
    mostrarErro('err-edit-nome', 'Erro ao salvar. Tente novamente.')
    if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar alterações' }
    return
  }

  // Se o e-mail mudou, atualiza também no Supabase Auth
  if (email !== usuarioLogado.email) {
    const { error: authError } = await db.auth.updateUser({ email })
    if (authError) {
      mostrarErro('err-edit-email',
        'Dados salvos, mas não foi possível atualizar o e-mail de login: ' + authError.message)
      if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar alterações' }
      return
    }
  }

  // Atualiza dados locais
  usuarioLogado.nome     = nome
  usuarioLogado.telefone = telefone
  usuarioLogado.email    = email

  fecharModalPerfil()
  renderHeader()
  renderTab('perfil')
}

function fecharModalPerfil() {
  document.getElementById('modal-editar-perfil')?.classList.remove('open')
  document.getElementById('modal-trocar-senha')?.classList.remove('open')
}

// ── Trocar senha ──────────────────────────────────────────────
function abrirTrocarSenha() {
  document.getElementById('nova-senha-atual').value    = ''
  document.getElementById('nova-senha-nova').value     = ''
  document.getElementById('nova-senha-confirma').value = ''
  limparTodosErros('err-senha-atual','err-senha-nova','err-senha-confirma')
  document.getElementById('modal-trocar-senha').classList.add('open')
}

async function salvarSenha() {
  limparTodosErros('err-senha-atual','err-senha-nova','err-senha-confirma')
  const atual    = document.getElementById('nova-senha-atual').value
  const nova     = document.getElementById('nova-senha-nova').value
  const confirma = document.getElementById('nova-senha-confirma').value
  let ok = true

  if (!atual)          { mostrarErro('err-senha-atual',    'Informe a senha atual.'); ok = false }
  if (nova.length < 6) { mostrarErro('err-senha-nova',     'Mínimo 6 caracteres.');   ok = false }
  if (nova !== confirma){ mostrarErro('err-senha-confirma','Senhas não coincidem.');   ok = false }
  if (!ok) return

  const btn = document.getElementById('btn-salvar-senha')
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>' }

  // Verifica senha atual fazendo re-login
  const { error: loginError } = await db.auth.signInWithPassword({
    email:    usuarioLogado.email,
    password: atual,
  })

  if (loginError) {
    mostrarErro('err-senha-atual', 'Senha atual incorreta.')
    if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar nova senha' }
    return
  }

  const { error } = await db.auth.updateUser({ password: nova })

  if (error) {
    mostrarErro('err-senha-nova', 'Erro ao alterar senha. Tente novamente.')
    if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar nova senha' }
    return
  }

  fecharModalPerfil()
  mostrarToast('Senha alterada com sucesso!')
}

// ── Notificações do morador ───────────────────────────────────
let notifMoradorAberto = false

function toggleNotifMorador() {
  notifMoradorAberto = !notifMoradorAberto
  const dropdown = document.getElementById('notif-dropdown-morador')
  if (!dropdown) return
  dropdown.style.display = notifMoradorAberto ? 'block' : 'none'
  if (notifMoradorAberto) renderNotifMorador()
}

function renderNotifMorador() {
  const lista = document.getElementById('notif-lista-morador')
  if (!lista) return

  const pendentes = todasEntregas.filter(e =>
    ['aguardando','notificado','entregue_porteiro'].includes(e.status)
  )

  if (!pendentes.length) {
    lista.innerHTML = `
      <div style="padding:24px;text-align:center;font-size:13px;color:var(--n-400)">
        Nenhuma entrega pendente 📦
      </div>`
    return
  }

  lista.innerHTML = pendentes.map(e => {
    const cfg = STATUS_CFG[e.status] || STATUS_CFG.aguardando
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:11px 16px;
           border-bottom:1px solid var(--n-100);cursor:pointer;transition:background .12s"
           onclick="toggleNotifMorador();mudarTab('pendentes')"
           onmouseenter="this.style.background='var(--p-50)'"
           onmouseleave="this.style.background='var(--n-0)'">
        <div style="width:8px;height:8px;border-radius:50%;background:${cfg.dot};flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--n-900)">${e.trans}</div>
          <div style="font-size:11px;color:var(--n-500);margin-top:2px">
            ${e.data} às ${e.hora} · ${e.volumes} volume${e.volumes > 1 ? 's' : ''}
          </div>
        </div>
        <span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:99px;
              background:${cfg.bg};color:${cfg.color};white-space:nowrap">${cfg.label}</span>
      </div>`
  }).join('')

  atualizarDotMorador()
}

function atualizarDotMorador() {
  const pendentes = todasEntregas.filter(e =>
    ['aguardando','notificado','entregue_porteiro'].includes(e.status)
  ).length
  const dot = document.getElementById('notif-dot-morador')
  if (dot) dot.style.display = pendentes > 0 ? 'block' : 'none'
}

// ── Notificações do morador ───────────────────────────────────
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
  const overlay = document.getElementById('modal-confirmar')
  if (!overlay) return
  overlay.classList.remove('open')
  // Aguarda a animação de saída antes de resetar o conteúdo interno
  const resetModal = () => {
    if (overlay.classList.contains('open')) return // foi reaberto antes do timeout
    document.getElementById('modal-form').style.display      = 'block'
    document.getElementById('confirm-success').style.display = 'none'
    entregaConfirmar = null
  }
  setTimeout(resetModal, 300)
}

async function confirmarRetirada() {
  if (!entregaConfirmar) return

  const { error } = await db
    .from('entregas')
    .update({ status: 'retirado', retirado_em: new Date().toISOString() })
    .eq('id', entregaConfirmar)

  if (error) {
    mostrarToast('Erro ao confirmar. Tente novamente.', 'erro')
    return
  }

  document.getElementById('modal-form').style.display      = 'none'
  document.getElementById('confirm-success').style.display = 'block'

  await carregarEntregas()
  setTimeout(() => { fecharModal(); renderTab(tabAtiva) }, 1800)
}

function bindEvents() {
  document.getElementById('modal-confirmar')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-confirmar')) fecharModal()
  })
  document.getElementById('modal-editar-perfil')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-editar-perfil')) fecharModalPerfil()
  })
  document.getElementById('modal-trocar-senha')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-trocar-senha')) fecharModalPerfil()
  })
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { fecharModal(); fecharModalPerfil() }
  })
  document.addEventListener('click', e => {
    if (notifMoradorAberto &&
        !e.target.closest('#btn-notif-morador') &&
        !e.target.closest('#notif-dropdown-morador')) {
      notifMoradorAberto = false
      const dropdown = document.getElementById('notif-dropdown-morador')
      if (dropdown) dropdown.style.display = 'none'
    }
  })
}