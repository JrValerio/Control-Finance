# AUD-014 - Enforcement semantico FE/BE (Governanca de Slice)

Fonte oficial de sequenciamento: docs/roadmaps/audit-backlog-executable-plan-2026-04-03.md (ordem 14).

## Objetivo da fatia

Fechar formalmente o enforcement do contrato semantico canonico entre API e Web no recorte minimo, impedindo inferencia local fora do payload canonico.

## Dependencias e contratos herdados

- AUD-013 fechada como contrato minimo de observabilidade documental/financeira.
- AUD-010 e AUD-011 fechadas no trilho de contrato/smoke.
- AUD-012 fechada no trilho de baseline de hardening HTTP.

## Escopo que entra

- Formalizar contrato semantico canonico consumido por FE e BE no recorte minimo.
- Eliminar inferencia local fora do payload canonico nos pontos cobertos pela fatia.
- Adicionar teste(s) de verdade minima para garantir consistencia FE/BE.
- Adicionar metrica de drift semantico no recorte minimo (se aplicavel sem ampliar escopo).

## Escopo que nao entra

- Refactor estrutural amplo de dominio.
- Reabertura de observabilidade global.
- Reabertura de labels/pontos de instrumentacao/papel de artifact ja fechados na AUD-013.
- Expansao de contrato para superficies nao cobertas pela fatia.

## Criterios verificaveis minimos

- Contrato canonico explicito para o recorte da fatia.
- FE e BE consumindo o mesmo payload canonico no recorte.
- Teste de regressao quebra quando houver inferencia local fora do contrato.
- Evidencia minima de drift/consistencia no CI da fatia.

## Rollback

- Reversao unica da fatia, preservando contratos fechados anteriormente.
- Fallback temporario somente em staging, conforme plano executavel da AUD-014.
