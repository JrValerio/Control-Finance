# Gate S9.6 - Encerramento formal da Sprint 9 (2026-04-01)

## Estado

- Gate S9.6 executado formalmente.
- Decisao: Sprint 9 encerrada.
- Base da decisao: criterios objetivos do gate atendidos com evidencia tecnica e documental.

## Evidencias consolidadas

- Smoke real S9.5:
  - Ambiente: https://control-finance-react-tailwind.onrender.com
  - RunId: 20260401-011715-8322
  - Resultado: PASS 14 / FAIL 0
  - Pacote: tmp/smoke-irpf-mvp-20260401-011715-8322
  - Documento: docs/runbooks/s9-5-smoke-irpf-mvp-evidence-2026-04-01.md
- Validacao de regressao no gate:
  - API: npm -w apps/api run test -- src/tax.test.js (55/55)
  - Web: npm -w apps/web run test:run -- src/pages/TaxPage.test.tsx (22/22)
- Trilha remota relevante da sprint:
  - PR #374, #375, #376, #377, #378, #381, #382, #383

## Checklist dos criterios objetivos do gate

1. Fluxo fiscal MVP validado ponta a ponta em smoke controlado: ingestao, revisao, resumo, export e conferencia.
- Status: atendido.
- Evidencia: smoke real runId 20260401-011715-8322 com criterios todos true.

2. Semantica fiscal anual consistente em API e UI para taxYear, exerciseYear e calendarYear sem regressao aberta.
- Status: atendido.
- Evidencia: suites API (55/55) e TaxPage (22/22) verdes no gate.

3. Export oficial JSON/CSV e modo imprimivel/PDF conferidos com rastreabilidade explicita para revisao humana.
- Status: atendido.
- Evidencia: smoke real validou export JSON/CSV; suite TaxPage cobre fluxo de impressao/PDF.

4. Todos os PRs de fechamento da Sprint 9 com CI verde e mergeados na main.
- Status: atendido.
- Evidencia: PRs #374, #375, #376, #377, #378, #381, #382, #383 mergeados com CI verde.

5. Roadmap executivo e operacional atualizados com decisao de encerramento e abertura da proxima frente ativa.
- Status: atendido.
- Evidencia: atualizacoes realizadas em docs/roadmaps/sprint-9-central-do-leao-irpf-mvp.md e docs/roadmap-execution.md.

## Decisao final

- Sprint 9 encerrada formalmente em 2026-04-01.
- Proxima frente ativa: Sprint 10 (CLT / Fundacao de Holerite).
