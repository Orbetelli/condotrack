# CondoTrack

> Sistema de gestão de entregas para condomínios — da portaria ao morador.

![Status](https://img.shields.io/badge/status-em%20desenvolvimento-yellow)
![Stack](https://img.shields.io/badge/stack-HTML%20%2B%20Supabase%20%2B%20Vercel-purple)

---

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Stack & Infraestrutura](#stack--infraestrutura)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Banco de Dados](#banco-de-dados)
- [Perfis de Usuário](#perfis-de-usuário)
- [Funcionalidades por Perfil](#funcionalidades-por-perfil)
- [Edge Functions](#edge-functions)
- [Automações (Cron Jobs)](#automações-cron-jobs)
- [Notificações](#notificações)
- [Instalação e Deploy](#instalação-e-deploy)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Migrações do Banco](#migrações-do-banco)
- [Roadmap](#roadmap)

---

## Visão Geral

O CondoTrack é um sistema web para gerenciamento de entregas em condomínios. Quando uma encomenda chega na portaria, o porteiro registra a entrega no sistema e o morador é automaticamente notificado por **e-mail** e **WhatsApp**. O morador acompanha suas entregas pelo painel e confirma a retirada.

### Fluxo principal

```
Entrega chega → Porteiro registra → Morador notificado (e-mail + WhatsApp)
→ Morador retira → Porteiro confirma → Status: Retirado
```

### Fluxo de entrega pessoal

```
Porteiro entrega em mãos → Marca "Entreguei pessoalmente"
→ Morador notificado para confirmar em 15 min
→ Se não confirmar → Sistema marca como Retirado automaticamente
```

---

## Stack & Infraestrutura

| Camada | Tecnologia |
|---|---|
| Frontend | HTML + CSS + JavaScript puro |
| Backend | Supabase (PostgreSQL + Auth + RLS + Edge Functions) |
| Notificações e-mail | Resend |
| Notificações WhatsApp | Z-API |
| Hospedagem | Vercel |
| Repositório | GitHub (Orbetelli/condotrack) |
| Projeto Supabase | `ihaeqbtoylxcfwmdcjfg` (região sa-east-1) |

---

## Estrutura do Projeto

```
condotrack/
├── index.html                        # Redirect para login
├── img/
│   └── logo.png                      # Logo do sistema
├── css/
│   ├── style.css                     # Variáveis globais e componentes base
│   ├── login.css
│   ├── cadastro.css
│   ├── admin.css
│   ├── admin-cadastro.css
│   ├── porteiro.css
│   ├── morador.css
│   └── superadmin.css
├── js/
│   ├── supabase.js                   # Init Supabase, auth, logout, requireAuth
│   ├── utils.js                      # Máscaras, validações, helpers
│   ├── login.js
│   ├── cadastro.js
│   ├── admin.js
│   ├── admin-cadastro.js
│   ├── porteiro.js
│   ├── morador.js
│   └── superadmin.js
├── pages/
│   ├── login.html
│   ├── cadastro.html
│   ├── admin.html
│   ├── admin-cadastro.html
│   ├── porteiro.html
│   ├── morador.html
│   └── superadmin.html
└── supabase/
    └── functions/
        ├── notificar-entrega/        # E-mail ao registrar entrega
        ├── notificar-whatsapp/       # WhatsApp ao registrar entrega
        ├── confirmar-entrega/        # Notifica morador ao entregar pessoalmente
        ├── verificar-entregas/       # Cron diário: expira e envia lembretes
        ├── alertar-entregas-acumuladas/ # Alerta síndico com 3+ entregas pendentes
        ├── convidar-morador/         # Convite por e-mail + WhatsApp para morador
        └── reset-senha/              # Reset de senha via service role
```

---

## Banco de Dados

### Tabelas

#### `condominios`
| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID | PK |
| nome | TEXT | Nome do condomínio |
| cnpj | TEXT | CNPJ com pontuação |
| razao_social | TEXT | Razão social |
| endereco | TEXT | Endereço completo |
| cidade | TEXT | Cidade |
| uf | CHAR(2) | Estado |
| cep | TEXT | CEP |
| blocos | INT | Número de torres/blocos |
| total_aptos | INT | Total de apartamentos |
| status | TEXT | `ativo` \| `inativo` \| `pendente` |
| criado_em | TIMESTAMPTZ | — |
| atualizado_em | TIMESTAMPTZ | — |

#### `apartamentos`
| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID | PK |
| condominio_id | UUID | FK → condominios |
| numero | TEXT | Número do apto (ex: `101`, `1A`) |
| bloco | TEXT | Bloco/torre (ex: `A`, `B`) |
| status | TEXT | `disponivel` \| `ocupado` |

#### `usuarios`
| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID | PK |
| auth_id | UUID | FK → auth.users (Supabase Auth) |
| condominio_id | UUID | FK → condominios |
| apartamento_id | UUID | FK → apartamentos |
| perfil | TEXT | `superadmin` \| `admin` \| `porteiro` \| `morador` |
| nome | TEXT | — |
| email | TEXT | UNIQUE |
| cpf | TEXT | Apenas dígitos |
| telefone | TEXT | — |
| turno | TEXT | Turno do porteiro (A, B, C) |
| periodo | TEXT | Manhã, Tarde, Noite |
| status | TEXT | `ativo` \| `inativo` \| `pendente` |
| convite_token | TEXT | Token único para convite |
| convite_enviado_em | TIMESTAMPTZ | — |
| criado_em | TIMESTAMPTZ | — |
| atualizado_em | TIMESTAMPTZ | — |

#### `entregas`
| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID | PK |
| condominio_id | UUID | FK → condominios |
| apartamento_id | UUID | FK → apartamentos |
| porteiro_id | UUID | FK → usuarios (porteiro) |
| morador_id | UUID | FK → usuarios (destinatário) |
| transportadora | TEXT | Ex: Correios, Amazon |
| volumes | INT | Quantidade de volumes |
| status | TEXT | Ver abaixo |
| obs | TEXT | Observações |
| recebido_em | TIMESTAMPTZ | Data/hora de recebimento |
| retirado_em | TIMESTAMPTZ | Data/hora de retirada |
| entregue_em | TIMESTAMPTZ | Data/hora de entrega pessoal |
| criado_em | TIMESTAMPTZ | — |
| atualizado_em | TIMESTAMPTZ | — |

**Status da entrega:**
- `aguardando` — registrada, aguardando retirada
- `notificado` — morador foi notificado
- `entregue_porteiro` — porteiro entregou pessoalmente, aguardando confirmação (15 min)
- `retirado` — morador retirou
- `expirado` — não retirada após 5 dias

#### `acessos`
| Campo | Tipo | Descrição |
|---|---|---|
| id | UUID | PK |
| usuario_id | UUID | FK → usuarios |
| condominio_id | UUID | FK → condominios |
| perfil | TEXT | Perfil do usuário |
| nome | TEXT | Descrição do acesso |
| ip | TEXT | IP de origem |
| user_agent | TEXT | — |
| status | TEXT | `sucesso` \| `falha` |
| criado_em | TIMESTAMPTZ | — |

---

## Perfis de Usuário

| Perfil | Acesso | Página |
|---|---|---|
| `superadmin` | Total — gerencia todos os condomínios | `superadmin.html` |
| `admin` | Síndico — gerencia seu condomínio | `admin.html` |
| `porteiro` | Portaria — registra e gerencia entregas | `porteiro.html` |
| `morador` | Morador — acompanha suas entregas | `morador.html` |

O login identifica o perfil automaticamente pelo e-mail — não há seletor de perfil.

---

## Funcionalidades por Perfil

### 🔐 Login (`login.html`)
- Autenticação via Supabase Auth
- Identificação automática do perfil pelo e-mail
- Redirecionamento automático para o painel correto
- Registro de histórico de acesso na tabela `acessos`

### 📝 Cadastro do Morador (`cadastro.html`)
- Fluxo em 4 passos: Condomínio → Dados → Apartamento → Senha
- Busca de condomínio com dropdown (pesquisa em tempo real)
- Grade de apartamentos filtrada e ordenada naturalmente
- Limite de 4 moradores por apartamento (trigger no banco)

### 👔 Super Admin (`superadmin.html`)
- Dashboard com stats globais de todos os condomínios
- Cadastro de condomínios com geração automática de apartamentos:
  - Por torres/blocos (A, B, C...)
  - Configuração de andares e aptos por andar
  - 4 formatos de numeração: numérico, por dezena, com letra, simples
  - Ou inserção manual de apartamentos
- Gestão de usuários com filtros
- Reset de senha via Edge Function segura
- Acesso ao painel de qualquer condomínio (impersonação com banner de aviso)
- Equipe interna de Super Admins

### 🏠 Admin/Síndico (`admin.html`)
- Dashboard com stats do condomínio
- Gestão de porteiros (cadastro com credenciais automáticas)
- Gestão de moradores com pré-cadastro e envio de convite
- Grade de apartamentos por bloco
- Visualização de todas as entregas com filtros
- Relatórios (em desenvolvimento)
- Perfil editável (nome, telefone, e-mail, senha)
- Impersonação pelo Super Admin com botão de retorno

### 👮 Porteiro (`porteiro.html`)
- Dashboard com stats em tempo real (via Supabase Realtime)
- Registro de nova entrega:
  - Busca por apartamento (formato `A-101`)
  - **Busca por nome do morador** com dropdown
  - Seleção do destinatário (múltiplos moradores por apto)
  - Observações rápidas com chips: Frágil, Refrigerado, Documento, Grande, Urgente
- Botão "Entreguei pessoalmente" → notifica morador para confirmar em 15 min
- Dropdown de notificações com entregas pendentes
- Aba Entregas com filtros por status
- Aba Moradores com busca
- Aba Histórico por apartamento

### 🏡 Morador (`morador.html`)
- Dashboard com contadores de entregas
- Lista de entregas pendentes com botão de confirmar retirada
- Histórico com filtros por status e período (7, 30, 90 dias)
- Dropdown de notificações com entregas pendentes
- Perfil editável (nome, telefone, e-mail)
- Troca de senha (valida senha atual)

---

## Edge Functions

Todas deployadas no Supabase (`supabase functions deploy <nome>`).

### `notificar-entrega`
Dispara e-mail via Resend quando uma entrega é registrada.

**Trigger:** chamada pelo `porteiro.js` após INSERT na tabela `entregas`

**Body:** `{ entrega_id, morador_id? }`

### `notificar-whatsapp`
Dispara mensagem WhatsApp via Z-API quando uma entrega é registrada.

**Trigger:** chamada pelo `porteiro.js` após INSERT na tabela `entregas`

**Body:** `{ entrega_id, morador_id? }`

### `confirmar-entrega`
Notifica o morador quando o porteiro marca como "entregue pessoalmente", pedindo confirmação em 15 minutos.

**Trigger:** chamada pelo `porteiro.js` ao mudar status para `entregue_porteiro`

**Body:** `{ entrega_id, morador_id? }`

### `verificar-entregas`
Cron job diário (08:00 BRT). Faz três coisas:
1. Auto-confirma entregas `entregue_porteiro` com mais de 15 minutos
2. Marca como `expirado` entregas com mais de 5 dias sem retirada + notifica morador
3. Envia lembrete para entregas com exatamente 3 dias sem retirada
4. Chama `alertar-entregas-acumuladas`

**Schedule:** `0 11 * * *` (pg_cron)

### `alertar-entregas-acumuladas`
Alerta síndico e porteiros quando um apartamento tem 3 ou mais entregas pendentes.

**Trigger:** chamada pelo `verificar-entregas`

### `convidar-morador`
Envia convite por e-mail e WhatsApp para morador pré-cadastrado completar o cadastro com senha.

**Trigger:** botão no painel do admin

**Body:** `{ usuario_id }`

### `reset-senha`
Permite que o Super Admin redefina a senha de qualquer usuário usando a service role key com segurança no backend.

**Trigger:** botão no painel do Super Admin

**Body:** `{ auth_id, nova_senha, solicitante_auth_id }`

---

## Automações (Cron Jobs)

| Job | Schedule | Descrição |
|---|---|---|
| `verificar-entregas-diario` | `0 11 * * *` (08:00 BRT) | Expira entregas, envia lembretes, auto-confirma entregas do porteiro |

Configurado via `pg_cron` no Supabase. Para verificar:

```sql
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname = 'verificar-entregas-diario';
```

---

## Notificações

### E-mail (Resend)
- **Ao registrar entrega:** avisa o morador que há uma entrega aguardando
- **Lembrete dia 3:** avisa que faltam 2 dias para expirar
- **Expiração:** avisa que a entrega expirou após 5 dias
- **Entrega pessoal:** pede confirmação em 15 minutos
- **Acúmulo:** alerta síndico/porteiro sobre 3+ entregas pendentes
- **Convite:** link para morador completar o cadastro

### WhatsApp (Z-API)
Mesmas notificações do e-mail, com mensagens formatadas em Markdown do WhatsApp.

**Configuração Z-API:**
- Instância conectada via WhatsApp Business
- Client Token configurado em Secrets no Supabase

---

## Instalação e Deploy

### Pré-requisitos
- Node.js instalado
- Supabase CLI instalado (`npm install -g supabase`)
- Conta no Supabase, Vercel, Resend e Z-API

### 1. Clone o repositório

```bash
git clone https://github.com/Orbetelli/condotrack.git
cd condotrack
```

### 2. Configure o Supabase

```bash
supabase login
supabase link --project-ref ihaeqbtoylxcfwmdcjfg
```

### 3. Aplique as migrações

Execute no SQL Editor do Supabase na ordem:

```
1. migration.sql
2. migration_moradores.sql
3. migration_cnpj.sql
4. migration_historico_convite.sql
5. migration_entregue_porteiro.sql
```

### 4. Configure os Secrets das Edge Functions

No Supabase Dashboard → Edge Functions → Secrets:

```
RESEND_API_KEY          = sua_chave_resend
ZAPI_INSTANCE_ID        = seu_instance_id
ZAPI_TOKEN              = seu_token
ZAPI_CLIENT_TOKEN       = seu_client_token
APP_URL                 = https://seu-dominio.vercel.app
```

### 5. Deploy das Edge Functions

```bash
supabase functions deploy notificar-entrega
supabase functions deploy notificar-whatsapp
supabase functions deploy confirmar-entrega
supabase functions deploy verificar-entregas
supabase functions deploy alertar-entregas-acumuladas
supabase functions deploy convidar-morador
supabase functions deploy reset-senha
```

### 6. Configure o Cron Job

Execute no SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'verificar-entregas-diario',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ihaeqbtoylxcfwmdcjfg.supabase.co/functions/v1/verificar-entregas',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer SEU_ANON_KEY"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

### 7. Deploy no Vercel

Conecte o repositório GitHub ao Vercel. O deploy é automático a cada push na branch `main`.

---

## Variáveis de Ambiente

O frontend usa as credenciais do Supabase diretamente no `js/supabase.js`:

```js
const SUPABASE_URL = 'https://ihaeqbtoylxcfwmdcjfg.supabase.co'
const SUPABASE_KEY = 'sua_anon_key'
```

> ⚠️ A `anon key` é segura para uso no frontend desde que as políticas RLS estejam corretamente configuradas.

---

## Migrações do Banco

| Arquivo | Descrição |
|---|---|
| `migration.sql` | Schema inicial, RLS completa, índices |
| `migration_moradores.sql` | `morador_id` nas entregas, limite 4 moradores/apto |
| `migration_cnpj.sql` | Colunas `cnpj` e `razao_social` em `condominios` |
| `migration_historico_convite.sql` | Tabela `acessos`, `convite_token` em `usuarios` |
| `migration_entregue_porteiro.sql` | Status `entregue_porteiro`, coluna `entregue_em` |

---

## Roadmap

### ✅ Implementado
- [x] Autenticação com identificação automática de perfil
- [x] Cadastro de morador com seleção de condomínio e apartamento
- [x] Painel do porteiro com registro de entregas
- [x] Busca de morador por apartamento e por nome
- [x] Observações rápidas com chips no registro de entrega
- [x] Notificações por e-mail (Resend)
- [x] Notificações por WhatsApp (Z-API)
- [x] Múltiplos moradores por apartamento (até 4)
- [x] Seleção de destinatário na entrega
- [x] Entrega pessoal com auto-confirmação em 15 min
- [x] Expiração automática após 5 dias
- [x] Lembrete automático no dia 3
- [x] Alerta de entregas acumuladas (3+)
- [x] Convite de morador por e-mail + WhatsApp
- [x] Reset de senha seguro via Edge Function
- [x] Histórico de acessos
- [x] Perfil editável para morador e síndico
- [x] Dropdown de notificações (porteiro e morador)
- [x] Painel do síndico com gestão completa
- [x] Super Admin com impersonação de condomínio
- [x] Cadastro de condomínio com geração automática de apartamentos por torre
- [x] CNPJ e razão social no condomínio

### 🔄 Em andamento
- [ ] Auditoria de segurança (RLS, sanitização, rate limiting)

### 📋 Planejado
- [ ] Aplicativo mobile para morador (QR Code de confirmação)
- [ ] Dashboard analytics para Super Admin
- [ ] Relatórios exportáveis (PDF/Excel)
- [ ] Início e fim de turno para porteiro
- [ ] Histórico de acessos visível no painel
- [ ] Webhook para integração com portaria eletrônica

---

## Licença

Projeto privado — © 2026 CondoTrack. Todos os direitos reservados.
