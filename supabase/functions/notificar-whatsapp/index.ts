// ============================================================
//  notificar-whatsapp/index.ts
//  Supabase Edge Function
//  Dispara mensagem WhatsApp via Z-API quando entrega é registrada
//
//  Deploy:
//    supabase functions deploy notificar-whatsapp
//
//  Variáveis de ambiente necessárias (Supabase Dashboard → Functions → Secrets):
//    ZAPI_INSTANCE_ID    = seu Instance ID do Z-API
//    ZAPI_TOKEN          = seu Token do Z-API
//    ZAPI_CLIENT_TOKEN   = seu Client Token do Z-API
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ZAPI_INSTANCE_ID  = Deno.env.get('ZAPI_INSTANCE_ID')  ?? ''
const ZAPI_TOKEN        = Deno.env.get('ZAPI_TOKEN')        ?? ''
const ZAPI_CLIENT_TOKEN = Deno.env.get('ZAPI_CLIENT_TOKEN') ?? ''
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')      ?? ''
const SUPABASE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

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
    const { entrega_id } = await req.json()

    if (!entrega_id) {
      return new Response(JSON.stringify({ error: 'entrega_id obrigatório' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // Usa service role para bypass do RLS
    const db = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Busca entrega + apartamento + morador + condomínio
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
          usuarios ( nome, telefone )
        ),
        condominios ( nome, endereco, cidade, uf )
      `)
      .eq('id', entrega_id)
      .single()

    if (errEntrega || !entrega) {
      console.error('Entrega não encontrada:', errEntrega)
      return new Response(JSON.stringify({ error: 'Entrega não encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    const morador  = entrega.apartamentos?.usuarios
    const apto     = entrega.apartamentos
    const condo    = entrega.condominios
    const nomeApto = apto ? `${apto.bloco}-${apto.numero}` : '—'

    // Sem telefone cadastrado — ignora silenciosamente
    if (!morador?.telefone) {
      return new Response(JSON.stringify({ ok: true, msg: 'Morador sem telefone, notificação ignorada' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // Formata o número para o padrão internacional (Z-API espera DDI+DDD+número)
    // Ex: "(11) 99999-0000" → "5511999990000"
    const telefone = formatarTelefone(morador.telefone)
    if (!telefone) {
      return new Response(JSON.stringify({ ok: true, msg: 'Telefone inválido, notificação ignorada' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    const dataReceb = new Date(entrega.recebido_em).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    const volumes = entrega.volumes === 1
      ? '1 volume'
      : `${entrega.volumes} volumes`

    // Monta a mensagem
    const mensagem = montarMensagem({
      nomeMorador:    morador.nome,
      nomeApto,
      transportadora: entrega.transportadora,
      volumes,
      obs:            entrega.obs || null,
      dataRecebido:   dataReceb,
      nomeCondo:      condo?.nome ?? '—',
    })

    // Dispara via Z-API
    const zapiRes = await fetch(
      `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Token':  ZAPI_CLIENT_TOKEN,
        },
        body: JSON.stringify({
          phone:   telefone,
          message: mensagem,
        }),
      }
    )

    if (!zapiRes.ok) {
      const err = await zapiRes.text()
      console.error('Z-API error:', err)
      return new Response(JSON.stringify({ error: 'Falha ao enviar WhatsApp', detail: err }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    const zapiData = await zapiRes.json()
    return new Response(JSON.stringify({ ok: true, message_id: zapiData.zaapId ?? zapiData.id }), {
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

// ── Formata telefone para padrão Z-API ────────────────────────
// "(11) 99999-0000" ou "11999990000" → "5511999990000"
function formatarTelefone(tel: string): string | null {
  const digits = tel.replace(/\D/g, '')

  // Já tem DDI 55
  if (digits.startsWith('55') && digits.length >= 12) return digits

  // Tem DDD + número (10 ou 11 dígitos)
  if (digits.length === 10 || digits.length === 11) return '55' + digits

  return null
}

// ── Monta a mensagem WhatsApp ─────────────────────────────────
function montarMensagem(p: {
  nomeMorador:    string
  nomeApto:       string
  transportadora: string
  volumes:        string
  obs:            string | null
  dataRecebido:   string
  nomeCondo:      string
}): string {
  const obs = p.obs ? `\n📝 *Obs:* ${p.obs}` : ''

  return `📦 *Sua entrega chegou!*

Olá, *${p.nomeMorador}*! Seu pacote está disponível na portaria.

*Detalhes:*
🚚 Transportadora: *${p.transportadora}*
📦 Volumes: *${p.volumes}*
🏠 Apartamento: *${p.nomeApto}*
🕐 Recebido em: *${p.dataRecebido}*${obs}

📍 *Local de retirada:*
${p.nomeCondo} — Portaria

⚠️ Retire sua entrega em até 5 dias úteis mediante apresentação de documento.

_Mensagem automática — CondoTrack_`
}