// ============================================================
//  utils.js — funções utilitárias compartilhadas
//  Carregado antes dos outros scripts em cada página
// ============================================================

function isEmailValido(email) {
  return /\S+@\S+\.\S+/.test(email)
}

function isCPFValido(cpf) {
  return cpf.replace(/\D/g, '').length === 11
}

function mostrarErro(id, mensagem) {
  const el = document.getElementById(id)
  if (!el) return
  el.textContent = mensagem
  el.style.display = 'block'
}

function limparErro(id) {
  const el = document.getElementById(id)
  if (!el) return
  el.textContent = ''
  el.style.display = 'none'
}

function limparTodosErros(...ids) {
  ids.forEach(limparErro)
}

function setBtnCarregando(btnId, carregando) {
  const btn = document.getElementById(btnId)
  if (!btn) return
  btn.disabled = carregando
  const texto = btn.querySelector('[data-texto]')
  const spin  = btn.querySelector('[data-spinner]')
  if (texto) texto.style.display = carregando ? 'none' : 'flex'
  if (spin)  spin.style.display  = carregando ? 'block' : 'none'
}

function toggleSenha(inputId, iconId) {
  const input = document.getElementById(inputId)
  const icon  = document.getElementById(iconId)
  if (!input || !icon) return
  const visivel = input.type === 'text'
  input.type = visivel ? 'password' : 'text'
  icon.innerHTML = visivel
    ? `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`
    : `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
       <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
       <line x1="1" y1="1" x2="23" y2="23"/>`
}

function aplicarMascaraCPF(inputId) {
  const input = document.getElementById(inputId)
  if (!input) return
  input.addEventListener('input', function () {
    let v = this.value.replace(/\D/g, '').slice(0, 11)
    v = v.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
    this.value = v
  })
}

function aplicarMascaraTelefone(inputId) {
  const input = document.getElementById(inputId)
  if (!input) return
  input.addEventListener('input', function () {
    let v = this.value.replace(/\D/g, '').slice(0, 11)
    v = v.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
    this.value = v
  })
}

function salvarSessao(perfil, dados) {
  sessionStorage.setItem('ct_perfil', perfil)
  sessionStorage.setItem('ct_usuario', JSON.stringify(dados))
}

function obterSessao() {
  return {
    perfil:  sessionStorage.getItem('ct_perfil'),
    usuario: JSON.parse(sessionStorage.getItem('ct_usuario') || 'null'),
  }
}

// encerrarSessao é definida em supabase.js (faz signOut + redireciona)