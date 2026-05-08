import { useState, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { getUsuarioLogado, logout, type Usuario } from '@/lib/supabase'
import { removerPushToken } from '@/lib/notifications'

const AC = '#0F6E56'

// QR Code pessoal do morador — identificação na portaria
// Formato: CT:MORADOR:{usuario_id}
function QRCodePessoal({ usuarioId }: { usuarioId: string }) {
  const payload = `CT:MORADOR:${usuarioId}`

  // Representação visual simples do QR Code
  // Em produção usar a lib react-native-qrcode-svg
  return (
    <View style={styles.qrWrap}>
      <View style={styles.qrFrame}>
        <View style={styles.qrPattern}>
          {/* Cantos do QR */}
          <View style={styles.qrCornerTL} />
          <View style={styles.qrCornerTR} />
          <View style={styles.qrCornerBL} />
          {/* Dados (representação visual) */}
          <View style={styles.qrData}>
            {Array.from({ length: 8 }).map((_, i) => (
              <View key={i} style={styles.qrRow}>
                {Array.from({ length: 8 }).map((_, j) => (
                  <View
                    key={j}
                    style={[
                      styles.qrCell,
                      { backgroundColor: ((i + j + usuarioId.charCodeAt(i % usuarioId.length)) % 3 === 0) ? '#111' : 'transparent' }
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
      </View>
      <Text style={styles.qrId}>{usuarioId.slice(0, 8).toUpperCase()}</Text>
    </View>
  )
}

export default function MoradorPerfil() {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)

  useFocusEffect(
    useCallback(() => {
      getUsuarioLogado().then(u => { setUsuario(u); setLoading(false) })
    }, [])
  )

  async function handleLogout() {
    Alert.alert(
      'Sair da conta',
      'Deseja encerrar sua sessão?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair', style: 'destructive',
          onPress: async () => {
            if (usuario) await removerPushToken(usuario.id)
            await logout()
            router.replace('/(auth)/login')
          },
        },
      ]
    )
  }

  if (loading) return <View style={styles.loadingWrap}><ActivityIndicator color={AC} /></View>

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {usuario?.nome?.split(' ').map(n => n[0]).slice(0, 2).join('') || '?'}
          </Text>
        </View>
        <Text style={styles.nome}>{usuario?.nome || '—'}</Text>
        <View style={styles.aptoPill}>
          <Text style={styles.aptoPillText}>
            Apto {usuario?.apartamentos?.bloco}-{usuario?.apartamentos?.numero}
          </Text>
        </View>
        <Text style={styles.condo}>{usuario?.condominios?.nome || '—'}</Text>
      </View>

      {/* QR Code pessoal */}
      <View style={styles.qrCard}>
        <Text style={styles.qrCardTitle}>Meu QR Code</Text>
        <Text style={styles.qrCardSub}>
          Apresente ao porteiro para identificação rápida ao retirar entregas
        </Text>
        {usuario && <QRCodePessoal usuarioId={usuario.id} />}
        <View style={styles.qrDica}>
          <Text style={styles.qrDicaText}>
            💡 O porteiro escaneia este código para identificar você e registrar a entrega automaticamente.
          </Text>
        </View>
      </View>

      {/* Dados do perfil */}
      <View style={styles.infoCard}>
        <Text style={styles.secTitle}>Meus dados</Text>
        {[
          ['Nome',      usuario?.nome     || '—'],
          ['E-mail',    usuario?.email    || '—'],
          ['Telefone',  usuario?.telefone || '—'],
          ['Condomínio',usuario?.condominios?.nome || '—'],
        ].map(([label, value]) => (
          <View key={label} style={styles.infoRow}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{value}</Text>
          </View>
        ))}
      </View>

      {/* Botão sair */}
      <TouchableOpacity style={styles.btnSair} onPress={handleLogout} activeOpacity={0.85}>
        <Text style={styles.btnSairText}>Sair da conta</Text>
      </TouchableOpacity>

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#f5f5f5' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content:     { padding: 20, paddingTop: 60 },

  header:     { alignItems: 'center', marginBottom: 24 },
  avatar:     { width: 72, height: 72, borderRadius: 36, backgroundColor: '#D1FAE5', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { fontSize: 24, fontWeight: '700', color: AC },
  nome:       { fontSize: 20, fontWeight: '700', color: '#18181B', marginBottom: 8 },
  aptoPill:   { backgroundColor: AC, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 5, marginBottom: 4 },
  aptoPillText:{ fontSize: 12, fontWeight: '600', color: '#fff' },
  condo:      { fontSize: 13, color: '#71717A' },

  qrCard:      { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 0.5, borderColor: '#E4E4E7', alignItems: 'center' },
  qrCardTitle: { fontSize: 16, fontWeight: '700', color: '#18181B', marginBottom: 4 },
  qrCardSub:   { fontSize: 12, color: '#71717A', textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  qrDica:      { backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12, marginTop: 16, borderWidth: 0.5, borderColor: '#BBF7D0' },
  qrDicaText:  { fontSize: 12, color: '#166534', lineHeight: 18 },

  qrWrap:      { alignItems: 'center' },
  qrFrame:     { padding: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E4E4E7' },
  qrPattern:   { width: 140, height: 140, position: 'relative' },
  qrCornerTL:  { position: 'absolute', top: 0, left: 0, width: 36, height: 36, borderWidth: 4, borderColor: '#111', borderRadius: 4 },
  qrCornerTR:  { position: 'absolute', top: 0, right: 0, width: 36, height: 36, borderWidth: 4, borderColor: '#111', borderRadius: 4 },
  qrCornerBL:  { position: 'absolute', bottom: 0, left: 0, width: 36, height: 36, borderWidth: 4, borderColor: '#111', borderRadius: 4 },
  qrData:      { position: 'absolute', top: 42, left: 42, right: 42, bottom: 42 },
  qrRow:       { flexDirection: 'row' },
  qrCell:      { width: 7, height: 7 },
  qrId:        { fontSize: 10, color: '#A1A1AA', marginTop: 8, letterSpacing: 1 },

  infoCard:  { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 0.5, borderColor: '#E4E4E7' },
  secTitle:  { fontSize: 14, fontWeight: '700', color: '#18181B', marginBottom: 12 },
  infoRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#F4F4F5' },
  infoLabel: { fontSize: 13, color: '#71717A' },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#18181B', flex: 1, textAlign: 'right' },

  btnSair:     { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 15, alignItems: 'center', borderWidth: 0.5, borderColor: '#FECACA', marginBottom: 32 },
  btnSairText: { color: '#DC2626', fontSize: 15, fontWeight: '700' },
})
