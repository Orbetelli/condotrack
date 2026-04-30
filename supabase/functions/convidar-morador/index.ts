// ============================================================
//  convidar-morador/index.ts
//  Supabase Edge Function
//  Envia convite por e-mail e WhatsApp para morador pré-cadastrado
//  completar o cadastro com senha
//
//  Deploy:
//    supabase functions deploy convidar-morador
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')                ?? ''
const SUPABASE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')   ?? ''
const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY')              ?? ''
const ZAPI_INSTANCE     = Deno.env.get('ZAPI_INSTANCE_ID')            ?? ''
const ZAPI_TOKEN        = Deno.env.get('ZAPI_TOKEN')                  ?? ''
const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN')           ?? ''
const APP_URL           = Deno.env.get('APP_URL')                     ?? 'https://condotrack-opal.vercel.app'
const FROM_EMAIL        = 'entregas@condotrack.com.br'
const FROM_NAME         = 'CondoTrack'

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
    const { usuario_id } = await req.json()

    if (!usuario_id) {
      return new Response(JSON.stringify({ error: 'usuario_id obrigatório' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    const db = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Busca dados do morador
    const { data: usuario, error: errUser } = await db
      .from('usuarios')
      .select(`
        id, nome, email, telefone, status,
        apartamentos ( numero, bloco ),
        condominios ( id, nome )
      `)
      .eq('id', usuario_id)
      .single()

    if (errUser || !usuario) {
      return new Response(JSON.stringify({ error: 'Usuário não encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    if (usuario.status !== 'pendente') {
      return new Response(JSON.stringify({ error: 'Usuário já possui cadastro completo' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // Gera token único de convite
    const token = crypto.randomUUID()
    const condoId = usuario.condominios?.id

    // Salva token no banco
    await db.from('usuarios').update({
      convite_token:      token,
      convite_enviado_em: new Date().toISOString(),
    }).eq('id', usuario_id)

    const apto     = usuario.apartamentos
    const nomeApto = apto ? `${apto.bloco}-${apto.numero}` : '—'
    const nomeCondo = usuario.condominios?.nome ?? '—'
    const linkConvite = `${APP_URL}/pages/cadastro.html?convite=${token}&condo=${condoId}`

    // Envia notificações
    const notifs = []

    if (usuario.email) {
      notifs.push(enviarEmailConvite({
        email:      usuario.email,
        nome:       usuario.nome,
        nomeApto,
        nomeCondo,
        linkConvite,
      }))
    }

    if (usuario.telefone) {
      notifs.push(enviarWhatsAppConvite({
        telefone:   usuario.telefone,
        nome:       usuario.nome,
        nomeApto,
        nomeCondo,
        linkConvite,
      }))
    }

    await Promise.allSettled(notifs)

    return new Response(JSON.stringify({ ok: true, token }), {
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

// ── E-mail convite ────────────────────────────────────────────
async function enviarEmailConvite(p: {
  email: string; nome: string; nomeApto: string
  nomeCondo: string; linkConvite: string
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
            <div style="font-size:32px;margin-bottom:12px">🏠</div>
            <div style="font-size:20px;font-weight:700;color:#18181B">Bem-vindo ao CondoTrack!</div>
            <div style="font-size:14px;color:#71717A;margin-top:6px">
              Olá, <strong>${p.nome}</strong>! Você foi cadastrado no <strong>${p.nomeCondo}</strong>.
            </div>
          </div>

          <table width="100%" style="background:#F5F3FF;border-radius:12px;padding:16px;margin-bottom:20px">
            <tr><td style="padding:8px 0;border-bottom:1px solid #EDE9FE">
              <table width="100%"><tr>
                <td style="font-size:12px;color:#7C3AED">Condomínio</td>
                <td style="font-size:13px;font-weight:600;color:#2E1065;text-align:right">${p.nomeCondo}</td>
              </tr></table>
            </td></tr>
            <tr><td style="padding:8px 0">
              <table width="100%"><tr>
                <td style="font-size:12px;color:#7C3AED">Apartamento</td>
                <td style="font-size:13px;font-weight:600;color:#2E1065;text-align:right">Apto ${p.nomeApto}</td>
              </tr></table>
            </td></tr>
          </table>

          <div style="text-align:center;margin-bottom:20px">
            <p style="font-size:14px;color:#52525B;line-height:1.6;margin-bottom:20px">
              Complete seu cadastro clicando no botão abaixo para criar sua senha de acesso e começar a receber notificações de entregas.
            </p>
            <a href="${p.linkConvite}" style="display:inline-block;background:#7C3AED;color:#fff;
               text-decoration:none;padding:13px 32px;border-radius:10px;font-size:15px;
               font-weight:600;letter-spacing:-.2px">
              Completar cadastro →
            </a>
          </div>

          <div style="background:#F4F4F5;border-radius:8px;padding:12px;font-size:11px;color:#71717A;text-align:center;line-height:1.6">
            Se o botão não funcionar, copie e cole este link no navegador:<br>
            <span style="color:#7C3AED;word-break:break-all">${p.linkConvite}</span>
          </div>

          <div style="font-size:12px;color:#A1A1AA;text-align:center;margin-top:20px">
            CondoTrack · Mensagem automática
          </div>
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
      subject: `🏠 Complete seu cadastro no CondoTrack — ${p.nomeCondo}`,
      html,
    }),
  })
}

// ── WhatsApp convite ──────────────────────────────────────────
async function enviarWhatsAppConvite(p: {
  telefone: string; nome: string; nomeApto: string
  nomeCondo: string; linkConvite: string
}) {
  const tel = formatarTelefone(p.telefone)
  if (!tel) return

  const mensagem = `🏠 *Bem-vindo ao CondoTrack!*

Olá, *${p.nome}*! Você foi cadastrado no condomínio *${p.nomeCondo}*.

🏠 *Apartamento:* ${p.nomeApto}

Para receber notificações de entregas, complete seu cadastro criando sua senha de acesso:

🔗 ${p.linkConvite}

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
