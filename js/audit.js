// ============================================================
//  audit.js — registro de audit log · CondoTrack
//  Importar em todas as páginas após supabase.js
//  Os triggers do banco já registram mudanças automáticas,
//  este arquivo cobre ações de alto nível (login, navegação, etc)
// ============================================================

// ── Sanitiza dados sensíveis antes de gravar no log (LGPD) ───
function _sanitizarParaAudit(obj) {
  if (!obj) return null
  // Remove campos sensíveis — nunca gravar CPF, telefone ou senha no log
  const { cpf, telefone, senha, password, ...seguro } = obj
  // Mascara email se presente
  if (seguro.email) {
    const [user, domain] = seguro.email.split('@')
    seguro.email = domain ? `${user.slice(0,3)}***@${domain}` : '***'
  }
  return seguro
}

// ── Registra uma ação no audit log (fire-and-forget) ─────────
async function registrarAudit({
  acao,
  tabela     = null,
  registroId = null,
  descricao  = null,
  valorAntes = null,
  valorDepois= null,
}) {
  try {
    const usuario = typeof usuarioLogado !== 'undefined' ? usuarioLogado : null
    await db.from('audit_log').insert({
      usuario_id:     usuario?.id            || null,
      usuario_nome:   usuario?.nome          || null,
      usuario_perfil: usuario?.perfil        || null,
      condominio_id:  usuario?.condominio_id || null,
      acao,
      tabela,
      registro_id:    registroId,
      descricao,
      // Sanitiza antes de gravar — remove CPF, telefone, senha
      valor_anterior: _sanitizarParaAudit(valorAntes),
      valor_novo:     _sanitizarParaAudit(valorDepois),
      user_agent:     navigator.userAgent.slice(0, 200),
    })
  } catch (err) {
    // Nunca bloqueia o fluxo principal
    console.warn('[audit] Falha ao registrar:', err)
  }
}

// ── Login com falha ──────────────────────────────────────────
async function registrarLoginFalha(email, motivo) {
  try {
    // Mascara o email tentado — não expor dado completo no log
    const [user, domain] = (email || '').split('@')
    const emailMascarado = domain ? `${user.slice(0,3)}***@${domain}` : '***'
    await db.from('audit_log').insert({
      acao:           'login_falha',
      descricao:      `Tentativa de login falhou para ${emailMascarado}: ${motivo}`,
      valor_anterior: { email: emailMascarado },
      user_agent:     navigator.userAgent.slice(0, 200),
    })
  } catch (_) {}
}

// ── Login com sucesso ────────────────────────────────────────
async function registrarLoginSucesso(usuario) {
  try {
    await db.from('audit_log').insert({
      usuario_id:     usuario.id,
      usuario_nome:   usuario.nome,
      usuario_perfil: usuario.perfil,
      condominio_id:  usuario.condominio_id || null,
      acao:           'login_sucesso',
      descricao:      `${usuario.nome} (${usuario.perfil}) fez login`,
      user_agent:     navigator.userAgent.slice(0, 200),
    })
  } catch (_) {}
}

// ── Logout ───────────────────────────────────────────────────
async function registrarLogout() {
  try {
    const usuario = typeof usuarioLogado !== 'undefined' ? usuarioLogado : null
    if (!usuario) return
    await db.from('audit_log').insert({
      usuario_id:     usuario.id,
      usuario_nome:   usuario.nome,
      usuario_perfil: usuario.perfil,
      condominio_id:  usuario.condominio_id || null,
      acao:           'logout',
      descricao:      `${usuario.nome} encerrou a sessão`,
      user_agent:     navigator.userAgent.slice(0, 200),
    })
  } catch (_) {}
}