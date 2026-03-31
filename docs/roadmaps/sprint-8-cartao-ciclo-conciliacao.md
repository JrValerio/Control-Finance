# Sprint 8 - Cartao, Ciclo de Fatura e Conciliacao

> Documento operacional para executar a Sprint 8 com foco em tornar o dominio de cartao totalmente confiavel no ciclo de fatura, no caixa e na conciliacao com pendencias.

Status: concluida em 31/03/2026.

---

## 0. Entregas executadas

### PRs da Sprint 8

1. PR #369 - kickoff documental da sprint
2. PR #370 - S8.1 (fechamento de ciclo deterministico em meses curtos)
3. PR #371 - S8.2 (leitura operacional no frontend de cartao)
4. PR #372 - S8.3 (guard rails de conciliacao invoice-bill)
5. PR final S8.4 (este PR) - hardening e fechamento executivo

### Evidencia de validacao final (S8.4)

- Lint monorepo: `npm run lint`
- Typecheck web: `npm -w apps/web run typecheck`
- API testes direcionados: `npm -w apps/api run test -- src/credit-cards.test.js src/credit-card-invoices.test.js`
- Web testes direcionados: `npm -w apps/web run test:run -- src/pages/CreditCardsPage.test.tsx src/components/CreditCardsSummaryWidget.test.tsx`

Todos os comandos acima concluiram com sucesso.

---

## 1. Objetivo

Fechar o modulo de cartao como operacao financeira real na Fase 2:

- consolidar semantica unica para compra aberta, fatura pendente e fatura paga
- garantir fechamento/reabertura de ciclo sem efeitos duplicados no caixa
- reforcar conciliacao entre fatura, bill e movimentos derivados
- manter API e UI com leitura operacional clara de limite, ciclo e risco

---

## 2. Escopo

### Em escopo

- Fortalecer regras de ciclo de fatura (close/reopen) e seus guard rails.
- Consolidar uso de `credit_card_invoice` como entidade operacional no fluxo de bills.
- Melhorar leitura de cartao no frontend para ciclo, limite e pendencias.
- Cobrir cenarios criticos de conciliacao com testes direcionados de API e Web.

### Fora de escopo

- Reabrir semantica da Sprint 7.
- Expandir funcionalidades fiscais da Central do Leao.
- Redesign amplo de dashboard fora do necessario para cartao/ciclo.
- Novas frentes estrategicas da Fase 3 durante a Sprint 8.

---

## 3. Contrato funcional de aceite

A Sprint 8 so fecha quando:

1. Compra em cartao nao vira saida de caixa imediata antes da fatura.
2. Fatura pendente vira obrigacao operacional explicita e auditavel.
3. Pagamento de fatura liquida obrigacao sem duplicar efeito financeiro.
4. Fechamento/reabertura de fatura respeita guard rails e ownership do usuario.
5. API e UI mantem leitura coerente de limite, ciclo e status sem ambiguidades.

---

## 4. Mapa tecnico inicial

### Backend

- apps/api/src/services/credit-cards.service.js
- apps/api/src/services/credit-card-invoices.service.js
- apps/api/src/routes/credit-cards.routes.js
- apps/api/src/services/bills.service.js
- apps/api/src/credit-cards.test.js
- apps/api/src/credit-card-invoices.test.js

### Frontend

- apps/web/src/pages/CreditCardsPage.tsx
- apps/web/src/pages/CreditCardsPage.test.tsx
- apps/web/src/components/CreditCardsSummaryWidget.tsx
- apps/web/src/components/CreditCardsSummaryWidget.test.tsx
- apps/web/src/components/CreditCardPurchaseModal.tsx
- apps/web/src/services/credit-cards.service.ts

---

## 5. Plano de execucao em slices

### Slice S8.1 - Contrato de ciclo e fatura

- Revisar regras de fechamento/reabertura e consistencia de status de fatura.
- Endurecer cenarios de ownership e conflito de ciclo.
- Resultado esperado: ciclo deterministico e sem efeitos ambiguos.

### Slice S8.2 - Leitura operacional no frontend de cartao

- Tornar status de ciclo, limite e pendencias mais explicitos.
- Alinhar resumo de cartao com leitura de decisao operacional.
- Resultado esperado: UX de cartao confiavel e acionavel.

### Slice S8.3 - Guard rails de conciliacao

- Reforcar vinculo entre invoice, bill e compras abertas.
- Cobrir bordas de duplicidade/sumico no fluxo de conciliacao.
- Resultado esperado: conciliacao segura ponta a ponta.

### Slice S8.4 - Hardening, smoke e fechamento executivo

- Rodar lint, typecheck e suites direcionadas.
- Atualizar roadmap para status de conclusao quando criterios forem cumpridos.
- Resultado esperado: PR final da Sprint 8 pronto para merge com CI verde.

---

## 6. Dependencias e riscos

- Pendencias manuais externas continuam rastreadas (PR #348 visual e OAuth E2E).
- Mudancas devem respeitar contrato semantico de `docs/architecture/v1.6.12-financial-semantics-contract.md`.
- Evitar acoplamento com Sprint 9 durante a Sprint 8.

---

## 7. Definition of Done da Sprint 8

- Criterios funcionais da secao 3 cumpridos.
- CI dos PRs da Sprint 8 fechado em verde.
- Evidencias de testes e smoke anexadas nos PRs.
- Roadmap executivo atualizado movendo Sprint 8 para concluida e Sprint 9 para proximo alvo.
