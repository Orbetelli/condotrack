// ============================================================
//  expirar-entregas/index.ts
//  Supabase Edge Function — agendada via pg_cron
//  Marca como 'expirado' entregas com mais de 5 dias sem retirada
//
//  Deploy:
//    supabase functions deploy expirar-entregas
//
//  Agendamento (rodar uma vez por dia às 3h):
//    SELECT cron.schedule(
//      'expirar-entregas-diario',
//      '0 3 * * *',
//      $$
//        SELECT net.http_post(
//          url := 'https://ihaeqbtoylxcfwmdcjfg.supabase.co/functions/v1/expirar-entregas',
//          headers := '{"Authorization": "Bearer SEU_SERVICE_ROLE_KEY"}'::jsonb
//        )
//      $$
//    );
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')                ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')   ?? ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Busca entregas aguardando há mais de 5 dias
    const cincoAtras = new Date()
    cincoAtras.setDate(cincoAtras.getDate() - 5)

    const { data: entregasExpiradas, error: errBusca } = await db
      .from('entregas')
      .select('id, apartamento_id, transportadora, recebido_em')
      .in('status', ['aguardando', 'notificado'])
      .lt('recebido_em', cincoAtras.toISOString())

    if (errBusca) {
      console.error('Erro ao buscar entregas:', errBusca)
      return new Response(JSON.stringify({ error: errBusca.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    if (!entregasExpiradas?.length) {
      return new Response(JSON.stringify({ ok: true, expiradas: 0, msg: 'Nenhuma entrega para expirar' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // Atualiza todas para 'expirado'
    const ids = entregasExpiradas.map(e => e.id)
    const { error: errUpdate } = await db
      .from('entregas')
      .update({ status: 'expirado' })
      .in('id', ids)

    if (errUpdate) {
      console.error('Erro ao expirar entregas:', errUpdate)
      return new Response(JSON.stringify({ error: errUpdate.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    console.log(`${ids.length} entregas expiradas:`, ids)

    return new Response(JSON.stringify({
      ok:        true,
      expiradas: ids.length,
      ids,
    }), {
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
