# Sprint 10 - CLT / Fundacao de Holerite

> Documento operacional para executar a Sprint 10 com foco em estruturar o dominio CLT com confiabilidade transacional e rastreabilidade analitica.

Status: concluida; slices S10.1-S10.6 entregues e validados em desenvolvimento e ambiente remoto em 01/04/2026.

---

## 1. Objetivo

Transformar holerite em renda CLT estruturada confiavel, sem contaminar o ledger principal com granularidade fiscal desnecessaria.

---

## 2. Regra operacional central

- No ledger principal entra a renda liquida.
- Bruto, bases, descontos e rubricas ficam na camada analitica/fiscal.

---

## 3. Principio de modelagem

- Holerite nao deve contaminar o ledger com granularidade fiscal/bruta desnecessaria.
- A camada transacional continua enxuta.
- A camada analitica/fiscal absorve estrutura de conferencia, auditoria e explicacao.

---

## 4. Escopo previsto da sprint

- Classificacao `clt_payslip`.
- Subtipagem:
  - `monthly_payroll`
  - `salary_advance`
  - `thirteenth_*`
  - `vacation_payroll`
- Extracao de cabecalho.
- Resumo financeiro.
- Rubricas.
- Dedupe.
- Revisao manual.
- `income_statement_clt`.

### Fora de escopo nesta sprint

- Reescrever ledger historico de renda fora da trilha CLT.
- Acoplamento da camada analitica fiscal ao fluxo operacional de transacoes ja consolidadas.
- Expandir dominio de IA operacional (Sprint 11) antes da base CLT estabilizada.

---

## 5. Escopo deste inicio de sprint

- Formalizar roadmap executivo e roadmap operacional da Sprint 10.
- Fatiar a Sprint 10 em slices executaveis.
- Definir contrato minimo do dominio CLT.
- Definir DoD da fundacao de holerite antes de implementacao pesada.

---

## 6. Plano de execucao em slices

### Slice S10.1 - Contrato CLT + classificacao base de holerite

- Definir contrato minimo do dominio CLT (entrada, metadados, saidas e erros).
- Introduzir classificacao base `clt_payslip` no pipeline documental.
- Resultado esperado: fundacao de contrato e classificacao pronta para evolucao segura.
- Status: concluido em desenvolvimento (contrato + migration + classificador + testes).

### Slice S10.2 - Extracao estruturada de cabecalho + resumo financeiro

- Extrair cabecalho essencial (competencia, empregador, trabalhador, tipo de folha).
- Consolidar resumo financeiro para leitura rapida de conferencia.
- Resultado esperado: leitura confiavel de cabecalho + resumo sem depender de parsing manual ad hoc.
- Status: concluido em desenvolvimento (extrator `clt-payslip` + persistencia de payload + testes).

### Slice S10.3 - Rubricas + normalizacao analitica

- Estruturar rubricas de proventos e descontos em camada analitica.
- Normalizar campos para comparabilidade mensal.
- Resultado esperado: rubricas rastreaveis e consistentes para auditoria e explicacao.
- Status: concluido em desenvolvimento (rubricas + fatos analiticos mensais + testes).

### Slice S10.4 - Dedupe + revisao manual

- Introduzir dedupe para holerites e variacoes de documento equivalente.
- Implementar trilha de revisao manual para conflitos e inconsistencias.
- Resultado esperado: pipeline robusto contra duplicidade e erro de classificacao.
- Status: concluido em desenvolvimento (cobertura de dedupe/conflito fraco entre holerites duplicados).

### Slice S10.5 - Geracao de `income_statement_clt`

- Materializar saida consolidada CLT para consumo operacional e fiscal.
- Garantir separacao entre camada transacional (liquido) e camada analitica (rubricas/bases).
- Resultado esperado: `income_statement_clt` confiavel para conferencia humana e evolucao de produto.
- Status: concluido em desenvolvimento (endpoint + contrato web + testes de agregacao).

### Slice S10.6 - Smoke/gate documental e operacional da sprint

- Executar smoke da trilha CLT de ponta a ponta.
- Registrar gate formal de encerramento da Sprint 10 com evidencias.
- Resultado esperado: encerramento da sprint sustentado por execucao real + trilha documental.
- Status: concluido (smoke remoto pos-merge executado com 9 PASS / 0 FAIL, runId 20260401-031639-5835).

---

## 7. Definition of Done da Sprint 10

- Dominio CLT com contrato minimo e classificacao base aprovados.
- Fluxo de holerite com separacao explicita entre ledger liquido e camada analitica/fiscal.
- Evidencias de testes e smoke anexadas nos PRs da sprint.
- Gate S10.6 executado com decisao final registrada em runbook.

---

## 8. Pendencia operacional aberta

- Nenhuma pendencia operacional aberta da Sprint 10.
- Status: encerrada.

---

## 9. Proxima acao executavel

- Comando/rotina: iniciar kickoff operacional da Sprint 11 com backlog priorizado.
- Ambiente-alvo: repositorio Control Finance / `main`.
- Dono: execucao operacional do projeto.
- Saida esperada: transicao limpa para proxima frente sem passivo da Sprint 10.
- Bloqueios conhecidos: nenhum bloqueio tecnico critico registrado ao final da Sprint 10.

---

## 10. Regra de fechamento

- So registrar "Sprint 10 iniciada oficialmente" para um slice quando houver atualizacao publicada no repositorio com PR, checks e merge.
- Na ausencia dessa trilha, o maximo permitido e "Sprint 10 preparada" ou "handoff validado".
