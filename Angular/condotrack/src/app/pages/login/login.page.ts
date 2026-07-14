import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone'; // Mantemos apenas o IonContent que estamos usando
import { SupabaseService } from 'src/app/services/supabase.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent] // Removemos os imports não utilizados aqui
})
export class LoginPage {
  // Variáveis que o HTML está procurando
  email = '';
  senha = '';
  
  // Controle de interface
  mostrarSenha = false;
  isLoading = false;
  
  // Mensagens de erro
  emailError = '';
  senhaError = '';
  formError = '';

  constructor(
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  toggleSenha() {
    this.mostrarSenha = !this.mostrarSenha;
  }

  limparErros() {
    this.emailError = '';
    this.senhaError = '';
    this.formError = '';
  }

  // Função chamada ao clicar em "Entrar"
  async fazerLogin() {
    this.limparErros();
    let valido = true;

    if (!this.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) {
      this.emailError = 'Informe um e-mail válido.';
      valido = false;
    }
    if (!this.senha || this.senha.length < 6) {
      this.senhaError = 'Mínimo 6 caracteres.';
      valido = false;
    }

    if (!valido) return;

    this.isLoading = true;

    try {
      const authData = await this.supabaseService.signIn(this.email, this.senha);
      const usuario = await this.supabaseService.getUsuarioPerfil(authData.user.id);

      if (usuario.status === 'inativo') {
        this.formError = 'Sua conta está inativa. Entre em contato com o administrador.';
        this.isLoading = false;
        return;
      }

      await this.supabaseService.registrarAcessoLog(usuario, 'sucesso');
      localStorage.setItem('ct_usuario', JSON.stringify(usuario));

      if (usuario.perfil === 'sindico') this.router.navigate(['/admin']);
      else if (usuario.perfil === 'porteiro') this.router.navigate(['/porteiro']);
      else this.router.navigate(['/dashboard']); 

    } catch (err: any) {
      console.error(err);
      this.formError = err.message?.includes('Email not confirmed') 
        ? 'Confirme seu e-mail antes de entrar.' 
        : 'E-mail ou senha incorretos.';
    } finally {
      this.isLoading = false;
    }
  }
}