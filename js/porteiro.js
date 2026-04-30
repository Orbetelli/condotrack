// ============================================================
//  porteiro.js — painel do porteiro com Supabase real
// ============================================================

const STATUS_CONFIG = {
  aguardando: { label: 'Aguardando', bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  notificado: { label: 'Notificado', bg: '#EDE9FE', color: '#5B21B6', dot: '#A78BFA' },
  retirado:   { label: 'Retirado',   bg: '#F0FDF4', color: '#166534', dot: '#34D399' },
  expirado:   { label: 'Expirado',   bg: '#FEF2F2', color: '#991B1B', dot: '#F87171' },
}

let usuarioLogado    = null
let entregaDetalhe   = null
let filtroAtivo      = 'todos'
let buscaAtual       = ''
let todasEntregas    = []

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  usuarioLogado = await requireAuth(['porteiro', 'admin'])
  if (!usuarioLogado) return

  // Atualiza header com nome do porteiro
  const saud = (() => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite' })()
  document.querySelector('.header-greeting').textContent = `${saud}, ${usuarioLogado.nome.split(' ')[0]} 👋`
  document.querySelector('.header-sub').textContent      = `${usuarioLogado.condominios?.nome || 'Condomínio'} · Turno ${usuarioLogado.turno || 'A'}`

  await carregarEntregas()
  bindEvents()

  // Escuta atualizações em tempo real
  db.channel('entregas-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'entregas' }, () => {
      carregarEntregas()
    })
    .subscribe()
})

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
    id:          e.id,
    apto:        e.apartamentos ? `${e.apartamentos.bloco}-${e.apartamentos.numero}` : '—',
    morador:     '—',
    trans:       e.transportadora,
    data:        new Date(e.recebido_em).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }),
    hora:        new Date(e.recebido_em).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }),
    volumes:     e.volumes,
    status:      e.status,
    obs:         e.obs || '',
  }))

  // Sempre renderiza via tab ativa para garantir que os elementos existam
  const body = document.getElementById('tab-body-porteiro')
  if (tabPorteiroAtiva === 'dashboard') {
    renderDashboard(body)
  } else if (tabPorteiroAtiva === 'entregas') {
    renderEntregas(body)
  }
  // Moradores e histórico não dependem de todasEntregas diretamente
}

// ── Stats ─────────────────────────────────────────────────────
function renderStats() {
  const set = (id, val) => {
    const el = document.getElementById(id)
    if (el) el.textContent = val
  }
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
  document.getElementById('count-pendentes').textContent = pendentes.length
  cardPend.innerHTML = pendentes.length === 0
    ? '<div class="entry-empty">Nenhuma entrega pendente</div>'
    : pendentes.map(entryHTML).join('')

  const cardRet = document.getElementById('card-retiradas')
  document.getElementById('count-retiradas').textContent = retiradas.length
  cardRet.innerHTML = retiradas.length === 0
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

  const aptoTexto  = document.getElementById('nova-apto').value.trim()
  const trans      = document.getElementById('nova-trans').value.trim()
  const volumes    = parseInt(document.getElementById('nova-volumes').value) || 0
  const obs        = document.getElementById('nova-obs').value.trim()
  const moradorId  = document.getElementById('nova-morador')?.value || ''
  let valido       = true

  if (!aptoTexto)  { mostrarErro('err-apto',    'Informe o apartamento.'); valido = false }
  if (!trans)      { mostrarErro('err-trans',   'Informe a transportadora.'); valido = false }
  if (!volumes)    { mostrarErro('err-volumes', 'Informe a quantidade.'); valido = false }
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

  // Dispara e-mail e WhatsApp em background
  if (novaEntrega?.id) {
    const notifs = [
      db.functions.invoke('notificar-entrega',  { body: { entrega_id: novaEntrega.id, morador_id: moradorId || null } }),
      db.functions.invoke('notificar-whatsapp', { body: { entrega_id: novaEntrega.id, morador_id: moradorId || null } }),
    ]
    Promise.allSettled(notifs).then(results => {
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.warn(`Notificação ${i === 0 ? 'e-mail' : 'WhatsApp'} não enviada:`, r.reason)
        }
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
  document.getElementById('busca')?.addEventListener('input', function() {
    buscaAtual = this.value
    renderCards()
  })
  document.getElementById('btn-nova-entrega')?.addEventListener('click', abrirModalNova)
  document.getElementById('modal-nova')?.addEventListener('click', e => { if (e.target === document.getElementById('modal-nova')) fecharModalNova() })
  document.getElementById('modal-detalhe')?.addEventListener('click', e => { if (e.target === document.getElementById('modal-detalhe')) fecharDetalhe() })
  document.getElementById('form-nova')?.addEventListener('submit', salvarEntrega)
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { fecharModalNova(); fecharDetalhe() } })
}