// ============================================================
//  alertar-entregas-acumuladas/index.ts
//  Supabase Edge Function — chamada pelo verificar-entregas
//  Alerta síndico e porteiro quando morador tem 3+ entregas pendentes
//
//  Deploy:
//    supabase functions deploy alertar-entregas-acumuladas
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')                ?? ''
const SUPABASE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')   ?? ''
const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY')              ?? ''
const ZAPI_INSTANCE     = Deno.env.get('ZAPI_INSTANCE_ID')            ?? ''
const ZAPI_TOKEN        = Deno.env.get('ZAPI_TOKEN')                  ?? ''
const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN')           ?? ''
const FROM_EMAIL        = 'entregas@condotrack.com.br'
const FROM_NAME         = 'CondoTrack'
const LIMITE_ENTREGAS   = 3 // Alerta a partir de 3 entregas pendentes

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
    const db = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Busca apartamentos com 3+ entregas pendentes
    const { data: entregas, error } = await db
      .from('entregas')
      .select(`
        apartamento_id,
        apartamentos ( numero, bloco, condominio_id,
          usuarios ( id, nome, email, telefone, perfil, status )
        ),
        condominios ( id, nome )
      `)
      .in('status', ['aguardando', 'notificado'])

    if (error || !entregas?.length) {
      return new Response(JSON.stringify({ ok: true, alertas: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // Agrupa por apartamento
    const porApto: Record<string, {
      count: number
      nomeApto: string
      condoId: string
      nomeCondo: string
      moradores: { nome: string; email?: string; telefone?: string }[]
    }> = {}

    for (const e of entregas) {
      const aptoId   = e.apartamento_id
      const apto     = e.apartamentos
      const nomeApto = apto ? `${apto.bloco}-${apto.numero}` : '—'
      const condoId  = apto?.condominio_id ?? e.condominios?.id ?? ''

      if (!porApto[aptoId]) {
        // Filtra só moradores ativos
        const moradores = Array.isArray(apto?.usuarios)
          ? apto.usuarios.filter((u: any) => u.perfil === 'morador' && u.status === 'ativo')
          : apto?.usuarios ? [apto.usuarios] : []

        porApto[aptoId] = {
          count:     0,
          nomeApto,
          condoId,
          nomeCondo: e.condominios?.nome ?? '—',
          moradores,
        }
      }
      porApto[aptoId].count++
    }

    let alertas = 0

    for (const [_, dados] of Object.entries(porApto)) {
      if (dados.count < LIMITE_ENTREGAS) continue

      // Busca admin e porteiros do condomínio para notificar
      const { data: responsaveis } = await db
        .from('usuarios')
        .select('nome, email, telefone, perfil')
        .eq('condominio_id', dados.condoId)
        .in('perfil', ['admin', 'porteiro'])
        .eq('status', 'ativo')

      if (!responsaveis?.length) continue

      const notifs = []

      for (const resp of responsaveis) {
        const nomeMorador = dados.moradores[0]?.nome ?? 'Morador'

        if (resp.email) {
          notifs.push(enviarEmailAlerta({
            email:        resp.email,
            nomeResp:     resp.nome,
            nomeApto:     dados.nomeApto,
            nomeMorador,
            nomeCondo:    dados.nomeCondo,
            qtdEntregas:  dados.count,
          }))
        }

        if (resp.telefone) {
          notifs.push(enviarWhatsAppAlerta({
            telefone:     resp.telefone,
            nomeResp:     resp.nome,
            nomeApto:     dados.nomeApto,
            nomeMorador,
            nomeCondo:    dados.nomeCondo,
            qtdEntregas:  dados.count,
          }))
        }
      }

      await Promise.allSettled(notifs)
      alertas++
    }

    return new Response(JSON.stringify({ ok: true, alertas }), {
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

// ── E-mail alerta ─────────────────────────────────────────────
async function enviarEmailAlerta(p: {
  email: string; nomeResp: string; nomeApto: string
  nomeMorador: string; nomeCondo: string; qtdEntregas: number
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
            <div style="font-size:32px;margin-bottom:12px">📦</div>
            <div style="font-size:20px;font-weight:700;color:#18181B">Entregas acumuladas!</div>
            <div style="font-size:14px;color:#71717A;margin-top:6px">
              Olá, <strong>${p.nomeResp}</strong>! Um morador está com muitas entregas pendentes.
            </div>
          </div>

          <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:12px;padding:16px;margin-bottom:20px;text-align:center">
            <div style="font-size:36px;font-weight:700;color:#92400E">${p.qtdEntregas}</div>
            <div style="font-size:13px;color:#78350F;margin-top:4px">entregas pendentes</div>
          </div>

          <table width="100%" style="background:#F5F3FF;border-radius:12px;padding:16px;margin-bottom:20px">
            <tr><td style="padding:8px 0;border-bottom:1px solid #EDE9FE">
              <table width="100%"><tr>
                <td style="font-size:12px;color:#7C3AED">Morador</td>
                <td style="font-size:13px;font-weight:600;color:#2E1065;text-align:right">${p.nomeMorador}</td>
              </tr></table>
            </td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #EDE9FE">
              <table width="100%"><tr>
                <td style="font-size:12px;color:#7C3AED">Apartamento</td>
                <td style="font-size:13px;font-weight:600;color:#2E1065;text-align:right">Apto ${p.nomeApto}</td>
              </tr></table>
            </td></tr>
            <tr><td style="padding:8px 0">
              <table width="100%"><tr>
                <td style="font-size:12px;color:#7C3AED">Condomínio</td>
                <td style="font-size:13px;font-weight:600;color:#2E1065;text-align:right">${p.nomeCondo}</td>
              </tr></table>
            </td></tr>
          </table>

          <div style="font-size:13px;color:#52525B;line-height:1.6;margin-bottom:16px">
            Recomendamos entrar em contato com o morador para que retire as entregas o quanto antes, evitando o acúmulo na portaria.
          </div>

          <div style="font-size:12px;color:#A1A1AA;text-align:center">CondoTrack · Mensagem automática</div>
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
      subject: `📦 Alerta: ${p.qtdEntregas} entregas acumuladas — Apto ${p.nomeApto}`,
      html,
    }),
  })
}

// ── WhatsApp alerta ───────────────────────────────────────────
async function enviarWhatsAppAlerta(p: {
  telefone: string; nomeResp: string; nomeApto: string
  nomeMorador: string; nomeCondo: string; qtdEntregas: number
}) {
  const tel = formatarTelefone(p.telefone)
  if (!tel) return

  const mensagem = `📦 *Alerta: Entregas acumuladas!*

Olá, *${p.nomeResp}*!

O morador *${p.nomeMorador}* do Apto *${p.nomeApto}* está com *${p.qtdEntregas} entregas pendentes* na portaria.

📍 *${p.nomeCondo}*

Recomendamos entrar em contato com o morador para que retire as entregas o quanto antes.

_Mensagem automática — CondoTrack_`

  await fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
    body: JSON.stringify({ phone: tel, message: mensagem }),
  })
}

function formatarTelefone(tel: string): string | null {
  const digits = tel.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 10 || digits.length === 11) return '55' + digits
  return null
}
