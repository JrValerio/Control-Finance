# Sprint 6 - Guard Rails Operacionais e Ingestao Documental Util

> Documento operacional para executar a Sprint 6 com foco em transformar importacao documental em dados financeiros operacionais, com trilha segura de revisao e rollback.

Status: concluida em 31/03/2026.

---

## 0. Entregas executadas

### PRs da Sprint 6

1. PR #359 - kickoff documental da sprint
2. PR #360 - S6.1 (guard rails de operacao documental)
3. PR #361 - S6.2 (parser prioritario e normalizacao util)
4. PR #362 - S6.3 (bills como entidade operacional)
5. PR final S6.4 (este PR) - hardening e fechamento executivo

### Evidencia de validacao final (S6.4)

- Lint monorepo: `npm run lint`
- Typecheck web: `npm run typecheck`
- API testes direcionados: `npm -w apps/api run test -- src/import.test.js src/income-sources.test.js src/bills.test.js src/reconciliation.test.js src/utility-bills-panel.test.js`
- Web testes direcionados: `npm -w apps/web run test:run -- src/pages/BillsPage.test.tsx src/pages/IncomeSourcesPage.test.tsx src/components/ImportCsvModal.test.jsx`

Todos os comandos acima concluiram com sucesso.

---

## 1. Objetivo

Fechar a base operacional da Fase 2 para ingestao documental confiavel:

- guard rails de operacao antes de persistir efeitos financeiros
- parser/document pipeline orientado a utilidade de negocio
- bills estruturadas como entidade operacional
- rastreabilidade e reversibilidade seguras

---

## 2. Escopo

### Em escopo

- Validacoes operacionais no fluxo de importacao/confirmacao.
- Evolucao de parser e normalizacao para casos prioritarios (INSS e utilidades).
- Fortalecimento de modelagem de `bill` com buckets de status operacional.
- Regras de conciliacao para evitar sumico/duplicidade de efeitos.
- Cobertura de testes direcionados para confiabilidade operacional.

### Fora de escopo

- Reabertura de semantica da Sprint 4 e Sprint 5.
- Redesign amplo de dashboard.
- Expansao de cartao/ciclo alem do necessario para integridade documental.
- Entregas da Central do Leao fora do recorte operacional da Sprint 6.

---

## 3. Contrato funcional de aceite

A Sprint 6 so fecha quando:

1. Documento importado relevante vira entidade de negocio correta (`income_statement` ou `bill`) com campos minimos consistentes.
2. Nenhum efeito financeiro operacional e aplicado sem trilha auditavel e possibilidade de reversao segura.
3. Bills ficam operacionais com bucket explicito (`vencida`, `a vencer`, `futura`) e sem confundir com transacao liquidada.
4. Conciliacao evita duplicidade de efeito entre documento, transacao e obrigacao.
5. API e UI mantem leitura coerente do estado operacional sem ambiguidades.

---

## 4. Mapa tecnico inicial

### Backend

- apps/api/src/services/transactions-import.service.js
- apps/api/src/services/bills.service.js
- apps/api/src/services/income-sources.service.js
- apps/api/src/domain/imports/document-classifier.js
- apps/api/src/import.test.js

### Frontend

- apps/web/src/pages/BillsPage.tsx
- apps/web/src/pages/IncomeSourcesPage.tsx
- apps/web/src/components/ImportCsvModal.jsx

---

## 5. Plano de execucao em slices

### Slice S6.1 - Guard rails de operacao documental

- Validacoes e bloqueios antes de confirmar efeitos financeiros.
- Mensagens de erro/revisao focadas em acao operacional.
- Resultado esperado: fluxo seguro por padrao.

### Slice S6.2 - Parser prioritario e normalizacao util

- Cobrir casos prioritarios INSS/utilidades com extracao consistente.
- Normalizar campos essenciais para uso operacional.
- Resultado esperado: ingestao que gera entidades uteis, nao texto solto.

### Slice S6.3 - Bills como entidade operacional

- Consolidar campos e buckets operacionais.
- Evitar mistura entre pendencia e caixa liquidado.
- Resultado esperado: pendencias confiaveis no dominio.

### Slice S6.4 - Hardening, smoke e fechamento executivo

- Rodar lint, typecheck e suites direcionadas.
- Atualizar roadmap para status de conclusao quando os criterios forem cumpridos.
- Resultado esperado: PR final da Sprint 6 pronto para merge com CI verde.

---

## 6. Dependencias e riscos

- Pendencias manuais externas continuam rastreadas (PR #348 visual e OAuth E2E).
- Mudancas devem respeitar contrato semantico de `docs/architecture/v1.6.12-financial-semantics-contract.md`.
- Evitar acoplamento com Sprint 7 durante a Sprint 6.

---

## 7. Definition of Done da Sprint 6

- Criterios funcionais da secao 3 cumpridos.
- CI dos PRs da Sprint 6 fechado em verde.
- Evidencias de testes e smoke anexadas nos PRs.
- Roadmap executivo atualizado movendo Sprint 6 para concluida e Sprint 7 para proximo alvo.
