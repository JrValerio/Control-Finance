# Runbook S9.5 - Smoke operacional IRPF MVP

## Objetivo

Validar o fluxo ponta a ponta da Central do Leao no exercicio fiscal alvo:

1. ingestao documental
2. reprocessamento
3. revisao humana em lote
4. resumo + obrigatoriedade
5. rebuild versionado
6. export oficial JSON/CSV

## Script oficial

- Script: `scripts/smoke-tax-irpf-mvp.ps1`
- Saida de evidencias: `tmp/smoke-irpf-mvp-<runId>/`

## Como executar

### Modo padrao (auth automatica)

```powershell
.\scripts\smoke-tax-irpf-mvp.ps1 -BaseUrl "https://control-finance-react-tailwind.onrender.com" -TaxYear 2026
```

### Com token existente

```powershell
.\scripts\smoke-tax-irpf-mvp.ps1 -BaseUrl "https://control-finance-react-tailwind.onrender.com" -TaxYear 2026 -Token "<jwt>"
```

### Pre-validacao sem chamadas de rede

```powershell
.\scripts\smoke-tax-irpf-mvp.ps1 -WhatIf
```

## Checklist de aceite S9.5

Marcar como concluido somente quando todos os itens abaixo estiverem verdadeiros:

- [ ] Upload documental retorna `201` com `documentId` valido.
- [ ] Reprocessamento retorna `200` e documento sai de `uploaded` para fluxo normalizado.
- [ ] Fila de revisao retorna fatos pendentes para o exercicio.
- [ ] Bulk review retorna `200` com preview fiscal consistente.
- [ ] Summary e obligation retornam `200` para o exercicio.
- [ ] Rebuild retorna `200` e atualiza snapshot fiscal.
- [ ] Export `JSON` retorna `200` com manifesto.
- [ ] Export `CSV` retorna `200` com cabecalho oficial.

## Evidencias geradas automaticamente

- `01-bootstrap.json`
- `02-upload-document.json`
- `03-reprocess-document.json`
- `04-facts-pending.json`
- `05-bulk-review.json`
- `06-summary-before-rebuild.json`
- `07-obligation.json`
- `08-summary-rebuild.json`
- `09-export-dossie.json`
- `10-export-dossie.csv`
- `checklist-s9-5.json`

## Observacoes operacionais

- O script exige PowerShell com suporte ao parametro `-Form` no `Invoke-WebRequest` (recomendado: PowerShell 7+).
- Em ambiente sem token, o script cria um usuario temporario para nao depender de contas manuais.
- O runbook cobre a evidencia tecnica da API; a conferencia visual da pagina imprimivel/PDF continua como validacao manual complementar da S9.5.
