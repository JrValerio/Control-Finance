# Auditoria Funcional Completa — Control Finance

- Data: 2026-04-02
- Autor: Auditoria automatizada via código
- Repositório: JrValerio/Control-Finance
- Branch no momento da auditoria: `main`
- Versão do `main` no momento: `38d981dc96b16e9f7964ebfadc07731032234971` (`38d981d`)

## 1) Resumo Executivo

Esta auditoria funcional foi executada por leitura direta do código do frontend (`apps/web/src`) e backend (`apps/api/src`), sem inferência por documentação isolada.
O produto possui implementação robusta dos domínios centrais (autenticação, transações, importação, pendências, cartões, renda, IRPF, billing), com integração end-to-end entre rotas de UI e APIs.
Os principais pontos de atenção não são ausências de funcionalidade core, mas sim comportamentos deliberados de gating por plano (free/trial/pro), além de fallbacks não bloqueantes para IA e projeções.
As rotas públicas/protegidas estão consistentes, e a Home concentra triagem operacional, análise e execução por modais de ação rápida.
No backend, a malha de endpoints é ampla e modular, com middlewares de autenticação, rate limit, entitlement/paywall, observabilidade e segurança de webhook.

---

## 2) Páginas e Rotas (Frontend)

### 2.1 Rotas públicas

Arquivo base: `apps/web/src/AppRoutes.tsx`

- `GET UI /` → `Login`
- `GET UI /login` → `Login`
- `GET UI /forgot-password` → `ForgotPassword`
- `GET UI /reset-password` → `ResetPassword`

### 2.2 Rotas protegidas

Arquivo base: `apps/web/src/AppRoutes.tsx`

- `GET UI /app` → `Dashboard` (wrapper para `App`)
- `GET UI /app/settings/categories` → `CategoriesSettingsRoute`
- `GET UI /app/settings/billing` → `BillingSettingsRoute`
- `GET UI /app/settings/profile` → `ProfileSettingsRoute`
- `GET UI /app/settings/security` → `SecuritySettingsRoute`
- `GET UI /app/bills` → `BillsRoute`
- `GET UI /app/credit-cards` → `CreditCardsRoute`
- `GET UI /app/income-sources` → `IncomeSourcesRoute`
- `GET UI /app/tax` → `TaxRoute`
- `GET UI /app/tax/:taxYear` → `TaxRoute`

### 2.3 Controle de acesso

Arquivos:

- `apps/web/src/routers/ProtectedRoute.jsx`
- `apps/web/src/context/AuthContext.tsx`

Comportamento observado:

- Rotas protegidas aguardam bootstrap de sessão (`isInitializing`) antes de decidir redirect.
- Usuário não autenticado é redirecionado para `/`.
- Sessão é restaurada via `refresh` (cookie httpOnly), não por token no localStorage.

Status: ✅ implementado

---

## 3) Home / Dashboard — Seções e Widgets

Arquivo central: `apps/web/src/pages/App.tsx`

### 3.1 Estrutura macro da Home

- Cabeçalho com ações rápidas, tema, atalhos operacionais e menu de conta.
- Resumo financeiro mensal (entradas, saídas, saldo + comparação mês anterior).
- Painel operacional.
- Seção de renda e estrutura.
- Seção de saúde e metas.
- Seção de análise do período.
- Seção de movimentações (lista transacional com paginação e filtros).

Status: ✅ implementado

### 3.2 Painel Operacional (triagem)

Widgets/Componentes:

- `OperationalSummaryPanel`
- `ForecastCard`
- `BillsSummaryWidget`
- `CreditCardsSummaryWidget`
- `UtilityBillsWidget`

Arquivos principais:

- `apps/web/src/pages/App.tsx`
- `apps/web/src/components/OperationalSummaryPanel.tsx`
- `apps/web/src/components/ForecastCard.tsx`
- `apps/web/src/components/BillsSummaryWidget.tsx`
- `apps/web/src/components/CreditCardsSummaryWidget.tsx`
- `apps/web/src/components/UtilityBillsWidget.tsx`

Status: ✅ implementado

### 3.3 Renda e Estrutura

Widgets/Componentes:

- `BankAccountsWidget`
- `SalaryWidget`
- `ConsignadoOverviewWidget`

Arquivos principais:

- `apps/web/src/components/BankAccountsWidget.tsx`
- `apps/web/src/components/SalaryWidget.tsx`
- `apps/web/src/components/ConsignadoOverviewWidget.tsx`

Status: ✅ implementado

### 3.4 Saúde e Metas

Widgets/Componentes:

- `HealthOverview`
- `GoalsSection`
- Bloco de orçamento mensal (criação/edição/exclusão de metas por categoria no mês)

Arquivos principais:

- `apps/web/src/components/HealthOverview.tsx`
- `apps/web/src/components/GoalsSection.tsx`
- `apps/web/src/pages/App.tsx`

Status: ✅ implementado

### 3.5 Análise do período

Componentes:

- `CategoryTreemap`
- `TrendChart`
- `TransactionChart`
- Top variações por categoria

Status: ✅ implementado

### 3.6 Movimentações

Componentes/fluxos:

- `TransactionList`
- Filtros por tipo/período/busca/categoria
- Paginação com tamanho de página persistido
- Bulk delete
- Undo de exclusão unitária

Status: ✅ implementado

---

## 4) Matriz por Domínio (Status ✅ / ⚠️ / 🔲)

| Domínio | Status | Evidência principal | Observação |
|---|---|---|---|
| Autenticação (email/senha, Google, refresh/logout) | ✅ | `apps/web/src/pages/Login.tsx`, `apps/api/src/routes/auth.routes.js` | Fluxo completo com recuperação de senha e link Google |
| Segurança de conta (troca/definição senha, vínculo Google) | ✅ | `apps/web/src/pages/SecuritySettings.tsx`, `apps/api/src/routes/auth.routes.js` | Implementado com validação de senha forte |
| Perfil do usuário | ✅ | `apps/web/src/pages/ProfileSettings.tsx`, `apps/api/src/routes/me.routes.js` | Inclui CPF titular para IRPF |
| Transações CRUD | ✅ | `apps/web/src/pages/App.tsx`, `apps/api/src/routes/transactions.routes.js` | Criação, edição, exclusão, restauração, listagem paginada |
| Importação de extratos (CSV/OFX/PDF) | ✅ | `apps/web/src/components/ImportCsvModal.jsx`, `apps/api/src/routes/transactions.routes.js` | Dry-run + commit + histórico + regras |
| Exportação CSV | ⚠️ | `apps/web/src/pages/App.tsx`, `apps/api/src/routes/transactions.routes.js` | Funciona, porém com gating de plano (`csv_export`) |
| Categorias | ✅ | `apps/web/src/pages/CategoriesSettings.tsx`, `apps/api/src/routes/categories.routes.js` | CRUD + restore |
| Pendências (bills) | ✅ | `apps/web/src/pages/BillsPage.tsx`, `apps/api/src/routes/bills.routes.js` | CRUD + mark paid + batch + reconciliação |
| Contas de consumo (utilidades) | ✅ | `apps/web/src/components/UtilityBillsWidget.tsx`, `apps/api/src/routes/bills.routes.js` | Triagem por urgência e conciliação |
| Cartões de crédito | ✅ | `apps/web/src/pages/CreditCardsPage.tsx`, `apps/api/src/routes/credit-cards.routes.js` | Cartões, compras, parcelamento, faturas, parse PDF |
| Fontes de renda | ✅ | `apps/web/src/pages/IncomeSourcesPage.tsx`, `apps/api/src/routes/income-sources.routes.js` | Fontes, descontos, extratos e conciliação |
| Contas bancárias | ✅ | `apps/web/src/components/BankAccountsWidget.tsx`, `apps/api/src/routes/bank-accounts.routes.js` | CRUD + posição real + insight |
| Salário/benefício/consignado | ⚠️ | `apps/web/src/components/SalaryWidget.tsx`, `apps/api/src/routes/salary.routes.js` | Implementado; parte anual é gated (`salary_annual`) |
| Projeção de saldo (forecast) | ⚠️ | `apps/web/src/components/ForecastCard.tsx`, `apps/api/src/routes/forecast.routes.js` | Implementado; congelamento após trial expirado |
| Saúde financeira (gauge/trajectory) | ✅ | `apps/web/src/components/HealthOverview.tsx` | Integrada com forecast e insight IA |
| Metas (goals) | ⚠️ | `apps/web/src/components/GoalsSection.tsx`, `apps/api/src/routes/goals.routes.js` | Implementado; endpoint exige trial ativo ou plano pago |
| Orçamento mensal por categoria | ✅ | `apps/web/src/pages/App.tsx`, `apps/api/src/routes/budgets.routes.js` | CRUD mensal + alertas de uso |
| Analytics de evolução | ⚠️ | `apps/web/src/pages/App.tsx`, `apps/api/src/routes/analytics.routes.js` | Implementado; histórico limitado por entitlement |
| IA (insight geral + conta + utilidades) | ⚠️ | `apps/web/src/components/AIInsightPanel.tsx`, `apps/api/src/routes/ai.routes.js` | Implementado; gated e com fallback nulo não bloqueante |
| IRPF / Central do Leão | ✅ | `apps/web/src/pages/TaxPage.tsx`, `apps/api/src/routes/tax.routes.js` | Upload, extração, revisão, obrigação, resumo, export |
| Billing / assinatura | ✅ | `apps/web/src/pages/BillingSettings.tsx`, `apps/api/src/routes/billing.routes.js` | Subscription, checkout, portal, entitlement |
| Dashboard snapshot consolidado | ✅ | `apps/web/src/components/OperationalSummaryPanel.tsx`, `apps/api/src/routes/dashboard.routes.js` | Endpoint dedicado para visão operacional |
| Funcionalidade planejada sem execução | 🔲 | N/A | Não identificada no escopo auditado |

---

## 5) Modais e Interações

### 5.1 Home (`App.tsx`)

- `Modal` de transação (criar/editar)
- `ConfirmDialog` para exclusão de transação
- `ConfirmDialog` para exclusão de meta de orçamento
- Modal inline de orçamento mensal
- `UpgradeModal` para paywall
- `ImportCsvModal`
- `ImportHistoryModal`
- Toast/undo de exclusão de transação

Status: ✅ implementado

### 5.2 Pendências (`BillsPage.tsx`)

- `BillModal` para criação/edição
- confirmação de exclusão inline
- ações rápidas: marcar paga, editar, excluir

Status: ✅ implementado

### 5.3 Cartões (`CreditCardsPage.tsx`)

- `CreditCardModal` (cadastro/edição de cartão)
- `CreditCardPurchaseModal` (compra/parcelamento)
- `ImportCsvModal` (importação contextual)
- confirmação de exclusão de compra
- ações de fechar/reabrir fatura e pagar via bills

Status: ✅ implementado

### 5.4 Fontes de renda (`IncomeSourcesPage.tsx`)

- `IncomeSourceModal`
- `IncomeDeductionModal`
- `IncomeStatementModal`
- `ImportCsvModal` (importação contextual)
- confirmações de exclusão (fonte/desconto)

Status: ✅ implementado

### 5.5 Categorias (`CategoriesSettings.tsx`)

- modal próprio de criar/renomear categoria
- `ConfirmDialog` para remover/restaurar

Status: ✅ implementado

### 5.6 IRPF (`TaxPage.tsx`)

- `TaxUploadModal`
- `TaxManualFactModal`
- interações de revisão individual e em lote

Status: ✅ implementado

### 5.7 Auth

- `GoogleLogin` em login e segurança
- fluxos de reset/forgot com validação local

Status: ✅ implementado

---

## 6) Endpoints Backend (método / path / função / arquivo)

> Base de montagem de rotas: `apps/api/src/app.js`

### 6.1 Health e Metrics

| Método | Path | Função principal | Arquivo de rota |
|---|---|---|---|
| GET | `/health/` | `checkDatabaseHealth`, `getMigrationStatus` | `apps/api/src/routes/health.routes.js` |
| GET | `/metrics/` | `getMetricsSnapshot` | `apps/api/src/routes/metrics.routes.js` |

### 6.2 Auth

| Método | Path | Função principal | Arquivo de rota |
|---|---|---|---|
| POST | `/auth/register` | `registerUser` | `auth.routes.js` |
| POST | `/auth/login` | `loginUser` | `auth.routes.js` |
| POST | `/auth/google` | `loginOrRegisterWithGoogle` | `auth.routes.js` |
| POST | `/auth/refresh` | `rotateRefreshToken` | `auth.routes.js` |
| DELETE | `/auth/logout` | `revokeRefreshToken` | `auth.routes.js` |
| POST | `/auth/forgot-password` | `requestPasswordReset` | `auth.routes.js` |
| POST | `/auth/reset-password` | `resetPassword` | `auth.routes.js` |
| PATCH | `/auth/password` | `setUserPassword` | `auth.routes.js` |
| POST | `/auth/google/link` | `linkGoogleIdentity` | `auth.routes.js` |
| GET | `/auth/me` | retorno de `req.user` autenticado | `auth.routes.js` |

### 6.3 Perfil / Usuário

| Método | Path | Função principal | Arquivo de rota |
|---|---|---|---|
| GET | `/me/` | `getMyProfile` | `me.routes.js` |
| PATCH | `/me/profile` | `updateMyProfile` | `me.routes.js` |

### 6.4 Categorias

| Método | Path | Função principal | Arquivo de rota |
|---|---|---|---|
| GET | `/categories/` | `listCategoriesByUser` | `categories.routes.js` |
| POST | `/categories/` | `createCategoryForUser` | `categories.routes.js` |
| PATCH | `/categories/:id` | `updateCategoryForUser` | `categories.routes.js` |
| DELETE | `/categories/:id` | `deleteCategoryForUser` | `categories.routes.js` |
| POST | `/categories/:id/restore` | `restoreCategoryForUser` | `categories.routes.js` |

### 6.5 Orçamentos

| Método | Path | Função principal | Arquivo de rota |
|---|---|---|---|
| GET | `/budgets/` | `listMonthlyBudgetsByUser` | `budgets.routes.js` |
| POST | `/budgets/` | `upsertMonthlyBudgetForUser` | `budgets.routes.js` |
| DELETE | `/budgets/:id` | `deleteMonthlyBudgetForUser` | `budgets.routes.js` |

### 6.6 Analytics

| Método | Path | Função principal | Arquivo de rota |
|---|---|---|---|
| POST | `/analytics/paywall` | `recordPaywallEvent` | `analytics.routes.js` |
| POST | `/analytics/events` | `recordActivationEvent` | `analytics.routes.js` |
| GET | `/analytics/trend` | `getMonthlyTrendForUser` | `analytics.routes.js` |

### 6.7 Transações e Importação

| Método | Path | Função principal | Arquivo de rota |
|---|---|---|---|
| GET | `/transactions/export.csv` | `exportTransactionsCsvByUser` | `transactions.routes.js` |
| GET | `/transactions/summary` | `getMonthlySummaryForUser` | `transactions.routes.js` |
| GET | `/transactions/imports/metrics` | `getTransactionsImportMetricsByUser` | `transactions.routes.js` |
| GET | `/transactions/imports` | `listTransactionsImportSessionsByUser` | `transactions.routes.js` |
| GET | `/transactions/` | `listTransactionsByUser` | `transactions.routes.js` |
| POST | `/transactions/` | `createTransactionForUser` | `transactions.routes.js` |
| DELETE | `/transactions/imports/:sessionId` | `deleteImportSessionForUser` | `transactions.routes.js` |
| POST | `/transactions/bulk-delete` | `bulkDeleteTransactionsForUser` | `transactions.routes.js` |
| PATCH | `/transactions/:id` | `updateTransactionForUser` | `transactions.routes.js` |
| DELETE | `/transactions/:id` | `deleteTransactionForUser` | `transactions.routes.js` |
| POST | `/transactions/:id/restore` | `restoreTransactionForUser` | `transactions.routes.js` |
| POST | `/transactions/import/dry-run` | `dryRunTransactionsImportForUser` | `transactions.routes.js` |
| POST | `/transactions/import/commit` | `commitTransactionsImportForUser` | `transactions.routes.js` |
| GET | `/transactions/import/rules` | `listTransactionImportCategoryRulesByUser` | `transactions.routes.js` |
| POST | `/transactions/import/rules` | `upsertTransactionImportCategoryRuleForUser` | `transactions.routes.js` |
| DELETE | `/transactions/import/rules/:ruleId` | `deleteTransactionImportCategoryRuleForUser` | `transactions.routes.js` |

### 6.8 Billing e Webhooks

| Método | Path | Função principal | Arquivo de rota |
|---|---|---|---|
| GET | `/billing/subscription` | `getSubscriptionSummaryByUser` | `billing.routes.js` |
| GET | `/billing/entitlement` | `getEntitlementSummaryByUser` | `billing.routes.js` |
| POST | `/billing/checkout` | `createCheckoutSession` | `billing.routes.js` |
| POST | `/billing/checkout-prepaid` | `createPrepaidCheckoutSession` | `billing.routes.js` |
| POST | `/billing/portal` | `createBillingPortalSession` | `billing.routes.js` |
| POST | `/billing/webhooks/stripe` | `processStripeEvent` (com verificação de assinatura) | `stripe-webhooks.routes.js` |

### 6.9 Forecast

| Método | Path | Função principal | Arquivo de rota |
|---|---|---|---|
| GET | `/forecasts/current` | `getLatestForecast` | `forecast.routes.js` |
| POST | `/forecasts/recompute` | `computeForecast` (+ notificações best-effort) | `forecast.routes.js` |

### 6.10 Pendências (Bills)

| Método | Path | Função principal | Arquivo de rota |
|---|---|---|---|
| GET | `/bills/summary` | `getBillsSummaryForUser` | `bills.routes.js` |
| GET | `/bills/utility-panel` | `getUtilityBillsPanelForUser` | `bills.routes.js` |
| GET | `/bills/` | `listBillsByUser` | `bills.routes.js` |
| POST | `/bills/` | `createBillForUser` | `bills.routes.js` |
| POST | `/bills/batch` | `createBillsBatchForUser` | `bills.routes.js` |
| PATCH | `/bills/:id/mark-paid` | `markBillAsPaidForUser` | `bills.routes.js` |
| PATCH | `/bills/:id` | `updateBillForUser` | `bills.routes.js` |
| DELETE | `/bills/:id` | `deleteBillForUser` | `bills.routes.js` |
| GET | `/bills/:id/match-candidates` | `getMatchCandidatesForBill` | `bills.routes.js` |
| POST | `/bills/:id/confirm-match` | `confirmBillMatch` | `bills.routes.js` |
| DELETE | `/bills/:id/match` | `unmatchBill` | `bills.routes.js` |

### 6.11 Cartões

| Método | Path | Função principal | Arquivo de rota |
|---|---|---|---|
| GET | `/credit-cards/` | `listCreditCardsByUser` | `credit-cards.routes.js` |
| POST | `/credit-cards/` | `createCreditCardForUser` | `credit-cards.routes.js` |
| PATCH | `/credit-cards/:id` | `updateCreditCardForUser` | `credit-cards.routes.js` |
| POST | `/credit-cards/:id/purchases` | `createCreditCardPurchaseForUser` | `credit-cards.routes.js` |
| POST | `/credit-cards/:id/installments` | `createCreditCardInstallmentsForUser` | `credit-cards.routes.js` |
| DELETE | `/credit-cards/purchases/:purchaseId` | `deleteCreditCardPurchaseForUser` | `credit-cards.routes.js` |
| POST | `/credit-cards/:id/close-invoice` | `closeCreditCardInvoiceForUser` | `credit-cards.routes.js` |
| POST | `/credit-cards/invoices/:invoiceId/reopen` | `reopenCreditCardInvoiceForUser` | `credit-cards.routes.js` |
| POST | `/credit-cards/:id/invoices/parse-pdf` | `parseCreditCardInvoicePdfForUser` | `credit-cards.routes.js` |
| GET | `/credit-cards/:id/invoices` | `listCreditCardInvoicesForUser` | `credit-cards.routes.js` |
| POST | `/credit-cards/:id/invoices/:invoiceId/link-bill` | `linkBillToInvoiceForUser` | `credit-cards.routes.js` |

### 6.12 Fontes de Renda

| Método | Path | Função principal | Arquivo de rota |
|---|---|---|---|
| GET | `/income-sources/` | `listIncomeSourcesForUser` | `income-sources.routes.js` |
| POST | `/income-sources/` | `createIncomeSourceForUser` | `income-sources.routes.js` |
| PATCH | `/income-sources/:id` | `updateIncomeSourceForUser` | `income-sources.routes.js` |
| DELETE | `/income-sources/:id` | `deleteIncomeSourceForUser` | `income-sources.routes.js` |
| POST | `/income-sources/:id/deductions` | `createDeductionForSource` | `income-sources.routes.js` |
| PATCH | `/income-sources/deductions/:deductionId` | `updateDeductionForSource` | `income-sources.routes.js` |
| DELETE | `/income-sources/deductions/:deductionId` | `deleteDeductionForSource` | `income-sources.routes.js` |
| GET | `/income-sources/:id/statements` | `listStatementsForSource` | `income-sources.routes.js` |
| POST | `/income-sources/:id/statements` | `createStatementDraftForSource` | `income-sources.routes.js` |
| GET | `/income-sources/statements/:statementId` | `getStatementWithDeductions` | `income-sources.routes.js` |
| PATCH | `/income-sources/statements/:statementId` | `updateStatementForSource` | `income-sources.routes.js` |
| POST | `/income-sources/statements/:statementId/post` | `postStatementForSource` | `income-sources.routes.js` |
| POST | `/income-sources/statements/:statementId/link-transaction` | `linkStatementToTransaction` | `income-sources.routes.js` |

### 6.13 Salário e Consignado

| Método | Path | Função principal | Arquivo de rota |
|---|---|---|---|
| GET | `/salary/profile` | `getSalaryProfileForUser` | `salary.routes.js` |
| PUT | `/salary/profile` | `upsertSalaryProfileForUser` | `salary.routes.js` |
| PUT | `/salary/profile/imported-benefit` | `syncImportedBenefitProfileForUser` | `salary.routes.js` |
| GET | `/salary/consignado-overview` | `getConsignadoOverviewForUser` | `salary.routes.js` |
| POST | `/salary/consignacoes` | `addConsignacaoForUser` | `salary.routes.js` |
| DELETE | `/salary/consignacoes/:id` | `deleteConsignacaoForUser` | `salary.routes.js` |

### 6.14 IRPF / Tax

| Método | Path | Função principal | Arquivo de rota |
|---|---|---|---|
| GET | `/tax/` | `getTaxBootstrapByUser` | `tax.routes.js` |
| POST | `/tax/documents` | `createTaxDocumentForUser` | `tax.routes.js` |
| GET | `/tax/documents` | `listTaxDocumentsByUser` | `tax.routes.js` |
| GET | `/tax/documents/:id` | `getTaxDocumentByIdForUser` | `tax.routes.js` |
| DELETE | `/tax/documents/:id` | `deleteTaxDocumentByIdForUser` | `tax.routes.js` |
| POST | `/tax/documents/:id/reprocess` | `processTaxDocumentByIdForUser` | `tax.routes.js` |
| GET | `/tax/facts` | `listTaxFactsByUser` | `tax.routes.js` |
| POST | `/tax/facts` | `createManualTaxFactByUser` | `tax.routes.js` |
| POST | `/tax/app-sync/:taxYear` | `syncAppTaxFactsByYear` | `tax.routes.js` |
| POST | `/tax/facts/bulk-review` | `bulkApproveTaxFactsByUser` | `tax.routes.js` |
| PATCH | `/tax/facts/:id/review` | `reviewTaxFactByUser` | `tax.routes.js` |
| GET | `/tax/rules/:taxYear` | `getTaxRuleSetsByYear` | `tax.routes.js` |
| GET | `/tax/obligation/:taxYear` | `getTaxObligationByYear` | `tax.routes.js` |
| GET | `/tax/summary/:taxYear` | `getTaxSummaryByYear` | `tax.routes.js` |
| GET | `/tax/income-statement-clt/:taxYear` | `getCltIncomeStatementByYear` | `tax.routes.js` |
| GET | `/tax/export/:taxYear` | `exportTaxDossierByYear` | `tax.routes.js` |
| POST | `/tax/summary/:taxYear/rebuild` | `rebuildTaxSummaryByYear` | `tax.routes.js` |

### 6.15 IA

| Método | Path | Função principal | Arquivo de rota |
|---|---|---|---|
| GET | `/ai/insight` | `generateFinancialInsight` | `ai.routes.js` |
| GET | `/ai/bank-account-insight` | `generateBankAccountInsight` | `ai.routes.js` |
| GET | `/ai/utility-insight` | `generateUtilityInsight` | `ai.routes.js` |

### 6.16 Goals

| Método | Path | Função principal | Arquivo de rota |
|---|---|---|---|
| GET | `/goals/` | `listGoalsForUser` | `goals.routes.js` |
| POST | `/goals/` | `createGoalForUser` | `goals.routes.js` |
| PATCH | `/goals/:id` | `updateGoalForUser` | `goals.routes.js` |
| DELETE | `/goals/:id` | `deleteGoalForUser` | `goals.routes.js` |

### 6.17 Bank Accounts

| Método | Path | Função principal | Arquivo de rota |
|---|---|---|---|
| GET | `/bank-accounts/` | `listBankAccountsByUser` | `bank-accounts.routes.js` |
| POST | `/bank-accounts/` | `createBankAccountForUser` | `bank-accounts.routes.js` |
| PATCH | `/bank-accounts/:id` | `updateBankAccountForUser` | `bank-accounts.routes.js` |
| DELETE | `/bank-accounts/:id` | `deleteBankAccountForUser` | `bank-accounts.routes.js` |

### 6.18 Dashboard Snapshot

| Método | Path | Função principal | Arquivo de rota |
|---|---|---|---|
| GET | `/dashboard/snapshot` | `getDashboardSnapshot` | `dashboard.routes.js` |

### 6.19 Operações internas (não-prod)

| Método | Path | Função principal | Arquivo de rota |
|---|---|---|---|
| POST | `/ops/force-plan` | `forcePlanForEmail` | `ops.routes.js` |
| POST | `/ops/tax-documents/reprocess-legacy` | `reprocessLegacyTaxDocuments` | `ops.routes.js` |

---

## 7) Gaps Identificados e Prioridade

### Gap A — Gating de funcionalidades premium (paywall)

- Descrição:
  - Recursos como importação, exportação CSV, forecast contínuo, analytics estendido, goals e parte anual de salário são bloqueados por entitlement/plano.
- Evidências:
  - `transactions.routes.js` (`requireFeature("csv_import")`, `requireFeature("csv_export")`)
  - `forecast.routes.js` (`requireActiveTrialOrPaidPlan`)
  - `analytics.routes.js` (limite por `analytics_months_max` + erro `FEATURE_GATED`)
  - `salary.routes.js` (gate parcial de dados anuais)
  - `goals.routes.js` (trial/paid)
- Classificação:
  - Prioridade: **médio**
  - Justificativa: não é defeito técnico, é regra de produto; impacta experiência free, não integridade dos dados.

### Gap B — Projeção congelada após expiração do trial

- Descrição:
  - Em trial expirado, o card de forecast entra em estado congelado e exibe último valor em cache/local.
- Evidências:
  - `apps/web/src/components/ForecastCard.tsx` (`cardState === "frozen"`, `loadCachedForecast`)
- Classificação:
  - Prioridade: **médio**
  - Justificativa: comportamento esperado de monetização, mas pode gerar percepção de desatualização para usuário free.

### Gap C — Fallback não estruturado de erro de paywall no frontend

- Descrição:
  - Existe TODO para remover fallback por string-match na detecção de erro de trial/paywall.
- Evidências:
  - `apps/web/src/services/api.ts` (comentário TODO em torno do tratamento de erro)
- Classificação:
  - Prioridade: **baixo**
  - Justificativa: dívida técnica conhecida, não bloqueia execução atual, mas fragiliza robustez de parsing de erro.

### Gap D — Insights de IA são best-effort (podem retornar nulo)

- Descrição:
  - Endpoints e widgets de IA degradam para `null` sem quebrar UX.
- Evidências:
  - `apps/api/src/routes/ai.routes.js` (retorno sem 500 por falha de LLM)
  - `apps/web/src/components/HealthOverview.tsx`, `BankAccountsWidget.tsx`, `UtilityBillsWidget.tsx`
- Classificação:
  - Prioridade: **baixo**
  - Justificativa: degradação é intencional e segura; impacto é apenas perda de enriquecimento contextual.

### Gap E — Endpoint de operações internas existe no runtime (com proteção por ambiente/token)

- Descrição:
  - Rotas `/ops/*` existem no app e são protegidas para não-prod + token.
- Evidências:
  - `apps/api/src/routes/ops.routes.js`
- Classificação:
  - Prioridade: **baixo**
  - Justificativa: proteção está aplicada; risco residual é operacional/configuração indevida de ambiente.

### Gaps críticos

- **Nenhum gap crítico identificado** na auditoria funcional atual.

---

## 8) Conclusão da Auditoria

O Control Finance apresenta cobertura funcional ampla e consistente, com rastreabilidade clara entre páginas, interações e serviços de backend.
Não foram encontradas lacunas críticas de implementação nos domínios principais auditados.
Os principais pontos de atenção são comportamentos deliberados de monetização (gating) e uma dívida técnica de tratamento de erro de paywall no frontend.
