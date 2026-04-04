# AUD-015 - Quebra de Hotspots (Governança de Slice)

Fonte oficial de sequenciamento: docs/roadmaps/audit-backlog-executable-plan-2026-04-03.md (ordem 15).

## Objetivo da fatia

Executar modularização mínima de hotspots com escopo cirúrgico, preservando contrato público e sem alterar comportamento funcional.

## Dependências e contratos herdados

- AUD-014 fechada no recorte mínimo de enforcement semântico de dashboard.
- AUD-011 fechada no recorte de smoke integrado.
- AUD-012 fechada no recorte de hardening HTTP.
- AUD-009 fechada no recorte de corpus/golden.

## Escopo que entra

- Selecionar 1 hotspot principal de alto churn no recorte da fatia.
- Extrair módulos internos com fronteiras claras e responsabilidade única.
- Preservar APIs públicas e comportamento externo.
- Adicionar testes regressivos focados no recorte alterado.

## Escopo que não entra

- Refactor estrutural amplo do domínio inteiro.
- Reabertura de dashboard semantics (AUD-014).
- Reabertura de smoke integrado (AUD-011).
- Reabertura de corpus/golden tests (AUD-009).
- Reabertura de hardening HTTP (AUD-012).

## Critérios verificáveis mínimos

- Hotspot selecionado reduzido em acoplamento e/ou tamanho com fronteiras explícitas.
- Contrato público preservado sem quebra funcional.
- Testes regressivos do recorte passam localmente e no CI.
- Mudança claramente delimitada à AUD-015.

## Rollback

- Reversão única da fatia.
- Caso necessário, restaurar implementação anterior do hotspot em um único revert.
