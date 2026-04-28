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
  bindEvents()
})

// ── Navegação entre abas ──────────────────────────────────────
async function mudarTab(tab) {
  tabAtiva = tab

  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'))
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active')

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
    card.innerHTML = `
      <div class="condo-card-top">
        <div>
          <div class="condo-card-name">${c.nome}</div>
          <div class="condo-card-addr">${c.endereco} · ${c.cidade}/${c.uf}</div>
        </div>
        <span class="status-pill s-${c.status}">${statusLabel(c.status)}</span>
      </div>
      <div class="condo-stats">
        <div class="condo-stat">${iconAptos()} <strong>${c.total_aptos}</strong> aptos</div>
        <div class="condo-stat">${iconRelogio()} Criado: ${new Date(c.criado_em).toLocaleDateString('pt-BR')}</div>
      </div>
      <div class="condo-footer">
        <button class="mini-btn" onclick="abrirDetalhe('${c.id}')">Detalhes</button>
        <button class="mini-btn" onclick="editarCondo('${c.id}')">Editar</button>
        ${c.status === 'pendente'
          ? `<button class="mini-btn primary" onclick="alert('Convite por e-mail disponível no tópico 5')">Reenviar convite</button>`
          : `<button class="mini-btn primary" onclick="alert('Acesso direto disponível em breve')">Acessar painel</button>`}
      </div>`
    grid.insertBefore(card, addCard)
  })
}

// ── USUÁRIOS ─────────────────────────────────────────────────
async function renderUsuarios(body) {
  const { data } = await db
    .from('usuarios')
    .select('*, condominios(nome)')
    .order('criado_em', { ascending: false })

  const lista = data || []

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
        <option value="admin">Admin</option>
        <option value="porteiro">Porteiro</option>
        <option value="morador">Morador</option>
      </select>
    </div>
    <div class="panel-card-sa" id="lista-usuarios">
      <div class="panel-card-sa-head">
        <span class="panel-card-sa-title">Usuários cadastrados</span>
        <span style="font-size:11px;color:var(--n-400)">${lista.length} total</span>
      </div>
      <div id="users-body">
        ${lista.map(u => userRowHTML(u, perfilCores)).join('') || '<div class="panel-empty-sa">Nenhum usuário encontrado</div>'}
      </div>
    </div>
  `

  // Filtros
  const filtrar = () => {
    const q     = document.getElementById('busca-user').value.toLowerCase()
    const perf  = document.getElementById('filtro-perfil').value
    const filt  = lista.filter(u =>
      (!q    || u.nome.toLowerCase().includes(q)) &&
      (!perf || u.perfil === perf))
    document.getElementById('users-body').innerHTML =
      filt.map(u => userRowHTML(u, perfilCores)).join('') ||
      '<div class="panel-empty-sa">Nenhum usuário encontrado</div>'
  }

  document.getElementById('busca-user')?.addEventListener('input', filtrar)
  document.getElementById('filtro-perfil')?.addEventListener('change', filtrar)
}

function userRowHTML(u, cores) {
  const cfg      = cores[u.perfil] || { bg:'#F8FAFC', color:'#64748B' }
  const iniciais = u.nome.split(' ').map(n => n[0]).slice(0,2).join('')
  const condo    = u.condominios?.nome || '—'
  const email    = u.email || '—'
  const isMe     = u.auth_id === usuarioLogado?.auth_id
  return `
    <div class="panel-row-sa">
      <div class="panel-avatar-sa" style="background:${cfg.bg};color:${cfg.color}">${iniciais}</div>
      <div class="panel-row-info-sa">
        <div class="panel-row-name-sa">${u.nome}</div>
        <div class="panel-row-sub-sa">${email} · ${condo} · ${new Date(u.criado_em).toLocaleDateString('pt-BR')}</div>
      </div>
      <span class="panel-row-badge-sa" style="background:${cfg.bg};color:${cfg.color}">${u.perfil}</span>
      <span class="panel-row-badge-sa" style="background:${u.status==='ativo'?'#F0FDF4':'#F8FAFC'};color:${u.status==='ativo'?'#166534':'#94A3B8'}">${u.status}</span>
      ${!isMe && u.auth_id ? `
        <button onclick="abrirResetSenha('${u.id}','${u.nome}','${u.auth_id}')"
          style="background:#FEF3C7;color:#92400E;border:none;border-radius:7px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font-sans);white-space:nowrap"
          title="Resetar senha">
          🔑 Reset
        </button>` : ''}
    </div>`
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
    // Usa a Admin API do Supabase para atualizar a senha
    const { error } = await db.auth.admin.updateUserById(resetAuthId, {
      password: nova
    })

    if (error) {
      // Fallback: atualiza via rpc se admin não disponível no frontend
      mostrarErro('err-reset-nova', 'Erro: ' + error.message + '. Use o Supabase Dashboard para resetar.')
      if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar nova senha' }
      return
    }

    // Mostra sucesso
    document.getElementById('reset-form').style.display      = 'none'
    document.getElementById('reset-resultado').style.display = 'block'
    document.getElementById('reset-resultado').innerHTML = `
      <div style="text-align:center;padding:16px 0">
        <div style="width:56px;height:56px;background:#F0FDF4;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px">
          <svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="#16A34A" style="width:28px;height:28px">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <div style="font-size:16px;font-weight:700;color:var(--n-900);margin-bottom:6px">Senha alterada!</div>
        <div style="font-size:13px;color:var(--n-500);margin-bottom:18px">A nova senha de <strong>${resetUsuarioNome}</strong> foi definida com sucesso.</div>
        <button onclick="fecharModal()" class="ct-btn-primary" style="width:auto;padding:9px 24px">Fechar</button>
      </div>`

  } catch (err) {
    console.error(err)
    mostrarErro('err-reset-nova', 'Erro inesperado ao resetar senha.')
    if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar nova senha' }
  }
}

// ── RELATÓRIOS ────────────────────────────────────────────────
async function renderRelatorios(body) {
  const [condos, users, entregas] = await Promise.all([
    db.from('condominios').select('id, nome, status, total_aptos'),
    db.from('usuarios').select('id, perfil, status'),
    db.from('entregas').select('id, status, recebido_em'),
  ])

  const condoData    = condos.data  || []
  const userData     = users.data   || []
  const entregaData  = entregas.data || []

  const hoje     = new Date()
  const mesAtual = hoje.getMonth()
  const anoAtual = hoje.getFullYear()
  const entMes   = entregaData.filter(e => {
    const d = new Date(e.recebido_em)
    return d.getMonth() === mesAtual && d.getFullYear() === anoAtual
  })

  body.innerHTML = `
    <div class="stats-grid" style="margin-bottom:20px">
      ${statCard(condoData.filter(c=>c.status==='ativo').length, 'Condomínios ativos', '#EDE9FE','#5B21B6', iconPredio())}
      ${statCard(userData.filter(u=>u.perfil==='morador').length, 'Moradores', '#EFF6FF','#1D4ED8', iconPessoas())}
      ${statCard(entMes.length, 'Entregas este mês', '#FEF3C7','#92400E', iconCaixa())}
      ${statCard(entregaData.filter(e=>e.status==='aguardando').length, 'Pendentes agora', '#FEF2F2','#991B1B', iconAlerta())}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div class="panel-card-sa">
        <div class="panel-card-sa-head"><span class="panel-card-sa-title">Condomínios</span></div>
        <div style="padding:4px 0">
          ${condoData.map(c => `
            <div class="panel-row-sa">
              <div style="width:8px;height:8px;border-radius:50%;background:${c.status==='ativo'?'#34D399':'#F59E0B'};flex-shrink:0"></div>
              <div class="panel-row-info-sa">
                <div class="panel-row-name-sa">${c.nome}</div>
                <div class="panel-row-sub-sa">${c.total_aptos} aptos</div>
              </div>
              <span class="panel-row-badge-sa" style="background:${c.status==='ativo'?'#F0FDF4':'#FEF3C7'};color:${c.status==='ativo'?'#166534':'#92400E'}">${statusLabel(c.status)}</span>
            </div>`).join('') || '<div class="panel-empty-sa">Nenhum condomínio</div>'}
        </div>
      </div>

      <div class="panel-card-sa">
        <div class="panel-card-sa-head"><span class="panel-card-sa-title">Usuários por perfil</span></div>
        <div style="padding:16px;display:flex;flex-direction:column;gap:10px">
          ${['superadmin','admin','porteiro','morador'].map(p => {
            const qtd   = userData.filter(u => u.perfil === p).length
            const total = userData.length || 1
            const cores = { superadmin:['#EDE9FE','#5B21B6'], admin:['#F3E8FF','#6D28D9'], porteiro:['#EFF6FF','#1D4ED8'], morador:['#F0FDFA','#0F766E'] }
            return statusBar(p.charAt(0).toUpperCase()+p.slice(1), qtd, total, cores[p][1], cores[p][0])
          }).join('')}
        </div>
      </div>
    </div>
  `
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

// ── Modal: novo/editar condomínio ─────────────────────────────
function abrirModalNovo() {
  condominioEditando = null
  document.getElementById('modal-title').textContent = 'Novo condomínio'
  document.getElementById('form-condo').reset()
  limparTodosErros('err-nome-c','err-end-c','err-sindico','err-email-s')
  document.getElementById('modal-condo').classList.add('open')
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

function abrirModalSA() { mudarTab('equipe') }

function fecharModal() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'))
}

async function salvarCondo(e) {
  e.preventDefault()
  limparTodosErros('err-nome-c','err-end-c','err-sindico','err-email-s')

  const nome   = document.getElementById('c-nome').value.trim()
  const end    = document.getElementById('c-end').value.trim()
  const cidade = document.getElementById('c-cidade').value.trim()
  const uf     = document.getElementById('c-uf').value.trim()
  const cep    = document.getElementById('c-cep').value.trim()
  const blocos = parseInt(document.getElementById('c-blocos').value) || 1
  const aptos  = parseInt(document.getElementById('c-aptos').value)  || 0
  const sindico = document.getElementById('c-sindico')?.value.trim() || ''
  const emailS  = document.getElementById('c-email-s')?.value.trim() || ''

  let ok = true
  if (!nome) { mostrarErro('err-nome-c', 'Informe o nome.'); ok = false }
  if (!end)  { mostrarErro('err-end-c',  'Informe o endereço.'); ok = false }
  if (!condominioEditando && !sindico)          { mostrarErro('err-sindico', 'Informe o síndico.'); ok = false }
  if (!condominioEditando && !isEmailValido(emailS)) { mostrarErro('err-email-s', 'E-mail inválido.'); ok = false }
  if (!ok) return

  if (condominioEditando) {
    await db.from('condominios').update({ nome, endereco: end, cidade, uf, cep, blocos, total_aptos: aptos }).eq('id', condominioEditando)
  } else {
    await db.from('condominios').insert({ nome, endereco: end, cidade, uf, cep, blocos, total_aptos: aptos, status: 'pendente' })
  }

  fecharModal()
  mudarTab(tabAtiva)
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
  document.getElementById('det-sindico').textContent = '—'
  document.getElementById('det-email').textContent  = '—'
  document.getElementById('det-mord').textContent   = '—'
  document.getElementById('det-port').textContent   = '—'
  document.getElementById('modal-detalhe').classList.add('open')
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
  document.getElementById('modal-reset')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-reset')) fecharModal()
  })
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal() })
}