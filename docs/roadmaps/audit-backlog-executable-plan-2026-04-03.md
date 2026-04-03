# Audit Backlog - Plano Executavel (2026-04-03)

## Objetivo

Converter o backlog de auditoria tecnica em trilha de execucao objetiva, com governanca de entrega:

- 1 issue = 1 PR
- escopo cirurgico por item
- checks verdes antes de merge
- main sempre sincronizada e limpa

Fonte:

- `tmp/control_finance_audit_backlog.extracted.txt`

## Estado atual conhecido

- Sequencia 1.1 a 2.4 finalizada no trilho de PR unica.
- PRs recentes do bloco documental: #450, #451, #452, #453.
- `AUD-014` esta parcialmente adiantado (contratos semanticos e trilha documental evoluidos), mas ainda requer fechamento formal FE+BE compartilhado com bloqueio de inferencia local fora do payload canonico.

## Regra operacional obrigatoria por issue

1. Criar branch dedicada.
2. Implementar apenas o escopo do item AUD.
3. Rodar validacao local minima (lint + testes focados da area alterada).
4. Commit unico com mensagem padrao.
5. Abrir PR unica.
6. Aguardar checks verdes.
7. Merge squash.
8. Sincronizar `main` e limpar branch.

## Regras complementares incorporadas

- `AUD-003` vira gate de fatiamento: a PR principal cobre contrato/politica/adapter; cutover de runtime/storage entra somente se couber no slice. Se nao couber, abrir `AUD-003B` como nova issue.
- `AUD-005` e gate binario de produto/contrato: ou suporte comprovado com parser+corpus+teste, ou bloqueio explicito de promessa (sem meio-termo).
- `AUD-011` passa a ter dependencia recomendada de `AUD-009` para o bloco documental do smoke integrado.

## Sequenciamento executivo

- Fase 1: AUD-001 a AUD-004
- Fase 2: AUD-005 a AUD-014
- Fase 3: AUD-015 a AUD-022

## Plano de execucao por issue

| Ordem | AUD | Prio | Owner primario | Branch sugerida | Commit sugerido | Dependencia direta | Rollback / reversao | Criterio verificavel (contrato/teste/observabilidade/UX) |
|---|---|---|---|---|---|---|---|---|
| 1 | AUD-001 - matriz real de suporte documental | P0 | api + web + product | `feat/aud-001-support-matrix-product-truth` | `feat(audit): formalize real document support matrix and product truth guardrails` | nenhuma | reverter matriz/copy para baseline anterior | contrato de suporte versionado; testes de classificacao basica; metrica de nao suportado; UX explicita suportado/restrito/nao suportado |
| 2 | AUD-002 - hard fail de JWT | P0 | security + api | `feat/aud-002-jwt-hard-fail` | `fix(security): enforce mandatory strong jwt secret at startup` | nenhuma | rollback controlado por env guard em staging, sem fallback inseguro em prod | contrato de bootstrap de seguranca; teste de falha de boot; log de configuracao invalida; UX erro tecnico claro |
| 3 | AUD-003 - storage sensivel hardening (fase A obrigatoria, fase B condicional) | P0 | platform + security + api | `feat/aud-003-sensitive-document-storage-hardening` | `feat(security): harden sensitive document storage lifecycle and access policy` | AUD-002 recomendado | fase A reversivel por adapter flag; fase B somente com plano de rollback e cutover reversivel; se crescer abrir `AUD-003B` | contrato de storage/politica; testes de leitura/escrita/delete via adapter; metrica de acesso/retencao; UX sem degradar upload atual |
| 4 | AUD-004 - minimizar persistencia sensivel | P0 | security + api | `feat/aud-004-sensitive-data-minimization` | `fix(security): minimize sensitive raw excerpt persistence in document metadata` | AUD-003 recomendado | rollback por feature flag de redacao e migracao nao destrutiva | contrato de campos permitidos; testes de mascaramento/redacao; metrica de payload redigido; UX sem perda de informacao essencial |
| 5 | AUD-005 - boleto generico decisao binaria | P0 | product + api + web | `feat/aud-005-boleto-generic-support-decision` | `feat(audit): enforce binary gate for generic boleto support decision` | AUD-001 | rollback para estado anterior de copy/contrato com gate unico | gate binario: ou parser+corpus+teste, ou bloqueio explicito em contrato+UX; metrica de decisao; UX sem meio-termo |
| 6 | AUD-006 - fatura cartao multiemissor | P0 | api | `feat/aud-006-credit-invoice-issuer-strategy` | `feat(import): add issuer-aware invoice parsing confidence and review fallback` | AUD-005 recomendado | rollback para parser single-issuer com flags desligadas | contrato issuer/confidence/needsReview; testes com emissores alvo; metrica por emissor; UX de revisao quando ambigua |
| 7 | AUD-007 - OCR e PDF escaneado confiavel | P0 | api + platform | `feat/aud-007-ocr-scanned-pdf-runtime` | `feat(import): add reliable scanned-pdf processing status and failure transparency` | AUD-006 recomendado | rollback para modo sem OCR pesado com status explicito | contrato de status OCR; testes de falha e timeout; metrica de OCR usage/fail; UX de status e motivo |
| 8 | AUD-008 - confidence e confirmacao ambigua | P1 | api + web | `feat/aud-008-ambiguity-confidence-confirmation` | `feat(semantics): enforce confidence score and manual confirmation for ambiguous classification` | AUD-006, AUD-007 | rollback por limiar de confidence configuravel | contrato de confidence/reason codes; testes de limiar; metrica auto-accept vs manual; UX de confirmacao obrigatoria |
| 9 | AUD-009 - corpus real e golden tests | P1 | quality + api | `feat/aud-009-document-corpus-golden-tests` | `test(import): add anonymized real-document corpus with golden extraction suites` | AUD-006 recomendado | rollback por suite opcional em staging ate estabilizar | contrato de fixtures versionadas; golden tests em CI; metrica de regressao de parser; UX indiretamente protegida via qualidade |
| 10 | AUD-010 - limpeza de superficie FE/BE | P1 | api + web | `feat/aud-010-fe-be-contract-surface-cleanup` | `refactor(api): classify and prune unused public contract surface` | nenhuma | rollback por restaure de endpoints deprecados via alias curto | contrato com owner/status por endpoint; testes de compatibilidade; metrica de endpoint deprecated; UX sem quebra de fluxo ativo |
| 11 | AUD-011 - smoke integrado em CI | P1 | platform + quality | `feat/aud-011-integrated-ci-smoke` | `ci(integration): add runtime smoke suite for critical finance journeys` | AUD-010 + AUD-009 recomendado (bloco documental) | rollback por job opcional em paralelo ate estabilizar runtime | contrato de jornada critica; smoke tests integrados; metrica de taxa de falha por jornada; UX protegida por bloqueio de merge |
| 12 | AUD-012 - baseline hardening HTTP | P1 | security + platform | `feat/aud-012-http-hardening-baseline` | `feat(security): enforce http hardening baseline for sensitive workloads` | AUD-002 | rollback por profile de headers por ambiente | contrato de headers/cors/cookies; testes de headers; metrica de violacao de policy; UX sem bloquear navegacao legitima |
| 13 | AUD-013 - observabilidade financeira documental | P1 | observability + api | `feat/aud-013-financial-document-observability` | `feat(observability): add document parsing integrity and financial mutation metrics` | AUD-011 recomendado | rollback por dashboards/alerts versionados | contrato de eventos metricos; testes de instrumentacao; alertas e dashboards ativos; UX com mensagens rastreaveis |
| 14 | AUD-014 - enforcement semantico FE/BE | P1 | api + web | `feat/aud-014-semantic-contract-enforcement` | `feat(semantics): enforce canonical financial semantics across api web and dashboard` | parcial adiantado; depende de fechamento de gaps | rollback por fallback temporario somente em staging | contrato semantico canonico consumido por FE/BE; testes de verdade minima; metrica de drift; UX sem inferencia local fora do payload |
| 15 | AUD-015 - quebra de hotspots | P1 | api + web | `refactor/aud-015-hotspot-modularization` | `refactor(core): split hotspot files into bounded feature modules` | AUD-010 recomendado | rollback por refactor incremental em commits pequenos | contrato publico preservado; testes regressivos verdes; metrica de churn por arquivo; UX sem alteracao funcional |
| 16 | AUD-016 - dominio explicito de regras criticas | P2 | api | `refactor/aud-016-financial-domain-consolidation` | `refactor(domain): consolidate sensitive financial rules into canonical domain modules` | AUD-015 | rollback por manter facade nos services antigos | contrato de dominio explicito; testes de invariantes; metrica de divergencia de regra; UX sem mudanca perceptivel |
| 17 | AUD-017 - schemas/enums compartilhados | P2 | api + web | `feat/aud-017-shared-contract-schemas` | `feat(contracts): generate shared schemas and enums for api and web` | AUD-014, AUD-016 | rollback por pacote compartilhado versionado com compat mode | contrato unico compartilhado; testes de build quebrando drift; metrica de mismatch; UX consistente entre telas |
| 18 | AUD-018 - fila para importacao pesada | P2 | platform + api | `feat/aud-018-async-import-runtime` | `feat(import): move heavy document processing to async queue with retries` | AUD-007, AUD-011 | rollback para sync com limite/timeout controlado | contrato de status/retry; testes de job lifecycle; metrica de fila p95/p99; UX com acompanhamento de estado |
| 19 | AUD-019 - politica de retencao e delecao | P2 | security + platform | `feat/aud-019-sensitive-data-retention-policy` | `feat(governance): enforce sensitive data retention deletion and masking policy` | AUD-003, AUD-004 | rollback por politica versionada e janelas de grace | contrato de lifecycle de dados; testes de retencao/delecao; metrica de conformidade; UX de exclusao/export verificavel |
| 20 | AUD-020 - runbooks de incidente documental | P2 | operations + observability | `docs/aud-020-document-incidents-runbooks` | `docs(ops): add incident runbooks for document import and semantic regression` | AUD-013 | rollback nao aplicavel (docs versionadas) | contrato operacional de incidente; teste de drill (tabletop); metrica MTTR por incidente; UX impacto mitigado por resposta rapida |
| 21 | AUD-021 - carga e latencia por fluxo | P2 | performance + observability | `perf/aud-021-load-latency-baseline` | `perf(ops): establish load and latency baseline for critical financial flows` | AUD-018 recomendado | rollback por thresholds progressivos | contrato de baseline p95/p99; testes de carga reproduziveis; alertas de regressao; UX de latencia dentro do alvo |
| 22 | AUD-022 - reducao JS+TS por risco | P2 | web | `refactor/aud-022-risk-driven-ts-adoption` | `refactor(web): reduce js-ts coexistence on high-risk contract surfaces` | AUD-017, AUD-015 | rollback por migracao incremental com adapters | contrato tipado nas superficies de risco; testes de tipo/build; metrica de cobertura TS; UX sem regressao funcional |

## Gate de saida por fase

### Fase 1

- Nenhum fallback inseguro ativo para autenticacao.
- Nenhuma persistencia sensivel sem justificativa operacional.
- Matriz de suporte documental publicada e refletida na experiencia.

### Fase 2

- Fluxos criticos com smoke integrado no CI.
- Contrato FE/BE auditavel e sem drift silencioso.
- Observabilidade cobre parsing/importacao/mutacoes financeiras sensiveis.

### Fase 3

- Runtime pesado assicrono para importacao/OCR.
- Dominio e contratos compartilhados com fonte unica de verdade.
- Runbooks e baseline de performance operacionais e testaveis.

## Proximo passo executavel imediato

Abrir a issue/PR da AUD-001 para formalizar a matriz real de suporte documental e alinhar a verdade de produto antes de ampliar promessa funcional.
