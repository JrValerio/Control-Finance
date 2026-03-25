# Control Finance — Roadmap de Execução

> Documento interno para orientar as próximas entregas do produto sem desviar do escopo.
> Este arquivo não substitui o README público do repositório; ele serve como mapa de execução.

---

## 1. Norte do produto

O Control Finance deixou de ser apenas um app de registro de entradas e saídas.
O produto é um **Copiloto Financeiro**:

- acompanha transações reais por usuário com isolamento real de dados
- projeta o comportamento financeiro do mês (forecast + flip detection)
- lê a saúde financeira de forma executiva (HealthOverview + gauge)
- gera insights contextuais via Claude Haiku (Especialista IA)
- acompanha metas de poupança com cálculo automático de necessidade mensal
- prepara o terreno para automações mais inteligentes sem inflar escopo cedo demais

### Regra central

> **Dar acabamento premium à inteligência que já existe antes de adicionar mais camadas.**

---

## 2. Estado atual confirmado (v1.30.0)

### Monorepo

```text
apps/
  web/  → React + Vite + TypeScript
  api/  → Express + PostgreSQL
```

### Scripts root

```bash
npm run dev
npm run lint
npm run test
npm run build
npm run preview
```

### Backend consolidado

- Auth JWT com httpOnly cookies (`cf_access` 15 min + `cf_refresh` 30 dias)
- Refresh token rotation com family revocation (theft detection)
- Rate limit + brute force guard no login
- Transações por usuário com soft delete + restore
- Exportação CSV com filtros e totais
- Forecast mensal com flip detection + notificações
- Claude Haiku: `GET /ai/insight` com contexto de forecast + categorias + metas
- Saving Goals: CRUD completo + `calcMonthlyNeeded` + `getGoalsSummaryForAI`
- Billing: Stripe + trial + paywall por feature flag
- Migrations automáticas no startup com advisory lock
- `GET /health` com status de migrations

### Frontend consolidado

- Dashboard: saldo, entradas, saídas, forecast, HealthOverview, CategoryTreemap
- Transações: CRUD, filtros, busca, export CSV, ImportCsvModal (OFX/CSV/PDF)
- Metas: GoalsSection com at-risk badge + quick contribution
- Salary widget com cálculo de INSS/IRRF
- Bills summary widget
- Onboarding: WelcomeCard v2 com funil de 4 etapas
- Modo Discreto: `DiscreetModeContext` com `isDiscreetMode`/`toggleDiscreetMode`/`useMaskedCurrency`

### Placar de testes

| Suite | Testes |
|-------|--------|
| API   | 552    |
| Web   | 261    |

---

## 3. Regras técnicas do projeto

### Stack

- Web: React + Vite + **TypeScript** (`.ts`/`.tsx`) — novos arquivos devem seguir este padrão
- API: Node.js + Express + pg + Vitest + pg-mem (in-memory para testes)

### API

- Manter contratos simples e explícitos
- Não abrir novos domínios sem modelagem clara e migration isolada
- Não acoplar lógica de apresentação à regra de negócio

### Produto

Toda entrega nova deve responder a pelo menos um destes critérios:

1. aumenta clareza de decisão do usuário
2. reduz fricção operacional
3. aumenta percepção de valor real do produto

### UX

- Evitar tabs, modais e complexidade desnecessária quando seções resolvem melhor
- Acessibilidade mínima obrigatória em controles novos (`type`, `aria-*`, estados visuais coerentes)
- Mascaramento monetário: máscara textual `R$ ••••`, não blur; mantém layout estável

---

## 4. ✅ Sprint A — Perfil como Painel de Controle (mergeado em main — PR #268)

### O que foi entregue

**ProfileSettings** reestruturado em três seções:

| Seção | Conteúdo |
|---|---|
| **Dados da conta** | Nome, avatar, e-mail, método de acesso (Senha · Google), salário, dia de pagamento |
| **Preferências** | Toggle de Modo Discreto com persistência em `localStorage` |
| **Assinatura** | Trial ativo (dias restantes), trial expirado (CTA upgrade), "Acesso ativo" (fallback neutro sem inferir plano) |

**Modo Discreto:**

- `DiscreetModeContext`: `isDiscreetMode` / `toggleDiscreetMode` / `useMaskedCurrency`
- `DiscreetModeProvider` envolvendo o app em `main.tsx`
- Máscara `R$ ••••` aplicada em: cards de saldo/entradas/saídas, ForecastCard, TransactionList, BillsSummaryWidget, GoalsSection

**Regras respeitadas:**

- Nenhuma migration nova
- Nenhum endpoint novo
- `formatCurrency` puro — sem `localStorage` no formatter
- Fallback de assinatura neutro — sem prometer "Plano Pro" sem confirmação do backend

---

## 5. Sprint B — Preferências do Copiloto (próximo)

### Objetivo

Permitir que o usuário ajuste o comportamento do copiloto.

### Pré-requisito

Sprint A mergeado e em produção.

### Escopo previsto

#### Backend (1 migration)

Adicionar à tabela `user_profiles`:

```sql
ai_tone TEXT DEFAULT 'pragmatic'  -- 'pragmatic' | 'motivator' | 'sarcastic'
ai_insight_frequency TEXT DEFAULT 'always'  -- 'always' | 'risk_only'
```

`updateMyProfile` já tem o padrão de normalização — apenas adicionar as duas novas chaves.

#### Frontend

- Radio group "Tom do Especialista" na seção **Preferências** do perfil
- `ai_insight_frequency = 'risk_only'`: `AIInsightPanel` suprime o painel quando `type === "success"`
- `ai_tone` passado via request param ou carregado no contexto do fetch de `GET /ai/insight`

### O que NÃO entra no Sprint B

- Contador de uso de IA visível (precisaria de tabela dedicada + cron de janela)
- Histórico de sessões (device tracking — outra liga)
- Upload de foto (sem storage configurado)
- `plan` completo no `GET /me` (precisaria join na tabela `subscriptions`)

---

## 6. Melhorias incrementais de produto (backlog)

Estas melhorias são diretas, de baixo risco e de alto valor percebido.

### Contador de uso de IA no perfil

Exibir: `7 de 10 consultas usadas este período`

Requer:
- Tabela `ai_usage_events` ou coluna `ai_calls_count + ai_calls_reset_at` em `users`
- Endpoint `GET /me` retornando `aiUsage: { used, limit, resetsAt }`

### `plan` real no `GET /me`

Expor no perfil o status exato do plano: `free | trial | premium | past_due`

Requer:
- JOIN em `subscriptions` dentro de `getMyProfile`
- Sem mudança de schema

### Trocar senha no perfil

Botão que navega para `/app/settings/security` — rota já existe e `SecuritySettings` já tem o fluxo.

---

## 7. Roadmap de produto — próxima liga

### Simulador de Impacto ("Posso comprar isso?")

O usuário informa um valor e recebe:
- impacto no saldo projetado do mês
- impacto nas metas em andamento
- recomendação do Especialista IA

Alta percepção de valor. Reutiliza forecast existente.

### Radar de Assinaturas

Detecta padrões de gastos recorrentes nas transações e agrupa como "assinaturas".
Ajuda o usuário a identificar custos fixos invisíveis.

### Análise de Gastos por Semana

Granularidade menor no dashboard: ver quanto foi gasto em cada semana do mês.
Reusa `transactions` sem nova infra.

---

## 8. Importação Inteligente de Documentos (roadmap — não abre agora)

Se essa frente for aberta no futuro, deve nascer como **subdomínio próprio**, não como extensão de `transactions`.

### Domínios prováveis

- `credit_card_bills`
- `utility_bills`
- `income_documents` / `payroll_entries`

### Abordagem correta

1. Classificar o tipo de documento
2. Extrair texto (OCR ou parser estruturado)
3. Usar parser determinístico para formatos conhecidos (OFX, CNAB)
4. Usar LLM para normalização de campos ambíguos
5. Validar saída por schema antes de persistir

> IA sozinha não deve ser parser principal de documentos financeiros em produção.

---

## 9. Decisões arquiteturais fixadas

| Decisão | Motivo |
|---|---|
| `formatCurrency` puro, sem estado global | Testes determinísticos, sem coupling com preferências de UI |
| `useMaskedCurrency()` hook, não componente wrapper | Mínima invasão nos 17 arquivos que usam `formatCurrency` |
| `DiscreetModeContext` separado de `AuthContext` | Responsabilidade única; preferência de UI ≠ sessão de autenticação |
| Fallback de assinatura neutro ("Acesso ativo") | Sem prometer entitlement que o backend não confirmou |
| pg-mem para testes de API | Sem banco real em CI; compatível com o subset de SQL usado |
| Squash merge sempre | Histórico limpo; cherry-pick limpo quando branches divergem |

---

## 10. Frase-guia para não perder o trilho

> **O Control Finance já pensa como copiloto.**
> **Os próximos passos devem fazê-lo agir como copiloto — sem sacrificar foco, clareza e qualidade estrutural.**
