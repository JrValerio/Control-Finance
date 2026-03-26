# Changelog

All notable changes to this project will be documented in this file.

## [1.31.0] - 2026-03-26

### Title

v1.31.0 - Central do Leão (IRPF MVP)

### Added

#### Central do Leão API (PR #290)

- Novo domínio fiscal isolado em `/tax`
- Migrations `100` a `105` para:
  - `tax_documents`
  - `tax_document_extractions`
  - `tax_facts`
  - `tax_reviews`
  - `tax_rule_sets`
  - `tax_summaries`
- Pipeline fiscal completo no backend:
  - upload de documentos
  - classificação
  - extração
  - normalização em fatos fiscais
  - review queue
  - obrigatoriedade por exercício
  - resumo anual snapshotado
  - lifecycle documental (retry/delete)
- Export oficial do dossiê fiscal:
  - `GET /tax/export/:taxYear?format=json`
  - `GET /tax/export/:taxYear?format=csv`
- Manifesto mínimo no export com:
  - `summarySnapshotVersion`
  - `factsIncluded`
  - `engineVersion`
  - `dataHash`
- Storage documental fiscal com:
  - `TAX_DOCUMENTS_STORAGE_DIR`
  - `TAX_DOCUMENT_MAX_FILE_SIZE_BYTES`

#### Central do Leão Web (PR #290)

- Nova área protegida:
  - `/app/tax`
  - `/app/tax/:taxYear`
- Dashboard fiscal com:
  - obrigatoriedade
  - warnings
  - snapshot anual
  - fila de revisão
- Upload fiscal dentro da `TaxPage`
- Reprocessamento, exclusão e rebuild automático do summary após ações documentais
- Download oficial de `JSON` e `CSV` via backend, substituindo o export montado localmente no frontend

### Changed

- A trilha fiscal passou a usar um contrato oficial de export no backend, sem side effect implícito de rebuild
- O produto agora inclui uma frente explícita de preparação do IRPF, com guardrail claro: organiza e prepara, mas não transmite DIRPF

### Quality

- `npm test` na raiz verde
- `npm run lint` na raiz verde
- `npm run build` na raiz verde
- API: `695/695` testes passando
- Web: `291/291` testes passando

## [1.30.0] - 2026-03-25

**Especialista IA + Metas de Poupança + Dashboard executivo**

O Control Finance deu o salto de gerenciador de gastos para copiloto financeiro pessoal. Esta release conecta três camadas que antes existiam separadas — rastreamento, projeção e inteligência — em uma única experiência de pilotagem.

### Especialista IA no dashboard

O dashboard agora entrega um insight acionável gerado por Claude Haiku a partir do contexto real do usuário: saldo projetado, taxa de queima, categorias de maior gasto e metas de poupança. O painel semântico sinaliza com cores o nível de atenção: alerta quando a trajetória é negativa ou as metas estão inviáveis, parabeniza quando o cenário está sob controle. Falha silenciosa garantida — se o LLM não responder, o dashboard não quebra.

- `GET /ai/insight`: auth + plano ativo + rate limit (10 chamadas/10 min)
- Contexto injetado no prompt: `balance`, `burn_rate`, `runway`, `top_categories`, `goals`
- `AIInsightPanel.tsx`: shimmer enquanto carrega; card warning/info/success; null em falha
- `HealthOverview.tsx`: grade 3 colunas com o painel de IA; degrada para 2 colunas em silêncio

### Metas de poupança (full-stack)

Criar uma meta agora é o início de um acompanhamento real, não só um número salvo. O app calcula automaticamente quanto guardar por mês, sinaliza quando o plano está inviável dado o saldo projetado, e permite registrar uma contribuição sem abrir o modal completo.

- Migration `030_create_user_goals.sql`: tabela `user_goals` com soft-delete e índice composto `(user_id, deleted_at)`
- `calcMonthlyNeeded`: função pura, `now` injetável para testes determinísticos; retorna o total restante quando a data já passou
- CRUD completo: `GET/POST/PATCH/DELETE /goals` — auth + plano ativo + rate limiter
- Goals injetadas no contexto do Haiku em paralelo com categorias; SYSTEM_PROMPT prioriza `monthly_needed > balance` antes de qualquer outro insight
- `GoalFormModal.tsx`: seletor de ícone emoji, validação no cliente, a11y (labels, role dialog, Escape)
- `GoalsSection.tsx`: busca `/goals` + `/forecasts/current` em paralelo; barra de progresso colorida (cinza → âmbar → roxo → verde); badge ⚠ risco quando `monthlyNeeded > projectedBalance`; contribuição rápida inline sem abrir modal
- `WelcomeCard.tsx` v2: narrativa de 4 etapas — transação → perfil → metas → IA

### Health Overview mais executivo

O painel de saúde financeira ganhou gráfico de trajetória mensal (AreaChart) e gauge de dinheiro livre. A leitura agora é executiva: você vê em três segundos se o mês vai fechar no azul, onde está queimando mais e qual meta exige atenção imediata.

### Nova experiência de onboarding

O `WelcomeCard` v2 guia o usuário pelos quatro passos que ativam o valor do produto: registrar, configurar, definir metas, ouvir o Especialista IA. Cada passo tem peso visual distinto — o primeiro em destaque como ação imediata, os demais como próximos horizontes.

### Visualização avançada de gastos

O `CategoryTreemap` substitui a lista plana de categorias por um treemap Recharts com 8 tons de roxo. Proporção visual imediata: onde o dinheiro vai fica óbvio sem precisar ler números.

### Estado da release

**Confirmado (CI + runner local):**
- 552 testes de API passando (531 → +21 goals.test.js)
- 239 testes web passando (219 → +20 GoalsSection.test.tsx)
- Lint limpo em ambos os workspaces

**Reportado no fluxo (integração validada, cobertura unitária parcial):**
- HealthOverview (trajetória + gauge): coberto por 12 testes de integração; lógica `generateTrajectory` coberta por unitários
- AIInsightPanel: coberto via mock do serviço; LLM path validado manualmente

**Pendente (fora do escopo desta release):**
- Testes negativos de importação (OFX truncado, PDF rejeitado, OCR com falha)
- Testes diretos de `email.service.js`

---

## [1.29.0] - 2026-02-24

### Title

v1.29.0 - Fontes de Renda (Income Sources Module)

### Added

#### Income Sources API (PR #203)

- New DB migration `018_create_income_sources.sql`:
  - `income_sources` — user-scoped income sources with optional category and default payment day
  - `income_deductions` — fixed and variable deductions per source (active/inactive, sort order)
  - `income_statements` — monthly snapshots with unique constraint on `(source_id, reference_month)`
  - `income_statement_deductions` — immutable deduction snapshot at statement creation time
- New service `income-sources.service.js` with 13 functions:
  - Full CRUD for income sources and their deductions
  - `createStatementDraftForSource` — atomic draft creation with deduction snapshot (transaction-safe)
  - `postStatementForSource` — atomic post: inserts `Entrada` transaction + marks statement posted; inherits `category_id` from source
  - Duplicate-month guard (409) and invalid-month validation
- New routes at `/income-sources` (12 endpoints, all auth-gated):
  - `GET /income-sources` — list with active deductions
  - `POST /income-sources`, `PATCH /:id`, `DELETE /:id`
  - `POST /:id/deductions`, `PATCH /deductions/:id`, `DELETE /deductions/:id`
  - `GET /:id/statements`, `POST /:id/statements`, `PATCH /statements/:id`, `POST /statements/:id/post`
- `incomeSourcesWriteRateLimiter` added to rate-limit middleware
- 22 API tests covering auth, CRUD, deduction management, statement lifecycle, 409/400 guards

#### Income Sources Web (PR #204)

- Typed client `incomeSources.service.ts` (11 methods, defensive normalizers for all API shapes)
- `IncomeSourceModal` — create/edit income source (name, default payment day, category, notes)
- `IncomeDeductionModal` — create/edit deduction (label, amount, variable toggle)
- `IncomeStatementModal` — monthly statement generation:
  - Fixed deductions shown read-only; variable deductions editable per-statement
  - Live footer: total deductions + estimated gross (net + deductions)
  - "Salvar rascunho" (draft only) and "Lançar entrada" (draft → post → Entrada transaction)
- `/app/income-sources` page with full CRUD for sources and deductions, statement history
- Navigation: "Fontes de Renda" added to desktop header and mobile Ações menu
- 8 web tests covering render, create flow, statement posting, draft save, error handling

### Changed

- App navigation extended with Income Sources route and nav entries (desktop + mobile)

## [1.27.0] - 2026-02-23

### Title

v1.27.0 - Bills, Batch Installments & UI Polish Pack

### Added

#### Bills Domain (PR #194)

- Full Bills API (PostgreSQL + user-scoped ownership)
  - `POST /bills`
  - `GET /bills`
  - `PATCH /bills/:id`
  - `DELETE /bills/:id`
  - `PATCH /bills/:id/mark-paid`
- Status handling (`pending`, `paid`, `overdue`)
- Overdue detection
- Server-side pagination and filtering

#### Bills Web (PR #195)

- `/app/bills` page with:
  - Bills CRUD (create, edit, delete)
  - Mark as paid
  - Summary cards (Total, Pending, Overdue, Paid)
  - Pagination + status filters
- BillModal with validation and feedback states

#### Dashboard Integration (PR #196)

- Bills summary widget on dashboard
- Top-level visibility of pending/overdue bills

#### Forecast Integration (PR #197)

- Pending bills integrated into projected balance calculation
- Forecast now reflects real upcoming liabilities

#### Batch Installments (PR #198)

- New endpoint: `POST /bills/batch`
- Atomic creation of 2–24 installments (transaction-safe)
- Installment UI in BillModal:
  - "Parcelar" toggle
  - Automatic due date increment (month-clamped)
  - Title format: `Título (X/N)`
- Full API + Web test coverage

#### UI Improvements (PR #200)

- Desktop header refactor:
  - Perfil, Assinatura, Segurança and Sair grouped under **Conta** dropdown
  - Click-outside + Escape support
  - Focus-first-item accessibility behavior
- Mobile "Ações" menu reordered into logical groups
- BillsPage dark mode fix (`bg-cf-bg-page`)
- UpgradeModal fully translated to PT-BR
- Dark-mode-aware hover state for Sair buttons

### Changed

- Forecast logic now considers pending bills in projected balance.
- Desktop header reduced from 10 buttons to 7 via account grouping.
- Improved dark mode consistency in navigation menus.

### Chore

#### Tooling (PR #199)

- Added PowerShell smoke test:
  - `scripts/smoke-bills-batch.ps1`
  - camelCase → snake_case fallback payload strategy
  - HTTP status + error output visibility
- Added `apps/web/vercel.json`:
  - `ignoreCommand` to skip web builds when only API files change
  - Reduces unnecessary Vercel free-tier build usage

### Quality

- 136/136 web tests passing
- API tests fully green
- Zero lint warnings
- Production build verified

## [1.26.0] - 2026-02-22

### Title

v1.26.0 - Trial, Paywall & Forecast Pack (P4)

### Added

#### Smart Trial System (API — #177)

- `trial_ends_at` column on `users` (migration `014`).
  - Set to `now + 14 days` on every new registration (email or Google).
  - Extended to `MAX(signup + 14d, next_payday_date)` when the user first saves a payday — guarantees at least one full pay cycle before the trial expires.
- `GET /me` now includes `trialEndsAt` (ISO string or null) and `trialExpired` (boolean).
- `PATCH /me/profile` with `payday` recalculates and persists the extended deadline.

#### Paywall Enforcement (API — #179)

- `requireActiveTrialOrPaidPlan` middleware (migration `014` shared with trial):
  - Allows access if the user has an active trial (`trial_ends_at > now`).
  - Allows access if a paid subscription exists with status `active`, `trialing`, or `past_due`.
  - Returns **402 Payment Required** with `"Periodo de teste encerrado"` when both checks fail.
- Applied to `GET /forecasts/current` and `POST /forecasts/recompute`.

#### Balance Forecast Engine v1 (API — #175)

- Migration `015`: `user_forecasts` table — stores monthly projections per user.
- `POST /forecasts/recompute` — recalculates projection for the current month:
  - `projected_balance = net_to_date + income_adjustment − (daily_avg_spending × days_remaining)`
  - Flip detection: `pos_to_neg` / `neg_to_pos` signals when the projected sign differs from current balance.
- `GET /forecasts/current` — returns the latest persisted forecast for the month (or null if none).

#### Email Notifications — Best-Effort (API — #178)

- Migration `016`: `email_notifications` table (type CHECK: `flip_neg` | `payday_reminder`).
- `email.service.js` — nodemailer-based sender; falls back to structured `console.log` when SMTP not configured.
- `notifications.service.js`:
  - `maybeSendFlipNotification` — fires on `pos_to_neg` flip only; 24-hour cooldown per user.
  - `maybeSendPaydayReminder` — fires 5–7 days before payday; once per calendar month.
- Both called inside `POST /forecasts/recompute` as **fire-and-forget** (`void …catch`) — never blocks the API response.
- New env vars (optional): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE`.

#### Forecast Card — Progressive Onboarding (Web — #176)

- New `ForecastCard` component, self-contained (fetches `/me` + `/forecasts/current` independently).
- Four rendering states:
  - **loading** — skeleton while requests resolve.
  - **awaiting-profile** — no salary/payday configured; CTA redirects to profile settings.
  - **active** — projected balance grid (projeção, gasto, dias restantes, projeção de gasto) + FlipBanner on flip events.
  - **frozen** — grayed card with "Congelado" badge, last known balance, tx count since freeze, "Ativar plano" CTA.
- `trialExpired` state sourced from `/me`; forecast cached locally after first 402 to show stale data in the frozen state.
- Rendered in `App.tsx` between the filter panel and the summary section.

#### Security Settings (API + Web — #173 / #174)

- `GET /me` extended with `hasPassword` and `linkedProviders` (list of OAuth providers linked to the account).
- `PATCH /auth/password` — change password (requires `currentPassword` for accounts with a password; Google-only accounts can set one without).
- `POST /auth/google/link` — link a Google identity to an existing account; idempotent if already linked; 409 if the Google account belongs to another user.
- `/app/settings/security` page — password change form + Google link button, with real-time feedback.

#### User Profile (API + Web — #171 / #172)

- Migration: `user_profiles` table (`salary_monthly`, `payday`, `display_name`, `avatar_url`).
- `GET /me` includes `profile` object (null for new users).
- `PATCH /me/profile` — upsert any subset of fields; validates payday (1–31), salary (≥ 0), avatar URL (https).
- `/app/settings/profile` page — avatar preview, display name, salary and payday form.

#### Billing Settings (API + Web — #169 / #170)

- `POST /billing/portal` — creates a Stripe Customer Portal session; requires `stripe_customer_id`.
- `/app/settings/billing` page — plan card (Free / Pro), "Subscribe" CTA → Stripe Checkout, "Manage" CTA → Customer Portal.

#### Google OAuth (API + Web — #165)

- `POST /auth/google` — exchange Google ID token; registers new user or logs in existing; sets `trial_ends_at` on creation.
- "Entrar com Google" button on login/register pages.

#### Dark Mode (Web — #160 / #161 / #162 / #164)

- Full dark mode infrastructure: CSS custom properties on `:root` / `[data-theme="dark"]`, toggled via `<html data-theme>`.
- Semantic color token system (`cf-surface`, `cf-bg-subtle`, `cf-text-primary`, `cf-text-secondary`, `cf-border`, `cf-border-input`, `cf-bg-page`) applied to shell, modals, inner content.
- Recharts axis, grid, and legend colors updated via theme tokens.

### Fixed

- **Semantic transaction colors** — Entrada/Saída type indicators now use `text-green-600` / `text-red-600` instead of raw grays (#167).
- **BRL formatting centralized** — all currency values use a single `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })` formatter (#166).
- **Budget/Category skeletons** — `bg-gray-100` (#212529, near-black in custom palette) corrected to `bg-cf-bg-subtle`; visible as dark skeleton on light backgrounds (#162).
- **Low-contrast error text** — transaction list error `text-red-300` corrected to `text-red-600` (#162).
- **Show/hide password toggle** — login and register fields now have a visibility toggle (#163).

### Migration Notes

| # | File | Description |
|---|------|-------------|
| 014 | `014_add_trial_ends_at.sql` | Adds `trial_ends_at TIMESTAMPTZ` to `users`; backfills existing rows |
| 015 | `015_create_user_forecasts.sql` | Creates `user_forecasts` table for monthly projections |
| 016 | `016_create_email_notifications.sql` | Creates `email_notifications` table (flip_neg / payday_reminder) |

### Quality

- 18 new/updated test files.
- API: **233/233** tests · lint OK.
- Web: **115/115** tests · lint OK · typecheck OK.

## [1.25.0] - 2026-02-22

### Title

v1.25.0 - UX Pack (Header, Filters, Category Sort, Contrast)

### Fixed

- **Header compact mode** — breakpoint raised from 420 px to 640 px; action buttons
  now remain visible on most phone orientations (PR-N2).
- **Filter panel** — collapses by default on all viewport sizes; opens on demand
  via "Filtros" toggle; desktop no longer forces it open on resize (PR-N3).
- **Category expense breakdown** — "Sem categoria" entry always sorts to the bottom
  of the list, after named categories ordered by descending spend (PR-N4).
- **WCAG AA contrast** — five elements that failed the 4.5:1 threshold on white
  backgrounds were corrected (PR-N5):
  - `TrendChart`: chart hint text `text-gray-300` → `text-gray-200` (2.05:1 → 8.2:1)
  - `App`: chip remove-button base color `text-gray-500` → `text-gray-200`; hover pair updated
  - `ImportCsvModal` / `ImportHistoryModal`: close-button `text-gray-500` → `text-gray-200`
  - `CategoriesSettings`: status label `text-gray-500` → `text-gray-200`

### Quality

- 11 existing web tests updated to open the filter panel before interacting with controls.
- Full suite green: **156/156** (api), **112/112** (web).

## [1.24.0] - 2026-02-21

### Title

v1.24.0 - Stripe Checkout & Modal Isolation

### Added

- `POST /billing/checkout` (requires Bearer token) — creates a Stripe Checkout Session for Pro plan upgrade.
  - Returns `{ url }` (201) pointing to the hosted Stripe Checkout page.
  - 409 if the user already has an `active`, `trialing`, or `past_due` subscription.
  - Price resolved from DB (`plans.stripe_price_id WHERE name='pro'`) with `STRIPE_PRICE_ID_PRO` env fallback.
  - Passes `metadata.userId`, `customer_email`, `allow_promotion_codes`, `billing_address_collection: "auto"`.
  - New env vars required at runtime: `STRIPE_SECRET_KEY`, `STRIPE_CHECKOUT_SUCCESS_URL`, `STRIPE_CHECKOUT_CANCEL_URL`.

### Fixed

- Budget modal now closes before transaction create, transaction edit, or delete confirm overlays open,
  preventing two `z-50` layers from stacking simultaneously (`openCreateModal`, `openEditModal`,
  `requestDeleteTransaction` in `App.tsx`).

### Quality

- 7 new integration tests in `apps/api/src/billing-checkout.test.js` — auth guard, conflict guard,
  Stripe session arg contract (price, metadata, URLs), `customer_email` passthrough, env-var guard paths.
- Regression test in `apps/web/src/pages/App.test.jsx` asserting budget modal closes on
  "Registrar novo valor" click.
- Full suite green: **156/156** (api), **112/112** (web).

## [1.23.0] - 2026-02-21

### Title

v1.23.0 - Auth Identity Endpoint

### Added

- `GET /auth/me` (requires Bearer token) — returns `{ id, email }` from JWT without DB access.
  Enables userId resolution in operational smoke tests and unblocks the billing checkout flow (PR-K).

### Quality

- 2 new tests in `apps/api/src/auth.test.js` covering 401 (no token) and 200 (valid token) cases.
- Full suite green: **149/149**.

## [1.22.0] - 2026-02-21

### Title

v1.22.0 - Stripe Webhooks (Subscription Lifecycle)

### Highlights

- Adds a Stripe webhook ingestion endpoint with hardened signature verification.
- Enables subscription lifecycle updates from Stripe events into the internal billing model.
- Keeps billing core provider-agnostic: lifecycle state comes from webhook payload processing.

### Added

- Stripe webhook route:
  - `POST /billing/webhooks/stripe` registered before `express.json()` to preserve raw body
- Stripe webhook service:
  - Event dispatcher for:
    - `checkout.session.completed`
    - `customer.subscription.updated`
    - `customer.subscription.deleted`
    - `invoice.payment_failed`
- Test helper:
  - `generateStripeSignature(payload, secret)` in `apps/api/src/test-helpers.js`
- Integration tests:
  - `apps/api/src/stripe-webhooks.test.js` with 12 scenarios

### Changed

- Signature verification hardening:
  - Compare HMAC signatures as hex bytes (not UTF-8 strings)
  - Sign the raw request `Buffer` directly
  - Support multiple `v1=` entries in `Stripe-Signature`
  - Validate hex format before `timingSafeEqual`
  - Guard malformed/expired timestamp with finite check + 300s tolerance
- Webhook handler returns deterministic error responses for missing/malformed signatures.

### Quality

- Full API suite green after webhook addition (`147/147`).
- Full monorepo gates green:
  - `npm run lint`
  - `npm run test`
  - `npm run build`

### Impact

- From: "subscriptions updated only by internal flows."
- To: "Stripe event lifecycle is ingested and reconciled in near real time."

## [1.21.0] - 2026-02-21

### Title

v1.21.0 - Billing Entitlements Foundation (Provider-Agnostic)

### Highlights

- Adds a billing foundation with plan features and subscription lifecycle states.
- Introduces entitlement middleware for premium gates and numeric caps.
- Enforces feature access for import/export and analytics trend history.

### Added

- Billing data model:
  - `plans` table with JSONB feature entitlements (`free`, `pro`)
  - `subscriptions` table with partial unique index enforcing one active/trialing/past_due subscription per user
- Billing service:
  - `getActivePlanFeaturesForUser()` with lazy fallback to free plan
  - `getSubscriptionSummaryForUser()` for subscription payload shaping
- Billing endpoint:
  - `GET /billing/subscription` (authenticated)
- Entitlement middleware:
  - `requireFeature(feature)` returns `402` + `Recurso disponivel apenas no plano Pro.`
  - `attachEntitlements` exposes `req.entitlements` for numeric caps

### Changed

- Premium feature gates:
  - CSV import (`/transactions/import/dry-run`, `/transactions/import/commit`) requires `csv_import`
  - CSV export (`/transactions/export.csv`) requires `csv_export`
  - Analytics trend (`/analytics/trend`) capped by `analytics_months_max`
    - free default is capped to 3 months
    - explicit requests above cap return `402` + `Limite de historico excedido no plano gratuito.`
- Integration tests now promote users to `pro` where premium flows are intentionally validated.

### Quality

- Added `apps/api/src/billing.test.js` with end-to-end entitlement scenarios.
- Full API suite green after changes (`135/135`).
- Full monorepo gates green:
  - `npm run lint`
  - `npm run test`
  - `npm run build`

### Impact

- From: "single-plan behavior with no enforcement."
- To: "plan-aware feature access with explicit gates and upgrade path."

## [1.19.0] - 2026-02-21

### Title

v1.19.0 - Scroll-to-Summary Drilldown + Trend Delta Tooltip

### Highlights

- Trend month click now auto-scrolls to the monthly summary section after month sync.
- Trend tooltip now includes month-over-month deltas for income, expense, and balance.
- Scroll behavior remains guarded by valid month input, and delta sorting contract is documented.

### Added

- Dashboard drilldown scroll (Web):
  - `summarySectionRef` attached to the "Resumo mensal" section
  - `handleTrendMonthClick` now calls `scrollIntoView({ behavior: "smooth", block: "start" })` after valid month selection
- Trend tooltip delta details (Web):
  - `buildDeltaMap` computes month-over-month deltas for income/expense/balance
  - Tooltip displays absolute value plus directional delta text
  - First month intentionally omits delta text (no previous baseline)
- Developer contract note:
  - `TrendChart` now documents that points must be sorted ascending by month (API contract)

### Changed

- Month click in `TrendChart` now both updates dashboard month state and focuses the summary section.
- Chart click affordance uses class-based pointer styling when navigation is enabled.

### Quality

- Extended `App.test.jsx` with scroll-to-summary assertion (`scrollIntoView` call on month click).
- Full monorepo validation green:
  - `npm run lint`
  - `npm run test`
  - `npm run build`
- CI checks green for PR #139 (`api`, `web`, `Vercel`).

### Impact

- From: "Month click updates context only."
- To: "Month click updates context and moves focus to the summary users need next."

## [1.18.0] - 2026-02-21

### Title

v1.18.0 — Deep-linked Month Navigation + Trend UX Polish

### Highlights

- The selected month in the dashboard is now persistent: shareable via URL, refresh-safe, and Back/Forward-aware.
- The trend chart speaks the user's language: pt-BR labels, a visible marker on the active month, and an explicit click affordance.

### Added

- URL persistence for `selectedSummaryMonth` (Web):
  - `?summaryMonth=YYYY-MM` read on init via `getInitialSummaryMonth()`; invalid values fall back to current month
  - Existing URL-sync `useEffect` extended: writes `summaryMonth` alongside all filter/pagination params
  - `popstate` listener syncs state on browser Back/Forward
- TrendChart UX polish (Web):
  - `formatMonthLabel`: converts `YYYY-MM` to `Fev/26` style (pt-BR static array, no `Intl` / locale risk)
  - `XAxis tickFormatter` and `CustomTooltip` header both use `formatMonthLabel`
  - `selectedMonth?: string` prop: `ReferenceLine` (brand purple, dashed) marks the active month when it falls within the trend data range
  - Click affordance: heading appends `— clique em um mes para navegar` hint when `onMonthClick` is wired

### Changed

- Dashboard month selection now persists in URL and survives refresh, deep-link, and browser navigation.
- Trend chart axis labels changed from raw `YYYY-MM` to `Mmm/YY` (pt-BR).

### Quality

- 6 new tests in `App.test.jsx`:
  - Initializes `selectedSummaryMonth` from valid `?summaryMonth` in URL
  - Ignores invalid `?summaryMonth` and falls back to current month
  - Month click updates `summaryMonth` in URL
  - Other query params preserved when updating `summaryMonth`
  - `selectedMonth` prop passed to TrendChart from URL init
  - `selectedMonth` prop reflects new month after chart click
- Web gates green (`typecheck`, `lint`, `test` 100/100, `build`)
- CI green across `api`, `web`, `Vercel` for both PRs (#136, #137)

### Impact

- From: "Click a month, lose it on refresh."
- To: "Click a month, share the link, come back tomorrow — same context."

## [1.17.0] - 2026-02-21

### Title

v1.17.0 — Historical Trend Chart: 6-Month Evolution + Month Click Sync

### Highlights

- Adds historical context directly into the dashboard with a 6-month trend chart (income / expense / balance).
- Turns the trend chart into navigation: clicking a month syncs the whole dashboard (summary, MoM compare, budgets).

### Added

- Historical trend chart (Web):
  - `GET /analytics/trend?months=6` consumption via a new typed service (`analytics.service.ts`)
  - Lazy-loaded `TrendChart` component using Recharts (3 series: income, expense, balance; custom tooltip; empty state)
  - Dashboard section: **Evolucao (ultimos 6 meses)**
  - Loading skeleton + error fallback states
- Interactive month drilldown (Web):
  - Clicking a month in the trend chart updates `selectedSummaryMonth`
  - Automatically reloads summary, MoM compare, and budgets in sync
  - Guard against malformed month strings (`MONTH_VALUE_REGEX`)

### Changed

- Dashboard now connects historical view with monthly insights through a single interaction (chart click).
- Trend loading flow added with explicit loading and error states.

### Quality

- Extended `App.test.jsx` coverage:
  - trend render when API returns data
  - error fallback when trend request fails
  - loading state for pending promise
  - confirms `getMonthlyTrend` called with `months=6`
  - month click triggers synchronized reload of summary / compare / budgets
  - sequential month clicks trigger sequential synchronized reloads
- Web gates green (`typecheck`, `lint`, `test` 94/94, `build`)
- `TrendChart` ships as a separate lazy chunk (12.71 kB)

### Impact

- From: "Static dashboard sections."
- To: "A dashboard that lets you drill down month-by-month from the trend itself."

## [1.16.0] - 2026-02-21

### Title

v1.16.0 - Product Insights: MoM Compare, Proactive Budget Alerts, and Category Movers

### Highlights

- This release transforms Control Finance from a transaction recorder into a product that actively surfaces insights and drives user action.
- Month-over-Month (MoM) comparison powered by a single API contract (`compare=prev`).
- Proactive in-app budget alert when a category reaches near limit (>=80%).
- Top Category Movers section showing the most impactful spending changes.

### Added

- MoM compare as a single source of truth:
  - `GET /transactions/summary?month=YYYY-MM&compare=prev`
  - backend-driven delta calculation (`current`, `previous`, `delta`, `byCategoryDelta`)
  - frontend MoM cards consume absolute delta, percentage delta (with `null` fallback), and correct tone semantics
  - centralized month-over-month logic in API.
- Proactive budget alert (Web):
  - dashboard banner triggered when at least one budget is in `near_limit` status
  - banner focuses on the highest `near_limit` percentage for urgency
  - no additional infra (UI-only, no email dependency)
  - existing Budget Alert Center preserved (`near_limit` + `exceeded`).
- Top Category Movers (Web):
  - new dashboard section: `Top variacoes por categoria`
  - uses `byCategoryDelta` from MoM compare
  - top 3 categories ordered by `abs(delta)`
  - directional badges (`↑/↓/→`) with percentage and absolute currency delta
  - CTA per category applies filter + selected month range and scrolls to transactions list
  - graceful empty fallback when no variation exists.

### Changed

- Dashboard MoM flow migrated from dual summary calls to a single `compare=prev` call.
- Frontend delta math removed in favor of API-calculated compare contract.
- Improved consistency between summary cards and category-level insights.

### Quality

- Extended `App.test.jsx` coverage:
  - MoM render and fallback scenarios
  - `previous=0` percentage edge case
  - proactive near-limit banner visibility
  - category movers ordering (top 3 by absolute delta)
  - CTA applying category + month range filter.
- Full monorepo validation:
  - `lint`
  - `typecheck`
  - `test`
  - `build`
- PR checks green (`api` / `web` / `vercel`).

### Impact

- From: "Here are your transactions."
- To: "Here is what changed, where it changed, and what you should act on."

## [1.15.0] - 2026-02-21

### Highlights

- Dashboard now provides month-over-month (MoM) insight for Income, Expense and Balance.
- Budget Alert Center introduces actionable risk visibility for near-limit and exceeded budgets.
- API now exposes monthly financial trend analytics with zero-filled month series.

### Added

- Web: MoM indicators on monthly summary cards (direction, percentage delta and absolute delta).
- Web: Expense-aware MoM semantics (`expense` up is treated as negative signal).
- Web: Budget Alert Center ordered by severity (`exceeded` first), with direct CTAs:
  - `View transactions`: applies category + selected month filters and scrolls to the list.
  - `Adjust budget`: opens the budget edit modal.
- API: authenticated endpoint `GET /analytics/trend?months=...` returning monthly:
  - `month` (`YYYY-MM`)
  - `income`
  - `expense`
  - `balance`

### Changed

- API: `months` query param is validated with:
  - default `6`
  - allowed range `1..24`
  - `400` for invalid values
- API: trend aggregation excludes soft-deleted transactions (`deleted_at IS NULL`).
- API: transaction type values were centralized into shared constants for service consistency.

### Quality

- API contract tests added for `/analytics/trend` covering:
  - `401` without token
  - `400` invalid `months` inputs
  - default 6-month zero-filled series
  - mixed-month aggregation with empty months
  - soft-deleted transaction exclusion
- Web tests expanded for:
  - MoM rendering, fallback and edge cases
  - Budget Alert Center ordering and CTA behaviors
- Test infrastructure compatibility:
  - analytics service includes a `pg-mem` fallback path for monthly trend tests without changing API contract.

## [1.14.0] - 2026-02-21

### Added

- Web core pages migrated to TypeScript:
  - `App.tsx`
  - `Login.tsx`
  - `CategoriesSettings.tsx`
- Observability operational assets:
  - Grafana Alloy worker config for authenticated `/metrics` scrape and remote_write
  - baseline dashboard and alert rules
  - warmup traffic script for metrics ingestion
  - observability validation order guide
- Availability SLI/SLO baseline documentation and runbook integration.

### Changed

- CI now enforces full Web typecheck in pull requests.
- API write endpoints now apply per-user rate limiting.
- Alloy config now uses inline static targets in `prometheus.scrape` (removing unsupported `discovery.static` usage).

### Security

- `/metrics` remains protected in production with `Authorization: Bearer <METRICS_AUTH_TOKEN>`.
- Added `ops/alloy/.env.example` with safe placeholders for Render Worker configuration.

### Quality

- Production observability ingestion validated in Grafana Cloud (`http_requests_total` rate > 0).
- CI checks remained green across API/Web/Vercel for release-line pull requests.

### Scope

- Release focused on type safety, observability operability, and runtime hardening.

## [1.13.1] - 2026-02-20

### Added

- CSV export now includes `category_name` (`id,type,value,date,description,notes,category_name,created_at`).
- Export category labels with fallbacks:
  - `Sem categoria` for null category.
  - `Categoria nao encontrada` when category id is unresolved.

### Changed

- Release runbook updated with incident severity and escalation criteria (`P1/P2/P3`).
- Release runbook now includes `APP_BUILD_TIMESTAMP` in deploy verification checks.

### Ops

- Production `buildTimestamp` in `/health` configured and validated.
- Post-release check now enforces `/health.commit == origin/main`.

## [1.13.0] - 2026-02-20

### Added

- End-to-end request correlation via `x-request-id` (Web -> API).
- Structured JSON logging for HTTP lifecycle, errors and startup events.
- Prometheus metrics endpoint (`GET /metrics`) with:
  - HTTP request counter
  - Latency histogram
  - Bearer token protection in production.
- Expanded `GET /health` with:
  - `buildTimestamp`
  - `uptimeSeconds`
  - `db.status`
  - `db.latencyMs`
  - `requestId`
- Safe ISO timestamp validation with fallback to `"unknown"`.

### Behavior

- `/health` returns `200` when DB is healthy.
- `/health` returns `503` when DB fails (`ok: false`).
- `/metrics` requires `Authorization: Bearer <METRICS_AUTH_TOKEN>` in production.

### Scope

- Observability-only. No business or domain behavior changes.

### Technical

- Merge commit: `cf6936cf6674bacbef1bc2bd316575c13f35e554`
- PR: #109

## [1.12.0] - 2026-02-20

### Added

- Categories v2 (soft delete, restore, `normalized_name`, partial unique index).
- Categories management UI.
- Backfill tooling (`db:backfill:categories-normalized`).
- Automated smoke validation script (`scripts/smoke-categories-v2.ps1`).
- Operational Maturity section in README.
- Release runbook documentation.

### Changed

- `PATCH /transactions/:id` now supports updating `category_id`.
- Allows `category_id = null` (Uncategorized).
- Enforces active-category and ownership validation on update.

### Fixed

- Resolved inconsistency where Web reset category to "Uncategorized" but backend ignored `category_id` in PATCH.

### Integrity

- Domain guards for deleted categories and restore conflicts.
- Expanded contract test coverage.

### Ops

- Runtime `/health` exposes version and commit.
- CI governance enforced before merge to `main`.

## [1.11.0] - 2026-02-19

### Highlights

- Monthly budgets by category for budget vs actual tracking in the selected month.
- Budget status signals (`ok`, `near_limit`, `exceeded`) with progress visualization.
- Full Web management flow for monthly budgets (create, edit, delete).

### API

- Added monthly budgets domain:
  - `POST /budgets` for upsert by `user_id + category_id + month`
  - `GET /budgets?month=YYYY-MM` for consolidated budget view per category
  - `DELETE /budgets/:id` for user-scoped delete with ownership enforcement
- Added persistence:
  - New `monthly_budgets` table
  - Unique index on `(user_id, category_id, month)`
  - Index on `(user_id, month)`
- `GET /budgets` consolidation includes:
  - `actual` from `transactions` with `type = 'Saida'`, monthly range, `deleted_at IS NULL`
  - computed `remaining`, `percentage`, and `status`
- Status rules:
  - `ok` when usage is `< 80%`
  - `near_limit` when usage is `>= 80%` and `<= 100%`
  - `exceeded` when usage is `> 100%`

### Web

- Added "Metas do mes" block to dashboard:
  - fetches budgets by selected summary month
  - loading, empty, error, and retry states
  - per-category card with budget, actual, remaining, usage percentage, status badge, and progress bar
- Added budgets CRUD UX:
  - `+ Nova meta` action
  - edit and delete actions per budget card
  - inline modal for create/edit with validation and success feedback
- Added UX and accessibility improvements:
  - applied filter chips summary and removable chips
  - icon-only remove control with preserved aria-label and 32x32 hit area
  - search `Escape` behavior for draft clear and applied query removal
  - polish for empty state CTA and edit mode clarity

### Quality

- Expanded API contract tests for budgets:
  - upsert
  - aggregation and status calculation
  - ownership-safe delete
- Expanded Web tests for:
  - budgets block rendering and error retry
  - budgets create and delete flows
  - applied filters summary and chip removal
  - search `Escape` behavior
  - budgets polish flows (empty state CTA and edit-mode messaging)
- CI green across `lint`, `test`, and `build`.

### Release Integrity

- Main aligned at `86f97054c8f48862d5cd9dbf2736f70dcf5d6900`.
- Release train delivered with additive endpoints and no breaking API changes.

## [1.10.4] - 2026-02-19

### Highlights

#### Web

- Pagination migrated to an offset-first model
- Pagination state persisted in querystring:
  - `limit`
  - `offset`
  - `type`
  - `categoryId`
  - `period`
  - `from`
  - `to`
- Predictable navigation controls:
  - First
  - Previous
  - Next
  - Last
- Shareable and refresh-safe dashboard URLs

#### API

- `GET /transactions` exposes `meta.offset`
- `offset` takes precedence over `page` when both are provided
- Backward-compatible response shape:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "offset": 0,
    "total": 45,
    "totalPages": 3
  }
}
```

#### UX improvements

- Range display based on `meta.offset`
- Automatic clamp of extreme offsets
- Pagination reset when filters or page size change

#### Quality

- Updated unit tests (API + Web)
- Full CI green (`lint`, `test`, `build`)
- No breaking changes
