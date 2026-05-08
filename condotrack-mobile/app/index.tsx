import { useEffect } from 'react'
import { router } from 'expo-router'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { getUsuarioLogado } from '@/lib/supabase'

export default function Index() {
  useEffect(() => {
    verificarSessao()
  }, [])

  async function verificarSessao() {
    const usuario = await getUsuarioLogado()

    if (!usuario) {
      router.replace('/(auth)/login')
      return
    }

    // Redireciona para o painel correto baseado no perfil
    switch (usuario.perfil) {
      case 'morador':
        router.replace('/(morador)')
        break
      case 'porteiro':
        router.replace('/(porteiro)')
        break
      case 'admin':
      case 'superadmin':
        router.replace('/(admin)')
        break
      default:
        router.replace('/(auth)/login')
    }
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#6D28D9" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F3FF',
  },
})
