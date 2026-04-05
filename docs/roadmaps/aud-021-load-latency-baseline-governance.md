# AUD-021 - Carga e Latencia por Fluxo (Governanca de Slice)

Fonte oficial de sequenciamento: docs/roadmaps/audit-backlog-executable-plan-2026-04-03.md (ordem 21).

## Objetivo da fatia

Executar recorte minimo para estabelecer baseline reproduzivel de carga e latencia em fluxo financeiro critico, com criterio verificavel de p95/p99 e trilha de regressao operacional.

## Dependencias e contratos herdados

- AUD-018 fechada (runtime assincrono minimo para importacao pesada como base de comportamento de fila).
- AUD-020 fechada como primeiro runbook documental + tabletop drill consolidado; qualquer ampliacao de politica de incidentes ou catalogo de runbooks deve referenciar AUD-020 e nascer em fatia propria.

## Escopo que entra

- Selecionar 1 fronteira unica de fluxo para baseline de carga/latencia.
- Definir protocolo minimo reproduzivel de medicao (janela, volume, metrica e criterio de aceitacao).
- Publicar evidencia minima versionada de execucao da baseline.
- Preservar contratos e comportamento publico fora do recorte da fatia.

## Fronteira selecionada (alvo unico)

- Fronteira unica: latencia da listagem de transacoes autenticadas (`GET /transactions`) sob carga controlada.
- Ativo minimo esperado nesta fatia:
  - procedimento de medicao reproduzivel para p95/p99 no recorte;
  - evidencias versionadas da execucao da baseline;
  - criterio simples de comparacao futura para regressao no mesmo protocolo.

## Protocolo operacional fechado (v1)

- Endpoint: `GET /transactions` autenticado.
- Query fixa: `limit=20`, `offset=0`.
- Ambiente alvo desta fatia:
  - baseline primaria: in-process no `apps/api` via teste dedicado (reproduzivel local e CI);
  - objetivo nesta primeira entrega: registrar baseline, nao bloquear release por threshold global.
- Janela e carga:
  - aquecimento: 12 requests;
  - medicao: 60 requests;
  - concorrencia: 6 workers.
- Leitura obrigatoria:
  - p95 e p99 em milissegundos calculados sobre a janela de medicao.
- Comando oficial:
  - `npm -w apps/api run test:performance:aud-021`.

## Escopo que nao entra

- Politica ampla de performance para todos os endpoints no mesmo PR.
- Suite de carga abrangente multi-fluxo/multi-servico.
- Mudancas funcionais em parser/OCR/import runtime/retencao/incidentes.
- Reorganizacao estrutural ampla de observabilidade/plataforma.
- Reabertura de AUD-018 ou AUD-020.

## Criterios verificaveis minimos

- Baseline p95/p99 definida para a fronteira unica.
- Protocolo de execucao reproduzivel e rastreavel.
- Evidencia minima versionada da medicao no recorte.
- Mudanca delimitada a AUD-021 com diff cirurgico.

## Formato minimo da evidencia versionada

- Protocolo executado (endpoint/query/janelas/concurrency/comando).
- Resultado medido (`p95Ms`, `p99Ms`, `avgMs`, `minMs`, `maxMs`, `sampleSize`).
- Contexto de ambiente e timestamp da coleta.
- Regra de comparacao futura simples:
  - considerar regressao quando novo `p95Ms` ou `p99Ms` exceder baseline em mais de 20% no mesmo protocolo.

## Rollback

- Nao aplicavel para conteudo versionado de documentacao/evidencia.
- Caso necessario, revert unico da fatia para restaurar baseline anterior.
- Rollback exato da integracao:
  - remover `apps/api/src/performance-transactions-baseline.test.js`;
  - remover script `test:performance:aud-021` de `apps/api/package.json`;
  - remover job `load-latency-baseline-aud021` de `.github/workflows/ci.yml`;
  - remover arquivos em `docs/observability/baselines/` criados pela fatia;
  - restaurar `docs/roadmaps/aud-021-load-latency-baseline-governance.md` ao baseline de kickoff.