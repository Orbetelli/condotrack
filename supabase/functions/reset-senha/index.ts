// ============================================================
//  reset-senha/index.ts
//  Supabase Edge Function
//  Permite que o superadmin redefina a senha de qualquer usuário
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')              ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

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
    const body = await req.json()
    const { auth_id, nova_senha, solicitante_auth_id } = body

    console.log('[reset-senha] body recebido:', {
      auth_id,
      nova_senha: nova_senha ? `${nova_senha.length} chars` : undefined,
      solicitante_auth_id,
    })

    if (!auth_id || !nova_senha || !solicitante_auth_id) {
      const faltando = ['auth_id', 'nova_senha', 'solicitante_auth_id'].filter(k => !body[k])
      console.error('[reset-senha] Campos faltando:', faltando)
      return new Response(JSON.stringify({
        error: `Parâmetros obrigatórios ausentes: ${faltando.join(', ')}`
      }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
    }

    if (nova_senha.length < 6) {
      return new Response(JSON.stringify({ error: 'Senha deve ter no mínimo 6 caracteres.' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      })
    }

    // Service role — bypassa RLS para verificar o solicitante
    const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Verifica se quem está solicitando é superadmin ativo
    const { data: solicitante, error: errSol } = await db
      .from('usuarios')
      .select('perfil, status')
      .eq('auth_id', solicitante_auth_id)
      .single()

    console.log('[reset-senha] solicitante:', solicitante, errSol)

    if (!solicitante || solicitante.perfil !== 'superadmin' || solicitante.status !== 'ativo') {
      return new Response(JSON.stringify({ error: 'Sem permissão para resetar senhas.' }), {
        status: 403, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      })
    }

    // Redefine a senha usando service role
    const { error } = await db.auth.admin.updateUserById(auth_id, {
      password: nova_senha,
    })

    if (error) {
      console.error('[reset-senha] Erro ao resetar:', error)
      return new Response(JSON.stringify({ error: 'Erro ao redefinir senha: ' + error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      })
    }

    console.log('[reset-senha] Senha resetada com sucesso para auth_id:', auth_id)

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })

  } catch (err) {
    console.error('[reset-senha] Erro inesperado:', err)
    return new Response(JSON.stringify({ error: 'Erro interno.' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  }
})