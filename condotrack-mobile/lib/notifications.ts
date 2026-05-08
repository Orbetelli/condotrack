import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from './supabase'

// Configura como as notificações aparecem quando o app está aberto
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
})

// ── Registrar device para push notifications ─────────────────
export async function registrarPushToken(usuarioId: string): Promise<void> {
  // Só funciona em device físico
  if (!Device.isDevice) {
    console.warn('[push] Push notifications só funcionam em dispositivos físicos.')
    return
  }

  // Solicita permissão
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    console.warn('[push] Permissão de notificação negada.')
    return
  }

  // Canal Android
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('entregas', {
      name:        'Entregas',
      importance:  Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor:  '#6D28D9',
      sound:       'notification.wav',
    })
  }

  // Obtém o token do Expo Push Service
  const projectId = Constants.expoConfig?.extra?.eas?.projectId
    ?? Constants.easConfig?.projectId

  const { data: tokenData } = await Notifications.getExpoPushTokenAsync({ projectId })
  const token = tokenData

  if (!token) return

  // Salva no banco — upsert para atualizar se já existir
  const { error } = await supabase
    .from('push_tokens')
    .upsert({
      usuario_id: usuarioId,
      token,
      plataforma: Platform.OS,
      ativo:      true,
    }, { onConflict: 'usuario_id,token' })

  if (error) console.error('[push] Erro ao salvar token:', error)
  else console.log('[push] Token registrado com sucesso.')
}

// ── Remove o token ao fazer logout ───────────────────────────
export async function removerPushToken(usuarioId: string): Promise<void> {
  const { data: tokenData } = await Notifications.getExpoPushTokenAsync()
    .catch(() => ({ data: null }))

  if (!tokenData) return

  await supabase
    .from('push_tokens')
    .update({ ativo: false })
    .eq('usuario_id', usuarioId)
    .eq('token', tokenData)
}

// ── Listeners de notificação ─────────────────────────────────
export function configurarListeners(
  onReceber:  (n: Notifications.Notification) => void,
  onRespostar: (r: Notifications.NotificationResponse) => void,
) {
  const sub1 = Notifications.addNotificationReceivedListener(onReceber)
  const sub2 = Notifications.addNotificationResponseReceivedListener(onRespostar)
  return () => { sub1.remove(); sub2.remove() }
}
