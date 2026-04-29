// ============================================================
//  criar-sindico/index.ts
//  Supabase Edge Function
//  Cria o síndico direto no Auth sem precisar confirmar e-mail
//  Chamada pelo superadmin ao criar um novo condomínio
//
//  Deploy:
//    supabase functions deploy criar-sindico
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')                ?? ''
const SUPABASE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')   ?? ''

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
    const { nome, email, senha, condominio_id } = await req.json()

    if (!nome || !email || !senha || !condominio_id) {
      return new Response(JSON.stringify({ error: 'Campos obrigatórios: nome, email, senha, condominio_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // Service role — bypassa RLS e confirmação de e-mail
    const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 1. Cria o usuário no Auth sem precisar confirmar e-mail
    const { data: authData, error: authError } = await db.auth.admin.createUser({
      email,
      password:      senha,
      email_confirm: true, // confirma automaticamente — sem e-mail de aceite
    })

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // 2. Insere na tabela usuarios como admin
    const { error: dbError } = await db.from('usuarios').insert({
      auth_id:       authData.user.id,
      condominio_id,
      perfil:        'admin',
      nome,
      email,
      status:        'ativo',
    })

    if (dbError) {
      // Rollback: remove o usuário do Auth se falhou no banco
      await db.auth.admin.deleteUser(authData.user.id)
      return new Response(JSON.stringify({ error: dbError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // 3. Atualiza o condomínio para status 'ativo'
    await db.from('condominios')
      .update({ status: 'ativo' })
      .eq('id', condominio_id)

    return new Response(JSON.stringify({ ok: true, user_id: authData.user.id }), {
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
