// ============================================================
//  verificar-entregas/index.ts
//  Supabase Edge Function — Cron Job diário
//  Executa todo dia às 08:00 (horário de Brasília)
//
//  Faz duas coisas:
//  1. Marca como 'expirado' entregas com +5 dias sem retirada
//  2. Reenvia lembrete para entregas com 3 dias sem retirada
//
//  Deploy:
//    supabase functions deploy verificar-entregas
//
//  Cron (configurar no Supabase Dashboard → Edge Functions → verificar-entregas → Schedule):
//    0 11 * * *   (11:00 UTC = 08:00 BRT)
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')                ?? ''
const SUPABASE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')   ?? ''
const RESEND_API_KEY  = Deno.env.get('RESEND_API_KEY')              ?? ''
const ZAPI_INSTANCE   = Deno.env.get('ZAPI_INSTANCE_ID')            ?? ''
const ZAPI_TOKEN      = Deno.env.get('ZAPI_TOKEN')                  ?? ''
const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN')         ?? ''
const FROM_EMAIL      = 'entregas@condotrack.com.br'
const FROM_NAME       = 'CondoTrack'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  const db = createClient(SUPABASE_URL, SUPABASE_KEY)
  const agora    = new Date()
  const dia5     = new Date(agora.getTime() - 5 * 24 * 60 * 60 * 1000)
  const dia3     = new Date(agora.getTime() - 3 * 24 * 60 * 60 * 1000)
  const dia3fim  = new Date(agora.getTime() - 2 * 24 * 60 * 60 * 1000)
  const min15    = new Date(agora.getTime() - 15 * 60 * 1000)

  const resultado = {
    expiradas:       0,
    lembretes:       0,
    autoConfirmadas: 0,
    erros:           [] as string[],
  }

  // ── 0. AUTO-CONFIRMAR entregue_porteiro com +15 minutos ───────
  const { data: paraAutoConfirmar, error: errAuto } = await db
    .from('entregas')
    .select('id')
    .eq('status', 'entregue_porteiro')
    .lt('entregue_em', min15.toISOString())

  if (errAuto) {
    resultado.erros.push('Erro ao buscar auto-confirmação: ' + errAuto.message)
  } else if (paraAutoConfirmar?.length) {
    for (const e of paraAutoConfirmar) {
      await db.from('entregas').update({
        status:      'retirado',
        retirado_em: new Date().toISOString(),
      }).eq('id', e.id)
      resultado.autoConfirmadas++
    }
  }

  // ── 1. MARCAR COMO EXPIRADO ──────────────────────────────────
  // Busca entregas aguardando/notificadas há mais de 5 dias
  const { data: paraExpirar, error: errExp } = await db
    .from('entregas')
    .select(`
      id, recebido_em,
      apartamentos ( id, numero, bloco, usuarios ( id, nome, email, telefone ) ),
      condominios ( nome, endereco, cidade, uf )
    `)
    .in('status', ['aguardando', 'notificado'])
    .lt('recebido_em', dia5.toISOString())

  if (errExp) {
    resultado.erros.push('Erro ao buscar expiradas: ' + errExp.message)
  } else if (paraExpirar?.length) {
    for (const entrega of paraExpirar) {
      // Atualiza status para expirado
      await db.from('entregas').update({ status: 'expirado' }).eq('id', entrega.id)
      resultado.expiradas++

      // Notifica o morador sobre expiração
      const morador = entrega.apartamentos?.usuarios
      const apto    = entrega.apartamentos
      const condo   = entrega.condominios
      const nomeApto = apto ? `${apto.bloco}-${apto.numero}` : '—'
      const dataReceb = new Date(entrega.recebido_em).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      })

      if (morador?.email) {
        await enviarEmailExpiracao({
          email: morador.email,
          nome:  morador.nome,
          nomeApto,
          dataRecebido: dataReceb,
          nomeCondo: condo?.nome ?? '—',
        })
      }

      if (morador?.telefone) {
        await enviarWhatsAppExpiracao({
          telefone:    morador.telefone,
          nome:        morador.nome,
          nomeApto,
          dataRecebido: dataReceb,
          nomeCondo:   condo?.nome ?? '—',
        })
      }
    }
  }

  // ── 2. REENVIAR LEMBRETE (dia 3) ─────────────────────────────
  // Busca entregas aguardando entre 2 e 3 dias (janela de 24h para não reenviar múltiplas vezes)
  const { data: paraLembrete, error: errLem } = await db
    .from('entregas')
    .select(`
      id, recebido_em,
      morador_id,
      apartamentos ( id, numero, bloco, usuarios ( id, nome, email, telefone ) ),
      condominios ( nome )
    `)
    .in('status', ['aguardando', 'notificado'])
    .lt('recebido_em', dia3.toISOString())
    .gt('recebido_em', dia3fim.toISOString())

  if (errLem) {
    resultado.erros.push('Erro ao buscar lembretes: ' + errLem.message)
  } else if (paraLembrete?.length) {
    for (const entrega of paraLembrete) {
      // Busca morador — prioriza morador_id específico
      let morador: { nome: string; email?: string; telefone?: string } | null = null

      if (entrega.morador_id) {
        const { data } = await db
          .from('usuarios')
          .select('nome, email, telefone')
          .eq('id', entrega.morador_id)
          .single()
        morador = data
      } else {
        morador = entrega.apartamentos?.usuarios ?? null
      }

      const apto     = entrega.apartamentos
      const condo    = entrega.condominios
      const nomeApto = apto ? `${apto.bloco}-${apto.numero}` : '—'
      const dataReceb = new Date(entrega.recebido_em).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      })
      const diasPendente = Math.floor((agora.getTime() - new Date(entrega.recebido_em).getTime()) / (24 * 60 * 60 * 1000))

      if (morador?.email) {
        await enviarEmailLembrete({
          email: morador.email,
          nome:  morador.nome,
          nomeApto,
          dataRecebido: dataReceb,
          diasPendente,
          nomeCondo: condo?.nome ?? '—',
        })
      }

      if (morador?.telefone) {
        await enviarWhatsAppLembrete({
          telefone:    morador.telefone,
          nome:        morador.nome,
          nomeApto,
          dataRecebido: dataReceb,
          diasPendente,
          nomeCondo:   condo?.nome ?? '—',
        })
      }

      resultado.lembretes++
    }
  }

  console.log('verificar-entregas resultado:', resultado)

  return new Response(JSON.stringify(resultado), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
})

// ── E-mail: expiração ─────────────────────────────────────────
async function enviarEmailExpiracao(p: {
  email: string; nome: string; nomeApto: string
  dataRecebido: string; nomeCondo: string
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
            <div style="font-size:32px;margin-bottom:12px">⚠️</div>
            <div style="font-size:20px;font-weight:700;color:#18181B">Entrega expirada</div>
            <div style="font-size:14px;color:#71717A;margin-top:6px">Olá, ${p.nome}. Sua entrega completou 5 dias na portaria.</div>
          </div>
          <table width="100%" style="background:#FEF3C7;border-radius:12px;padding:16px;margin-bottom:20px">
            <tr><td style="font-size:12px;font-weight:700;color:#92400E;padding-bottom:10px;border-bottom:1px solid #FDE68A">DETALHES</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #FDE68A">
              <table width="100%"><tr>
                <td style="font-size:12px;color:#92400E">Apartamento</td>
                <td style="font-size:13px;font-weight:600;color:#78350F;text-align:right">Apto ${p.nomeApto}</td>
              </tr></table>
            </td></tr>
            <tr><td style="padding:8px 0">
              <table width="100%"><tr>
                <td style="font-size:12px;color:#92400E">Recebido em</td>
                <td style="font-size:13px;font-weight:600;color:#78350F;text-align:right">${p.dataRecebido}</td>
              </tr></table>
            </td></tr>
          </table>
          <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:14px;margin-bottom:20px;font-size:13px;color:#991B1B;line-height:1.6">
            <strong>Atenção:</strong> Sua entrega foi marcada como expirada. Entre em contato com a portaria do ${p.nomeCondo} para regularizar a situação.
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
      subject: `⚠️ Entrega expirada — Apto ${p.nomeApto} · ${p.nomeCondo}`,
      html,
    }),
  })
}

// ── E-mail: lembrete ──────────────────────────────────────────
async function enviarEmailLembrete(p: {
  email: string; nome: string; nomeApto: string
  dataRecebido: string; diasPendente: number; nomeCondo: string
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
            <div style="font-size:20px;font-weight:700;color:#18181B">Lembrete de entrega</div>
            <div style="font-size:14px;color:#71717A;margin-top:6px">Olá, ${p.nome}. Você ainda tem uma entrega aguardando retirada há ${p.diasPendente} dias.</div>
          </div>
          <table width="100%" style="background:#F5F3FF;border-radius:12px;padding:16px;margin-bottom:20px">
            <tr><td style="font-size:12px;font-weight:700;color:#7C3AED;padding-bottom:10px;border-bottom:1px solid #DDD6FE">DETALHES</td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #EDE9FE">
              <table width="100%"><tr>
                <td style="font-size:12px;color:#7C3AED">Apartamento</td>
                <td style="font-size:13px;font-weight:600;color:#2E1065;text-align:right">Apto ${p.nomeApto}</td>
              </tr></table>
            </td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid #EDE9FE">
              <table width="100%"><tr>
                <td style="font-size:12px;color:#7C3AED">Recebido em</td>
                <td style="font-size:13px;font-weight:600;color:#2E1065;text-align:right">${p.dataRecebido}</td>
              </tr></table>
            </td></tr>
            <tr><td style="padding:8px 0">
              <table width="100%"><tr>
                <td style="font-size:12px;color:#7C3AED">Prazo restante</td>
                <td style="font-size:13px;font-weight:600;color:#DC2626;text-align:right">${5 - p.diasPendente} dia${5 - p.diasPendente !== 1 ? 's' : ''}</td>
              </tr></table>
            </td></tr>
          </table>
          <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:14px;margin-bottom:20px;font-size:13px;color:#166534;line-height:1.6">
            📍 <strong>Local de retirada:</strong> ${p.nomeCondo} — Portaria<br>
            Retire sua entrega em até ${5 - p.diasPendente} dia${5 - p.diasPendente !== 1 ? 's' : ''} para evitar a expiração.
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
      subject: `📦 Lembrete: entrega aguardando há ${p.diasPendente} dias — Apto ${p.nomeApto}`,
      html,
    }),
  })
}

// ── WhatsApp: expiração ───────────────────────────────────────
async function enviarWhatsAppExpiracao(p: {
  telefone: string; nome: string; nomeApto: string
  dataRecebido: string; nomeCondo: string
}) {
  const tel = formatarTelefone(p.telefone)
  if (!tel) return

  const mensagem = `⚠️ *Entrega expirada!*

Olá, *${p.nome}*! Sua entrega no Apto *${p.nomeApto}* completou 5 dias na portaria e foi marcada como expirada.

📦 *Recebida em:* ${p.dataRecebido}
📍 *Local:* ${p.nomeCondo} — Portaria

Entre em contato com a portaria para regularizar a situação.

_Mensagem automática — CondoTrack_`

  await fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
    body: JSON.stringify({ phone: tel, message: mensagem }),
  })
}

// ── WhatsApp: lembrete ────────────────────────────────────────
async function enviarWhatsAppLembrete(p: {
  telefone: string; nome: string; nomeApto: string
  dataRecebido: string; diasPendente: number; nomeCondo: string
}) {
  const tel = formatarTelefone(p.telefone)
  if (!tel) return

  const restam = 5 - p.diasPendente
  const mensagem = `📦 *Lembrete: entrega aguardando!*

Olá, *${p.nome}*! Sua entrega está na portaria há *${p.diasPendente} dias* e ainda não foi retirada.

🏠 Apartamento: *${p.nomeApto}*
📅 Recebida em: *${p.dataRecebido}*
⏰ Prazo restante: *${restam} dia${restam !== 1 ? 's' : ''}*

📍 *${p.nomeCondo}* — Portaria

_Retire sua entrega para evitar a expiração!_

_Mensagem automática — CondoTrack_`

  await fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Client-Token': ZAPI_CLIENT_TOKEN },
    body: JSON.stringify({ phone: tel, message: mensagem }),
  })
}

// ── Helper: formata telefone ──────────────────────────────────
function formatarTelefone(tel: string): string | null {
  const digits = tel.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 10 || digits.length === 11) return '55' + digits
  return null
}