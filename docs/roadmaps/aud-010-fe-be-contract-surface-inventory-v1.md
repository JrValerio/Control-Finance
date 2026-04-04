# AUD-010 - Inventario de superficie FE/BE v1 (recorte importacao)

Fonte: docs/roadmaps/aud-010-fe-be-contract-surface-cleanup-governance.md.

## Recorte

Superficie publica ativa do bloco de importacao de transacoes.

## Inventario minimo

| Endpoint/contrato | Owner | Consumidor conhecido | Status | Acao proposta | Evidencia tecnica |
| --- | --- | --- | --- | --- | --- |
| `GET /transactions/imports` | `api: routes/transactions + import services` | `web: transactions.service.fetchImportSessions` | `ativo` | manter | consumo no FE em `apps/web/src/services/transactions.service.ts` (`api.get("/transactions/imports")`) |
| `POST /transactions/import/dry-run` | `api: routes/transactions + import pipeline` | `web: transactions.service.dryRunImport` | `ativo` | manter | consumo no FE em `apps/web/src/services/transactions.service.ts` (`api.post("/transactions/import/dry-run")`) |
| `POST /transactions/import/commit` | `api: routes/transactions + import pipeline` | `web: transactions.service.commitImport` | `ativo` | manter | consumo no FE em `apps/web/src/services/transactions.service.ts` (`api.post("/transactions/import/commit")`) |
| `GET /transactions/import/rules` | `api: routes/transactions + import rules` | `web: transactions.service.fetchImportRules` | `ativo` | manter | consumo no FE em `apps/web/src/services/transactions.service.ts` (`api.get("/transactions/import/rules")`) |
| `POST /transactions/import/rules` | `api: routes/transactions + import rules` | `web: transactions.service.saveImportRule` | `ativo` | manter | consumo no FE em `apps/web/src/services/transactions.service.ts` (`api.post("/transactions/import/rules")`) |
| `DELETE /transactions/import/rules/:ruleId` | `api: routes/transactions + import rules` | `web: transactions.service.deleteImportRule` | `ativo` | manter | consumo no FE em `apps/web/src/services/transactions.service.ts` (`api.delete("/transactions/import/rules/:ruleId")`) |
| `GET /transactions/imports/metrics` | `api: routes/transactions + observability import` | `nenhum consumidor FE identificado no recorte` | `deprecado` | manter compat e marcar depreciacao (sem remocao hard nesta fatia) | busca em `apps/web/src/**` sem ocorrencias; endpoint coberto apenas por testes da API em `apps/api/src/import.test.js` |

## Primeira poda segura desta fatia

- Tipo: depreciacao compat (nao remocao hard).
- Alvo: `GET /transactions/imports/metrics`.
- Justificativa: ausencia de consumo FE no recorte + endpoint ainda ativo para compatibilidade.
- Guardrail: resposta preservada e sinalizacao de depreciacao por header, com teste de compatibilidade.