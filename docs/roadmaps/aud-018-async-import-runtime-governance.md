# AUD-018 - Fila para Importacao Pesada (Governanca de Slice)

Fonte oficial de sequenciamento: docs/roadmaps/audit-backlog-executable-plan-2026-04-03.md (ordem 18).

## Objetivo da fatia

Executar recorte minimo para mover processamento pesado de importacao para fluxo assincrono com status/retry observavel, preservando contrato publico vigente no que nao entrar no recorte.

## Dependencias e contratos herdados

- AUD-007 fechada (OCR/runtime de PDF escaneado com status explicito).
- AUD-011 fechada (smoke integrado em CI para jornadas criticas).
- AUD-017 fechada como consolidacao inicial de contrato canonico compartilhado; qualquer mudanca para local neutro de shared contracts fica fora desta fatia e deve nascer em slice propria.

## Escopo que entra

- Selecionar 1 fronteira unica de importacao pesada para async runtime.
- Definir contrato minimo de status e retry para o recorte selecionado.
- Preservar comportamento publico fora da fronteira da fatia.
- Adicionar teste/check focado no lifecycle do job no recorte.

## Escopo que nao entra

- Migracao ampla de todos os fluxos de importacao para fila.
- Reorganizacao ampla de runtime/plataforma.
- Mudanca transversal de contratos alem da fronteira selecionada.
- Reabertura de AUD-007, AUD-011 ou AUD-017.

## Criterios verificaveis minimos

- Fronteira unica de importacao pesada processada em modo assincrono.
- Contrato de status/retry verificavel no recorte.
- Teste/check focado de lifecycle do job verde.
- Mudanca delimitada a AUD-018 com diff cirurgico.

## Rollback

- Reversao unica da fatia.
- Caso necessario, restaurar fluxo sincronico anterior em um unico revert mantendo contrato publico fora do recorte.
