// ============================================================
//  utils.js — funções utilitárias compartilhadas
//  Carregado antes dos outros scripts em cada página
// ============================================================

function isEmailValido(email) {
  return /\S+@\S+\.\S+/.test(email)
}

function isCPFValido(cpf) {
  const n = cpf.replace(/\D/g, '')
  if (n.length !== 11) return false
  // Rejeita sequências repetidas (111.111.111-11, etc)
  if (/^(\d)\1+$/.test(n)) return false
  // Valida 1º dígito verificador
  let soma = 0
  for (let i = 0; i < 9; i++) soma += parseInt(n[i]) * (10 - i)
  let dig = 11 - (soma % 11)
  if (dig >= 10) dig = 0
  if (dig !== parseInt(n[9])) return false
  // Valida 2º dígito verificador
  soma = 0
  for (let i = 0; i < 10; i++) soma += parseInt(n[i]) * (11 - i)
  dig = 11 - (soma % 11)
  if (dig >= 10) dig = 0
  return dig === parseInt(n[10])
}

function isCNPJValido(cnpj) {
  const n = cnpj.replace(/\D/g, '')
  if (n.length !== 14) return false
  if (/^(\d)\1+$/.test(n)) return false
  const calc = (s, p) => {
    let t = 0
    for (let i = 0; i < s; i++) t += parseInt(n[i]) * p--
    const r = t % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12, 5) === parseInt(n[12]) && calc(13, 6) === parseInt(n[13])
}

function aplicarMascaraCNPJ(inputId) {
  const input = document.getElementById(inputId)
  if (!input) return
  input.addEventListener('input', function () {
    let v = this.value.replace(/\D/g, '').slice(0, 14)
    v = v.replace(/(\d{2})(\d)/, '$1.$2')
    v = v.replace(/(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    v = v.replace(/\.(\d{3})(\d)/, '.$1/$2')
    v = v.replace(/(\d{4})(\d)/, '$1-$2')
    this.value = v
  })
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

// ── Mascaramento de dados sensíveis (LGPD) ───────────────────

// CPF: 123.456.789-00 → ***.456.789-**
function mascararCPF(cpf) {
  if (!cpf) return '—'
  const n = cpf.replace(/\D/g, '')
  if (n.length !== 11) return '***.***.***-**'
  return `***.${n.slice(3,6)}.${n.slice(6,9)}-**`
}

// Email: usuario@email.com → usu***@email.com
function mascararEmail(email) {
  if (!email) return '—'
  const [user, domain] = email.split('@')
  if (!domain) return '***'
  const visivel = user.slice(0, 3)
  return `${visivel}***@${domain}`
}

// Telefone: (11) 99999-0000 → (11) *****-0000
function mascararTelefone(tel) {
  if (!tel) return '—'
  const n = tel.replace(/\D/g, '')
  if (n.length < 10) return '(**) *****-****'
  const ddd    = n.slice(0, 2)
  const sufixo = n.slice(-4)
  return `(${ddd}) *****-${sufixo}`
}