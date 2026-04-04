# AUD-016 - Domínio Explícito de Regras Críticas (Governança de Slice)

Fonte oficial de sequenciamento: docs/roadmaps/audit-backlog-executable-plan-2026-04-03.md (ordem 16).

## Objetivo da fatia

Consolidar, em recorte mínimo, regras financeiras críticas em módulo de domínio canônico, preservando contratos públicos e sem alteração funcional externa.

## Dependências e contratos herdados

- AUD-015 fechada como primeira quebra cirúrgica de hotspot único.
- AUD-014 fechada no recorte mínimo de enforcement semântico de dashboard.
- AUD-011/AUD-012/AUD-009 permanecem fechadas e fora de reabertura nesta fatia.

## Escopo que entra

- Selecionar 1 fronteira de regra crítica para consolidação explícita no domínio.
- Extrair lógica para módulo canônico interno com responsabilidade clara.
- Preservar contratos públicos, payloads e semântica observável.
- Adicionar teste(s) de invariantes/regressão focados no recorte.

## Fronteira crítica selecionada (alvo único)

- Arquivo alvo: `apps/api/src/services/credit-card-invoices.service.js`.
- Critério operacional de escolha: regra financeira crítica usada em dois pontos sensíveis do fluxo (shape de resposta de fatura e bloqueio de confirmação no link de pendência), com risco direto de inconsistência sem fronteira canônica.
- Fronteira consolidada nesta fatia: resolução de sinais de classificação ambígua (`classificationAmbiguous`, `reasonCode`, `requiresUserConfirmation`, `classificationConfidence`) em módulo interno dedicado (`credit-card-invoice-classification.service.js`).
- Contrato público que deve permanecer intocado: rotas de `credit-cards invoices` e shape de resposta retornado pelo parse/list/link.
- Métrica simples de melhora desta fatia: regra única de classificação removida do serviço principal e isolada em módulo testável próprio, sem alteração de API.

## Escopo que não entra

- Refactor estrutural amplo do domínio inteiro.
- Múltiplas frentes de consolidação na mesma PR.
- Mudanças de contrato público FE/BE.
- Reabertura de dashboard semantics (AUD-014) ou modularização ampla de hotspots (AUD-015).
- Reabertura de smoke/corpus/hardening já encerrados.

## Critérios verificáveis mínimos

- Regra crítica selecionada consolidada em módulo explícito e testável.
- Contrato público preservado sem mudança de comportamento externo.
- Testes focados verdes no recorte alterado.
- Mudança delimitada à AUD-016.

## Prova de preservação de contrato

- Teste regressivo focado no comportamento público do endpoint:
	- `apps/api/src/credit-card-invoices.test.js`
- Teste dedicado da fronteira interna consolidada:
	- `apps/api/src/services/credit-card-invoice-classification.service.test.js`
- Check visível da fatia:
	- `domain-invoice-classification` (CI)

## Rollback

- Reversão única da fatia.
- Caso necessário, restaurar implementação anterior da regra consolidada em um único revert.
- Rollback exato da integração:
	- remover script `test:domain:invoice-classification` de `apps/api/package.json`.
	- remover job `domain-invoice-classification` de `.github/workflows/ci.yml`.
	- reverter extração do módulo `apps/api/src/services/credit-card-invoice-classification.service.js`.
