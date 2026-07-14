import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ihaeqbtoylxcfwmdcjfg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tkRXIWO0dgIArNRHZ9RyGw_ewcUlAzD';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  }

  // Faz a autenticação padrão com e-mail e senha
  async signIn(email: string, senha: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password: senha,
    });
    
    if (error) throw error;
    return data;
  }

  // Busca os detalhes do usuário na tabela pública
  async getUsuarioPerfil(authId: string) {
    const { data, error } = await this.supabase
      .from('usuarios')
      .select('id, perfil, condominio_id, nome, status')
      .eq('auth_id', authId)
      .single();

    if (error) throw error;
    return data;
  }

  // Registra o log de acesso (Audit)
  async registrarAcessoLog(usuario: any, status: string) {
    const { error } = await this.supabase.from('acessos').insert({
      usuario_id: usuario.id,
      condominio_id: usuario.condominio_id,
      perfil: usuario.perfil,
      nome: usuario.nome,
      status: status,
    });
    
    if (error) console.error('Erro ao registrar log de acesso:', error);
  }
}