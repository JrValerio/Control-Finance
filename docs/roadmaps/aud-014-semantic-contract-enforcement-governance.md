# AUD-014 - Enforcement semântico FE/BE (Governança de Slice)

Fonte oficial de sequenciamento: docs/roadmaps/audit-backlog-executable-plan-2026-04-03.md (ordem 14).

## Objetivo da fatia

Fechar formalmente o enforcement do contrato semântico canônico entre API e Web no recorte mínimo, impedindo inferência local fora do payload canônico.

## Dependências e contratos herdados

- AUD-013 fechada como contrato mínimo de observabilidade documental/financeira.
- AUD-010 e AUD-011 fechadas no trilho de contrato/smoke.
- AUD-012 fechada no trilho de baseline de hardening HTTP.

## Escopo que entra

- Formalizar contrato semântico canônico consumido por FE e BE no recorte mínimo.
- Eliminar inferência local fora do payload canônico nos pontos cobertos pela fatia.
- Adicionar teste(s) de verdade mínima para garantir consistência FE/BE.
- Adicionar métrica de drift semântico no recorte mínimo (se aplicável sem ampliar escopo).

## Recorte operacional desta fatia

- Endpoint do recorte: `GET /dashboard/snapshot`.
- Consumo FE do recorte: `OperationalSummaryPanel` + `buildDashboardContractView`.
- Shape canônico mínimo no recorte:
	- `semanticCore` (source of truth para renda, posição atual e projeção).
	- `semanticSourceMap` (mapeamento explícito dos campos canônicos deste endpoint).

- Campos derivados que o FE não pode recalcular fora do contrato:
	- `saldo projetado` a partir de `forecast` legado sem passar por `semanticCore`.
	- `renda confirmada/prevista` fora dos grupos `semanticCore.realized` e `semanticCore.projection`.
- Comportamento de falha no drift:
	- se `semanticCore` divergir do payload legado mapeado por `semanticSourceMap`, a montagem do contrato no FE falha explicitamente.

## Escopo que nao entra

- Refactor estrutural amplo de dominio.
- Reabertura de observabilidade global.
- Reabertura de labels/pontos de instrumentação/papel de artifact já fechados na AUD-013.
- Expansão de contrato para superfícies não cobertas pela fatia.

## Critérios verificáveis mínimos

- Contrato canônico explícito para o recorte da fatia.
- FE e BE consumindo o mesmo payload canônico no recorte.
- Teste de regressão quebra quando houver inferência local fora do contrato.
- Evidência mínima de drift/consistência no CI da fatia.

## Check dedicado desta fatia

- Check visível: `semantic-contract-enforcement-dashboard`.
- Gate de sucesso/falha: testes dedicados do recorte (API + Web).
- Artifact: `semantic-contract-enforcement-dashboard-log` (somente evidência diagnóstica).

## Rollback

- Reversão única da fatia, preservando contratos fechados anteriormente.
- Fallback temporario somente em staging, conforme plano executavel da AUD-014.

- Rollback exato da integração:
	- remover script `test:semantic:dashboard` de `apps/api/package.json`.
	- remover script `test:semantic:dashboard` de `apps/web/package.json`.
	- remover job `semantic-contract-enforcement-dashboard` de `.github/workflows/ci.yml`.
