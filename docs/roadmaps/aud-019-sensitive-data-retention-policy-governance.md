# AUD-019 - Politica de Retencao e Delecao de Dados Sensiveis (Governanca de Slice)

Fonte oficial de sequenciamento: docs/roadmaps/audit-backlog-executable-plan-2026-04-03.md (ordem 19).

## Objetivo da fatia

Executar recorte minimo para aplicar politica verificavel de retencao/delecao de dados sensiveis, preservando contrato publico fora da fronteira escolhida.

## Dependencias e contratos herdados

- AUD-003 fechada (hardening de storage sensivel).
- AUD-004 fechada (minimizacao de persistencia sensivel).
- AUD-018 fechada como primeira migracao assincrona minima; qualquer evolucao de runtime de jobs alem do necessario para esta fatia deve nascer em slice propria e referenciar AUD-018.

## Escopo que entra

- Selecionar 1 fronteira unica de lifecycle de dado sensivel para retencao/delecao.
- Definir regra minima verificavel (retencao, elegibilidade de delecao e evidencia de execucao).
- Preservar contratos e comportamento publico fora do recorte da fatia.
- Adicionar teste/check focado de conformidade do lifecycle no recorte.

## Escopo que nao entra

- Politica ampla para todos os tipos de dado sensivel no mesmo PR.
- Reorganizacao estrutural ampla de storage/runtime.
- Mudancas transversais de UX/export para multiplos fluxos.
- Reabertura de AUD-003, AUD-004 ou AUD-018.

## Criterios verificaveis minimos

- Fronteira unica com regra de retencao/delecao aplicada e auditavel.
- Evidencia de conformidade via teste/check focado.
- Contrato publico preservado fora da fronteira alterada.
- Mudanca delimitada a AUD-019 com diff cirurgico.

## Rollback

- Reversao unica da fatia.
- Caso necessario, restaurar comportamento anterior de lifecycle em um unico revert sem expandir escopo.
