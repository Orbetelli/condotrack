// ============================================================
//  confirmar-entrega/index.ts
//  Supabase Edge Function
//  Chamada quando porteiro marca entrega como "entregue pessoalmente"
//  Notifica morador para confirmar em 15 minutos
//
//  Deploy:
//    supabase functions deploy confirmar-entrega
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')                ?? ''
const SUPABASE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')   ?? ''
const RESEND_API_KEY   = Deno.env.get('RESEND_API_KEY')              ?? ''
const ZAPI_INSTANCE    = Deno.env.get('ZAPI_INSTANCE_ID')            ?? ''
const ZAPI_TOKEN       = Deno.env.get('ZAPI_TOKEN')                  ?? ''
const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN')          ?? ''
const FROM_EMAIL       = 'entregas@condotrack.com.br'
const FROM_NAME        = 'CondoTrack'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })
  }

  try {
    const { entrega_id, morador_id } = await req.json()

    if (!entrega_id) {
      return new Response(JSON.stringify({ error: 'entrega_id obrigatório' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    const db = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Busca dados da entrega
    const { data: entrega, error: errEntrega } = await db
      .from('entregas')
      .select(`
        id, transportadora, volumes, recebido_em,
        apartamentos ( id, numero, bloco ),
        condominios ( nome )
      `)
      .eq('id', entrega_id)
      .single()

    if (errEntrega || !entrega) {
      return new Response(JSON.stringify({ error: 'Entrega não encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // Busca morador — prioriza morador_id específico
    let morador: { nome: string; email?: string; telefone?: string } | null = null
    if (morador_id) {
      const { data } = await db
        .from('usuarios')
        .select('nome, email, telefone')
        .eq('id', morador_id)
        .single()
      morador = data
    } else {
      const { data } = await db
        .from('usuarios')
        .select('nome, email, telefone')
        .eq('apartamento_id', entrega.apartamentos?.id)
        .eq('perfil', 'morador')
        .eq('status', 'ativo')
        .single()
      morador = data
    }

    const apto     = entrega.apartamentos
    const condo    = entrega.condominios
    const nomeApto = apto ? `${apto.bloco}-${apto.numero}` : '—'

    // Envia notificações em paralelo
    const notifs = []

    if (morador?.email) {
      notifs.push(enviarEmail({
        email:    morador.email,
        nome:     morador.nome,
        nomeApto,
        trans:    entrega.transportadora,
        volumes:  entrega.volumes,
        nomeCondo: condo?.nome ?? '—',
        entregaId: entrega_id,
      }))
    }

    if (morador?.telefone) {
      notifs.push(enviarWhatsApp({
        telefone:  morador.telefone,
        nome:      morador.nome,
        nomeApto,
        trans:     entrega.transportadora,
        volumes:   entrega.volumes,
        nomeCondo: condo?.nome ?? '—',
        entregaId: entrega_id,
      }))
    }

    await Promise.allSettled(notifs)

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })

  } catch (err) {
    console.error('Erro inesperado:', err)
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  }
})

// ── E-mail ────────────────────────────────────────────────────
async function enviarEmail(p: {
  email: string; nome: string; nomeApto: string
  trans: string; volumes: number; nomeCondo: string; entregaId: string
}) {
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px">
        <tr><td align="center" style="padding-bottom:24px">
          <div style="background:#7C3AED;border-radius:10px;padding:10px 14px;display:inline-block">
            <span style="color:#fff;font-size:16px;font-weight:700">CondoTrack</span>
          </div>
        </td></tr>
        <tr><td style="background:#fff;border-radius:16px;border:1px solid #E4E4E7;padding:32px">
          <div style="text-align:center;margin-bottom:24px">
            <div style="font-size:32px;margin-bottom:12px">🤝</div>
            <div style="font-size:20px;font-weight:700;color:#18181B">Entrega realizada!</div>
            <div style="font-size:14px;color:#71717A;margin-top:6px">
              Olá, <strong>${p.nome}</strong>! O porteiro acabou de entregar seu pacote pessoalmente.
            </div>
          </div>

          <table width="100%" style="background:#F5F3FF;border-radius:12px;padding:16px;margin-bottom:20px">
            <tr><td style="font-size:12px;font-weight:700;color:#7C3AED;padding-bottom:10px;border-bottom:1px solid #DDD6FE">DETALHES</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #EDE9FE">
              <table width="100%"><tr>
                <td style="font-size:12px;color:#7C3AED">Transportadora</td>
                <td style="font-size:13px;font-weight:600;color:#2E1065;text-align:right">${p.trans}</td>
              </tr></table>
            </td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #EDE9FE">
              <table width="100%"><tr>
                <td style="font-size:12px;color:#7C3AED">Volumes</td>
                <td style="font-size:13px;font-weight:600;color:#2E1065;text-align:right">${p.volumes} volume${p.volumes > 1 ? 's' : ''}</td>
              </tr></table>
            </td></tr>
            <tr><td style="padding:8px 0">
              <table width="100%"><tr>
                <td style="font-size:12px;color:#7C3AED">Apartamento</td>
                <td style="font-size:13px;font-weight:600;color:#2E1065;text-align:right">Apto ${p.nomeApto}</td>
              </tr></table>
            </td></tr>
          </table>

          <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:10px;padding:16px;margin-bottom:20px;text-align:center">
            <div style="font-size:14px;font-weight:700;color:#92400E;margin-bottom:6px">⏰ Confirme em até 15 minutos!</div>
            <div style="font-size:13px;color:#78350F;line-height:1.6">
              Acesse o app do CondoTrack e confirme o recebimento.<br>
              Caso não confirme, o sistema marcará automaticamente como recebido.
            </div>
          </div>

          <div style="font-size:12px;color:#A1A1AA;text-align:center">CondoTrack · ${p.nomeCondo} · Mensagem automática</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    `${FROM_NAME} <${FROM_EMAIL}>`,
      to:      [p.email],
      subject: `🤝 Entrega realizada — Confirme em 15 minutos! Apto ${p.nomeApto}`,
      html,
    }),
  })
}

// ── WhatsApp ──────────────────────────────────────────────────
async function enviarWhatsApp(p: {
  telefone: string; nome: string; nomeApto: string
  trans: string; volumes: number; nomeCondo: string; entregaId: string
}) {
  const tel = formatarTelefone(p.telefone)
  if (!tel) return

  const mensagem = `🤝 *Entrega realizada!*

Olá, *${p.nome}*! O porteiro acabou de entregar seu pacote pessoalmente.

📦 *Transportadora:* ${p.trans}
📦 *Volumes:* ${p.volumes} volume${p.volumes > 1 ? 's' : ''}
🏠 *Apartamento:* ${p.nomeApto}
📍 *${p.nomeCondo}*

⏰ *Confirme o recebimento em até 15 minutos!*

Acesse o app do CondoTrack e confirme. Caso não confirme, o sistema marcará automaticamente como recebido.

_Mensagem automática — CondoTrack_`

  await fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
    body: JSON.stringify({ phone: tel, message: mensagem }),
  })
}

// ── Helper ────────────────────────────────────────────────────
function formatarTelefone(tel: string): string | null {
  const digits = tel.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 10 || digits.length === 11) return '55' + digits
  return null
}
