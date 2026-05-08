import { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Modal, TextInput, Alert,
  ActivityIndicator, Image, Platform,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Haptics from 'expo-haptics'
import { supabase, getUsuarioLogado, type Usuario, type Entrega } from '@/lib/supabase'
import { gerarPayloadQR, salvarQRCodeEntrega } from '@/lib/qrcode'

const AC = '#1D4ED8'

const TRANSPORTADORAS = [
  'Correios', 'Shopee', 'Mercado Envios', 'iFood', 'Amazon',
  'Rappi', 'DHL', 'FedEx', 'Loggi', 'Total Express', 'Outro',
]

const STATUS_CFG: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  aguardando:        { label: 'Aguardando',  bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  notificado:        { label: 'Notificado',  bg: '#EDE9FE', color: '#5B21B6', dot: '#A78BFA' },
  entregue_porteiro: { label: 'A confirmar', bg: '#ECFDF5', color: '#065F46', dot: '#10B981' },
  retirado:          { label: 'Retirado',    bg: '#F0FDF4', color: '#166534', dot: '#34D399' },
  expirado:          { label: 'Expirado',    bg: '#FEF2F2', color: '#991B1B', dot: '#F87171' },
}

export default function PorteiroDashboard() {
  const [usuario, setUsuario]     = useState<Usuario | null>(null)
  const [entregas, setEntregas]   = useState<Entrega[]>([])
  const [loading, setLoading]     = useState(true)
  const [refresh, setRefresh]     = useState(false)

  // Modal nova entrega
  const [modalAberto, setModalAberto]           = useState(false)
  const [moradorSelecionado, setMoradorSelecionado] = useState<any>(null)
  const [transportadora, setTransportadora]     = useState('')
  const [volumes, setVolumes]                   = useState('1')
  const [obs, setObs]                           = useState('')
  const [salvando, setSalvando]                 = useState(false)
  const [qrGerado, setQrGerado]                 = useState<string | null>(null)
  const [entregaSalvaId, setEntregaSalvaId]     = useState<string | null>(null)

  // Scanner para identificar morador pelo QR
  const [scannerAberto, setScannerAberto]       = useState(false)
  const [scannerAtivo, setScannerAtivo]         = useState(true)
  const [permission, requestPermission]         = useCameraPermissions()

  useFocusEffect(
    useCallback(() => {
      carregarDados()
    }, [])
  )

  async function carregarDados() {
    const u = await getUsuarioLogado()
    if (!u) return
    setUsuario(u)

    const { data } = await supabase
      .from('entregas')
      .select(`
        id, transportadora, volumes, status, obs, recebido_em,
        apartamentos ( numero, bloco ),
        morador:usuarios!morador_id ( nome )
      `)
      .eq('condominio_id', u.condominio_id)
      .in('status', ['aguardando', 'notificado', 'entregue_porteiro'])
      .order('recebido_em', { ascending: false })
      .limit(30)

    setEntregas((data as any[]) || [])
    setLoading(false)
    setRefresh(false)
  }

  // Abre scanner para identificar o morador pelo QR Code pessoal dele
  async function abrirScannerMorador() {
    if (!permission?.granted) {
      const { granted } = await requestPermission()
      if (!granted) {
        Alert.alert('Câmera necessária', 'Permita o acesso à câmera.')
        return
      }
    }
    setScannerAtivo(true)
    setScannerAberto(true)
  }

  async function handleScanMorador({ data: payload }: { data: string }) {
    if (!scannerAtivo || !usuario) return
    setScannerAtivo(false)

    // Payload do QR pessoal do morador: CT:MORADOR:{usuario_id}
    if (!payload.startsWith('CT:MORADOR:')) {
      Alert.alert('QR inválido', 'Este não é um QR Code de morador do CondoTrack.')
      setTimeout(() => setScannerAtivo(true), 1500)
      return
    }

    const moradorId = payload.replace('CT:MORADOR:', '')

    const { data: morador } = await supabase
      .from('usuarios')
      .select('id, nome, apartamento_id, apartamentos(numero, bloco), condominio_id')
      .eq('id', moradorId)
      .eq('condominio_id', usuario.condominio_id) // segurança
      .eq('perfil', 'morador')
      .single()

    if (!morador) {
      Alert.alert('Não encontrado', 'Morador não encontrado neste condomínio.')
      setTimeout(() => setScannerAtivo(true), 1500)
      return
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setMoradorSelecionado(morador)
    setScannerAberto(false)
    setModalAberto(true)
  }

  async function salvarEntrega() {
    if (!usuario || !moradorSelecionado) return
    if (!transportadora) { Alert.alert('', 'Selecione a transportadora.'); return }
    const vol = parseInt(volumes) || 1
    if (vol < 1 || vol > 99) { Alert.alert('', 'Informe um número de volumes válido.'); return }

    setSalvando(true)

    try {
      // 1. Insere a entrega
      const { data: novaEntrega, error } = await supabase
        .from('entregas')
        .insert({
          condominio_id:  usuario.condominio_id,
          apartamento_id: moradorSelecionado.apartamento_id,
          morador_id:     moradorSelecionado.id,
          porteiro_id:    usuario.id,
          transportadora,
          volumes:        vol,
          obs:            obs.trim() || null,
          status:         'aguardando',
        })
        .select('id')
        .single()

      if (error || !novaEntrega) throw error

      // 2. Gera e salva o QR Code único da entrega
      const payload = gerarPayloadQR(novaEntrega.id)
      await salvarQRCodeEntrega(novaEntrega.id, payload)

      // 3. Notifica o morador via Edge Function
      supabase.functions.invoke('notificar-entrega', {
        body: { entrega_id: novaEntrega.id, morador_id: moradorSelecionado.id },
      }).catch(console.warn)

      setQrGerado(payload)
      setEntregaSalvaId(novaEntrega.id)
      await carregarDados()

    } catch (err) {
      Alert.alert('Erro', 'Não foi possível registrar a entrega. Tente novamente.')
      console.error(err)
    } finally {
      setSalvando(false)
    }
  }

  function fecharModal() {
    setModalAberto(false)
    setMoradorSelecionado(null)
    setTransportadora('')
    setVolumes('1')
    setObs('')
    setQrGerado(null)
    setEntregaSalvaId(null)
  }

  const pendentes = entregas.filter(e => e.status === 'aguardando' || e.status === 'notificado')
  const totalHoje = entregas.length

  if (loading) return <View style={styles.loadingWrap}><ActivityIndicator size="large" color={AC} /></View>

  return (
    <View style={styles.container}>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSub}>Turno {usuario?.turno || 'A'} · {usuario?.periodo || 'Manhã'}</Text>
          <Text style={styles.headerNome}>{usuario?.nome?.split(' ')[0] || '—'} 👋</Text>
          <Text style={styles.headerCondo}>{usuario?.condominios?.nome || '—'}</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={[styles.statNum, { color: '#92400E' }]}>{pendentes.length}</Text>
          <Text style={styles.statLabel}>Aguardando</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={[styles.statNum, { color: AC }]}>{totalHoje}</Text>
          <Text style={styles.statLabel}>Pendentes</Text>
        </View>
      </View>

      {/* Botão principal — abrir câmera */}
      <TouchableOpacity style={styles.btnNovaEntrega} onPress={abrirScannerMorador} activeOpacity={0.85}>
        <Text style={styles.btnNovaEntregaText}>📷  Escanear QR do morador</Text>
        <Text style={styles.btnNovaEntregaSub}>Aponte para o QR Code do app do morador</Text>
      </TouchableOpacity>

      {/* Lista de pendentes */}
      <Text style={styles.secTitle}>Pendentes agora</Text>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); carregarDados() }} tintColor={AC} />
        }
      >
        {entregas.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>Nenhuma entrega pendente</Text>
          </View>
        ) : (
          entregas.map(e => {
            const cfg = STATUS_CFG[e.status] || STATUS_CFG.aguardando
            const apto = (e as any).apartamentos
              ? `${(e as any).apartamentos.bloco}-${(e as any).apartamentos.numero}` : '—'
            const morador = (e as any).morador?.nome || '—'
            const hora = new Date(e.recebido_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            return (
              <View key={e.id} style={[styles.entregaRow, { borderLeftColor: cfg.dot }]}>
                <View style={styles.entregaInfo}>
                  <Text style={styles.entregaApto}>Apto {apto} · {morador}</Text>
                  <Text style={styles.entregaSub}>{e.transportadora} · {e.volumes} vol. · {hora}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
                  <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>
            )
          })
        )}
      </ScrollView>

      {/* Scanner QR do morador */}
      <Modal visible={scannerAberto} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <TouchableOpacity onPress={() => setScannerAberto(false)}>
              <Text style={styles.closeBtnText}>✕ Fechar</Text>
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Identificar morador</Text>
            <Text style={styles.scannerSub}>Peça ao morador para abrir o QR Code no app dele</Text>
          </View>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scannerAtivo ? handleScanMorador : undefined}
          />
          <View style={styles.scanOverlay}>
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal nova entrega */}
      <Modal visible={modalAberto} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {qrGerado ? '✅  Entrega registrada!' : 'Nova entrega'}
            </Text>
            <TouchableOpacity onPress={fecharModal} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕ Fechar</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll}>
            {qrGerado ? (
              /* Tela de sucesso com QR gerado */
              <View style={styles.qrSuccessWrap}>
                <View style={styles.moradorBox}>
                  <Text style={styles.moradorNome}>{moradorSelecionado?.nome}</Text>
                  <Text style={styles.moradorApto}>
                    Apto {moradorSelecionado?.apartamentos?.bloco}-{moradorSelecionado?.apartamentos?.numero}
                  </Text>
                </View>
                <View style={styles.qrBox}>
                  <Text style={styles.qrLabel}>QR Code da entrega</Text>
                  <Text style={styles.qrCode}>{qrGerado}</Text>
                  <Text style={styles.qrSub}>
                    Mostre este código ao morador ou imprima e cole na entrega.
                    O morador escaneia no app para confirmar a retirada.
                  </Text>
                </View>
                <TouchableOpacity style={styles.btnPrimary} onPress={fecharModal}>
                  <Text style={styles.btnPrimaryText}>Registrar outra entrega</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Formulário */
              <View style={styles.form}>
                {/* Morador identificado */}
                <View style={styles.moradorBox}>
                  <Text style={styles.formLabel}>MORADOR IDENTIFICADO</Text>
                  <Text style={styles.moradorNome}>{moradorSelecionado?.nome}</Text>
                  <Text style={styles.moradorApto}>
                    Apto {moradorSelecionado?.apartamentos?.bloco}-{moradorSelecionado?.apartamentos?.numero}
                  </Text>
                </View>

                {/* Transportadora */}
                <Text style={styles.formLabel}>TRANSPORTADORA</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.transRow}>
                  {TRANSPORTADORAS.map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.transChip, transportadora === t && styles.transChipActive]}
                      onPress={() => setTransportadora(t)}
                    >
                      <Text style={[styles.transChipText, transportadora === t && styles.transChipTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Volumes */}
                <Text style={[styles.formLabel, { marginTop: 16 }]}>VOLUMES</Text>
                <View style={styles.volumesRow}>
                  {['1','2','3','4','5'].map(v => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.volBtn, volumes === v && styles.volBtnActive]}
                      onPress={() => setVolumes(v)}
                    >
                      <Text style={[styles.volBtnText, volumes === v && styles.volBtnTextActive]}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                  <TextInput
                    style={[styles.volInput, !['1','2','3','4','5'].includes(volumes) && styles.volBtnActive]}
                    value={['1','2','3','4','5'].includes(volumes) ? '' : volumes}
                    onChangeText={setVolumes}
                    placeholder="Outro"
                    placeholderTextColor="#A1A1AA"
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>

                {/* Observação */}
                <Text style={[styles.formLabel, { marginTop: 16 }]}>OBSERVAÇÃO <Text style={styles.optional}>(opcional)</Text></Text>
                <TextInput
                  style={styles.obsInput}
                  value={obs}
                  onChangeText={setObs}
                  placeholder="Ex: caixa amassada, entrega frágil..."
                  placeholderTextColor="#A1A1AA"
                  multiline
                  numberOfLines={3}
                />

                <TouchableOpacity
                  style={[styles.btnPrimary, salvando && styles.btnDisabled]}
                  onPress={salvarEntrega}
                  disabled={salvando}
                  activeOpacity={0.85}
                >
                  {salvando
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.btnPrimaryText}>Registrar e gerar QR Code</Text>}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

    </View>
  )
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#f5f5f5' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header:      { backgroundColor: AC, padding: 20, paddingTop: 56 },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,.65)', marginBottom: 2 },
  headerNome:  { fontSize: 22, fontWeight: '700', color: '#fff' },
  headerCondo: { fontSize: 12, color: 'rgba(255,255,255,.65)', marginTop: 2 },

  statsRow:    { flexDirection: 'row', backgroundColor: '#fff', margin: 16, borderRadius: 14, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  stat:        { flex: 1, alignItems: 'center' },
  statNum:     { fontSize: 24, fontWeight: '700', color: '#18181B' },
  statLabel:   { fontSize: 11, color: '#71717A', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: '#E4E4E7' },

  btnNovaEntrega:    { backgroundColor: AC, margin: 16, marginTop: 0, borderRadius: 14, padding: 16, alignItems: 'center' },
  btnNovaEntregaText:{ color: '#fff', fontSize: 16, fontWeight: '700' },
  btnNovaEntregaSub: { color: 'rgba(255,255,255,.75)', fontSize: 12, marginTop: 4 },

  secTitle:      { fontSize: 13, fontWeight: '600', color: '#3F3F46', paddingHorizontal: 16, marginBottom: 8 },
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 0 },

  empty:      { alignItems: 'center', paddingVertical: 32 },
  emptyIcon:  { fontSize: 32, marginBottom: 8 },
  emptyTitle: { fontSize: 14, color: '#71717A' },

  entregaRow:   { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, borderLeftWidth: 4, flexDirection: 'row', alignItems: 'center', borderTopWidth: 0.5, borderRightWidth: 0.5, borderBottomWidth: 0.5, borderTopColor: '#E4E4E7', borderRightColor: '#E4E4E7', borderBottomColor: '#E4E4E7' },
  entregaInfo:  { flex: 1 },
  entregaApto:  { fontSize: 13, fontWeight: '600', color: '#18181B' },
  entregaSub:   { fontSize: 11, color: '#71717A', marginTop: 2 },
  badge:        { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText:    { fontSize: 10, fontWeight: '600' },

  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerHeader:    { padding: 20, paddingTop: 52, backgroundColor: '#111' },
  closeBtnText:     { color: '#A1A1AA', fontSize: 14, marginBottom: 8 },
  scannerTitle:     { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 4 },
  scannerSub:       { fontSize: 13, color: '#A1A1AA' },
  camera:           { flex: 1 },
  scanOverlay:      { position: 'absolute', inset: 0, justifyContent: 'center', alignItems: 'center' },
  scanFrame:        { width: 220, height: 220, position: 'relative' },
  corner:           { position: 'absolute', width: 30, height: 30, borderColor: '#fff', borderWidth: 3 },
  cornerTL:         { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  cornerTR:         { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  cornerBL:         { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  cornerBR:         { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },

  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 52, borderBottomWidth: 0.5, borderBottomColor: '#E4E4E7' },
  modalTitle:     { fontSize: 18, fontWeight: '700', color: '#18181B' },
  closeBtn:       {},
  modalScroll:    { flex: 1 },

  form:        { padding: 20 },
  formLabel:   { fontSize: 11, fontWeight: '700', color: '#71717A', letterSpacing: 0.7, marginBottom: 8 },
  optional:    { fontWeight: '400', color: '#A1A1AA' },

  moradorBox:  { backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, marginBottom: 20 },
  moradorNome: { fontSize: 16, fontWeight: '700', color: '#1E3A8A' },
  moradorApto: { fontSize: 13, color: '#3B82F6', marginTop: 2 },

  transRow:       { marginBottom: 4 },
  transChip:      { borderWidth: 1, borderColor: '#E4E4E7', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8, backgroundColor: '#fff' },
  transChipActive:{ backgroundColor: AC, borderColor: AC },
  transChipText:  { fontSize: 13, color: '#71717A' },
  transChipTextActive: { color: '#fff', fontWeight: '600' },

  volumesRow:    { flexDirection: 'row', gap: 8, alignItems: 'center' },
  volBtn:        { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#E4E4E7', justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  volBtnActive:  { backgroundColor: AC, borderColor: AC },
  volBtnText:    { fontSize: 15, fontWeight: '600', color: '#71717A' },
  volBtnTextActive: { color: '#fff' },
  volInput:      { width: 64, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#E4E4E7', textAlign: 'center', fontSize: 15, color: '#18181B' },

  obsInput:    { borderWidth: 1, borderColor: '#E4E4E7', borderRadius: 10, padding: 12, fontSize: 14, color: '#18181B', minHeight: 80, textAlignVertical: 'top', marginBottom: 20 },

  btnPrimary:     { backgroundColor: AC, borderRadius: 12, padding: 15, alignItems: 'center' },
  btnDisabled:    { opacity: 0.6 },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  qrSuccessWrap: { padding: 20 },
  qrBox:         { backgroundColor: '#F5F3FF', borderRadius: 14, padding: 20, marginVertical: 20, alignItems: 'center' },
  qrLabel:       { fontSize: 13, fontWeight: '700', color: '#5B21B6', marginBottom: 12 },
  qrCode:        { fontSize: 10, color: '#374151', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', textAlign: 'center', marginBottom: 12, letterSpacing: 0.5 },
  qrSub:         { fontSize: 12, color: '#6B7280', textAlign: 'center', lineHeight: 18 },
})
