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

## Fronteira selecionada (alvo unico)

- Fluxo pesado selecionado: importacao de PDF de fatura de cartao (`POST /credit-cards/:id/invoices/parse-pdf`).
- Substituicao/encapsulamento no recorte: introduzido caminho assincrono dedicado (`POST /credit-cards/:id/invoices/parse-pdf-async`) sem remover o caminho sincronico legado.
- Contrato minimo de status/retry desta fatia:
	- status: `queued`, `processing`, `succeeded`, `failed`.
	- retry minimo observavel: reenfileirar job failed ate limite de tentativas (`maxAttempts`) via endpoint dedicado.
- Comportamento publico que permanece intacto fora do recorte: fluxo sincronico original e demais importacoes do sistema.

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

## Prova de lifecycle e contrato minimo

- Teste dedicado de lifecycle (queued/processing/succeeded/failed + retry):
	- `apps/api/src/credit-card-invoice-import-jobs.test.js`
- Check visivel da fatia:
	- `async-import-runtime-invoice` (CI)

## Rollback

- Reversao unica da fatia.
- Caso necessario, restaurar fluxo sincronico anterior em um unico revert mantendo contrato publico fora do recorte.
- Rollback exato da integracao:
	- remover `apps/api/src/services/credit-card-invoice-import-jobs.service.js`.
	- remover rotas async em `apps/api/src/routes/credit-cards.routes.js`.
	- remover teste `apps/api/src/credit-card-invoice-import-jobs.test.js`.
	- remover script `test:async-import:invoice` de `apps/api/package.json`.
	- remover job `async-import-runtime-invoice` de `.github/workflows/ci.yml`.
