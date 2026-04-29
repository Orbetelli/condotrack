// ============================================================
//  notificar-entrega/index.ts
//  Supabase Edge Function
//  Dispara e-mail via Resend quando uma entrega é registrada
//
//  Deploy:
//    supabase functions deploy notificar-entrega
//
//  Variáveis de ambiente necessárias (Supabase Dashboard):
//    RESEND_API_KEY = re_xxxxxxxxxxxx
//    FROM_EMAIL     = entregas@condotrack.com.br
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')          ?? ''
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')            ?? ''
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const FROM_EMAIL     = Deno.env.get('FROM_EMAIL')              ?? 'entregas@condotrack.com.br'
const FROM_NAME      = 'CondoTrack'

// FIX: CORS headers para compatibilidade com chamadas diretas do frontend
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

serve(async (req: Request) => {
  // FIX: responder OPTIONS para preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS })
  }

  try {
    const { entrega_id } = await req.json()

    if (!entrega_id) {
      return new Response(JSON.stringify({ error: 'entrega_id obrigatório' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    // Usa service role para bypassar RLS e buscar todos os dados necessários
    const db = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Busca entrega + apartamento + morador + condomínio em uma query só
    const { data: entrega, error: errEntrega } = await db
      .from('entregas')
      .select(`
        id,
        transportadora,
        volumes,
        obs,
        recebido_em,
        apartamentos (
          numero,
          bloco,
          usuarios!apartamento_id ( nome, email, perfil )
        ),
        condominios ( nome, endereco, cidade, uf )
      `)
      .eq('id', entrega_id)
      .single()

    if (errEntrega || !entrega) {
      console.error('Entrega não encontrada:', errEntrega)
      return new Response(JSON.stringify({ error: 'Entrega não encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    // FIX: usuarios retorna array — filtra pelo perfil morador
    const usuariosApto = entrega.apartamentos?.usuarios
    const morador = Array.isArray(usuariosApto)
      ? usuariosApto.find((u: { perfil: string }) => u.perfil === 'morador')
      : usuariosApto

    const apto         = entrega.apartamentos
    const condo        = entrega.condominios
    const nomeApto     = apto ? `${apto.bloco}-${apto.numero}` : '—'

    // FIX: toLocaleString suporta opções de hora, toLocaleDateString não
    const dataReceb = new Date(entrega.recebido_em).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    })

    // Sem morador cadastrado no apartamento — não envia
    if (!morador?.email) {
      return new Response(JSON.stringify({ ok: true, msg: 'Morador sem e-mail, notificação ignorada' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    const volumes = entrega.volumes === 1
      ? '1 volume'
      : `${entrega.volumes} volumes`

    // Monta o HTML do e-mail
    const html = emailHTML({
      nomeMorador:    morador.nome,
      nomeApto,
      transportadora: entrega.transportadora,
      volumes,
      obs:            entrega.obs || null,
      dataRecebido:   dataReceb,
      nomeCondo:      condo?.nome ?? '—',
      enderecoCondo:  condo ? `${condo.endereco}, ${condo.cidade} — ${condo.uf}` : '—',
    })

    // Dispara o e-mail via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    `${FROM_NAME} <${FROM_EMAIL}>`,
        to:      [morador.email],
        subject: `📦 Entrega chegou! ${entrega.transportadora} — Apto ${nomeApto}`,
        html,
      }),
    })

    if (!resendRes.ok) {
      const err = await resendRes.text()
      console.error('Resend error:', err)
      return new Response(JSON.stringify({ error: 'Falha ao enviar e-mail', detail: err }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS },
      })
    }

    // FIX: trata erro do UPDATE de status
    const { error: updateError } = await db
      .from('entregas')
      .update({ status: 'notificado' })
      .eq('id', entrega_id)

    if (updateError) {
      console.error('Erro ao atualizar status da entrega:', updateError)
    }

    const resendData = await resendRes.json()
    return new Response(JSON.stringify({ ok: true, email_id: resendData.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })

  } catch (err) {
    console.error('Erro inesperado:', err)
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
})

// ── Template HTML do e-mail ───────────────────────────────────
function emailHTML(p: {
  nomeMorador:    string
  nomeApto:       string
  transportadora: string
  volumes:        string
  obs:            string | null
  dataRecebido:   string
  nomeCondo:      string
  enderecoCondo:  string
}) {
  const linhasDetalhes = [
    detalheRow('Transportadora', p.transportadora, false),
    detalheRow('Volumes',        p.volumes,        false),
    detalheRow('Apartamento',    'Apto ' + p.nomeApto, false),
    // FIX: última linha sem border-bottom
    detalheRow('Recebido em',    p.dataRecebido,   !p.obs),
    p.obs ? detalheRow('Observação', p.obs, true) : '',
  ].join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sua entrega chegou!</title>
</head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;padding:32px 16px">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:24px">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#7C3AED;border-radius:10px;padding:10px 14px">
                    <span style="color:#fff;font-size:16px;font-weight:700;letter-spacing:-.3px">CondoTrack</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card principal -->
          <tr>
            <td style="background:#fff;border-radius:16px;border:1px solid #E4E4E7;padding:32px 32px 24px">

              <!-- Ícone de entrega -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:20px">
                    <div style="width:64px;height:64px;background:#F5F3FF;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:28px">📦</div>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:6px">
                    <span style="font-size:22px;font-weight:700;color:#18181B;letter-spacing:-.3px">Sua entrega chegou!</span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-bottom:28px">
                    <span style="font-size:14px;color:#71717A">Olá, ${p.nomeMorador}. Seu pacote está na portaria.</span>
                  </td>
                </tr>
              </table>

              <!-- Detalhes da entrega -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F3FF;border-radius:12px;padding:20px;margin-bottom:20px">
                <tr>
                  <td style="padding-bottom:12px;border-bottom:1px solid #DDD6FE">
                    <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#7C3AED">Detalhes da entrega</span>
                  </td>
                </tr>
                ${linhasDetalhes}
              </table>

              <!-- Local de retirada -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:10px;padding:14px 16px;margin-bottom:24px">
                <tr>
                  <td>
                    <span style="font-size:12px;font-weight:700;color:#166534;display:block;margin-bottom:3px">Local de retirada</span>
                    <span style="font-size:13px;color:#15803D">${p.nomeCondo} — Portaria</span><br>
                    <span style="font-size:12px;color:#16A34A">${p.enderecoCondo}</span>
                  </td>
                </tr>
              </table>

              <!-- Aviso -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-top:16px;border-top:1px solid #F4F4F5">
                    <span style="font-size:12px;color:#A1A1AA;line-height:1.6">
                      Retire sua entrega na portaria mediante apresentação de documento.
                      Após 5 dias úteis sem retirada, o item poderá ser devolvido ao remetente.
                    </span>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Rodapé -->
          <tr>
            <td align="center" style="padding-top:20px">
              <span style="font-size:12px;color:#A1A1AA">
                CondoTrack · Sistema de gestão de entregas<br>
                Este e-mail foi enviado automaticamente. Não responda.
              </span>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`
}

// FIX: parâmetro isLast controla border-bottom da última linha
function detalheRow(label: string, valor: string, isLast: boolean) {
  const border = isLast ? 'none' : '1px solid #EDE9FE'
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:${border}">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:12px;color:#7C3AED;width:40%">${label}</td>
            <td style="font-size:13px;font-weight:600;color:#2E1065;text-align:right">${valor}</td>
          </tr>
        </table>
      </td>
    </tr>`
}