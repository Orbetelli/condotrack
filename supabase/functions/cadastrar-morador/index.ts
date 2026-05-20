// ============================================================
//  cadastrar-morador/index.ts
//  Supabase Edge Function
//  Cria o usuário no Auth + insere na tabela usuarios + marca
//  apartamento como ocupado — tudo com service role para contornar
//  o RLS que bloqueia inserts de usuários sem sessão ativa.
//
//  Por que Edge Function?
//  Após db.auth.signUp(), sem confirmação de e-mail, o cliente
//  não possui JWT válido. O RLS da tabela usuarios rejeita o
//  INSERT mesmo que auth_id esteja correto. A service role
//  bypassa o RLS com segurança no backend.
//
//  Deploy:
//    supabase functions deploy cadastrar-morador
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')                ?? ''
const SUPABASE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')   ?? ''
// CORS aberto: cadastro é rota pública — qualquer origem pode chamar.
// Diferente de reset-senha que restringe ao APP_URL.
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
    const {
      email,
      senha,
      nome,
      cpf,
      telefone,
      condominio_id,
      apartamento_id,
    } = body

    // Log para diagnóstico (não loga senha)
    console.log('[cadastrar-morador] body recebido:', {
      email,
      nome,
      cpf:            cpf ? '***' : undefined,
      telefone:       telefone ? '***' : undefined,
      condominio_id,
      apartamento_id,
      senha:          senha ? `${senha.length} chars` : undefined,
    })

    // ── Validação básica ──────────────────────────────────────
    if (!email || !senha || !nome || !condominio_id || !apartamento_id) {
      const faltando = ['email','senha','nome','condominio_id','apartamento_id']
        .filter(k => !body[k])
      console.error('[cadastrar-morador] Campos faltando:', faltando)
      return new Response(JSON.stringify({
        error: `Campos obrigatórios ausentes: ${faltando.join(', ')}`
      }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
    }

    if (senha.length < 6) {
      return new Response(JSON.stringify({ error: 'Senha deve ter no mínimo 6 caracteres.' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      })
    }

    // Service role — bypassa RLS
    const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // ── 1. Verifica se o apartamento ainda está disponível ────
    const { data: apto, error: aptoCheckError } = await db
      .from('apartamentos')
      .select('id, status, condominio_id')
      .eq('id', apartamento_id)
      .single()

    if (aptoCheckError || !apto) {
      return new Response(JSON.stringify({ error: 'Apartamento não encontrado.' }), {
        status: 404, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      })
    }

    if (apto.status === 'ocupado') {
      return new Response(JSON.stringify({
        error: 'Este apartamento já possui um morador cadastrado. Selecione outro.'
      }), { status: 409, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
    }

    // Garante que o apartamento pertence ao condomínio informado
    if (apto.condominio_id !== condominio_id) {
      return new Response(JSON.stringify({ error: 'Apartamento não pertence a este condomínio.' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      })
    }

    // ── 2. Verifica se o e-mail já existe na tabela usuarios ──
    const { data: emailExiste } = await db
      .from('usuarios')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (emailExiste) {
      return new Response(JSON.stringify({
        error: 'Este e-mail já está cadastrado. Tente fazer login.'
      }), { status: 409, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
    }

    // ── 3. Verifica se o e-mail já existe no Auth ────────────
    // Necessário antes do createUser para evitar 500 em tentativas repetidas
    const { data: listaAuth } = await db.auth.admin.listUsers()
    const jaNoAuth = listaAuth?.users?.some(
      (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase()
    )
    if (jaNoAuth) {
      return new Response(JSON.stringify({
        error: 'Este e-mail já está cadastrado. Tente fazer login.'
      }), { status: 409, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
    }

    // ── 4. Cria no Supabase Auth ──────────────────────────────
    const { data: authData, error: authError } = await db.auth.admin.createUser({
      email,
      password:      senha,
      email_confirm: false, // mantém confirmação de e-mail ativa
    })

    if (authError) {
      console.error('[cadastrar-morador] Erro no Auth:', authError)
      const jaExiste =
        authError.message?.toLowerCase().includes('already registered') ||
        authError.message?.toLowerCase().includes('already exists') ||
        (authError as any).status === 422

      return new Response(JSON.stringify({
        error: jaExiste
          ? 'Este e-mail já está cadastrado. Tente fazer login.'
          : 'Erro ao criar conta: ' + authError.message
      }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
    }

    const userId = authData.user.id

    // ── 5. Insere na tabela usuarios ──────────────────────────
    const { error: userError } = await db.from('usuarios').insert({
      auth_id:        userId,
      condominio_id,
      apartamento_id,
      perfil:         'morador',
      nome,
      email,
      cpf:            cpf ? cpf.replace(/\D/g, '') : null,
      telefone:       telefone || null,
      status:         'ativo',
    })

    if (userError) {
      // Rollback: remove do Auth para não deixar usuário órfão
      await db.auth.admin.deleteUser(userId)
      console.error('Erro ao inserir em usuarios, rollback Auth:', userError)
      return new Response(JSON.stringify({
        error: 'Erro ao salvar dados. Tente novamente.'
      }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })
    }

    // ── 6. Marca apartamento como ocupado ─────────────────────
    const { error: aptoError } = await db
      .from('apartamentos')
      .update({ status: 'ocupado' })
      .eq('id', apartamento_id)

    if (aptoError) {
      // Não faz rollback — usuário foi criado com sucesso.
      // Admin corrige manualmente se necessário.
      console.error('Aviso: falha ao marcar apartamento como ocupado:', aptoError)
    }

    return new Response(JSON.stringify({
      ok:      true,
      user_id: userId,
      aviso:   aptoError ? 'Usuário criado, mas status do apartamento não foi atualizado.' : null,
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } })

  } catch (err) {
    console.error('Erro inesperado:', err)
    return new Response(JSON.stringify({ error: 'Erro interno.' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    })
  }
})