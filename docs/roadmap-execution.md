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
- prepara o IRPF com a Central do Leão sem depender da Receita no MVP
- prepara o terreno para automações mais inteligentes sem inflar escopo cedo demais

### Regra central

> **Dar acabamento premium à inteligência que já existe antes de adicionar mais camadas.**

---

## 2. Estado atual confirmado (v1.31.0)

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
- Central do Leão:
  - `/tax` com upload, classificação, extração, normalização e review queue
  - regras anuais de IRPF, obrigatoriedade e resumo snapshotado
  - lifecycle documental com retry/delete
  - export oficial do dossiê em `JSON` e `CSV`
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
- Central do Leão em `/app/tax`:
  - upload e reprocessamento de documentos fiscais
  - review queue de fatos fiscais
  - rebuild do resumo por exercício
  - export oficial via backend

### Placar de testes

| Suite | Testes |
|-------|--------|
| API   | 695    |
| Web   | 291    |

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

## 5. ✅ Sprint B — Preferências do Copiloto (mergeado em main — PR #269)

### O que foi entregue

**Migration 031** — `ai_tone` e `ai_insight_frequency` em `user_profiles`.

| Campo | Tipo | Default | Valores válidos |
|---|---|---|---|
| `ai_tone` | TEXT NOT NULL | `'pragmatic'` | `pragmatic` · `motivator` · `sarcastic` |
| `ai_insight_frequency` | TEXT NOT NULL | `'always'` | `always` · `risk_only` |

**Backend:**
- `normalizeAiTone` e `normalizeAiInsightFrequency` — validação de enum com 400 explícito
- `rowToProfile` inclui os dois campos com fallback defensivo (valor inválido no banco → default)
- `GET /me` retorna `aiTone` e `aiInsightFrequency` dentro de `profile`
- `PATCH /me/profile` persiste os dois campos na allowlist (bug silencioso prevenido)
- `ai.service`: `SYSTEM_PROMPTS` por tom + early exit quando `risk_only + success` (0 tokens gastos)

**Frontend (`ProfileSettings.tsx`):**
- Seção **Preferências** ganha dois radio groups: Tom do Especialista IA + Frequência do insight
- Preferências salvas inline no onChange via `PATCH /me/profile` (sem botão extra)
- Carregadas do backend no mount; fallback local para `pragmatic` / `always`

**Regras respeitadas:**
- Persistência via backend — sobrevive troca de dispositivo (não é `localStorage`)
- Valor inválido no banco nunca quebra a UI
- `risk_only` suprime o painel **e** o call à Anthropic (sem custo de token em forecast positivo)

---

## 6. Marco entregue depois da Sprint B — Central do Leão (mergeado em main — PR #290)

### O que foi entregue

**IRPF MVP** como subdomínio próprio, sem contaminar `transactions`.

**Backend**
- schema fiscal próprio com migrations `100` a `105`
- pipeline documental: upload -> classificação -> extração -> normalização -> revisão -> summary -> export
- review queue com trilha em `tax_reviews`
- obrigatoriedade e resumo anual calculados a partir de fatos revisados
- lifecycle documental com deleção lógica completa e cleanup físico `best effort`
- export oficial do dossiê fiscal em `JSON` e `CSV`

**Frontend**
- rota protegida `/app/tax` com navegação pelo dashboard
- dashboard da Central do Leão com warnings, resumo e fila de revisão
- modal de upload fiscal com reprocessamento automático
- retry/delete por documento com rebuild de snapshot
- download oficial do dossiê pelo backend
- runbook operacional do batch legado em `docs/runbooks/tax-legacy-reprocess.md`

### Guardrails fixados

- não transmitir DIRPF no MVP
- não depender de API da Receita
- export nunca recalcula snapshot escondido
- CSV = fatos revisados; JSON = dossiê completo

---

## 7. Melhorias incrementais de produto (backlog)

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

## 8. Roadmap de produto — próxima liga

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

## 9. Importação Inteligente de Documentos fora da trilha fiscal (entregue no MVP)

> Observação: a trilha fiscal IRPF abriu seu subdomínio próprio em `/tax`.
> Em paralelo, a frente de importação inteligente evoluiu o app financeiro principal sem misturar os dois domínios.

### Estado atual

**Importação inteligente de renda e extratos** já foi entregue em `main` no recorte MVP.

PRs mergeados:

1. `#298` dedupe entre comprovante de renda e extrato bancário
2. `#299` documento importado pode compor renda estruturada
3. `#300` sugestão confirmável para perfil e planejamento
4. `#301` preview com busca e filtros para extratos grandes
5. `#302` categorização em lote + regras reaproveitáveis
6. `#303` guard rails operacionais e histórico auditável de imports
7. `#304` limite bancário / cheque especial
8. `#305` cartão + ciclo inicial de fatura
9. `#309` conciliação explícita entre renda documental e crédito bancário
10. `#310` parcelamento simples no cartão
11. `#311` bridge documental para holerite/CLT
12. `#312` polish e performance do preview grande
13. `#313` undo com cascata segura para derivados

Documentos de referência:

- `docs/roadmaps/importacao-inteligente-renda-extratos.md`
- `docs/audits/importacao-inteligente-mvp-auditoria-final.md`
- `docs/roadmaps/importacao-inteligente-pos-mvp-backlog.md`

Leitura correta do estado:

- fundação do épico: entregue
- guard rails do MVP: entregues
- limite bancário: entregue
- cartão e fatura: entregues no recorte inicial
- follow-ups pós-MVP já entregues: reconciliação explícita, parcelamento simples, bridge de holerite/CLT, polish grande de preview e undo seguro
- gaps atuais: evolução de cartão para casos mais ricos, expansão documental além de INSS/CLT e UX mais explícita de reconciliação

Essa frente não deve voltar para o backlog como “fundação pendente”.
Os próximos passos devem nascer como **follow-ups pós-MVP**, não como repetição da trilha já mergeada.

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

## 10. Decisões arquiteturais fixadas

| Decisão | Motivo |
|---|---|
| `formatCurrency` puro, sem estado global | Testes determinísticos, sem coupling com preferências de UI |
| `useMaskedCurrency()` hook, não componente wrapper | Mínima invasão nos 17 arquivos que usam `formatCurrency` |
| `DiscreetModeContext` separado de `AuthContext` | Responsabilidade única; preferência de UI ≠ sessão de autenticação |
| Fallback de assinatura neutro ("Acesso ativo") | Sem prometer entitlement que o backend não confirmou |
| pg-mem para testes de API | Sem banco real em CI; compatível com o subset de SQL usado |
| Preferir merges lineares (rebase/ff) em stacks | Preserva slices encadeados e reduz merge bubble em épicos longos |

---

## 10.1 Próximo ciclo operacional — Sprint de Confiabilidade do Produto

O próximo ciclo recomendado não é abrir monetização nova.
É fechar qualquer divergência entre:

- entitlement real
- copy in-app
- dashboard
- comportamento do produto
- percepção de confiança em fluxos críticos

Documento operacional:

- `docs/roadmaps/sprint-confiabilidade-produto.md`

Direção da sprint:

1. alinhar trial, billing e bloqueios de importação ao entitlement real
2. reorganizar a home como painel de ação e risco, não como painel decorativo
3. consolidar a UX de cartões e faturas
4. normalizar a narrativa textual do app para que o produto fale a verdade sobre si mesmo

Regra de produto:

> **Em finanças pessoais, clareza vem antes de ambição.**

Essa frente deve fechar antes de qualquer reposicionamento forte de preço ou de novas promessas comerciais.

---

## 10.2 Fechamento operacional por fases e sprints (status executivo)

Data de atualização: 31/03/2026.

Legenda de status:

- ✅ realizado
- 🟡 em andamento
- ⚪ próximo
- 🔵 futuro estratégico

### Fase 0 - Fundação e estabilização

| Sprint | Foco | Evidências | Status |
|---|---|---|---|
| Sprint 1 | Contenção da home e redução de fan-out | PR #347 | ✅ |
| Sprint 2 | Isolamento de falha por widget + contrato semântico + visão do mês realizado-only | PR #348, PR #349, PR #350 | ✅ |
| Sprint 3 | Estabilização de auth Google OAuth + integridade da main | PR #351, PR #352, PR #353 | ✅ |

### Fase 1 - Precisão financeira core

| Sprint | Foco | Escopo de fechamento | Status |
|---|---|---|---|
| Sprint 4 | Forecast semantics (projeção confiável) | saldo real como base, obrigações futuras sem abatimento duplo, trilha de home/auth estabilizada e CI verde em main | ✅ |
| Sprint 5 | Renda confirmada ponta a ponta (pensão/INSS) | documento -> entidade -> agregado mensal -> projeção sem sumir/duplicar | ✅ |

### Fase 2 - Operação financeira real

| Sprint | Foco | Status |
|---|---|---|
| Sprint 6 | Guard rails operacionais + parsers prioritários de documentos | ✅ |
| Sprint 7 | Conta corrente operacional (saldo/limite/risco) | ✅ |
| Sprint 8 | Cartão, ciclo de fatura e conciliação | 🟡 |

### Fase 3 - Expansão estratégica

| Sprint | Foco | Status |
|---|---|---|
| Sprint 9 | Central do Leão (IRPF MVP) | 🔵 |
| Sprint 10 | IA operacional por camadas | 🔵 |
| Sprint 11 | Copiloto contextual ampliado | 🔵 |

### Decisão executiva atual

- Sprint 4 fechada.
- Sprint 5 concluida.
- Sprint 6 concluida.
- Sprint 7 concluida.
- Sprint 8 iniciada.
- Documento operacional da Sprint 6: `docs/roadmaps/sprint-6-guard-rails-documentais.md`.
- Documento operacional da Sprint 7: `docs/roadmaps/sprint-7-conta-corrente-operacional.md`.
- Documento operacional da Sprint 8: `docs/roadmaps/sprint-8-cartao-ciclo-conciliacao.md`.
- Documento operacional da Sprint 5: `docs/roadmaps/sprint-5-renda-confirmada.md`.
- Evidencias da Sprint 5: PR #355, PR #356, PR #357, PR #358.
- Evidencias da Sprint 6: PR #359, PR #360, PR #361, PR #362.
- Evidencias da Sprint 7: PR #364, PR #365, PR #366, PR #367.
- Pendências manuais continuam rastreadas fora de CI (prova visual do PR #348 e validação E2E real do OAuth).

---

## 11. Frase-guia para não perder o trilho

> **O Control Finance já pensa como copiloto.**
> **Os próximos passos devem fazê-lo agir como copiloto — sem sacrificar foco, clareza e qualidade estrutural.**

---

## 12. Visão de produto — O Copiloto da Vida Real

O Control Finance tem potencial de ser o app financeiro mais útil para a maioria dos brasileiros:
trabalhadores com renda mensal entre R$ 2.000 e R$ 8.000, que vivem o fluxo de caixa mês a mês,
não têm assessor financeiro, e precisam de clareza — não de palestra.

### O usuário real

- Recebe salário todo dia 5 ou todo dia 15
- Tem conta bancária, talvez cartão de crédito, talvez rotativo
- Paga boletos no prazo (quando lembra)
- Não tem "investimentos" — tem uma TED para poupança quando sobra
- Sente o dinheiro acabar antes do fim do mês e não sabe exatamente por quê
- Não quer um app que o julgue; quer um app que o ajude

### O que diferencia este produto

- **Proativo, não reativo**: avisa antes do problema, não depois
- **Sem julgamento**: linguagem de parceiro, não de banco
- **Contextual**: entende o calendário brasileiro (payday, 13°, FGTS, INSS, IPVA, IPTU)
- **Útil sem esforço**: o valor cresce com uso mínimo — não exige planilhas

---

## 13. Regra de Ouro de UX — Modo Sem Humilhação

> **Nunca fazer o usuário se sentir burro, pobre ou irresponsável.**

O app lida com dinheiro — o assunto mais carregado emocionalmente na vida da maioria das pessoas.
Copywriting errado quebra a relação com o produto.

### O que NÃO escrever

| ❌ Tom errado | ✅ Tom correto |
|---|---|
| "Você gastou demais este mês" | "O mês tá mais apertado que o planejado" |
| "Sua saúde financeira está crítica" | "Atenção: o saldo pode zerar antes do dia 30" |
| "Você ainda não atingiu sua meta" | "Faltam R$ 120 para a meta. Você consegue" |
| "Sem assinatura, você perde acesso" | "Quer continuar com o copiloto completo?" |
| "Plano gratuito limitado" | "Você está no trial — aproveite" |

### Princípios

1. **Parceiro, não juiz** — o app está do lado do usuário, não avaliando ele
2. **Concreto, não vago** — "R$ 312 a menos que semana passada" > "gastos aumentaram"
3. **Ação, não culpa** — toda mensagem negativa termina com o que o usuário pode fazer
4. **Humor contextual** — tom leve quando situação permite; sério quando o risco é real
5. **Celebrar o pequeno** — guardar R$ 50 é uma vitória real para muita gente

---

## 14. Backlog estratégico — Faixa 1: Sobrevivência e Controle de Dano

Features que evitam que o usuário "se afogue" no mês. Alto impacto emocional, baixo esforço técnico.

### 13.1 Modo Sobrevivência

Ativado automaticamente quando `projeção do mês < 10% do salário` (ou quando o usuário ativa manualmente).

No modo sobrevivência:
- Dashboard simplifica: mostra só saldo atual, dias até o pagamento, e quanto pode gastar por dia
- Fórmula exibida: `(saldo atual) ÷ (dias restantes) = R$ X/dia`
- Especialista IA muda tom: foco em cortes imediatos, não em metas de longo prazo
- Notificação diária opcional: "Hoje: R$ 43 disponíveis"

Requer: nenhuma migration nova — usa forecast existente + novo threshold no frontend.

### 13.2 Detector de Semanas Perigosas

Analisa o histórico de transações e detecta padrões de semanas pesadas (ex: semana do boleto do aluguel, semana do cartão).

Exibe no dashboard: "Semana de 20 a 26 costuma ser pesada para você — R$ 800 em média."

Requer: query de agregação sobre `transactions` por semana do mês; sem nova tabela.

### 13.3 Reserva Anti-Aperto

Meta especial: "fundo de emergência mínimo" — valor equivalente a N dias de gasto médio.

Diferente das metas normais (Saving Goals):
- Meta é dinâmica (recalcula conforme gasto médio muda)
- Não tem prazo — é um nível mínimo permanente
- Badge "Reserva protegida" / "Reserva em risco" no dashboard

Requer: novo tipo de meta ou campo especial em `user_goals`.

### 13.4 Calendário de Pressão Financeira

Vista mensal que pinta os dias com base na pressão esperada:
- Vermelho: dia de vencimento de boleto / fatura de cartão
- Amarelo: semana historicamente pesada
- Verde: dias tranquilos

Permite o usuário ver, de relance, onde o mês vai apertar.

Requer: cruzamento de `bills` (vencimentos) + histórico de `transactions` por dia da semana do mês.

### 13.5 Alertas de Conta Esquecida

Detecta contas cadastradas em `bills` com vencimento nos próximos 3 dias sem pagamento registrado.

Notificação: "Conta de luz vence em 2 dias — R$ 89. Já pagou?"
Ação rápida: marcar como paga direto da notificação.

Requer: lógica de comparação entre `bills.due_date` e ausência de transação correspondente.

### 13.6 Gastos Domésticos Essenciais (Botijão, Remédios, Escola)

Categoria especial "Essenciais recorrentes" para gastos que não são mensais mas são certos:
- Botijão de gás (a cada 30–45 dias, ~R$ 120)
- Remédios de uso contínuo (mensal, valor fixo)
- Material escolar (anual, mas previsível)
- IPVA / IPTU (anual, parcelável)

O app detecta esses gastos no histórico e os projeta automaticamente no forecast.

Requer: tag/flag especial em categorias ou novo campo `recurrence_type` em `transactions`.

### 13.7 Planejamento Familiar e Escolar

Módulo de eventos financeiros de ciclo anual:
- Janeiro/Fevereiro: material escolar + matrícula
- Março: IPVA
- Junho/Julho: férias escolares
- Novembro/Dezembro: 13° salário + presentes de Natal

O usuário marca os eventos relevantes para ele e o copiloto os inclui no forecast anual.

Requer: tabela `financial_calendar_events` com tipo, mês, valor estimado.

---

## 15. Backlog estratégico — Faixa 2: Otimização de Fluxo de Caixa

Features que melhoram como o dinheiro flui — sem exigir disciplina extra do usuário.

### 14.1 Missão Escapar de Dívida Cara

Para usuários com cartão rotativo ou empréstimo pessoal:

1. Usuário cadastra a dívida (valor, juros mensais, parcelas)
2. App calcula o custo real da dívida (quanto vai pagar no total)
3. Compara com cenário de quitar antecipado
4. Propõe um plano: "Se guardar R$ 150/mês, quita em 4 meses e economiza R$ 380"

Formato de missão (gamificação leve): progresso visual, celebração ao atingir marcos.

Requer: nova tabela `debts` com campos de amortização; cálculo de juros compostos.

### 14.2 Radar de Assinaturas

Detecta automaticamente gastos recorrentes no histórico de transações e os agrupa:
- Netflix, Spotify, Amazon Prime
- Academia, plano de saúde
- Software, serviços digitais

Exibe painel: "Você tem R$ 320/mês em assinaturas. Qual você realmente usa?"
Botão: "Marcar como cancelada" (não bloqueia a transação; só marca no radar).

Requer: algoritmo de detecção de recorrência sobre `transactions` (mesmo descritor + intervalo regular).

### 14.3 Análise de Gastos por Semana

Granularidade menor no dashboard: ver quanto foi gasto em cada semana do mês.

Útil para entender onde o dinheiro vai — muitos usuários percebem padrões semanais que não viam no mensal.

Requer: query de agregação por semana do mês sobre `transactions`; sem nova infra.

### 14.4 Simulador de Impacto — "Posso comprar isso?"

Usuário informa um valor e recebe:
- Impacto no saldo projetado do mês
- Impacto nas metas em andamento
- Recomendação do Especialista IA ("Pode, mas vai ficar apertado na semana de 20 a 26")

Alta percepção de valor. Reutiliza forecast existente + `GET /ai/insight` com prompt especializado.

Requer: endpoint de simulação ou lógica client-side com re-cálculo do forecast.

### 14.5 Comparativo Mês a Mês

Gráfico de barras simples: gastos por categoria nos últimos 3 meses.
Destaque automático: "Alimentação subiu 23% em relação ao mês passado."

Requer: query agregada sobre `transactions` por categoria + mês; sem nova tabela.

### 14.6 Análise do 13° Salário

Quando usuário cadastra recebimento do 13° (ou o app detecta pela data + valor):
- Simula impacto nas metas se X% for destinado a elas
- Sugere quitação da dívida cara com o 13°
- Alerta sobre gastos de dezembro que costumam consumir o 13° antes do Natal

Requer: detecção de sazonalidade + prompt especializado para IA.

---

## 16. Backlog estratégico — Faixa 3: Inteligência Avançada

Features que transformam dados em decisões. Requerem mais dados acumulados para funcionar bem.

### 15.1 Especialista IA com Memória de Contexto

O Especialista hoje responde com contexto do mês atual.
Com memória:
- Compara com comportamento histórico do próprio usuário
- Identifica padrões de vários meses ("Você sempre estoura em março — é IPVA?")
- Ajusta tom conforme progresso do usuário ao longo do tempo

Requer: histórico de insights salvo por usuário; contexto ampliado no prompt.

### 15.2 Tom Personalizado do Especialista IA

Configuração na seção Preferências (Sprint B):
- **Pragmático** (padrão): direto, objetivo, sem enrolação
- **Motivador**: celebra progresso, enquadra problemas como desafios superáveis
- **Sarcástico**: humor ácido para quem prefere esse estilo ("Parabéns, mais um mês sem economizar nada")

Implementação: campo `ai_tone` em `user_profiles` + variação de system prompt.

### 15.3 Frequência do Especialista IA

Configuração na seção Preferências (Sprint B):
- **Sempre** (padrão): insight toda vez que o usuário abre o dashboard
- **Só quando há risco**: suprime insights de tipo `success`; exibe só `warning` e `info`

Implementação: campo `ai_insight_frequency` em `user_profiles` + filtro no `AIInsightPanel`.

### 15.4 Score de Saúde Financeira Pessoal

Número de 0 a 100 calculado a partir de:
- Razão despesas/renda
- Regularidade de poupança
- Cobertura da reserva de emergência
- Controle de dívidas

Não é comparativo com outras pessoas — é histórico pessoal.
Exibido no HealthOverview como número + tendência (↑ melhorando / ↓ piorando).

### 15.5 Previsão de Fim de Dinheiro

Não apenas "saldo projetado no fim do mês" — mas "em qual dia o saldo vai zerar (se o padrão continuar)".

Exibido como: "No ritmo atual, o saldo zera por volta do dia 22."
Com destaque quando a data é menos de 5 dias à frente.

Requer: refinamento do forecast engine com projeção diária.

### 15.6 Modo Conversa com o Especialista (Chat Financeiro)

Interface de chat livre com o Especialista IA.
Usuário pode perguntar: "Quanto gastei com alimentação nos últimos 3 meses?" ou "O que aconteceu de errado em fevereiro?"

O Especialista responde com dados reais do usuário — não respostas genéricas.

Requer: contexto enriquecido (transações + metas + forecast) + interface de chat; uso significativo de tokens.

---

## 17. Decisões de não fazer (e por quê)

| Feature | Por que não agora |
|---|---|
| App mobile (iOS/Android) | Web responsiva cobre 80% do uso; mobile nativo antes de tração é risco de escopo |
| Open Finance / Pix automático | Requer certificação regulatória (BACEN) — fora do alcance de produto solo |
| Planilha de orçamento anual | Usuário-alvo não tem hábito de planejar 12 meses; fecha o app sem usar |
| Chatbot de atendimento | Confunde com Especialista IA; duas personas de IA = confusão |
| Integração com bancos por scraping | Frágil, contra ToS dos bancos, risco legal |
| Gamificação pesada (pontos, badges, ranking) | Distrai da função; usuários financeiramente estressados não querem jogar |

---

## 18. Notas de produto para não esquecer

- **Payday é sagrado**: tudo no produto orbita em torno do dia de pagamento do usuário. Forecast, metas, alertas — tudo usa `payday` como âncora.
- **O mês do usuário não é o mês do calendário**: se o usuário recebe dia 15, o "mês financeiro" dele é de 15 a 14.
- **Renda irregular é a realidade de muitos**: autônomos, freelancers, comissionados. O forecast precisa lidar com isso sem quebrar.
- **Cartão de crédito = buraco negro para muitos usuários**: a fatura fecha em uma data, vence em outra, e o gasto já foi feito semanas antes. Tratamento correto do cartão é feature de alta percepção de valor.
- **Silêncio é melhor que dado errado**: se o app não tem dados suficientes para um insight, não inventa um. Melhor não mostrar nada do que mostrar algo impreciso.
