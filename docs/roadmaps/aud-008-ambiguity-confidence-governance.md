# AUD-008 - Confidence e Confirmacao Ambigua (Governanca de Slice)

Fonte oficial de sequenciamento: `docs/roadmaps/audit-backlog-executable-plan-2026-04-03.md`.

## Contrato semantico da fatia

Quando a classificacao for ambigua, o sistema nao decide sozinho; ele sinaliza e exige confirmacao explicita.

## Escopo que entra

- Sinal de ambiguidade/confidence com reason codes em contrato aditivo FE/BE.
- Fallback seguro: sem auto-aceite em classificacao ambigua.
- Testes focados de limiar e confirmacao obrigatoria.
- Metricas basicas de auto-accept vs manual-confirmation com cardinalidade controlada.

## Escopo que nao entra

- Expansao de parser documental.
- UX complexa (wizards, novos fluxos longos, estados extensivos).
- Fila/background e orquestracao assíncrona.
- Tuning amplo de heuristica fora do limiar minimo da fatia.

## Rollback

- Reverter para comportamento anterior de limiar/confirmacao por revert unico da fatia.
- Sem migracoes destrutivas.

## Criterios verificaveis minimos

- Ambiguidade produz status explicitamente revisavel e nao auto-decisionado.
- Contrato permanece aditivo para consumidores existentes.
- Teste automatizado cobre ao menos um caso de auto-aceite e um caso de confirmacao manual obrigatoria.

## Shape minimo esperado do contrato

- `classificationConfidence`: score numerico normalizado para decisao operacional.
- `classificationAmbiguous`: sinal booleano de ambiguidade.
- `reasonCode`: motivo tecnico principal da classificacao ambigua.
- `requiresUserConfirmation`: gate booleano para confirmacao explicita.

## Fallback seguro desta fatia

- Em ambiguidade, bloquear auto-aceite.
- Exigir confirmacao explicita do usuario para seguir com o vinculo/acao.