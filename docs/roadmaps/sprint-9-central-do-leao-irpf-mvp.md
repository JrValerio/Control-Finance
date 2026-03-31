# Sprint 9 - Central do Leao (IRPF MVP)

> Documento operacional para executar a Sprint 9 com foco em consolidar a Central do Leao como modulo fiscal confiavel, auditavel e acionavel no fluxo real do usuario.

Status: iniciada em 31/03/2026.

---

## 1. Objetivo

Concluir o ciclo MVP da Central do Leao na Fase 3 com foco operacional:

- reforcar confiabilidade de ingestao, revisao e resumo anual
- garantir leitura fiscal clara de obrigatoriedade e pendencias
- preservar rastreabilidade fim a fim entre documento, fato e resumo
- manter export oficial estavel (JSON/CSV) sem recalculo implicito

---

## 2. Escopo

### Em escopo

- Fortalecer consistencia entre `tax_documents`, `tax_facts`, `tax_reviews` e `tax_summaries`.
- Refinar guard rails de review e rebuild de resumo anual.
- Melhorar leitura operacional no frontend de `/app/tax` para pendencias e decisao.
- Cobrir cenarios criticos com testes direcionados de API e Web.

### Fora de escopo

- Transmissao oficial DIRPF.
- Integracao com pre-preenchida oficial da Receita no MVP.
- Expansao de dominios nao fiscais durante a sprint.
- Iniciar frentes da Sprint 10 antes do fechamento da Sprint 9.

---

## 3. Contrato funcional de aceite

A Sprint 9 so fecha quando:

1. Pipeline documental fiscal mantem trilha auditavel sem lacunas de estado.
2. Revisao de fatos reflete corretamente em obrigatoriedade e resumo anual.
3. Rebuild e export oficial permanecem deterministas e sem efeitos ocultos.
4. UI fiscal deixa pendencias e proximos passos explicitos para o usuario.
5. API e UI mantem semantica fiscal unica para tax year e exercise year.

---

## 4. Mapa tecnico inicial

### Backend

- apps/api/src/routes/tax.routes.js
- apps/api/src/services/tax-documents.service.js
- apps/api/src/services/tax-extraction.service.js
- apps/api/src/services/tax-reviews.service.js
- apps/api/src/services/tax-obligation.service.js
- apps/api/src/services/tax-summary.service.js
- apps/api/src/services/tax-export.service.js
- apps/api/src/tax.test.js

### Frontend

- apps/web/src/pages/TaxPage.tsx
- apps/web/src/services/tax.service.ts
- apps/web/src/components/TaxUploadModal.tsx
- apps/web/src/components/TaxManualFactModal.tsx
- apps/web/src/pages/TaxPage.test.tsx

---

## 5. Plano de execucao em slices

### Slice S9.1 - Contrato fiscal anual e bootstrap

- Revisar consistencia entre regra anual, obrigatoriedade e bootstrap.
- Endurecer cenarios de ano/exercicio e ownership fiscal.
- Resultado esperado: contrato anual fiscal deterministico.

### Slice S9.2 - Guard rails de revisao e resumo

- Reforcar trilha de revisao e impacto no resumo anual.
- Cobrir bordas de pending/approved/corrected e warnings operacionais.
- Resultado esperado: resumo fiscal confiavel e auditavel.

### Slice S9.3 - Export e lifecycle documental

- Fortalecer consistencia de export (JSON/CSV) e lifecycle de documentos.
- Cobrir bordas de reprocess/delete sem quebrar rastreabilidade.
- Resultado esperado: dossie oficial estavel ponta a ponta.

### Slice S9.4 - Hardening, smoke e fechamento executivo

- Rodar lint, typecheck e suites direcionadas.
- Atualizar roadmap para status de conclusao quando criterios forem cumpridos.
- Resultado esperado: PR final da Sprint 9 pronto para merge com CI verde.

---

## 6. Dependencias e riscos

- Pendencias manuais externas continuam rastreadas (PR #348 visual e OAuth E2E).
- Mudancas devem respeitar guard rails fiscais da arquitetura v1.31.0.
- Evitar acoplamento com Sprint 10 durante a Sprint 9.

---

## 7. Definition of Done da Sprint 9

- Criterios funcionais da secao 3 cumpridos.
- CI dos PRs da Sprint 9 fechado em verde.
- Evidencias de testes e smoke anexadas nos PRs.
- Roadmap executivo atualizado movendo Sprint 9 para concluida e Sprint 10 para proximo alvo.
