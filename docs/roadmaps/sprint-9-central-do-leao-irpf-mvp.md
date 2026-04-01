# Sprint 9 - Central do Leao (IRPF MVP)

> Documento operacional para executar a Sprint 9 com foco em consolidar a Central do Leao como modulo fiscal confiavel, auditavel e acionavel no fluxo real do usuario.

Status: em andamento; S9.1, S9.2, S9.3 e S9.4 oficializadas na main em 31/03/2026.

---

## 0. Entregas executadas ate agora

### PRs ja executados na Sprint 9

1. PR #374 - kickoff documental da sprint
2. PR #375 - S9.1 (contrato fiscal anual e bootstrap)
3. PR #376 - docs de escopo UX fiscal
4. PR #377 - S9.2 backend (preview pos-review + guard rail taxYear)
5. PR #378 - frontend pendente oficializado (S9.2 frontend + S9.3 + S9.4)

### Resultado consolidado da S9.1

- Contrato anual fiscal unificado entre bootstrap e summary.
- Bootstrap fiscal expondo `supportedTaxYears` a partir dos anos seedados.
- Summary fiscal alinhando `exerciseYear` e `calendarYear` via configuracao ativa de regras.
- Regressao de API para retorno `404` quando nao ha regras fiscais ativas para o exercicio.
- Validacao local: `npm -w apps/api run test -- src/tax.test.js` (54 testes verdes) e `npm -w apps/api run lint`.

### Resultado consolidado da S9.2, S9.3 e S9.4

- S9.2 backend oficializada no PR #377 com `preview` em review/bulk-review, `taxYear` no retorno de lote e guard rail para impedir aprovacao em lote com exercicios diferentes.
- S9.2 frontend oficializada no PR #378 com consumo de `preview` na TaxPage sem recarga obrigatoria do snapshot.
- S9.3 oficializada no PR #378 com resumo da declaracao em tela, comparacao de regimes e painel operacional de pendencias.
- S9.4 oficializada no PR #378 com modo imprimivel/PDF, botao dedicado de impressao e ajuste de layout para saida limpa.
- Validacoes registradas no ciclo de oficializacao: backend (`src/tax.test.js` com 55 testes verdes) e frontend (`TaxPage.test.tsx` com 22 testes verdes + typecheck).

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
- Subfrente explicita: UX fiscal + espelhamento frontend do dominio fiscal.
- Preview fiscal estruturado antes de confirmacoes finais.
- Resumo da declaracao em tela com leitura conferivel por bloco fiscal.
- Modo imprimivel e PDF de conferencia para revisao e arquivo pessoal.

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
6. Resumo do IRPF funciona como superficie real de conferencia antes da decisao final.

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
- Status: concluida (PR #375).

### Slice S9.2 - Guard rails de revisao + preview fiscal estruturado

- Reforcar trilha de revisao e impacto no resumo anual.
- Cobrir bordas de pending/approved/corrected, conflitos e warnings operacionais.
- Tornar preview fiscal estruturado antes da confirmacao final.
- Resultado esperado: revisao guiada e previsivel para conferencia.
- Status: concluida (PR #377 backend + PR #378 frontend).

### Slice S9.3 - Resumo da declaracao em tela

- Consolidar blocos fiscais principais em leitura conferivel e acionavel.
- Tornar comparacao de regimes explicita (deducoes legais x simplificado).
- Resultado esperado: resumo anual confiavel e compreensivel para decisao.
- Status: concluida (PR #378).

### Slice S9.4 - Modo imprimivel/PDF + fechamento executivo

- Fortalecer consistencia de export (JSON/CSV) e modo de conferencia imprimivel.
- Entregar PDF de conferencia com rastreabilidade clara.
- Rodar lint, typecheck e suites direcionadas.
- Atualizar roadmap para status de conclusao quando criterios forem cumpridos.
- Resultado esperado: PR final da Sprint 9 pronto para merge com CI verde.
- Status: concluida (PR #378).

### Slice S9.5 - Fechamento operacional do IRPF MVP

- Consolidar o fluxo fim a fim com checklist objetivo de prontidao (ingestao -> revisao -> resumo -> export -> conferencia).
- Endurecer evidencias operacionais de smoke para cenarios criticos do MVP fiscal.
- Artefatos iniciais publicados: `scripts/smoke-tax-irpf-mvp.ps1` e `docs/runbooks/s9-5-smoke-irpf-mvp.md`.
- Resultado esperado: frente IRPF MVP com pendencias explicitamente residualizadas e sem lacunas de rastreabilidade.
- Status: em andamento (slice iniciado em 01/04/2026).

### Slice S9.6 - Gate formal de encerramento da Sprint 9

- Executar o gate de saida da sprint e registrar decisao executiva de encerramento.
- Atualizar roadmap executivo movendo Sprint 9 para concluida quando todos os criterios forem satisfeitos.
- Resultado esperado: Sprint 9 encerrada formalmente com evidencias remotas e documentais.
- Status: pendente (slice de fechamento).

### Trilha transversal da sprint

- Copy semantica correta por tipo documental no modulo fiscal.
- Ajustes de layout para modulos fiscais/operacionais densos.

---

## 6. Dependencias e riscos

- Pendencias manuais externas continuam rastreadas (PR #348 visual e OAuth E2E).
- Mudancas devem respeitar guard rails fiscais da arquitetura v1.31.0.
- Evitar acoplamento com Sprint 10 durante a Sprint 9.

---

## 7. Definition of Done da Sprint 9

### DoD especifico do resumo do IRPF

O resumo deve apresentar minimamente:

- Cabecalho: exercicio, ano-calendario, CPF do titular, status da revisao e ultima atualizacao.
- Blocos principais: rendimentos tributaveis, isentos/nao tributaveis, tributacao exclusiva, IR retido, bens relevantes, dividas relevantes, deducoes e pendencias.
- Comparacao de regimes: deducoes legais x simplificado com indicacao explicita de melhor cenario para conferencia (sem decisao invisivel).
- Painel de pendencias: itens sem documento, com conflito, duplicados e aguardando revisao humana.
- Saidas: visualizacao em tela, versao imprimivel, export "dados para declarar" e PDF de conferencia.

### DoD geral da Sprint 9

- Criterios funcionais da secao 3 cumpridos.
- CI dos PRs da Sprint 9 fechado em verde.
- Evidencias de testes e smoke anexadas nos PRs.
- Roadmap executivo atualizado movendo Sprint 9 para concluida e Sprint 10 para proximo alvo.

### Gate formal de encerramento (criterios objetivos)

1. Fluxo fiscal MVP validado ponta a ponta em smoke controlado: ingestao, revisao, resumo, export e conferencia.
2. Semantica fiscal anual consistente em API e UI para `taxYear`, `exerciseYear` e `calendarYear` sem regressao aberta.
3. Export oficial `JSON/CSV` e modo imprimivel/PDF conferidos com rastreabilidade explicita para revisao humana.
4. Todos os PRs de fechamento da Sprint 9 com CI verde e mergeados na `main`.
5. Roadmap executivo e operacional atualizados com decisao de encerramento e abertura da proxima frente ativa.
