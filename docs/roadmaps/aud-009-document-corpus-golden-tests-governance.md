# AUD-009 - Corpus real anonimizado e Golden Tests (Governanca de Slice)

Fonte oficial de sequenciamento: docs/roadmaps/audit-backlog-executable-plan-2026-04-03.md.

## Objetivo da fatia

Adicionar corpus de documentos reais anonimizados e suites de golden tests para evitar regressao de extracao/classificacao no fluxo de importacao.

## Contrato herdado (nao regredir)

O contrato de ambiguidade e confirmacao explicita consolidado na AUD-008 permanece valido e fora de rediscussao nesta fatia.

## Escopo que entra

- Fixtures anonimizadas versionadas para cenarios representativos.
- Golden tests deterministicas para extracao/classificacao.
- Guardrails de regressao para campos/semantica essenciais.
- Metricas basicas de regressao por suite (pass/fail) sem labels livres.

## Escopo que nao entra

- Expansao de parser/heuristica em larga escala.
- UX nova ou fluxos de confirmacao adicionais.
- Fila/background e mudancas de orquestracao runtime.
- Reabertura de decisoes semanticas da AUD-007/AUD-008.

## Rollback

- Revert unico da fatia (fixtures e suites) sem migracoes destrutivas.

## Criterios verificaveis minimos

- Pelo menos um conjunto de fixtures anonimizadas por tipo alvo com expected versionado.
- Suite golden falha quando houver regressao em campos-chave.
- CI executa a suite e bloqueia regressao funcional no recorte definido.