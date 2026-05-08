import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase, getUsuarioLogado, type Usuario } from '@/lib/supabase'

const AC = '#6D28D9'

const STATUS_CFG: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  aguardando:        { label: 'Aguardando',  bg: '#FEF3C7', color: '#92400E', dot: '#F59E0B' },
  notificado:        { label: 'Notificado',  bg: '#EDE9FE', color: '#5B21B6', dot: '#A78BFA' },
  entregue_porteiro: { label: 'A confirmar', bg: '#ECFDF5', color: '#065F46', dot: '#10B981' },
  retirado:          { label: 'Retirado',    bg: '#F0FDF4', color: '#166534', dot: '#34D399' },
  expirado:          { label: 'Expirado',    bg: '#FEF2F2', color: '#991B1B', dot: '#F87171' },
}

export default function AdminDashboard() {
  const [usuario, setUsuario]   = useState<Usuario | null>(null)
  const [stats, setStats]       = useState({ porteiros: 0, moradores: 0, pendentes: 0, total: 0 })
  const [entregas, setEntregas] = useState<any[]>([])
  const [moradores, setMoradores] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [refresh, setRefresh]   = useState(false)
  const [aba, setAba]           = useState<'entregas' | 'moradores'>('entregas')

  useFocusEffect(
    useCallback(() => { carregarDados() }, [])
  )

  async function carregarDados() {
    const u = await getUsuarioLogado()
    if (!u) return
    setUsuario(u)

    const condoId = u.condominio_id

    const [
      { data: porteiros },
      { data: mors },
      { data: entr },
    ] = await Promise.all([
      supabase.from('usuarios').select('id', { count: 'exact' })
        .eq('condominio_id', condoId).eq('perfil', 'porteiro').eq('status', 'ativo'),
      supabase.from('usuarios').select('id, nome, status, apartamentos(numero, bloco)')
        .eq('condominio_id', condoId).eq('perfil', 'morador').order('nome').limit(20),
      supabase.from('entregas')
        .select('id, transportadora, volumes, status, recebido_em, apartamentos(numero, bloco)')
        .eq('condominio_id', condoId)
        .order('recebido_em', { ascending: false }).limit(20),
    ])

    const pendentes = (entr || []).filter((e: any) =>
      ['aguardando', 'notificado', 'entregue_porteiro'].includes(e.status)
    ).length

    setStats({
      porteiros: porteiros?.length || 0,
      moradores: mors?.length || 0,
      pendentes,
      total:     entr?.length || 0,
    })
    setEntregas(entr || [])
    setMoradores(mors || [])
    setLoading(false)
    setRefresh(false)
  }

  if (loading) return <View style={s.loadingWrap}><ActivityIndicator size="large" color={AC} /></View>

  return (
    <View style={s.container}>

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.hGreeting}>Bom dia,</Text>
          <Text style={s.hNome}>{usuario?.nome?.split(' ')[0] || '—'}</Text>
          <Text style={s.hCondo}>{usuario?.condominios?.nome || '—'} · Síndico</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={s.statsGrid}>
        {[
          { num: stats.porteiros, label: 'Porteiros',  color: '#5B21B6' },
          { num: stats.moradores, label: 'Moradores',  color: '#1D4ED8' },
          { num: stats.pendentes, label: 'Pendentes',  color: '#92400E' },
          { num: stats.total,     label: 'Hoje',       color: AC       },
        ].map(({ num, label, color }) => (
          <View key={label} style={s.statCard}>
            <Text style={[s.statNum, { color }]}>{num}</Text>
            <Text style={s.statLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Abas */}
      <View style={s.abas}>
        <TouchableOpacity
          style={[s.aba, aba === 'entregas' && s.abaActive]}
          onPress={() => setAba('entregas')}
        >
          <Text style={[s.abaText, aba === 'entregas' && s.abaTextActive]}>📦 Entregas</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.aba, aba === 'moradores' && s.abaActive]}
          onPress={() => setAba('moradores')}
        >
          <Text style={[s.abaText, aba === 'moradores' && s.abaTextActive]}>👥 Moradores</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); carregarDados() }} tintColor={AC} />
        }
      >
        {aba === 'entregas' ? (
          entregas.length === 0 ? (
            <View style={s.empty}><Text style={s.emptyText}>Nenhuma entrega registrada</Text></View>
          ) : (
            entregas.map((e: any) => {
              const cfg = STATUS_CFG[e.status] || STATUS_CFG.aguardando
              const apto = e.apartamentos ? `${e.apartamentos.bloco}-${e.apartamentos.numero}` : '—'
              const hora = new Date(e.recebido_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              return (
                <View key={e.id} style={[s.row, { borderLeftColor: cfg.dot }]}>
                  <View style={s.rowInfo}>
                    <Text style={s.rowTitle}>Apto {apto} · {e.transportadora}</Text>
                    <Text style={s.rowSub}>{e.volumes} vol. · {hora}</Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: cfg.bg }]}>
                    <Text style={[s.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>
              )
            })
          )
        ) : (
          moradores.length === 0 ? (
            <View style={s.empty}><Text style={s.emptyText}>Nenhum morador cadastrado</Text></View>
          ) : (
            moradores.map((m: any) => {
              const apto = m.apartamentos ? `${m.apartamentos.bloco}-${m.apartamentos.numero}` : '—'
              const ini  = m.nome.split(' ').map((n: string) => n[0]).slice(0, 2).join('')
              const ativo = m.status === 'ativo'
              return (
                <View key={m.id} style={s.moradorRow}>
                  <View style={[s.avatar, { backgroundColor: ativo ? '#EDE9FE' : '#F4F4F5' }]}>
                    <Text style={[s.avatarText, { color: ativo ? '#5B21B6' : '#A1A1AA' }]}>{ini}</Text>
                  </View>
                  <View style={s.rowInfo}>
                    <Text style={s.rowTitle}>{m.nome}</Text>
                    <Text style={s.rowSub}>Apto {apto}</Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: ativo ? '#F0FDF4' : '#F4F4F5' }]}>
                    <Text style={[s.badgeText, { color: ativo ? '#166534' : '#A1A1AA' }]}>
                      {ativo ? 'Ativo' : m.status}
                    </Text>
                  </View>
                </View>
              )
            })
          )
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#f5f5f5' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header:    { backgroundColor: AC, padding: 20, paddingTop: 56 },
  hGreeting: { fontSize: 12, color: 'rgba(255,255,255,.65)' },
  hNome:     { fontSize: 22, fontWeight: '700', color: '#fff', marginTop: 2 },
  hCondo:    { fontSize: 12, color: 'rgba(255,255,255,.65)', marginTop: 2 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 16 },
  statCard:  { flex: 1, minWidth: '45%', backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 0.5, borderColor: '#E4E4E7' },
  statNum:   { fontSize: 24, fontWeight: '700' },
  statLabel: { fontSize: 11, color: '#71717A', marginTop: 2 },

  abas:         { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 0.5, borderBottomColor: '#E4E4E7' },
  aba:          { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  abaActive:    { borderBottomColor: AC },
  abaText:      { fontSize: 13, color: '#A1A1AA', fontWeight: '500' },
  abaTextActive:{ color: AC, fontWeight: '700' },

  scroll:        { flex: 1 },
  scrollContent: { padding: 16 },

  empty:     { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 14, color: '#A1A1AA' },

  row:       { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, borderLeftWidth: 4, flexDirection: 'row', alignItems: 'center', borderTopWidth: 0.5, borderRightWidth: 0.5, borderBottomWidth: 0.5, borderTopColor: '#E4E4E7', borderRightColor: '#E4E4E7', borderBottomColor: '#E4E4E7' },
  rowInfo:   { flex: 1 },
  rowTitle:  { fontSize: 13, fontWeight: '600', color: '#18181B' },
  rowSub:    { fontSize: 11, color: '#71717A', marginTop: 2 },
  badge:     { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '600' },

  moradorRow: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 0.5, borderColor: '#E4E4E7' },
  avatar:     { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 12, fontWeight: '700' },
})
