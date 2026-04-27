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

  renderStats()
  renderCards()
}

// ── Stats ─────────────────────────────────────────────────────
function renderStats() {
  document.getElementById('stat-aguardando').textContent =
    todasEntregas.filter(e => e.status === 'aguardando' || e.status === 'notificado').length
  document.getElementById('stat-retirado').textContent   =
    todasEntregas.filter(e => e.status === 'retirado').length
  document.getElementById('stat-expirado').textContent   =
    todasEntregas.filter(e => e.status === 'expirado').length
  document.getElementById('stat-total').textContent      = todasEntregas.length
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

// ── Nova entrega ──────────────────────────────────────────────
function abrirModalNova() {
  document.getElementById('modal-nova').classList.add('open')
  document.getElementById('form-nova').reset()
  limparTodosErros('err-apto','err-trans','err-volumes')
}

function fecharModalNova() {
  document.getElementById('modal-nova').classList.remove('open')
}

async function salvarEntrega(e) {
  e.preventDefault()
  limparTodosErros('err-apto','err-trans','err-volumes')

  const aptoTexto = document.getElementById('nova-apto').value.trim()
  const trans     = document.getElementById('nova-trans').value.trim()
  const volumes   = parseInt(document.getElementById('nova-volumes').value) || 0
  const obs       = document.getElementById('nova-obs').value.trim()
  let valido      = true

  if (!aptoTexto)  { mostrarErro('err-apto',    'Informe o apartamento.'); valido = false }
  if (!trans)      { mostrarErro('err-trans',   'Informe a transportadora.'); valido = false }
  if (!volumes)    { mostrarErro('err-volumes', 'Informe a quantidade.'); valido = false }
  if (!valido) return

  // Busca o apartamento pelo texto digitado (ex: "A-101")
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
    return
  }

  const { error } = await db.from('entregas').insert({
    condominio_id:  usuarioLogado.condominio_id,
    apartamento_id: aptoData.id,
    porteiro_id:    usuarioLogado.id,
    transportadora: trans,
    volumes,
    obs,
    status: 'aguardando',
  })

  if (error) { mostrarErro('err-trans', 'Erro ao registrar. Tente novamente.'); return }

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