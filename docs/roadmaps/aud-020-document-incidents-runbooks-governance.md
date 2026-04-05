# AUD-020 - Runbooks de Incidente Documental (Governanca de Slice)

Fonte oficial de sequenciamento: docs/roadmaps/audit-backlog-executable-plan-2026-04-03.md (ordem 20).

## Objetivo da fatia

Executar recorte minimo para formalizar runbooks operacionais de incidente no dominio documental, com resposta padronizada para importacao e regressao semantica, sem alterar runtime funcional fora da fronteira escolhida.

## Dependencias e contratos herdados

- AUD-013 fechada (observabilidade financeira documental como base de sinal operacional).
- AUD-019 fechada como primeira regra minima consolidada de retencao/delecao em sessoes de importacao; qualquer expansao futura de lifecycle sensivel deve referenciar AUD-019 e nascer em fatia propria.

## Escopo que entra

- Selecionar 1 fronteira unica operacional de incidente documental.
- Definir runbook minimo com gatilhos, triagem, mitigacao, criterios de encerramento e evidencia.
- Definir prova focada de drill operacional (tabletop) no recorte.
- Preservar comportamento de produto e runtime fora da fronteira da fatia.

## Fronteira selecionada (alvo unico)

- Fronteira unica: resposta operacional para incidente de regressao semantica em importacao documental (`source=transactions_import`).
- Incidente-alvo desta fatia: aumento sustentado de `parse_failure` com queda de `sensitive_mutation_success` no mesmo intervalo operacional.
- Sinais herdados (AUD-013) obrigatorios no recorte:
  - metrica: `document_financial_observability_events_total{source,signal,reason_class}`;
  - sinais: `parse_attempt`, `parse_failure`, `sensitive_mutation_success`.
- Ativo minimo esperado nesta fatia:
  - runbook versionado em `docs/runbooks/document-import-semantic-incident.md`;
  - check-list de tabletop drill com evidencias minimas em `docs/runbooks/aud-020-tabletop-document-import-semantic-regression-2026-04-04.md`;
  - referencia explicita a sinais operacionais herdados de AUD-013.

## Escopo que nao entra

- Politica ampla de incidentes para todos os dominios da aplicacao no mesmo PR.
- Mudancas funcionais em parser/OCR/import runtime/retencao sensivel.
- Reorganizacao estrutural ampla de observabilidade/plataforma.
- Reabertura de AUD-013 ou AUD-019.

## Criterios verificaveis minimos

- Runbook documental com fluxo operacional completo e versionado.
- Evidencia de drill (tabletop) focada e rastreavel.
- Fronteira unica respeitada, sem ampliar para politica global.
- Mudanca delimitada a AUD-020 com diff cirurgico.

## Formato minimo de evidencia (tabletop)

- Cenario unico descrito com gatilho objetivo.
- Checklist executavel com triagem, mitigacao e encerramento.
- Resultado esperado por etapa (ok/falha + acao).
- Registro final versionado com data, owner e licoes imediatas.

## Rollback

- Nao aplicavel para conteudo versionado de documentacao.
- Caso necessario, revert unico da fatia para restaurar baseline anterior dos runbooks.
- Rollback exato da integracao:
  - remover `docs/runbooks/document-import-semantic-incident.md`;
  - remover `docs/runbooks/aud-020-tabletop-document-import-semantic-regression-2026-04-04.md`;
  - restaurar `docs/roadmaps/aud-020-document-incidents-runbooks-governance.md` ao baseline de kickoff.