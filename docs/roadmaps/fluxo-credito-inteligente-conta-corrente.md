# Épico: Fluxo de Crédito Inteligente na Conta Corrente

**Status:** Backlog — pronto para execução  
**Pré-condições:** parsers estáveis ✅ | typecheck API completo ✅ | forecast.service.ts coberto ✅

**Objetivo:** quando um crédito relevante entra na conta corrente via importação de extrato, o sistema deve reconhecê-lo como renda, vinculá-lo a uma fonte conhecida e usar esse crédito para alimentar o forecast automaticamente — sem exigir que o usuário importe um holerite PDF separado.

---

## Contexto

Este épico dá continuidade à trilha já documentada em:

- `docs/roadmaps/importacao-inteligente-renda-extratos.md`
- `docs/roadmaps/importacao-inteligente-pos-mvp-backlog.md`

O foco aqui não é reabrir a fundação da importação inteligente, mas fechar o gap específico entre:

- crédito real que entra na conta corrente
- fontes de renda já cadastradas ou inferidas
- forecast e saldo disponível que ainda dependem demais de fallback/manual

---

## Issue E1 — Detecção de crédito relevante no extrato

**Branch sugerida:** `feat/income-credit-detection`  
**Commit sugerido:** `feat(import): detect and annotate income credits in bank statement dry-run`

### Objetivo

Identificar, durante o dry-run de importação de extrato bancário, quais transações de crédito têm características de renda — e marcá-las com um sinal explícito antes de persistir.

### Entrada

- Transações do tipo `Entrada` extraídas do extrato
- Descrições como `PGTO INSS`, `CREDITO SALARIO`, `PIX TRANSF`, `FOLHA PAGAMENTO`, `BENEFICIO`
- Fontes de renda cadastradas do usuário (`income_sources`)

### Saída

- Cada transação de crédito anotada com `income_candidate: true/false`
- Campo `income_source_id` populado quando há match com fonte conhecida
- Campo `income_candidate_reason` para rastreabilidade (`pattern_match`, `source_match`, `amount_match`)

### Critérios de aceite

- `PGTO INSS XXXXXXX` com valor próximo ao benefício cadastrado → `income_candidate: true`, `income_source_id` preenchido
- `PIX TRANSF` genérico sem fonte conhecida → `income_candidate: false`
- Crédito acima de limiar configurável sem padrão conhecido → `income_candidate: true`, `income_source_id: null` (sugestão para revisão humana)
- Filtro não bloqueia importação — é anotação, não gate
- Teste com extrato Itaú real (`PGTO INSS 01776829899 2.803,52`)

### Dependências

Nenhuma das outras issues.

### Riscos de regressão

- Parser de extrato hoje não passa `income_sources` do usuário — precisa injetar no contexto do dry-run sem quebrar o pipeline existente
- `income_candidate` não deve afetar dedup por fingerprint

---

## Issue E2 — Vinculação crédito → income_source

**Branch sugerida:** `feat/income-credit-link`  
**Commit sugerido:** `feat(import): create income_statement from confirmed bank credit on commit`

### Objetivo

Persistir a relação entre uma transação de crédito confirmada e uma fonte de renda — criando ou atualizando um `income_statement` a partir do crédito detectado.

### Entrada

- Transação commitada com `income_candidate: true` e `income_source_id` preenchido
- Mês de referência inferido da data da transação
- Valor líquido do crédito

### Saída

- `income_statement` criado com `source_type: bank_credit`, `source_import_session_id` preenchido
- Evita duplicata: se já existe `income_statement` para o mesmo `income_source_id` + mês, não cria novo
- Evento de domínio emitido para o forecast recalcular

### Critérios de aceite

- Importar extrato com crédito INSS → `income_statement` criado automaticamente sem importar PDF
- Importar extrato duas vezes com mesmo crédito → apenas um `income_statement` (idempotência)
- Deletar a sessão de importação → `income_statement` derivado também removido (undo seguro)
- `income_statement` criado por extrato não colide com o criado por PDF do mesmo mês — PDF tem prioridade

### Dependências

E1 concluída.

### Riscos de regressão

- Undo de sessão hoje remove transações mas não `income_statements` derivados de crédito — precisa estender `deleteImportSessionForUser`
- Colisão com `income_statement` existente criado via holerite PDF

---

## Issue E3 — Forecast alimentado por crédito confirmado

**Branch sugerida:** `feat/forecast-confirmed-credit`  
**Commit sugerido:** `feat(forecast): use confirmed bank credit as income basis when available`

### Objetivo

Quando existe `income_statement` com `source_type: bank_credit` para o mês corrente, usar esse valor como `incomeExpected` em vez do fallback do perfil salarial.

### Entrada

- `income_statements` do mês com `source_type` qualquer (PDF, bank_credit, manual)
- `salary_profile` do usuário (fallback)

### Saída

- `incomeBasis: confirmed_statement` quando há crédito confirmado no mês
- `incomeExpected` = soma dos créditos confirmados do mês
- `fallbacksUsed` não inclui `incomeBasis:salary_profile_fallback` quando crédito está confirmado

### Critérios de aceite

- Usuário importa extrato com crédito INSS em abril → forecast de abril usa `confirmed_statement`, não fallback
- Usuário não importou nada em abril → forecast continua usando `salary_profile_fallback` (sem regressão)
- Crédito parcial → `incomeExpected` reflete valor real, não o do perfil
- Testes: adicionar casos de `confirmed_statement` via `bank_credit` em `forecast.service.ts`

### Dependências

E2 concluída.

### Riscos de regressão

- `resolveIncomeBasis` hoje distingue apenas `confirmed_statement` vs `salary_profile_fallback` — prioridade entre `bank_credit` e `pdf` precisa ser explícita
- Testes de forecast existentes assumem fallback como padrão — precisam de ajuste

---

## Issue E4 — Disponível real pós-crédito

**Branch sugerida:** `feat/available-after-obligations`  
**Commit sugerido:** `feat(dashboard): add availableAfterObligations to dashboard snapshot`

### Objetivo

Exibir no painel um cálculo de disponível real após o crédito recebido, descontando saídas recorrentes conhecidas associadas àquela fonte de renda.

### Entrada

- `income_statement` do mês com crédito confirmado
- `bills` pendentes do mês
- Faturas de cartão abertas
- Consignados cadastrados (para INSS: deduções já extraídas pelo parser)

### Saída

- Novo campo no dashboard: `availableAfterObligations`
- Cálculo: `creditConfirmed - billsPending - invoicesPending - consignado`
- Distinção visual entre `projectedBalance` (saldo bancário projetado) e `availableAfterObligations` (disponível real)

### Critérios de aceite

- Usuário com INSS R$2.803 recebido, R$500 em bills, R$200 em fatura → disponível real = R$2.103
- Campo ausente quando não há crédito confirmado no mês (não exibe zero enganoso)
- Não substitui `projectedBalance` — é informação complementar
- `DashboardSnapshotBase` estendido no schema e no `dashboard.service.ts` simultaneamente (typecheck vai pegar qualquer drift)

### Dependências

E3 concluída.

### Riscos de regressão

- `DashboardSnapshotBase` está sob typecheck — qualquer campo novo precisa ser adicionado ao schema e ao service simultaneamente
- Frontend precisa de conditional render — não mostrar para usuários sem crédito confirmado no mês

---

## Ordem de execução

```text
E1 → E2 → E3 → E4
```

E1 e E2 podem ser revisadas em paralelo, mas E2 só entra após E1 mergeada.  
E3 só entra após E2 mergeada.  
E4 só entra após E3 mergeada.

---

## Fora do escopo deste épico

- Open Finance (Pluggy) — feed automático sem upload manual
- Detecção de crédito em OFX (extensão natural de E1, épico separado)
- Notificações push quando crédito detectado
