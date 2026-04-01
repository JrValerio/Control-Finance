# S10.6 - Gate de Smoke CLT Foundation (2026-04-01)

Status do gate: concluido (desenvolvimento + ambiente remoto validados)

---

## 1. Objetivo

Validar ponta a ponta a trilha CLT da Sprint 10:

- classificacao clt_payslip
- extracao estruturada de holerite
- normalizacao analitica
- dedupe/conflito fraco
- geracao de income statement CLT

---

## 2. Evidencias tecnicas executadas

### 2.1 Testes focados backend (OK)

Comandos executados:

```bash
npm --prefix apps/api test -- src/domain/tax/tax-document-classifier.test.js src/tax.test.js -t "catalogo inicial do dominio fiscal|detecta holerite CLT"
npm --prefix apps/api test -- src/domain/tax/tax-document-extractors.test.js src/tax.test.js -t "holerite CLT"
npm --prefix apps/api test -- src/domain/tax/tax-fact-normalizer.test.js src/tax.test.js -t "holerite CLT|fatos analiticos"
npm --prefix apps/api test -- src/tax.test.js -t "holerites CLT duplicados|conflito fraco"
npm --prefix apps/api test -- src/tax.test.js -t "income-statement-clt|holerite CLT"
```

Resultado consolidado:

- classificacao CLT validada
- extracao de cabecalho/resumo validada
- normalizacao de fatos analiticos validada
- dedupe/conflito fraco para duplicidade validado
- endpoint de income statement CLT validado

### 2.2 Smoke script S10.6 (dry-run OK)

Comando:

```bash
pwsh -NoProfile -File scripts/smoke-tax-clt-foundation.ps1 -WhatIf
```

Resultado:

- fluxo operacional completo do smoke foi validado em modo dry-run
- etapas, parametros e artefatos foram gerados conforme esperado

### 2.3 Smoke script S10.6 (ambiente remoto - bloqueio de deploy)

Comando:

```bash
pwsh -NoProfile -File scripts/smoke-tax-clt-foundation.ps1
```

RunId:

- 20260401-023457-7246

Resultado:

- autenticacao, bootstrap, upload e reprocess executados
- bloqueio em `GET /tax/facts` por ausencia do comportamento novo publicado no ambiente remoto
- conclusao: ambiente remoto ainda sem deploy das alteracoes da Sprint 10

Artefatos:

- `tmp/smoke-clt-foundation-20260401-023457-7246`

### 2.4 Smoke script S10.6 (ambiente remoto - pos-merge, OK)

Comando:

```bash
pwsh -NoProfile -File scripts/smoke-tax-clt-foundation.ps1
```

RunId:

- 20260401-031639-5835

Resultado:

- fluxo completo executado com sucesso no ambiente-alvo
- `GET /tax/facts` retornou 6 fatos pendentes para aprovacao
- `POST /tax/facts/bulk-review` retornou 200
- `GET /tax/income-statement-clt/2026` retornou 200
- placar final do smoke: 9 PASS / 0 FAIL

Artefatos:

- `tmp/smoke-clt-foundation-20260401-031639-5835`
- `tmp/smoke-clt-foundation-20260401-031639-5835/checklist-s10-6.json`

---

## 3. Decisao de gate

Decisao atual: GO final (gate S10.6 concluido)

- GO (dev): implementacao e testes locais cobrem S10.1-S10.5
- GO (remoto): smoke pos-merge executado com sucesso no ambiente-alvo (runId 20260401-031639-5835)

---

## 4. Proximos passos obrigatorios

1. Registrar no roadmap executivo o fechamento oficial da Sprint 10 com referencia ao runId remoto.
2. Iniciar planejamento operacional da Sprint 11 sem carregar pendencias da Sprint 10.
