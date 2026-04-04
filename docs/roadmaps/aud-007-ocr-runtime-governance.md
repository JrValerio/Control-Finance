# AUD-007 - OCR e PDF escaneado confiavel (Governanca de Slice)

Fonte oficial de sequenciamento: `docs/roadmaps/audit-backlog-executable-plan-2026-04-03.md`.

## Objetivo da fatia

Implementar um slice minimo e verificavel para processamento de PDF escaneado com OCR no runtime atual, com transparencia de status e falha, sem inflar escopo.

## Escopo que entra

- Gate/config controlado para OCR em PDF escaneado.
- Comportamento explicito para sucesso/falha/timeout no fluxo de parse.
- Observabilidade basica de OCR (uso/falha/timeout) com cardinalidade controlada.
- Testes focados do fluxo de OCR escaneado.

## Escopo que nao entra

- Fila assíncrona, job worker, orquestracao em background.
- UX expandida de acompanhamento de processamento.
- Novos parsers multiemissor.
- Tuning amplo de OCR (qualidade/performance/custo) fora de guardrails minimos.

## Rollback

- Reverter para modo sem OCR pesado, com status explicito de nao processado para escaneado.
- Rollback em um unico commit da fatia, sem migracoes destrutivas.

## Criterios verificaveis minimos

- Documento escaneado com OCR habilitado produz status deterministico de sucesso ou falha explicita.
- Timeout gera status e codigo de erro explicitos (sem falha silenciosa).
- Metricas de OCR registram uso e falha sem labels livres.
- Teste automatizado cobre pelo menos: sucesso OCR e timeout/falha OCR.

## Contrato minimo de status

- Shape esperado em metadados de parse: `ocrRuntime: { status, reasonCode, ocrEnabled, ocrAttempted, timeoutMs }`.
- Status permitidos nesta fatia: `success | failed | timeout`.
- Erros tecnicos consumiveis por codigo publico: `INVOICE_OCR_TIMEOUT`, `INVOICE_OCR_FAILED`, `INVOICE_OCR_DISABLED`.

## Tipo de timeout nesta fatia

- Timeout logico/controlado do pipeline OCR no runtime atual.
- Implementacao por limite configuravel (`IMPORT_OCR_TIMEOUT_MS`) aplicado por pagina durante `worker.recognize`.
- Nao inclui (nesta fatia) timeout de fila assíncrona ou de infraestrutura externa.

## Risco principal e mitigacao

- Risco: crescimento de escopo ao misturar runtime + UX + async.
- Mitigacao: PR limitada a runtime + status + observabilidade + teste, sem expansoes laterais.