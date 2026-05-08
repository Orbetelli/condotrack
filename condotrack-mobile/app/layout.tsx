import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { configurarListeners } from '@/lib/notifications'
import { useRouter } from 'expo-router'

export default function RootLayout() {
  const router = useRouter()

  useEffect(() => {
    // Configura listeners de notificação
    const cleanup = configurarListeners(
      // Notificação recebida com app aberto
      (notification) => {
        console.log('[notif] Recebida:', notification.request.content.title)
      },
      // Usuário tocou na notificação
      (response) => {
        const data = response.notification.request.content.data as any
        if (data?.entrega_id) {
          // Navega para a entrega específica
          router.push('/(morador)')
        }
      },
    )
    return cleanup
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(morador)" />
          <Stack.Screen name="(porteiro)" />
          <Stack.Screen name="(admin)" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
