import { supabase } from './supabase'

// ── Gera um payload único para o QR Code de uma entrega ──────
// Formato: CT:{entrega_id}:{timestamp}:{checksum}
export function gerarPayloadQR(entregaId: string): string {
  const timestamp = Date.now()
  const checksum  = simpleHash(`${entregaId}:${timestamp}`)
  return `CT:${entregaId}:${timestamp}:${checksum}`
}

// ── Valida e extrai o ID da entrega de um QR Code escaneado ──
export function validarPayloadQR(payload: string): {
  valido: boolean
  entregaId: string | null
  erro?: string
} {
  if (!payload.startsWith('CT:')) {
    return { valido: false, entregaId: null, erro: 'QR Code inválido — não é do CondoTrack.' }
  }

  const partes = payload.split(':')
  if (partes.length !== 4) {
    return { valido: false, entregaId: null, erro: 'Formato de QR Code inválido.' }
  }

  const [, entregaId, timestamp, checksum] = partes

  // Valida checksum
  const checksumEsperado = simpleHash(`${entregaId}:${timestamp}`)
  if (checksum !== checksumEsperado) {
    return { valido: false, entregaId: null, erro: 'QR Code adulterado ou inválido.' }
  }

  // Verifica expiração — QR Code válido por 48 horas
  const ts  = parseInt(timestamp)
  const age = Date.now() - ts
  const maxAge = 48 * 60 * 60 * 1000 // 48h em ms

  if (age > maxAge) {
    return { valido: false, entregaId: null, erro: 'QR Code expirado. Solicite um novo ao porteiro.' }
  }

  return { valido: true, entregaId }
}

// ── Salva o QR Code gerado na entrega ────────────────────────
export async function salvarQRCodeEntrega(
  entregaId: string,
  payload:   string,
): Promise<boolean> {
  const { error } = await supabase
    .from('entregas')
    .update({ qr_code: payload })
    .eq('id', entregaId)

  if (error) { console.error('[qr] Erro ao salvar QR Code:', error); return false }
  return true
}

// ── Confirma retirada via QR Code escaneado pelo morador ─────
export async function confirmarRetiradaQR(
  payload:    string,
  moradorId:  string,
  aptoId:     string,
): Promise<{ sucesso: boolean; erro?: string }> {
  const { valido, entregaId, erro } = validarPayloadQR(payload)

  if (!valido || !entregaId) {
    return { sucesso: false, erro }
  }

  // Busca a entrega e verifica se pertence ao apartamento do morador
  const { data: entrega, error: fetchError } = await supabase
    .from('entregas')
    .select('id, status, apartamento_id, qr_code')
    .eq('id', entregaId)
    .eq('apartamento_id', aptoId) // segurança: só confirma entrega do próprio apto
    .single()

  if (fetchError || !entrega) {
    return { sucesso: false, erro: 'Entrega não encontrada ou não pertence ao seu apartamento.' }
  }

  if (entrega.status === 'retirado') {
    return { sucesso: false, erro: 'Esta entrega já foi retirada.' }
  }

  if (!['aguardando', 'notificado', 'entregue_porteiro'].includes(entrega.status)) {
    return { sucesso: false, erro: 'Esta entrega não pode ser confirmada neste momento.' }
  }

  // Verifica que o QR Code escaneado bate com o cadastrado
  if (entrega.qr_code !== payload) {
    return { sucesso: false, erro: 'QR Code não corresponde a esta entrega.' }
  }

  // Confirma a retirada
  const { error: updateError } = await supabase
    .from('entregas')
    .update({
      status:      'retirado',
      retirado_em: new Date().toISOString(),
      morador_id:  moradorId,
    })
    .eq('id', entregaId)
    .eq('apartamento_id', aptoId) // dupla verificação

  if (updateError) {
    return { sucesso: false, erro: 'Erro ao confirmar retirada. Tente novamente.' }
  }

  return { sucesso: true }
}

// ── Hash simples para checksum (não criptográfico) ───────────
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}
