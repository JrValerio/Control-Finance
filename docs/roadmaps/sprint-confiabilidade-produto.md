# Sprint — Confiabilidade do Produto

> Documento operacional para fechar divergências entre entitlement, copy in-app, dashboard e percepção de confiança do produto.
> Esta sprint não abre monetização nova; ela prepara o produto para sustentar preço e narrativa sem pedir desculpa.

---

## 1. Objetivo

Eliminar divergências entre:

- entitlement real
- copy in-app
- dashboard
- comportamento do produto
- percepção de confiança em fluxos críticos

---

## 2. Regra de entrada

- não abrir nova frente de monetização antes desta sprint
- não subir preço com força antes de fechar esta consistência
- evitar escopo lateral fora de trust, product shell, dashboard, cards e copy

---

## 3. Regra de saída

Esta sprint só fecha quando:

- trial não promete mais do que entrega
- importação bloqueada fica autoexplicativa
- dashboard prioriza ação e risco reais
- cartões e faturas passam sensação de módulo fechado
- narrativa do app bate com o entitlement real

---

## 4. Contexto operacional

O produto evoluiu bastante no backend e nos domínios principais, mas ainda existem pontos onde:

- o backend fala uma coisa e a UI sugere outra
- o usuário não entende se o bloqueio é técnico ou de plano
- a home ainda mostra mais análise do que decisão
- o módulo de cartões ainda parece mais funcional do que consolidado

Em finanças pessoais, isso pesa mais do que em outros produtos.
O objetivo desta sprint é matar qualquer sensação de "prometeu mais do que entrega".

---

## 5. Quadro operacional

| PR | Foco | Resultado esperado |
|---|---|---|
| **PR 1** | Trust Contract | trial, paywall e bloqueios contando a mesma história |
| **PR 2** | Dashboard Trust V2 | home priorizando saldo, risco, pendências, cartões e projeção |
| **PR 3** | Cards Confidence | cartões e faturas com leitura clara de ciclo, limite e ações |
| **PR 4** | Messaging Polish | narrativa interna coerente com o produto real |

---

## 6. PR 1 — Trust Contract

**Título**
`fix(product): align trial copy with real entitlements`

### Escopo

- revisar copy em:
  - assinatura
  - perfil
  - billing
  - modal de bloqueio da importação
  - CTAs que sugerem acesso total
- remover promessa de "acesso completo" se `csv_import` continuar bloqueado no trial
- tornar o bloqueio da importação claro:
  - o que está bloqueado
  - por que está bloqueado
  - qual plano libera
- alinhar trial, paywall e billing para contarem a mesma história

### Arquivos prováveis

- [BillingSettings.tsx](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/pages/BillingSettings.tsx)
- [ProfileSettings.tsx](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/pages/ProfileSettings.tsx)
- [ImportCsvModal.jsx](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/components/ImportCsvModal.jsx)
- [billing.service.ts](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/services/billing.service.ts)
- [billing.service.js](/F:/devprojects/Control-Finance-React-TailWind/apps/api/src/services/billing.service.js)
- [entitlement.middleware.js](/F:/devprojects/Control-Finance-React-TailWind/apps/api/src/middlewares/entitlement.middleware.js)

### Impacto por tela

- `/app/settings/billing`
- `/app/settings/profile`
- modal de importação de extrato
- qualquer superfície que resuma trial ou upgrade

### Commits sugeridos

- `fix(billing): remove full-access language from trial surfaces`
- `fix(import): clarify csv import gate messaging`
- `fix(profile): align plan copy with effective entitlements`

### Critérios de aceite

- nenhuma tela promete mais do que o plano entrega
- trial e paywall não se contradizem
- bloqueio de importação é compreensível sem precisar adivinhar
- usuário entende que o problema é plano, não erro técnico

### QA

- usuário trial vê mensagens coerentes em billing, perfil e importação
- modal bloqueado não usa linguagem ambígua
- nenhuma tela sugere que trial tem tudo liberado

---

## 7. PR 2 — Dashboard Trust V2

**Título**
`feat(web): reorganize dashboard around action and risk`

### Escopo

Reorganizar a home para refletir o domínio real do produto.

### Nova prioridade visual

#### Topo

- saldo atual
- entradas
- saídas
- projeção do mês
- pendências e vencidas
- cartão e fatura

#### Bloco operacional

- contas vencidas
- próximas a vencer
- fatura pendente
- renda principal ou configuração pendente
- possíveis importações ou revisões pendentes, quando fizer sentido

#### Bloco analítico

- evolução dos últimos 6 meses
- despesas por categoria
- outros gráficos só como apoio

### Reduções

- tirar protagonismo de gráfico redundante
- remover ou rebaixar blocos que não ajudam decisão imediata
- priorizar leitura rápida da situação financeira

### Arquivos prováveis

- [App.tsx](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/pages/App.tsx)
- [BillsSummaryWidget.tsx](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/components/BillsSummaryWidget.tsx)
- [CreditCardsSummaryWidget.tsx](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/components/CreditCardsSummaryWidget.tsx)
- [ForecastCard.tsx](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/components/ForecastCard.tsx)
- [HealthOverview.tsx](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/components/HealthOverview.tsx)
- [TransactionChart.jsx](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/components/TransactionChart.jsx)
- [CategoryTreemap.jsx](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/components/CategoryTreemap.jsx)
- [TrendChart.tsx](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/components/TrendChart.tsx)

### Impacto por tela

- `/app`
- widgets do topo do dashboard
- seção analítica da home
- shell/header, caso a hierarquia visual precise de ajuste fino

### Commits sugeridos

- `feat(dashboard): prioritize balance risk and pending actions`
- `refactor(dashboard): move secondary charts below operational summary`
- `fix(dashboard): reduce redundant analytics emphasis`

### Critérios de aceite

- a home explica rapidamente:
  - saldo
  - risco imediato
  - pendências
  - cartão e fatura
  - projeção
- gráficos deixam de competir com informação acionável
- leitura do dashboard fica mais próxima de "painel de decisão" do que "painel decorativo"

### QA

- abrir `/app` com dados reais
- confirmar que pendências e cartão aparecem cedo
- confirmar que gráficos não escondem ações prioritárias
- confirmar que header e shell continuam estáveis

---

## 8. PR 3 — Cards Confidence

**Título**
`feat(cards): harden invoice status and card overview UX`

### Escopo

Fechar a experiência de cartões e faturas para parecer módulo confiável e não rascunho funcional.

### Pontos que precisam ficar explícitos

- limite total
- limite usado
- limite disponível
- fechamento
- vencimento
- fatura atual
- status da fatura
- ações de pagar e reabrir

### Direção de UX

- separar visualmente:
  - cartão
  - compras
  - fatura
  - pagamento
- deixar o status da fatura legível sem interpretação subjetiva
- melhorar hierarquia de limite e ciclo mensal

### Arquivos prováveis

- [CreditCardsPage.tsx](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/pages/CreditCardsPage.tsx)
- [credit-cards.service.ts](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/services/credit-cards.service.ts)
- [credit-cards.routes.js](/F:/devprojects/Control-Finance-React-TailWind/apps/api/src/routes/credit-cards.routes.js)
- [credit-cards.service.js](/F:/devprojects/Control-Finance-React-TailWind/apps/api/src/services/credit-cards.service.js)
- [credit-cards.test.js](/F:/devprojects/Control-Finance-React-TailWind/apps/api/src/credit-cards.test.js)
- [CreditCardsPage.test.tsx](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/pages/CreditCardsPage.test.tsx)

### Impacto por tela

- `/app/credit-cards`
- resumo de cartões no dashboard
- fluxos de pagar e reabrir fatura

### Commits sugeridos

- `feat(cards): clarify credit limit and invoice summary states`
- `fix(cards): improve invoice status and payment action hierarchy`
- `refactor(cards): separate overview purchases and invoice blocks`

### Critérios de aceite

- usuário entende o ciclo do cartão sem ambiguidade
- pagar e reabrir fica claro
- limite usado e disponível não exige leitura cuidadosa demais
- fatura pendente e paga ficam visualmente distintas

### QA

- abrir `/app/credit-cards`
- validar cartão com fatura pendente
- validar ações disponíveis
- confirmar leitura clara de limite e vencimento

---

## 9. PR 4 — Messaging Polish

**Título**
`docs(product): normalize in-app product narrative`

### Escopo

- alinhar a narrativa textual do app com o produto real
- consolidar uma proposta curta e repetível
- revisar textos de:
  - dashboard
  - billing
  - perfil
  - cartões
  - importação
  - blocos de ação principais

### Proposta-base do produto

**"Controle financeiro pessoal com cartões, pendências, fontes de renda, importação e apoio fiscal em uma experiência confiável."**

Não precisa usar essa frase literalmente em toda parte, mas tudo precisa derivar da mesma lógica.

### Arquivos prováveis

- [App.tsx](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/pages/App.tsx)
- [BillingSettings.tsx](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/pages/BillingSettings.tsx)
- [ProfileSettings.tsx](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/pages/ProfileSettings.tsx)
- [CreditCardsPage.tsx](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/pages/CreditCardsPage.tsx)
- [ImportCsvModal.jsx](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/components/ImportCsvModal.jsx)
- [TaxPage.tsx](/F:/devprojects/Control-Finance-React-TailWind/apps/web/src/pages/TaxPage.tsx)

### Impacto por tela

- `/app`
- `/app/settings/billing`
- `/app/settings/profile`
- `/app/credit-cards`
- modal de importação
- `/app/tax/:taxYear`

### Commits sugeridos

- `docs(product): normalize core in-app narrative`
- `fix(copy): align dashboard and billing messaging`
- `fix(copy): remove imaginary capabilities from product surfaces`

### Critérios de aceite

- a narrativa do app bate com o estado real do produto
- textos não vendem feature inexistente ou parcialmente fechada
- a home funciona como onboarding implícito coerente

### QA

- ler as principais telas em sequência
- verificar se a história do produto é consistente
- garantir que copy não contradiz gate, plano ou comportamento real

---

## 10. Ordem de execução

1. **PR 1 — Trust Contract**
2. **PR 2 — Dashboard Trust V2**
3. **PR 3 — Cards Confidence**
4. **PR 4 — Messaging Polish**

Essa ordem está certa porque:

- primeiro elimina mentira
- depois melhora a leitura da casa
- depois fecha o módulo de cartão
- por fim faz o polimento narrativo em cima de base já coerente

### Atualização da trilha Home Operacional (A->D)

Leitura consolidada da execução incremental em PRs empilhados:

- `#402`: estrutura da home
- `#403`: protagonismo dos cards críticos
- `#404`: semântica e severidade (incluindo `SalaryWidget.tsx`)
- `#405`: ação operacional por severidade

Ajuste incremental posterior no `#405`:

- commit isolado `d4a288e`
- mensagem: `polish(web): allow actionable empty state in salary widget`
- efeito: `SalaryWidget.tsx` passa a aparecer no `#405` por acréscimo controlado, sem contradizer a trilha histórica

Validação local do ajuste incremental:

- typecheck: ok
- `SalaryWidget.test.tsx`: `35/35`

Status de aterrissagem em `main` (2026-04-01):

- `#402` merged em `main`
- `#403` merged em `main`
- `#404` merged em `main`
- `#405` merged em `main` com head `d4a288e`

Nota operacional:

- Durante o merge train, o `#403` foi fechado automaticamente ao deletar a branch-base do `#402`; a esteira foi recuperada com restauração da base, reabertura do PR e retarget para `main`, sem perda de trilha lógica.

---

## 11. Riscos a evitar

- transformar PR 2 em redesign grande demais
- misturar monetização nova com correção de copy
- abrir importação ou fatura completa agora se isso puxar parser e domínio além do recorte
- mexer em entitlement sem decisão consciente de produto

---

## 12. Métricas qualitativas desta sprint

Ao final, o produto deve passar esta impressão:

- "eu entendo o que meu plano inclui"
- "sei o que está bloqueado e por quê"
- "a home me mostra o que importa"
- "cartões e faturas parecem confiáveis"
- "o app fala a verdade sobre o que faz"

---

## 13. Decisão de preço depois da sprint

Depois disso, a base fica saudável para sustentar:

- **mensal:** R$ 19,90
- **anual:** R$ 197,00 a R$ 199,00
- **fundador / early adopter:** R$ 9,90 como promoção, não como âncora oficial

Leitura de produto:

- primeiro confiança
- depois pressão comercial

Em finanças pessoais, inverter isso é pedir para o usuário desconfiar logo no onboarding.

---

## 14. Veredito

Essa sprint existe para fechar a distância entre:

- o que o backend realmente entrega
- o que a UI comunica
- o que o usuário entende

Ela separa "produto promissor" de "produto que já pode cobrar sem pedir desculpa".
