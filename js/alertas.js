// ============================================================
//  alertas.js — sistema de alertas de atualização · CondoTrack
//  Importar em todas as páginas após supabase.js e utils.js
//  Chamar: await verificarAlertas() no DOMContentLoaded
// ============================================================

const ALERTAS_VISTO_KEY = 'ct_alertas_vistos'

// ── Verifica e exibe alertas não vistos ──────────────────────
async function verificarAlertas() {
  try {
    const { data: alertas, error } = await db
      .from('alertas_sistema')
      .select('id, versao, titulo, descricao, tipo, criado_em')
      .eq('ativo', true)
      .order('criado_em', { ascending: false })

    if (error || !alertas?.length) return

    // Pega IDs já vistos nesta sessão
    const vistos = new Set(
      JSON.parse(sessionStorage.getItem(ALERTAS_VISTO_KEY) || '[]')
    )

    // Filtra apenas os não vistos
    const novos = alertas.filter(a => !vistos.has(a.id))
    if (!novos.length) return

    // Exibe o mais recente (se tiver mais de um, empilha na fila)
    await exibirFilaAlertas(novos, vistos)

  } catch (err) {
    console.warn('Erro ao verificar alertas:', err)
  }
}

// ── Exibe alertas em sequência ───────────────────────────────
async function exibirFilaAlertas(fila, vistos) {
  for (const alerta of fila) {
    await new Promise(resolve => exibirAlerta(alerta, vistos, resolve))
  }
}

// ── Renderiza o pop-up do alerta ─────────────────────────────
function exibirAlerta(alerta, vistos, onClose) {
  // Remove alerta anterior se existir
  document.getElementById('ct-alerta-overlay')?.remove()

  const TIPOS = {
    info:    { icon: '🚀', cor: 'var(--p-600)', bg: 'var(--p-50)',  borda: 'var(--p-200)', label: 'Atualização do sistema' },
    aviso:   { icon: '⚠️', cor: '#D97706',      bg: '#FFFBEB',      borda: '#FDE68A',      label: 'Aviso importante'       },
    critico: { icon: '🔴', cor: '#DC2626',      bg: '#FEF2F2',      borda: '#FECACA',      label: 'Atenção requerida'      },
  }
  const cfg  = TIPOS[alerta.tipo] || TIPOS.info
  const data = new Date(alerta.criado_em).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric'
  })

  // Converte quebras de linha em parágrafos
  const paragrafos = alerta.descricao
    .split('\n')
    .filter(l => l.trim())
    .map(l => `<p style="margin:0 0 8px;font-size:14px;color:var(--n-600);line-height:1.65">${_escaparHTML(l)}</p>`)
    .join('')

  const overlay = document.createElement('div')
  overlay.id = 'ct-alerta-overlay'
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:99999;
    background:rgba(0,0,0,.55);backdrop-filter:blur(3px);
    display:flex;align-items:center;justify-content:center;
    padding:20px;animation:fadeIn .25s ease both;
  `

  overlay.innerHTML = `
    <div id="ct-alerta-card" style="
      background:var(--n-0);border-radius:var(--radius-xl);
      width:100%;max-width:520px;max-height:88vh;
      overflow-y:auto;
      box-shadow:0 24px 80px rgba(0,0,0,.3);
      animation:modalIn .3s cubic-bezier(.34,1.56,.64,1) both;
      position:relative;
    ">

      <!-- Faixa superior colorida -->
      <div style="
        background:${cfg.bg};border-bottom:2px solid ${cfg.borda};
        padding:20px 24px 18px;border-radius:var(--radius-xl) var(--radius-xl) 0 0;
      ">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="
              width:44px;height:44px;border-radius:12px;
              background:${cfg.cor};display:flex;align-items:center;
              justify-content:center;font-size:22px;flex-shrink:0;
              box-shadow:0 4px 12px rgba(0,0,0,.15);
            ">${cfg.icon}</div>
            <div>
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;
                          letter-spacing:.07em;color:${cfg.cor};margin-bottom:3px">
                ${_escaparHTML(cfg.label)}
              </div>
              <div style="font-size:19px;font-weight:800;color:var(--n-900);
                          letter-spacing:-.3px;line-height:1.2">
                ${_escaparHTML(alerta.titulo)}
              </div>
            </div>
          </div>
          <button id="ct-alerta-fechar" style="
            width:30px;height:30px;border-radius:8px;border:none;
            background:rgba(0,0,0,.06);cursor:pointer;flex-shrink:0;
            display:flex;align-items:center;justify-content:center;
            transition:background .12s;margin-top:2px;
          " onmouseenter="this.style.background='rgba(0,0,0,.12)'"
             onmouseleave="this.style.background='rgba(0,0,0,.06)'">
            <svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round"
                 fill="none" stroke="var(--n-600)" style="width:14px;height:14px">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Badges versão + data -->
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
          <span style="
            background:${cfg.cor};color:#fff;
            font-size:11px;font-weight:700;
            padding:3px 10px;border-radius:99px;
          ">v${_escaparHTML(alerta.versao)}</span>
          <span style="
            background:rgba(0,0,0,.06);color:var(--n-600);
            font-size:11px;font-weight:600;
            padding:3px 10px;border-radius:99px;
          ">${data}</span>
        </div>
      </div>

      <!-- Corpo da mensagem -->
      <div style="padding:22px 24px 8px">
        ${paragrafos}
      </div>

      <!-- Rodapé -->
      <div style="
        padding:16px 24px 22px;
        display:flex;align-items:center;justify-content:space-between;
        gap:12px;flex-wrap:wrap;
      ">
        <span style="font-size:12px;color:var(--n-400)">
          CondoTrack · ${data}
        </span>
        <button id="ct-alerta-ok" style="
          background:${cfg.cor};color:#fff;border:none;
          border-radius:var(--radius-md);padding:10px 28px;
          font-size:14px;font-weight:700;cursor:pointer;
          font-family:var(--font-sans);
          box-shadow:0 3px 10px rgba(0,0,0,.18);
          transition:opacity .15s;
        " onmouseenter="this.style.opacity='.88'"
           onmouseleave="this.style.opacity='1'">
          Entendido ✓
        </button>
      </div>
    </div>
  `

  document.body.appendChild(overlay)

  // Marca como visto e fecha
  const fechar = () => {
    vistos.add(alerta.id)
    sessionStorage.setItem(ALERTAS_VISTO_KEY, JSON.stringify([...vistos]))
    overlay.style.animation = 'fadeIn .2s ease reverse both'
    setTimeout(() => { overlay.remove(); onClose?.() }, 200)
  }

  document.getElementById('ct-alerta-ok').addEventListener('click', fechar)
  document.getElementById('ct-alerta-fechar').addEventListener('click', fechar)

  // Fecha com Escape
  const onKeydown = e => {
    if (e.key === 'Escape') { document.removeEventListener('keydown', onKeydown); fechar() }
  }
  document.addEventListener('keydown', onKeydown)

  // NÃO fecha ao clicar no overlay — força o usuário a ler
}

// ── Helper: escapa HTML para evitar XSS ──────────────────────
function _escaparHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
