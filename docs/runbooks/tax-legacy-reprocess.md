# Reprocess legado fiscal — execução operacional

## Pré-condições

* `main` contém `#293` e `#294`
* endpoint `POST /ops/tax-documents/reprocess-legacy` ativo
* `x-ops-token` válido
* `taxpayer_cpf` preenchido no perfil dos usuários de amostra, quando aplicável
* acesso para validar depois:
  * `summary`
  * `export`
  * documentos reprocessados
  * fatos previamente aprovados
* confirmar que existe **backup lógico** ou ao menos **capacidade de inspeção before/after** dos dados do lote

## Checklist operacional

### Antes do lote

* confirmar ambiente correto
* confirmar payload do lote
* confirmar recorte inicial pequeno
* separar amostra real para validação:
  * documento válido
  * CPF divergente
  * `extrato-ir.pdf`
  * caso já revisado/aprovado
* garantir ponto de inspeção before/after

### Dry-run

* rodar `dryRun: true`
* registrar resposta completa
* conferir:
  * `processed`
  * `succeeded`
  * `failed`
  * `excludedByCpfMismatch`
  * `summariesRebuilt = 0`
  * `nextAfterDocumentId`

### Apply

* só rodar se o dry-run vier coerente
* registrar resposta completa
* conferir:
  * `updatedExtractions`
  * `updatedTaxFacts`
  * `excludedByCpfMismatch`
  * `summariesRebuilt`
  * `failed`
  * `nextAfterDocumentId`

### Pós-apply

* validar amostra real
* conferir:
  * documento válido segue no oficial
  * CPF divergente segue visível, mas fora do oficial
  * `extrato-ir.pdf` segue com 5 fatos
  * caso aprovado preservou `review_status`
  * `summary` e `export` refletem a base nova
  * não houve duplicação de `tax_facts`

## Payloads prontos

### Dry-run inicial

```json
{
  "dryRun": true,
  "limit": 10,
  "taxYear": 2026
}
```

### Apply inicial

```json
{
  "dryRun": false,
  "limit": 10,
  "taxYear": 2026
}
```

### Dry-run paginado

```json
{
  "dryRun": true,
  "limit": 10,
  "taxYear": 2026,
  "afterDocumentId": 1048
}
```

### Apply paginado

```json
{
  "dryRun": false,
  "limit": 10,
  "taxYear": 2026,
  "afterDocumentId": 1048
}
```

### Lote por usuário

```json
{
  "dryRun": true,
  "limit": 10,
  "taxYear": 2026,
  "userId": 123
}
```

## Registro por lote

```md
### Lote [N]
- modo: [dry-run|apply]
- payload: { ... }
- processed:
- succeeded:
- failed:
- updatedExtractions:
- updatedTaxFacts:
- totalFactsGenerated:
- excludedByCpfMismatch:
- summariesRebuilt:
- nextAfterDocumentId:

### Validação funcional
- documento válido:
- CPF divergente:
- extrato-ir.pdf:
- caso aprovado antes do batch:

### Observações
- 
```

## Go / No-Go

### GO

Pode seguir para o próximo lote se:

* `failed` estiver zerado ou baixo e explicável
* `excludedByCpfMismatch` estiver coerente
* `summary` pós-apply fizer sentido
* `export` estiver alinhado
* `review_status` tiver sido preservado quando esperado
* `extrato-ir.pdf` mantiver os 5 fatos
* não houver duplicação de fatos

### NO-GO

Parar a operação se:

* `failed` vier alto ou repetitivo
* `summary` ficar inconsistente
* `export` divergir sem explicação
* fato aprovado perder `review_status` indevidamente
* `extrato-ir.pdf` deixar de gerar os 5 fatos
* CPF divergente entrar no cálculo oficial
* documento válido sair do oficial sem motivo claro

## Sequência recomendada

1. `dryRun` com `limit: 10`
2. validar resposta
3. `apply` com o mesmo recorte
4. validar amostra real
5. seguir com `afterDocumentId`
6. repetir em lotes pequenos
7. só aumentar lote quando houver estabilidade

## Nota operacional

`excludedByCpfMismatch` **não é erro automático**.
É sinal operacional esperado do filtro entre:

* documento visível/auditável
* fato elegível ao cálculo oficial
