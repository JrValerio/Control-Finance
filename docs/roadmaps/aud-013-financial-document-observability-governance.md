# AUD-013 - Observabilidade financeira documental (Governanca de Slice)

Fonte oficial de sequenciamento: docs/roadmaps/audit-backlog-executable-plan-2026-04-03.md.

## Objetivo da fatia

Adicionar observabilidade minima para parsing documental e mutacoes financeiras sensiveis, com contrato explicito de eventos/metricas e sinalizacao operacional de regressao.

## Dependencia recomendada

- AUD-011: primeiro gate integrado de jornada critica ja concluido.

## Contrato herdado (nao regredir)

- AUD-012: baseline minimo de hardening HTTP ja fechado; esta fatia nao reabre hardening.
- AUD-011: smoke critico integrado ja fechado; esta fatia nao expande suite smoke ampla.
- AUD-007/AUD-008/AUD-009: sem reabertura de OCR/ambiguidade/corpus.

## Escopo que entra

- Definir contrato minimo de eventos/metricas para parsing documental e mutacoes financeiras sensiveis no recorte.
- Adicionar instrumentacao minima no backend para emitir os sinais definidos.
- Adicionar teste(s) de instrumentacao para impedir regressao silenciosa do contrato.
- Publicar evidencias operacionais minimas (dashboard/alerta) no recorte da fatia.

## Escopo que nao entra

- Reforma ampla de observabilidade da aplicacao inteira.
- Mudancas funcionais de negocio fora do recorte de observabilidade.
- Reabertura de hardening HTTP, smoke amplo/e2e, parser/OCR/ambiguidade/corpus.

## Rollback

- Reversao unica da fatia.
- Rollback por dashboards/alerts versionados, conforme plano executavel.

## Criterios verificaveis minimos

- Contrato de eventos/metricas do recorte documentado e implementado.
- Teste de instrumentacao falha quando houver regressao no sinal esperado.
- Evidencia operacional do recorte disponivel (dashboard/alerta ou equivalente documentado).
- Mudancas restritas a AUD-013, sem acoplamento indevido com outras fatias.