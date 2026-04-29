// ============================================================
//  notificar-porteiro-retirada/index.ts
//  Supabase Edge Function
//  Notifica o porteiro via WhatsApp quando morador retira entrega
//
//  Deploy:
//    supabase functions deploy notificar-porteiro-retirada
//
//  Usa os mesmos secrets do notificar-whatsapp:
//    ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN
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
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Busca entrega + apartamento + morador + porteiro responsável
    const { data: entrega, error: errEntrega } = await db
      .from('entregas')
      .select(`
        id, transportadora, volumes, retirado_em,
        apartamentos ( id, numero, bloco ),
        condominios ( nome )
      `)
      .eq('id', entrega_id)
      .single()

    if (errEntrega || !entrega) {
      return new Response(JSON.stringify({ error: 'Entrega não encontrada' }), {
        status: 404, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    const apto     = entrega.apartamentos
    const nomeApto = apto ? `${apto.bloco}-${apto.numero}` : '—'

    // Busca o morador do apartamento
    const { data: moradorData } = await db
      .from('usuarios')
      .select('nome')
      .eq('apartamento_id', apto?.id)
      .eq('perfil', 'morador')
      .single()

    // Busca porteiros ativos do condomínio que têm telefone
    const { data: porteiros } = await db
      .from('usuarios')
      .select('nome, telefone')
      .eq('condominio_id', entrega.condominios?.id ?? '')
      .eq('perfil', 'porteiro')
      .eq('status', 'ativo')
      .not('telefone', 'is', null)

    if (!porteiros?.length) {
      return new Response(JSON.stringify({ ok: true, msg: 'Nenhum porteiro com telefone cadastrado' }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    const horaRetirada = entrega.retirado_em
      ? new Date(entrega.retirado_em).toLocaleTimeString('pt-BR', {
          hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
        })
      : new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
        })

    const mensagem = `✅ *Retirada confirmada!*

O morador *${moradorData?.nome || 'do Apto ' + nomeApto}* confirmou a retirada da entrega.

📦 *Detalhes:*
🏠 Apartamento: *${nomeApto}*
🚚 Transportadora: *${entrega.transportadora}*
📦 Volumes: *${entrega.volumes}*
🕐 Retirado às: *${horaRetirada}*

_Notificação automática — CondoTrack_`

    // Envia para todos os porteiros com telefone cadastrado
    const envios = porteiros.map(async (p) => {
      const digits = p.telefone.replace(/\D/g, '')
      const telefone = digits.startsWith('55') ? digits : '55' + digits
      if (telefone.length < 12) return

      await fetch(
        `https://api.z-api.io/instances/${ZAPI_INSTANCE_ID}/token/${ZAPI_TOKEN}/send-text`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Client-Token':  ZAPI_CLIENT_TOKEN,
          },
          body: JSON.stringify({ phone: telefone, message: mensagem }),
        }
      )
    })

    await Promise.allSettled(envios)

    return new Response(JSON.stringify({ ok: true, notificados: porteiros.length }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })

  } catch (err) {
    console.error('Erro inesperado:', err)
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  }
})
