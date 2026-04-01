# Sprint 10 - CLT / Fundacao de Holerite

> Documento operacional para executar a Sprint 10 com foco em estruturar o dominio CLT com confiabilidade transacional e rastreabilidade analitica.

Status: em andamento; kickoff formal documental realizado em 01/04/2026.

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
- Status: em andamento (primeiro slice oficial da Sprint 10).

### Slice S10.2 - Extracao estruturada de cabecalho + resumo financeiro

- Extrair cabecalho essencial (competencia, empregador, trabalhador, tipo de folha).
- Consolidar resumo financeiro para leitura rapida de conferencia.
- Resultado esperado: leitura confiavel de cabecalho + resumo sem depender de parsing manual ad hoc.
- Status: pendente.

### Slice S10.3 - Rubricas + normalizacao analitica

- Estruturar rubricas de proventos e descontos em camada analitica.
- Normalizar campos para comparabilidade mensal.
- Resultado esperado: rubricas rastreaveis e consistentes para auditoria e explicacao.
- Status: pendente.

### Slice S10.4 - Dedupe + revisao manual

- Introduzir dedupe para holerites e variacoes de documento equivalente.
- Implementar trilha de revisao manual para conflitos e inconsistencias.
- Resultado esperado: pipeline robusto contra duplicidade e erro de classificacao.
- Status: pendente.

### Slice S10.5 - Geracao de `income_statement_clt`

- Materializar saida consolidada CLT para consumo operacional e fiscal.
- Garantir separacao entre camada transacional (liquido) e camada analitica (rubricas/bases).
- Resultado esperado: `income_statement_clt` confiavel para conferencia humana e evolucao de produto.
- Status: pendente.

### Slice S10.6 - Smoke/gate documental e operacional da sprint

- Executar smoke da trilha CLT de ponta a ponta.
- Registrar gate formal de encerramento da Sprint 10 com evidencias.
- Resultado esperado: encerramento da sprint sustentado por execucao real + trilha documental.
- Status: pendente.

---

## 7. Definition of Done da Sprint 10

- Dominio CLT com contrato minimo e classificacao base aprovados.
- Fluxo de holerite com separacao explicita entre ledger liquido e camada analitica/fiscal.
- Evidencias de testes e smoke anexadas nos PRs da sprint.
- Gate S10.6 executado com decisao final registrada em runbook.

---

## 8. Pendencia operacional aberta

- Acao pendente: iniciar implementacao do Slice S10.1.
- Criterio objetivo de conclusao: contrato minimo CLT + classificacao base publicados com CI verde e merge em `main`.
- Evidencia esperada: diff tecnico + branch + commit + PR + CI verde + merge.
- Status: aberta.

---

## 9. Proxima acao executavel

- Comando/rotina: abrir branch do S10.1 e iniciar contrato CLT + classificacao base.
- Ambiente-alvo: repositorio Control Finance / `main`.
- Dono: execucao operacional do projeto.
- Saida esperada: primeiro slice da Sprint 10 entregue com trilha auditavel.
- Bloqueios conhecidos: nenhum bloqueio tecnico critico registrado neste kickoff.

---

## 10. Regra de fechamento

- So registrar "Sprint 10 iniciada oficialmente" para um slice quando houver atualizacao publicada no repositorio com PR, checks e merge.
- Na ausencia dessa trilha, o maximo permitido e "Sprint 10 preparada" ou "handoff validado".
