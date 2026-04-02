# Sprint B - PR M - Plano cirurgico (validacoes e alertas de obrigatoriedade)

Data: 2026-04-02  
Status: em execucao (slice 2)

## Objetivo

Aumentar a explicabilidade e previsibilidade da obrigatoriedade IRPF sem alterar contratos de negocio ja estabilizados no PR L:

- regras de obrigatoriedade deterministicas;
- mensagens de alerta rastreaveis ao gatilho fiscal;
- evolucao incremental em slices pequenos e auditaveis.

## Escopo geral do PR M

1. Explicabilidade dos gatilhos
- mensagens de obrigatoriedade com origem e contexto numerico;
- foco inicial no gatilho de rendimentos tributaveis.

2. Cobertura de validacao
- testes de integracao para garantir disparo e mensagem esperada;
- sem regressao de filtros/revisao da fila ja entregues no PR L.

3. UX de alertas (fatias seguintes)
- manter linguagem clara na TaxPage sem abrir escopo de layout amplo;
- preservar operacao do bulk approve e filtros persistidos.

## Slice 1 (este PR)

Escopo:
- detalhar o motivo `TAXABLE_INCOME_LIMIT` com total, limite e composicao de rendimentos tributaveis (CLT/INSS/OUTROS);
- expor totais de composicao no payload de obrigatoriedade;
- validar via teste de integracao de `/tax/obligation/:taxYear`.

Fora de escopo:
- novos gatilhos fiscais;
- alteracao de thresholds oficiais;
- mudanca de contrato de `sourceFilter`.

## Arquivos-alvo

Backend:
- apps/api/src/domain/tax/tax-obligation.calculator.js
- apps/api/src/tax.test.js

Tipagem web (compatibilidade):
- apps/web/src/services/tax.service.ts

Roadmap:
- docs/roadmaps/sprint-b-irpf-kickoff.md

## Criterios de aceite (slice 1)

1. Quando `TAXABLE_INCOME_LIMIT` disparar, a mensagem deve incluir:
- total tributavel;
- limite aplicavel;
- composicao por origem (CLT, INSS, OUTROS quando houver).

2. O endpoint `/tax/obligation/:taxYear` deve manter comportamento deterministico:
- mesmos codigos de gatilho;
- sem regressao em `mustDeclare`.

3. Suite focada verde.

## Validacao (slice 1)

- npm -w apps/api run test -- src/tax.test.js -t "considera apenas fatos approved ou corrected"
- npm -w apps/api run test -- src/tax.test.js -t "explica composicao CLT e INSS no gatilho tributavel"

## Guardrails

- Diff pequeno e escopo unico por slice.
- Sem merge sem diff completo e aprovacao explicita.
- Sem alterar contratos estaveis do PR L sem necessidade objetiva.

## Slice 2 (este PR)

Escopo:
- detalhar o motivo `EXEMPT_AND_EXCLUSIVE_INCOME_LIMIT` com total, limite e composicao (isentos e exclusivos);
- validar via teste de integracao de `/tax/obligation/:taxYear` para o gatilho de isentos/exclusivos.

Fora de escopo:
- alteracao de thresholds oficiais;
- mudanca de semantica dos codigos de gatilho;
- mudancas de UX na TaxPage.

## Criterios de aceite (slice 2)

1. Quando `EXEMPT_AND_EXCLUSIVE_INCOME_LIMIT` disparar, a mensagem deve incluir:
- total combinado;
- limite aplicavel;
- composicao entre rendimentos isentos e exclusivos.

2. Endpoint `/tax/obligation/:taxYear` continua deterministico:
- codigo do gatilho preservado;
- `mustDeclare` sem regressao.

3. Suite focada verde.

## Validacao (slice 2)

- npm -w apps/api run test -- src/tax.test.js -t "explica composicao CLT e INSS no gatilho tributavel"
- npm -w apps/api run test -- src/tax.test.js -t "explica total e composicao no gatilho de isentos/exclusivos"
