# Control Finance

[![CI](https://github.com/JrValerio/Control-Finance-React-TailWind/actions/workflows/ci.yml/badge.svg)](https://github.com/JrValerio/Control-Finance-React-TailWind/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Cockpit financeiro pessoal com IA. Registre transações, acompanhe a saúde do mês em tempo real, defina metas de poupança e receba orientação do Especialista IA — do extrato de hoje até os objetivos de amanhã.

## Índice

- [Links](#links)
- [Funcionalidades](#funcionalidades)
- [Deploy](#deploy-render--vercel)
- [Modelo Operacional](#modelo-operacional)
- [Arquitetura](#arquitetura-monorepo)
- [API Reference](#api-reference)
- [Como rodar localmente](#como-rodar-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Scripts](#scripts)
- [Qualidade](#qualidade)
- [Maturidade Operacional](#maturidade-operacional)
- [Roadmap](#roadmap)

## Links

- Produção (Vercel): [control-finance-react-tail-wind.vercel.app](https://control-finance-react-tail-wind.vercel.app/)
- CI: [GitHub Actions](https://github.com/JrValerio/Control-Finance-React-TailWind/actions/workflows/ci.yml)
- Releases: [GitHub Releases](https://github.com/JrValerio/Control-Finance-React-TailWind/releases)

## Funcionalidades

### Transações e Categorias

- Cadastro de transações com tipo (`Entrada` / `Saída`), data, descrição, notas e categoria
- Filtros por tipo, período (`Hoje`, `7 dias`, `30 dias`, `Personalizado`) e busca por texto
- Edição e exclusão com confirmação + desfazer (undo real via soft delete)
- Categorias com unicidade case/acento-insensitive, soft delete e restauração
- Resumo mensal: `income`, `expense`, `balance`, `byCategory`

### Importação e Exportação

- **Importação CSV** em duas etapas: dry-run com pré-visualização linha a linha + commit das linhas válidas
  - Badge `Revisar` para linhas válidas sem categoria classificada
  - Sessão de dry-run com TTL de 30 minutos; commit idempotente (409 se já confirmado)
- **Importação OFX/PDF** com parser nativo e OCR de fallback
- **Exportação CSV** com filtros ativos e totais consolidados
- Histórico de importações com status `Committed / Expired / Pending`

### Dashboard Visual

- **Gráfico de receita × despesa** (Recharts, lazy-loaded)
- **Treemap de despesas por categoria** — mapa de calor proporcional ao gasto
- **HealthOverview** — dois painéis lado a lado:
  - *Trajetória mensal*: AreaChart com projeção de saldo dia a dia até o fim do mês
  - *Gauge de dinheiro livre*: arco SVG colorido (verde / âmbar / vermelho) pelo saldo ajustado como % da renda
- **FinancialAlertBanner** — alerta proativo vermelho quando o saldo projetado for negativo; descartável por sessão

### Forecast Engine

- `POST /forecasts/recompute`: `saldo_projetado = renda_ajustada − (media_diaria × dias_restantes)`
- Detecção de flip (`pos_to_neg` / `neg_to_pos`) com notificação por email (cooldown de 24 h)
- Lembrete de payday (janela de 5–7 dias, uma vez por mês)

### Metas de Poupança

- CRUD completo de metas (`/goals`) com auth, entitlement gate e rate-limit
- `calcMonthlyNeeded`: quanto poupar por mês para bater o prazo
- Barra de progresso com cores semânticas (cinza → âmbar → roxo → verde)
- **Badge `⚠ risco`** — aparece quando `monthlyNeeded > adjustedProjectedBalance` (cruzamento forecast × meta)
- **`+ Registrar poupança`** — mini-form inline que faz `PATCH` sem abrir o modal completo
- Ícones emoji selecionáveis (🎯 ✈️ 🏠 🚗 🎓 ❤️ ⭐ 🎁 💼 ☂️)

### Especialista IA

- `GET /ai/insight` — gera um insight acionável de até 180 caracteres via Claude Haiku
- Contexto enviado ao modelo: saldo projetado, burn rate, dias restantes, top 3 categorias de despesa, metas ativas (necessidade mensal + progresso %)
- **Prioridade de alerta**: se alguma meta tiver `monthly_needed > balance`, o Especialista aponta o conflito antes de qualquer elogio
- Falha do LLM é silenciosa — nunca bloqueia o dashboard
- Rate limit: 10 chamadas / 10 min por usuário (env `AI_RATE_LIMIT_MAX` / `AI_RATE_LIMIT_WINDOW_MS`)

### Salário e Benefícios

- Calculadora CLT de salário líquido: INSS + IRRF 2026 com tabelas progressivas
- `GET /salary/profile`, `PUT /salary/profile`
- Deduções de dependentes, vale-refeição, vale-transporte
- Visão anual gated por plano Pro (`salary_annual` feature flag)

### Contas a Pagar e Fontes de Renda

- CRUD de contas recorrentes (`/bills`) com vencimento, valor estimado e categoria
- CRUD de fontes de renda (`/income-sources`) com frequência e próximo pagamento
- Widgets auto-suficientes no dashboard

### Autenticação e Sessão

- Registro, login e Google OAuth
- **httpOnly cookies**: `cf_access` (JWT, 15 min) + `cf_refresh` (opaque, 30 dias)
- Rotação de refresh token a cada uso; revogação de família em replay de token revogado (detecção de roubo)
- Fluxo completo de recuperação de senha por e-mail (token único, TTL 1 h, invalidação em falha de SMTP)
- Rate limiting de login por IP + bloqueio temporário por brute force

### Billing e Trial

- Trial inteligente: 14 dias, extensível até o próximo payday
- Planos via Stripe; webhook de ciclo de vida de assinatura
- Paywall 402 com `code: "TRIAL_EXPIRED"` ou `"FEATURE_GATED"`; modal contextual no frontend
- `past_due` grace period

### Onboarding e Ativação

- **WelcomeCard** (4 passos): transação → perfil → metas de poupança → Especialista IA
- Funil instrumentado: `welcome_card_viewed → welcome_cta_clicked → transaction_modal_opened → first_transaction_created`
- Banner de ativação após primeira transação (descartável)

## Deploy (Render + Vercel)

- Guia monorepo: `docs/deployment/monorepo-render-vercel.md`
- Production release checklist: `docs/runbooks/release-production-checklist.md`

## Modelo Operacional

- Deploy trigger: merge na `main` (Render Auto Deploy) ou manual via **Deploy latest commit**
- Migrations SQL aplicadas automaticamente no boot via `runMigrations()` com advisory lock (`pg_try_advisory_lock`)
- Health endpoint: `GET /health` — `{ ok, version, commit, buildTimestamp, uptimeSeconds, db, migrations, requestId }`
  - `migrations.applied`: número de migrations aplicadas; `migrations.latest`: nome da última
  - `db.status`: `"ok" | "error"` com `latencyMs`; retorna `503` em falha
- Metrics endpoint: `GET /metrics` — formato Prometheus; requer bearer token em produção (`METRICS_AUTH_TOKEN`)
- CI gates: `lint`, `typecheck`, `test`, `build`

## Arquitetura (Monorepo)

```text
apps/
  web/  → React + Vite + TypeScript + Tailwind
  api/  → Express + pg (Postgres) + Vitest
```

Sessão e autenticação: `apps/api/src/middlewares/auth.middleware.js` — lê `cf_access` cookie primeiro, fallback para `Authorization: Bearer`.

DB helper: `dbQuery()`, `withDbTransaction()`, `withDbClient()` em `apps/api/src/db/index.js`.

Tokens de cor semânticos: `bg-cf-surface`, `cf-text-primary`, `cf-border`, `brand-1` (`#6741D9`) etc.

## API Reference

### Auth

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/auth/register` | Cria usuário |
| POST | `/auth/login` | Login — seta cookies `cf_access` + `cf_refresh` |
| POST | `/auth/refresh` | Rotaciona refresh token |
| DELETE | `/auth/logout` | Revoga refresh token e limpa cookies |
| POST | `/auth/google` | Login/registro via Google OAuth |
| POST | `/auth/password-reset/request` | Envia e-mail de recuperação de senha |
| POST | `/auth/password-reset/confirm` | Aplica nova senha com token de e-mail |

### Transações

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/transactions` | Lista paginada com filtros (`type`, `from`, `to`, `q`, `limit`, `offset`) |
| POST | `/transactions` | Cria transação |
| PATCH | `/transactions/:id` | Atualiza |
| DELETE | `/transactions/:id` | Soft delete |
| POST | `/transactions/:id/restore` | Restaura |
| GET | `/transactions/summary` | Resumo mensal (`?month=YYYY-MM`) |
| GET | `/transactions/export.csv` | Exporta CSV com filtros |
| POST | `/transactions/import/dry-run` | Valida CSV e cria sessão |
| POST | `/transactions/import/commit` | Confirma sessão |
| GET | `/transactions/imports` | Histórico de importações |

### Outros endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST/PATCH/DELETE | `/categories` | CRUD de categorias |
| GET/POST/PATCH/DELETE | `/budgets` | Metas mensais por categoria |
| GET/POST/PATCH/DELETE | `/goals` | Metas de poupança (entitlement gated) |
| GET/POST | `/forecasts/current`, `/forecasts/recompute` | Forecast engine |
| GET | `/ai/insight` | Insight do Especialista IA (entitlement + rate-limit) |
| GET/PUT | `/salary/profile` | Perfil salarial CLT |
| GET/POST/PATCH/DELETE | `/bills` | Contas a pagar |
| GET/POST/PATCH/DELETE | `/income-sources` | Fontes de renda |
| GET/PUT | `/me` | Perfil do usuário |
| POST | `/billing/…` | Planos, checkout, portal Stripe |
| POST | `/analytics/events`, `/analytics/paywall` | Eventos de ativação e paywall |
| GET | `/health` | Health check |
| GET | `/metrics` | Métricas Prometheus |

### CSV Import

```csv
date,type,value,description,notes,category
2026-03-01,Entrada,1000,Salário,,Trabalho
2026-03-02,Saida,250,Supermercado,Compras do mês,Mercado
```

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| `date` | Sim | `YYYY-MM-DD` |
| `type` | Sim | `Entrada` ou `Saida` (case-insensitive) |
| `value` | Sim | Número `> 0` (suporta `.` e `,`) |
| `description` | Sim | Texto não vazio |
| `notes` | Não | Opcional |
| `category` | Não | Deve existir para o usuário (case-insensitive) |

## Como rodar localmente

```bash
# 1. Instalar dependências
npm ci

# 2. Criar arquivo de env
cp apps/api/.env.example apps/api/.env
# editar: DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY, ...

# 3. Subir web + api
npm run dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:3001/health`

## Variáveis de ambiente

Referência completa: `apps/api/.env.example` e `apps/web/.env.example`

| Variável | Onde | Descrição |
|----------|------|-----------|
| `DATABASE_URL` | API | Connection string Postgres |
| `JWT_SECRET` | API | Segredo de assinatura JWT |
| `ANTHROPIC_API_KEY` | API | Chave para o Especialista IA (Claude Haiku) |
| `VITE_API_URL` | Web | URL pública da API (obrigatório em produção) |
| `CORS_ORIGIN` | API | Origens permitidas (lista separada por vírgula) |
| `COOKIE_DOMAIN` | API | Domínio dos cookies de sessão |
| `COOKIE_SAME_SITE` | API | `strict` (padrão) ou `none` para cross-site |
| `TRUST_PROXY` | API | `1` em deploy com proxy reverso (Render) |
| `DB_SSL` | API | `true` para Postgres gerenciado com SSL |
| `AI_RATE_LIMIT_MAX` | API | Máx. chamadas IA por janela (padrão: 10) |
| `AI_RATE_LIMIT_WINDOW_MS` | API | Janela em ms (padrão: 600000 = 10 min) |
| `METRICS_AUTH_TOKEN` | API | Bearer token para `GET /metrics` em produção |
| `ACCESS_TOKEN_EXPIRES_IN` | API | Expiração do JWT de acesso (padrão: `15m`) |
| `REFRESH_TOKEN_EXPIRES_DAYS` | API | Expiração do refresh token (padrão: `30`) |

## Scripts

```bash
npm run dev        # inicia web + api
npm run lint       # ESLint nos dois apps
npm run typecheck  # validação de tipos (web)
npm run test       # testes dos dois apps (552 api + 239 web)
npm run build      # build web + validação de build api
```

```bash
# Release automático (PowerShell)
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\release.ps1 -Version "1.30.0" -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\release.ps1 -Version "1.30.0"

# Smoke tests pós-deploy
scripts/smoke-categories-v2.ps1 -BaseUrl "https://<api-host>"
scripts/smoke-paywall-forecast.ps1 -BaseUrl "https://<api-host>"
```

## Qualidade

- CI com jobs separados para web e api (`.github/workflows/ci.yml`)
- Branch protection ativa na `main` — CI verde obrigatório antes de merge
- Runtime: Node `24.x`
- Testes: `552/552` (api, pg-mem in-memory) · `239/239` (web, jsdom)
- 0 warnings ESLint (`--max-warnings 0`)

## Maturidade Operacional

### Health & Version Integrity

```http
GET /health
```

```json
{
  "ok": true,
  "version": "1.30.0",
  "commit": "abcdef1",
  "buildTimestamp": "2026-03-25T05:00:00.000Z",
  "uptimeSeconds": 1234,
  "db": { "status": "ok", "latencyMs": 3 },
  "migrations": { "applied": 30, "latest": "030_create_user_goals" },
  "requestId": "rid-abc"
}
```

Usado para verificar consistência pós-deploy:

```bash
curl https://<api-host>/health | jq '.migrations'
```

### Release Automation

`scripts/release.ps1` — release completo sem `gh` CLI:

1. Valida seção no CHANGELOG
2. Bumpa `package.json` (root + api + web)
3. Cria branch `chore/release-vX.Y.Z`, commita, push
4. Abre PR via GitHub API e faz squash merge
5. Cria tag e GitHub Release com o corpo do CHANGELOG
6. Limpa branch remota + local e sincroniza `main`

## Roadmap

### Concluído

- [x] Autenticação JWT + rotas protegidas
- [x] Transações por usuário com CRUD completo
- [x] Exportação e importação CSV (dry-run + commit)
- [x] Importação OFX e PDF com OCR de fallback
- [x] Dark mode com sistema de tokens semânticos
- [x] Google OAuth
- [x] Trial inteligente + paywall Stripe
- [x] Motor de forecast com detecção de flip e notificações
- [x] Calculadora de salário líquido CLT (INSS + IRRF 2026)
- [x] Contas a pagar e fontes de renda
- [x] Recuperação de senha por e-mail (transacional, com rollback em falha SMTP)
- [x] Sessão httpOnly cookie com rotação de refresh token e detecção de roubo
- [x] Dashboard visual: FinancialAlertBanner + CategoryTreemap + HealthOverview (trajetória + gauge)
- [x] Especialista IA — Claude Haiku com contexto de forecast + metas
- [x] Metas de poupança full-stack (`/goals`) com badge de risco e contribuição rápida
- [x] Funil de ativação instrumentado (`activation_events` + `paywall_events`)
- [x] WelcomeCard v2 — onboarding narrativo em 4 passos

### Próximas frentes

- [ ] M2 — testes negativos de importação (OFX truncado, PDF rejeitado, OCR falhando)
- [ ] M3 — teste direto de `email.service.js` isolado
- [ ] Simulação "e se?" — projeção interativa de corte de gastos
- [ ] Insights acionáveis vinculados às metas (ex: "cortar R$ X em Lazer garante sua meta de Viagem")
- [ ] Importação JSON

## Licença

MIT. Consulte `LICENSE`.
