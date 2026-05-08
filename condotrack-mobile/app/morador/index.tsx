import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Modal, Alert, Vibration, ActivityIndicator,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Haptics from 'expo-haptics'
import { supabase, getUsuarioLogado, type Usuario, type Entrega } from '@/lib/supabase'
import { confirmarRetiradaQR } from '@/lib/qrcode'

const AC = '#0F6E56'

const STATUS_CFG: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  aguardando:        { label: 'Aguardando',    bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  notificado:        { label: 'Notificado',    bg: '#EDE9FE', color: '#5B21B6', dot: '#A78BFA' },
  entregue_porteiro: { label: 'A confirmar',   bg: '#ECFDF5', color: '#065F46', dot: '#10B981' },
  retirado:          { label: 'Retirado',      bg: '#F0FDF4', color: '#166534', dot: '#34D399' },
  expirado:          { label: 'Expirado',      bg: '#FEF2F2', color: '#991B1B', dot: '#F87171' },
}

export default function MoradorEntregas() {
  const [usuario, setUsuario]   = useState<Usuario | null>(null)
  const [entregas, setEntregas] = useState<Entrega[]>([])
  const [loading, setLoading]   = useState(true)
  const [refresh, setRefresh]   = useState(false)

  // Scanner QR
  const [scannerAberto, setScannerAberto] = useState(false)
  const [scannerAtivo, setScannerAtivo]   = useState(true)
  const [scanMsg, setScanMsg]             = useState('')
  const [scanSucesso, setScanSucesso]     = useState(false)
  const [permission, requestPermission]   = useCameraPermissions()

  useFocusEffect(
    useCallback(() => {
      carregarDados()
    }, [])
  )

  useEffect(() => {
    // Realtime — atualiza quando chega nova entrega
    const channel = supabase
      .channel('morador-entregas')
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'entregas',
      }, () => carregarDados())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [usuario])

  async function carregarDados() {
    const u = await getUsuarioLogado()
    if (!u) return
    setUsuario(u)

    const { data } = await supabase
      .from('entregas')
      .select('id, transportadora, volumes, status, obs, qr_code, recebido_em, retirado_em')
      .eq('apartamento_id', u.apartamento_id!)
      .order('recebido_em', { ascending: false })

    setEntregas((data as Entrega[]) || [])
    setLoading(false)
    setRefresh(false)
  }

  async function abrirScanner(entregaId?: string) {
    if (!permission?.granted) {
      const { granted } = await requestPermission()
      if (!granted) {
        Alert.alert('Câmera necessária', 'Permita o acesso à câmera para escanear o QR Code.')
        return
      }
    }
    setScannerAtivo(true)
    setScanMsg('')
    setScanSucesso(false)
    setScannerAberto(true)
  }

  async function handleQRScan({ data: payload }: { data: string }) {
    if (!scannerAtivo || !usuario) return
    setScannerAtivo(false) // evita múltiplos scans

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

    const resultado = await confirmarRetiradaQR(
      payload,
      usuario.id,
      usuario.apartamento_id!,
    )

    if (resultado.sucesso) {
      setScanSucesso(true)
      setScanMsg('Retirada confirmada com sucesso!')
      Vibration.vibrate([0, 100, 50, 100])
      await carregarDados()
      setTimeout(() => setScannerAberto(false), 2000)
    } else {
      setScanMsg(resultado.erro || 'QR Code inválido.')
      setTimeout(() => {
        setScannerAtivo(true)
        setScanMsg('')
      }, 2500)
    }
  }

  const pendentes = entregas.filter(e =>
    ['aguardando', 'notificado', 'entregue_porteiro'].includes(e.status)
  )
  const retiradas = entregas.filter(e => e.status === 'retirado').length

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={AC} />
      </View>
    )
  }

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{saudacao()},</Text>
          <Text style={styles.nome}>{usuario?.nome?.split(' ')[0] || '—'}</Text>
        </View>
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            Apto {usuario?.apartamentos?.bloco}-{usuario?.apartamentos?.numero}
          </Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={[styles.statNum, { color: AC }]}>{pendentes.length}</Text>
          <Text style={styles.statLabel}>Aguardando</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={[styles.statNum, { color: '#166534' }]}>{retiradas}</Text>
          <Text style={styles.statLabel}>Retiradas</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statNum}>{entregas.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); carregarDados() }} tintColor={AC} />
        }
      >
        {pendentes.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>Nenhuma entrega pendente</Text>
            <Text style={styles.emptySub}>Você será notificado quando chegar uma encomenda.</Text>
          </View>
        ) : (
          pendentes.map(e => (
            <EntregaCard
              key={e.id}
              entrega={e}
              onScan={() => abrirScanner(e.id)}
            />
          ))
        )}
      </ScrollView>

      {/* Modal Scanner QR */}
      <Modal visible={scannerAberto} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <TouchableOpacity onPress={() => setScannerAberto(false)} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕ Fechar</Text>
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Escanear QR Code</Text>
            <Text style={styles.scannerSub}>Aponte para o código na portaria</Text>
          </View>

          <View style={styles.cameraWrap}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scannerAtivo ? handleQRScan : undefined}
            />
            {/* Overlay com guia de enquadramento */}
            <View style={styles.scanOverlay}>
              <View style={styles.scanFrame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
            </View>
          </View>

          {/* Feedback */}
          {scanMsg ? (
            <View style={[styles.scanFeedback, scanSucesso ? styles.feedbackOk : styles.feedbackErr]}>
              <Text style={styles.scanFeedbackText}>
                {scanSucesso ? '✓  ' : '✕  '}{scanMsg}
              </Text>
            </View>
          ) : (
            <Text style={styles.scanTip}>O QR Code é fornecido pelo porteiro ao registrar a entrega.</Text>
          )}
        </View>
      </Modal>

    </View>
  )
}

// ── Componente de card de entrega ────────────────────────────
function EntregaCard({ entrega, onScan }: { entrega: Entrega; onScan: () => void }) {
  const cfg = STATUS_CFG[entrega.status] || STATUS_CFG.aguardando
  const data = new Date(entrega.recebido_em).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
  const podeConfirmar = ['aguardando', 'notificado', 'entregue_porteiro'].includes(entrega.status)

  return (
    <View style={[styles.entregaCard, { borderLeftColor: cfg.dot }]}>
      <View style={styles.entregaTop}>
        <Text style={styles.entregaTrans}>{entrega.transportadora}</Text>
        <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>
      <View style={styles.entregaInfo}>
        <Text style={styles.entregaInfoText}>📅 {data}</Text>
        <Text style={styles.entregaInfoText}>📦 {entrega.volumes} volume{entrega.volumes > 1 ? 's' : ''}</Text>
      </View>
      {entrega.obs ? (
        <Text style={styles.entregaObs}>💬 {entrega.obs}</Text>
      ) : null}
      {podeConfirmar && (
        <TouchableOpacity style={[styles.btnConfirmar, { backgroundColor: AC }]} onPress={onScan} activeOpacity={0.85}>
          <Text style={styles.btnConfirmarText}>📷  Escanear QR para retirar</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ── Helper ───────────────────────────────────────────────────
function saudacao() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#f5f5f5' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header:    { backgroundColor: AC, padding: 20, paddingTop: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  greeting:  { fontSize: 13, color: 'rgba(255,255,255,.7)' },
  nome:      { fontSize: 22, fontWeight: '700', color: '#fff', marginTop: 2 },
  pill:      { backgroundColor: 'rgba(255,255,255,.2)', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5 },
  pillText:  { fontSize: 12, fontWeight: '600', color: '#fff' },

  statsRow:    { flexDirection: 'row', backgroundColor: '#fff', margin: 16, borderRadius: 14, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  stat:        { flex: 1, alignItems: 'center' },
  statNum:     { fontSize: 24, fontWeight: '700', color: '#18181B' },
  statLabel:   { fontSize: 11, color: '#71717A', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: '#E4E4E7' },

  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 0 },

  empty:      { alignItems: 'center', paddingVertical: 48 },
  emptyIcon:  { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#3F3F46', marginBottom: 6 },
  emptySub:   { fontSize: 13, color: '#A1A1AA', textAlign: 'center', lineHeight: 20 },

  entregaCard:   { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderLeftWidth: 4, borderTopWidth: 0.5, borderRightWidth: 0.5, borderBottomWidth: 0.5, borderTopColor: '#E4E4E7', borderRightColor: '#E4E4E7', borderBottomColor: '#E4E4E7' },
  entregaTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  entregaTrans:  { fontSize: 15, fontWeight: '700', color: '#18181B', flex: 1 },
  badge:         { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:     { fontSize: 11, fontWeight: '600' },
  entregaInfo:   { flexDirection: 'row', gap: 12, marginBottom: 6 },
  entregaInfoText:{ fontSize: 12, color: '#71717A' },
  entregaObs:    { fontSize: 12, color: '#52525B', backgroundColor: '#F4F4F5', borderRadius: 8, padding: 8, marginBottom: 8 },
  btnConfirmar:  { borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4 },
  btnConfirmarText:{ color: '#fff', fontSize: 14, fontWeight: '700' },

  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerHeader:    { padding: 20, paddingTop: 52, backgroundColor: '#111' },
  closeBtn:         { marginBottom: 12 },
  closeBtnText:     { color: '#A1A1AA', fontSize: 14 },
  scannerTitle:     { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 4 },
  scannerSub:       { fontSize: 13, color: '#A1A1AA' },
  cameraWrap:       { flex: 1, position: 'relative' },
  camera:           { flex: 1 },
  scanOverlay:      { position: 'absolute', inset: 0, justifyContent: 'center', alignItems: 'center' },
  scanFrame:        { width: 220, height: 220, position: 'relative' },
  corner:           { position: 'absolute', width: 30, height: 30, borderColor: '#fff', borderWidth: 3 },
  cornerTL:         { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  cornerTR:         { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  cornerBL:         { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  cornerBR:         { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  scanFeedback:     { margin: 20, borderRadius: 12, padding: 16 },
  feedbackOk:       { backgroundColor: '#F0FDF4' },
  feedbackErr:      { backgroundColor: '#FEF2F2' },
  scanFeedbackText: { fontSize: 15, fontWeight: '600', textAlign: 'center', color: '#18181B' },
  scanTip:          { color: '#71717A', fontSize: 13, textAlign: 'center', margin: 20, lineHeight: 20 },
})
