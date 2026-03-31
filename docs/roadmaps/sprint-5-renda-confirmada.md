# Sprint 5 - Renda Confirmada Ponta a Ponta

> Documento operacional para executar a Sprint 5 com foco em verdade financeira: renda reconhecida corretamente no dominio, no agregado mensal e na projecao.

Status: concluida em 31/03/2026.

---

## 0. Entregas executadas

### PRs da Sprint 5

1. PR #355 - S5.1 (testes de semantica e guard rails)
2. PR #356 - S5.2 (integridade backend no vinculo de extrato)
3. PR #357 - S5.3 (status explicito de renda confirmada no frontend)
4. PR #358 - S5.4 (hardening final e fechamento executivo)

### Evidencia de validacao final (S5.4)

- API lint: `npm -w apps/api run lint`
- API testes direcionados: `npm -w apps/api run test -- src/forecast.test.js src/income-sources.test.js src/transactions.test.js`
- Web lint: `npm -w apps/web run lint`
- Web typecheck: `npm -w apps/web run typecheck`
- Web testes direcionados: `npm -w apps/web run test:run -- src/pages/IncomeSourcesPage.test.tsx src/services/auth.service.test.ts`

Todos os comandos acima concluiram com sucesso.

---

## 1. Objetivo

Fechar o ciclo completo de renda confirmada para os cenarios de pensao/INSS:

- documento reconhecido
- entidade correta
- agregado mensal correto
- projecao correta
- sem sumir
- sem duplicar

---

## 2. Escopo

### Em escopo

- Regras deterministicas de classificacao/confirmacao para renda documental relevante.
- Persistencia e reconciliacao sem criar dupla contagem.
- Consumo consistente por:
  - resumo mensal
  - forecast/projecao
  - superficies de renda no frontend
- Cobertura de testes para evitar regressao de semantica.

### Fora de escopo

- Redesign amplo de dashboard.
- Novos modulos de cartao/conta corrente/bills (Sprint 6+).
- Mudancas fiscais da Central do Leao fora do necessario para o caso de renda confirmada.

---

## 3. Contrato funcional de aceite

A Sprint 5 so fecha quando, para o mesmo usuario e mesmo mes de referencia:

1. Documento validado gera renda em entidade correta (source/statement).
2. Agregado mensal inclui somente o que esta confirmado.
3. Forecast usa a renda confirmada sem inflar nem omitir valor.
4. Nenhum fluxo gera renda duplicada entre importacao e reconciliacao manual.
5. Nenhum fluxo "some" com renda confirmada apos refresh/recompute.

---

## 4. Mapa tecnico inicial

### Backend

- apps/api/src/services/forecast.service.js
- apps/api/src/services/transactions.service.js
- apps/api/src/domain/imports/document-classifier.js
- apps/api/src/forecast.test.js

### Frontend

- apps/web/src/pages/IncomeSourcesPage.tsx
- apps/web/src/components/IncomeStatementModal.tsx
- apps/web/src/services/transactions.service.ts

---

## 5. Plano de execucao em slices

### Slice S5.1 - Testes de semantica e guard rails

- Adicionar/ajustar cenarios de teste para:
  - renda confirmada entra no forecast
  - renda nao confirmada nao entra como confirmada
  - sem dupla contagem no mesmo mes
- Resultado esperado: baseline de seguranca para evolucao.

### Slice S5.2 - Consolidacao backend de renda confirmada

- Ajustar regras e queries de renda confirmada para manter semantica unica.
- Garantir coerencia entre servico de forecast e resumo mensal.
- Resultado esperado: API com comportamento deterministico.

### Slice S5.3 - Consumo consistente no frontend

- Alinhar exibicao e estado de renda em telas/modais relevantes.
- Garantir que usuario veja status coerente (confirmada, pendente, conciliada).
- Resultado esperado: mesma verdade no backend e na UI.

### Slice S5.4 - Hardening e smoke final

- Rodar lint, typecheck e suites direcionadas.
- Validar cenarios de regressao de sumir/duplicar renda.
- Resultado esperado: PR final da Sprint 5 pronto para merge com CI verde.

---

## 6. Dependencias e riscos

- Pendencias manuais externas continuam rastreadas: prova visual do PR #348 e E2E real de OAuth.
- Mudancas de semantica devem respeitar o contrato em docs/architecture/v1.6.12-financial-semantics-contract.md.
- Evitar acoplamento com backlog de Sprint 6+ durante a Sprint 5.

---

## 7. Definition of Done da Sprint 5

- Criterios funcionais da secao 3 cumpridos.
- CI do PR da Sprint 5 fechado em verde.
- Evidencia de testes anexada no corpo do PR.
- Atualizacao do roadmap executivo movendo Sprint 5 para concluida e Sprint 6 para proximo alvo.
