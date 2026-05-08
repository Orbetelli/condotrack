import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ihaeqbtoylxcfwmdcjfg.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImloYWVxYnRveWx4Y2Z3bWRjamZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyNTA4NTUsImV4cCI6MjA5MjgyNjg1NX0.Tyn5D4LeCsPWMFh8Crk6zb9gQD9IlR4fjG_v_xfnMPE' // usar a nova após rotação

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage:          AsyncStorage,
    autoRefreshToken: true,
    persistSession:   true,
    detectSessionInUrl: false,
  },
})

// ── Helpers de autenticação ──────────────────────────────────

export async function getUsuarioLogado() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.id) return null

  const { data, error } = await supabase
    .from('usuarios')
    .select(`
      id, auth_id, perfil, nome, email, telefone,
      status, turno, periodo,
      condominio_id, apartamento_id,
      condominios ( id, nome, endereco, cidade, uf ),
      apartamentos ( id, numero, bloco )
    `)
    .eq('auth_id', session.user.id)
    .single()

  if (error) { console.error('Erro ao buscar usuário:', error); return null }
  return data
}

export async function logout() {
  await supabase.auth.signOut()
}

// ── Tipos ────────────────────────────────────────────────────

export type Perfil = 'superadmin' | 'admin' | 'porteiro' | 'morador'

export interface Usuario {
  id:             string
  auth_id:        string
  perfil:         Perfil
  nome:           string
  email:          string
  telefone:       string | null
  status:         string
  turno:          string | null
  periodo:        string | null
  condominio_id:  string
  apartamento_id: string | null
  condominios:    { id: string; nome: string; endereco: string; cidade: string; uf: string } | null
  apartamentos:   { id: string; numero: string; bloco: string } | null
}

export interface Entrega {
  id:             string
  condominio_id:  string
  apartamento_id: string
  morador_id:     string | null
  porteiro_id:    string | null
  transportadora: string
  volumes:        number
  status:         'aguardando' | 'notificado' | 'retirado' | 'expirado' | 'entregue_porteiro'
  obs:            string | null
  qr_code:        string | null
  foto_url:       string | null
  recebido_em:    string
  retirado_em:    string | null
  entregue_em:    string | null
  apartamentos:   { numero: string; bloco: string } | null
  morador:        { nome: string } | null
}
