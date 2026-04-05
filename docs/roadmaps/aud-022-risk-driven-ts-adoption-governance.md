# AUD-022 - Reducao JS+TS por Risco (Governanca de Slice)

Fonte oficial de sequenciamento: docs/roadmaps/audit-backlog-executable-plan-2026-04-03.md (ordem 22).

## Objetivo da fatia

Executar recorte minimo para reduzir coexistencia JS+TS em superficie de contrato de maior risco no web, preservando comportamento funcional e sem migracao ampla do frontend.

## Dependencias e contratos herdados

- AUD-017 fechada (schemas/enums compartilhados como base de contrato tipado).
- AUD-015 fechada (quebra de hotspots sem regressao funcional).
- AUD-021 fechada como primeira baseline minima reproduzivel de performance; qualquer ampliacao de politica ampla de performance fica fora desta fatia.

## Escopo que entra

- Selecionar 1 fronteira unica de coexistencia JS+TS em superficie de risco.
- Aplicar migracao minima para TypeScript no recorte unico.
- Preservar contratos e comportamento publico fora do recorte.
- Adicionar prova focada de nao regressao no recorte.

## Fronteira selecionada (alvo unico)

- Fronteira unica: contrato de risco do cliente HTTP web em `apps/web/src/services/api.ts`, validado por teste dedicado migrado de JS para TS.
- Risco concreto que a fatia elimina: drift silencioso no contrato de interceptors (request id, retry de 401 e payload de 402) por falta de tipagem explicita no teste de maior cobertura desse fluxo.
- Artefato minimo de migracao: mover o teste de risco de `apps/web/src/services/api.test.js` para arquivo TypeScript dedicado (`apps/web/src/services/api-risk-contract.test.ts`).
- Ativo minimo esperado nesta fatia:
  - migracao da fronteira para TypeScript com tipagem explicita;
  - alinhamento do teste/contrato para impedir drift de shape;
  - evidencia de execucao focada no recorte.

## Prova focada de nao regressao

- Check dedicado da fatia executando apenas os testes de contrato de risco da API web.
- Suficiencia minima da prova:
  - validar injector de `x-request-id` no interceptor de request;
  - validar fila/retry de 401 sem loop de refresh;
  - validar mapeamento de payload 402 (`reason`, `feature`, `context`) sem drift.

## Escopo que nao entra

- Migracao ampla de multiplos arquivos JS no web no mesmo PR.
- Politica global de adocao TypeScript para toda a aplicacao.
- Refactors transversais em runtime de servicos ou componentes.
- Reabertura de AUD-017, AUD-015 ou AUD-021.

## Criterios verificaveis minimos

- Fronteira unica migrada para TS com contrato explicito.
- Teste/check focado verde no recorte.
- Mudanca delimitada a AUD-022 com diff cirurgico.

## Rollback

- Revert unico da fatia.
- Rollback exato da integracao:
  - restaurar `apps/web/src/services/api.test.js`;
  - remover `apps/web/src/services/api-risk-contract.test.ts`;
  - remover script/check dedicado da AUD-022 em `apps/web/package.json` e `.github/workflows/ci.yml`;
  - restaurar governanca ao baseline de kickoff se necessario.