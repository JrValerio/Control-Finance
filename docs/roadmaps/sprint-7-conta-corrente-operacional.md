# Sprint 7 - Conta Corrente Operacional (Saldo, Limite e Risco)

> Documento operacional para executar a Sprint 7 com foco em tornar conta corrente um modulo confiavel de operacao diaria, com leitura clara de saldo, uso de limite e risco real.

Status: concluida em 31/03/2026.

---

## 0. Entregas executadas

### PRs da Sprint 7

1. PR #364 - kickoff documental da sprint
2. PR #365 - S7.1 (fonte de verdade operacional para limite no forecast)
3. PR #366 - S7.2 (leitura operacional de risco no frontend)
4. PR #367 - S7.3 (guard rails de risco no insight de conta)
5. PR final S7.4 (este PR) - hardening e fechamento executivo

### Evidencia de validacao final (S7.4)

- Lint monorepo: `npm run lint`
- Typecheck web: `npm run typecheck`
- API testes direcionados: `npm -w apps/api run test -- src/forecast.test.js src/ai.test.js`
- Web testes direcionados: `npm -w apps/web run test:run -- src/components/BankAccountsWidget.test.tsx src/components/ForecastCard.test.tsx`

Todos os comandos acima concluiram com sucesso.

---

## 1. Objetivo

Consolidar conta corrente como dominio operacional na Fase 2:

- leitura consistente de saldo real e limite por conta
- risco de uso de limite sem ambiguidade entre API, dashboard e insights
- fluxo confiavel de cadastro, edicao e exclusao de contas
- base pronta para acoplamento seguro com Sprint 8 (cartao/fatura), sem misturar escopo agora

---

## 2. Escopo

### Em escopo

- Fortalecer contrato de `bank_accounts` como fonte operacional de saldo e limite.
- Alinhar resumo de conta corrente e sinal de risco entre `bank-accounts`, `forecast` e `ai`.
- Melhorar consistencia de UX na leitura de posicao real e uso de limite.
- Cobrir cenarios criticos com testes direcionados de API e Web.

### Fora de escopo

- Reabrir semantica da Sprint 6.
- Expandir dominio de cartao/ciclo de fatura (Sprint 8).
- Redesign amplo de dashboard fora do necessario para conta corrente operacional.
- Mudancas fiscais da Central do Leao fora do recorte desta sprint.

---

## 3. Contrato funcional de aceite

A Sprint 7 so fecha quando:

1. Conta corrente apresenta saldo, limite total, limite usado e limite disponivel com semantica unica.
2. Sinal de risco de limite e coerente entre API, widgets e painel de projecao.
3. Operacoes de criar/editar/excluir conta funcionam com validacoes e mensagens operacionais claras.
4. Nao ha dupla contagem ou conflito de leitura entre configuracao legada de limite e contas bancarias.
5. API e UI mantem leitura coerente do estado operacional sem ambiguidades.

---

## 4. Mapa tecnico inicial

### Backend

- apps/api/src/services/bank-accounts.service.js
- apps/api/src/routes/bank-accounts.routes.js
- apps/api/src/services/forecast.service.js
- apps/api/src/services/ai.service.js
- apps/api/src/forecast.test.js
- apps/api/src/ai.test.js

### Frontend

- apps/web/src/components/BankAccountsWidget.tsx
- apps/web/src/services/bank-accounts.service.ts
- apps/web/src/components/ForecastCard.tsx
- apps/web/src/pages/ProfileSettings.tsx
- apps/web/src/services/forecast.service.ts

---

## 5. Plano de execucao em slices

### Slice S7.1 - Contrato operacional de conta corrente

- Definir e reforcar fonte de verdade para saldo/limite por conta.
- Tratar convivencia com sinal legado de limite sem quebrar compatibilidade.
- Resultado esperado: contrato semantico unico para conta corrente.

### Slice S7.2 - Leitura operacional no frontend

- Ajustar superficies de conta corrente e projecao para mensagem consistente de risco.
- Tornar status de uso de limite evidente para tomada de decisao.
- Resultado esperado: UX de conta corrente confiavel e acionavel.

### Slice S7.3 - Guard rails e consistencia de risco

- Cobrir cenarios de borda (limite em uso, limite esgotado, sem limite, saldo positivo).
- Garantir coerencia entre calculo de risco em forecast e insight de IA.
- Resultado esperado: sem divergencia entre servicos e widgets.

### Slice S7.4 - Hardening, smoke e fechamento executivo

- Rodar lint, typecheck e suites direcionadas.
- Atualizar roadmap para status de conclusao quando criterios forem cumpridos.
- Resultado esperado: PR final da Sprint 7 pronto para merge com CI verde.

---

## 6. Dependencias e riscos

- Pendencias manuais externas continuam rastreadas (PR #348 visual e OAuth E2E).
- Mudancas devem respeitar contrato semantico de `docs/architecture/v1.6.12-financial-semantics-contract.md`.
- Evitar acoplamento com Sprint 8 durante a Sprint 7.

---

## 7. Definition of Done da Sprint 7

- Criterios funcionais da secao 3 cumpridos.
- CI dos PRs da Sprint 7 fechado em verde.
- Evidencias de testes e smoke anexadas nos PRs.
- Roadmap executivo atualizado movendo Sprint 7 para concluida e Sprint 8 para proximo alvo.
