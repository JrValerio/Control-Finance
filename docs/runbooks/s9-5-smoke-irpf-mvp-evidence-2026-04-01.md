# Evidencia operacional S9.5 - Smoke real IRPF MVP (2026-04-01)

## Estado

- Execucao realizada com sucesso no ambiente-alvo.
- Resultado geral: PASS 14 / FAIL 0.
- Objetivo: remover bloqueio de ausencia de evidencia operacional da S9.5.

## Metadados da execucao

- Ambiente-alvo: https://control-finance-react-tailwind.onrender.com
- RunId: 20260401-011715-8322
- TaxYear: 2026
- Timestamp: 2026-04-01T01:17:19.6040962-03:00
- Pasta de evidencias: tmp/smoke-irpf-mvp-20260401-011715-8322

## Criterios objetivos

- ingestao: true
- revisao: true
- resumo: true
- exportJson: true
- exportCsv: true

## Artefatos gerados

- 01-bootstrap.json
- 02-upload-document.json
- 03-reprocess-document.json
- 04-facts-pending.json
- 05-bulk-review.json
- 06-summary-before-rebuild.json
- 07-obligation.json
- 08-summary-rebuild.json
- 09-export-dossie.json
- 10-export-dossie.csv
- checklist-s9-5.json
- documento-irpf-smoke.csv

## Impacto de governanca

- S9.5: bloqueio tecnico de evidencia operacional removido.
- S9.6: apta para inicio formal do gate de encerramento da Sprint 9 (pre-abertura concluida).
- Sprint 9: permanece em andamento ate execucao e registro da decisao final do gate S9.6.
