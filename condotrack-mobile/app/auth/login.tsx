import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native'
import { router } from 'expo-router'
import { supabase, getUsuarioLogado } from '@/lib/supabase'
import { registrarPushToken } from '@/lib/notifications'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [senha, setSenha]       = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [carregando, setCarregando]     = useState(false)
  const [erro, setErro]         = useState('')

  async function handleLogin() {
    setErro('')
    if (!email.trim())     { setErro('Informe seu e-mail.'); return }
    if (senha.length < 6)  { setErro('Senha com mínimo 6 caracteres.'); return }

    setCarregando(true)

    try {
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })

      if (authError) {
        const msg = authError.message?.includes('Email not confirmed')
          ? 'Confirme seu e-mail antes de entrar.'
          : 'E-mail ou senha incorretos.'
        setErro(msg)
        return
      }

      const usuario = await getUsuarioLogado()

      if (!usuario) {
        setErro('Usuário não encontrado no sistema.')
        await supabase.auth.signOut()
        return
      }

      if (usuario.status === 'inativo') {
        setErro('Sua conta está inativa. Entre em contato com o administrador.')
        await supabase.auth.signOut()
        return
      }

      // Registra push token em background
      registrarPushToken(usuario.id).catch(console.warn)

      // Redireciona para o painel correto
      switch (usuario.perfil) {
        case 'morador':   router.replace('/(morador)'); break
        case 'porteiro':  router.replace('/(porteiro)'); break
        case 'admin':
        case 'superadmin': router.replace('/(admin)'); break
        default:
          setErro('Perfil não reconhecido.')
          await supabase.auth.signOut()
      }

    } catch (err) {
      setErro('Erro inesperado. Tente novamente.')
      console.error(err)
    } finally {
      setCarregando(false)
    }
  }

  async function handleEsqueciSenha() {
    if (!email.trim()) {
      Alert.alert('Informe seu e-mail', 'Digite o e-mail no campo acima antes de continuar.')
      return
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim())
    if (error) {
      Alert.alert('Erro', 'Não foi possível enviar o link. Tente novamente.')
    } else {
      Alert.alert('Link enviado!', 'Verifique sua caixa de entrada e o spam.')
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={styles.logoArea}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoIconText}>CT</Text>
          </View>
          <Text style={styles.logoName}>CondoTrack</Text>
          <Text style={styles.logoSub}>Gestão inteligente de entregas</Text>
        </View>

        {/* Card de login */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bem-vindo de volta</Text>
          <Text style={styles.cardSub}>Entre com seu e-mail e senha</Text>

          {/* E-mail */}
          <View style={styles.fieldWrap}>
            <Text style={styles.label}>E-MAIL</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="seu@email.com"
              placeholderTextColor="#A1A1AA"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Senha */}
          <View style={styles.fieldWrap}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>SENHA</Text>
              <TouchableOpacity onPress={handleEsqueciSenha}>
                <Text style={styles.forgotLink}>Esqueci minha senha</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.inputWrap}>
              <TextInput
                style={[styles.input, styles.inputWithBtn]}
                value={senha}
                onChangeText={setSenha}
                placeholder="••••••••"
                placeholderTextColor="#A1A1AA"
                secureTextEntry={!mostrarSenha}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setMostrarSenha(v => !v)}
              >
                <Text style={styles.eyeText}>{mostrarSenha ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Erro */}
          {erro ? (
            <View style={styles.erroBox}>
              <Text style={styles.erroText}>{erro}</Text>
            </View>
          ) : null}

          {/* Botão entrar */}
          <TouchableOpacity
            style={[styles.btnPrimary, carregando && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={carregando}
            activeOpacity={0.85}
          >
            {carregando
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>Entrar</Text>}
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>CondoTrack v1.0</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F3FF' },
  scroll:    { flexGrow: 1, justifyContent: 'center', padding: 24 },

  logoArea:    { alignItems: 'center', marginBottom: 32 },
  logoIcon:    { width: 64, height: 64, borderRadius: 18, backgroundColor: '#6D28D9', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  logoIconText:{ color: '#fff', fontSize: 22, fontWeight: '700' },
  logoName:    { fontSize: 24, fontWeight: '700', color: '#1F1B4B', letterSpacing: -0.5 },
  logoSub:     { fontSize: 13, color: '#7C3AED', marginTop: 4 },

  card:      { backgroundColor: '#fff', borderRadius: 20, padding: 24, shadowColor: '#6D28D9', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  cardTitle: { fontSize: 20, fontWeight: '700', color: '#18181B', marginBottom: 4 },
  cardSub:   { fontSize: 13, color: '#71717A', marginBottom: 24 },

  fieldWrap: { marginBottom: 16 },
  labelRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  label:     { fontSize: 11, fontWeight: '700', color: '#71717A', letterSpacing: 0.7, marginBottom: 6 },
  forgotLink:{ fontSize: 12, fontWeight: '600', color: '#7C3AED' },

  inputWrap:    { position: 'relative' },
  input:        { borderWidth: 1.5, borderColor: '#E4E4E7', borderRadius: 10, padding: 12, fontSize: 14, color: '#18181B', backgroundColor: '#fff' },
  inputWithBtn: { paddingRight: 44 },
  eyeBtn:       { position: 'absolute', right: 12, top: 12 },
  eyeText:      { fontSize: 16 },

  erroBox:  { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 8, padding: 10, marginBottom: 14 },
  erroText: { fontSize: 13, color: '#DC2626' },

  btnPrimary:  { backgroundColor: '#6D28D9', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 4 },
  btnDisabled: { opacity: 0.6 },
  btnText:     { color: '#fff', fontSize: 15, fontWeight: '700' },

  footer: { textAlign: 'center', fontSize: 12, color: '#A1A1AA', marginTop: 32 },
})
