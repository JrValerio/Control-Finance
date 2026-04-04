# AUD-011 - Smoke integrado em CI (Governanca de Slice)

Fonte oficial de sequenciamento: docs/roadmaps/audit-backlog-executable-plan-2026-04-03.md.

## Objetivo da fatia

Adicionar um recorte minimo e executavel de smoke integrado no CI para jornadas financeiras criticas, com sinal de falha claro para bloquear regressao de merge.

## Dependencias recomendadas (ja atendidas)

- AUD-009: guardrail documental inicial (corpus/golden) concluido.
- AUD-010: limpeza de superficie no recorte de importacao concluida.

## Contrato herdado (nao regredir)

- AUD-007: transparencia de status/falha de OCR continua obrigatoria.
- AUD-008: confirmacao explicita em ambiguidade permanece obrigatoria.
- AUD-009: guardrail inicial de regressao documental nao equivale a cobertura ampla.
- AUD-010: depreciacao compativel nao implica remocao hard nesta fatia.

## Escopo que entra

- Definir jornada critica minima para smoke de CI.
- Executar smoke em pipeline de CI com resultado bloqueante para regressao no recorte definido.
- Produzir saida operacional minima para diagnostico de falha (pass/fail por jornada).

## Jornada critica minima (operacional)

- Fluxo escolhido: criar uma pendencia financeira e validar reflexo imediato no resumo de pendencias.
- Entrada minima: usuario autenticado + payload de `POST /bills` com `title`, `amount` e `dueDate` validos.
- Condicao de sucesso: `POST /bills` retorna 201 e `GET /bills/summary` retorna `pendingCount=1` com `pendingTotal` coerente.
- Condicao de falha bloqueante: qualquer divergencia nesses asserts reprova o check dedicado no CI.
- Evidencia operacional no CI: log do job de smoke + artifact `smoke-critical-finance-journey-log`.

## Escopo que nao entra

- Expansao ampla de cobertura end-to-end.
- Reabertura de parser/OCR/ambiguidade/corpus.
- Refactor estrutural de rotas/servicos fora do necessario para smoke.
- Mudancas funcionais de produto fora do recorte de validacao.

## Rollback

- Job de smoke opcional em paralelo ate estabilizar, conforme plano executavel.
- Reversao unica da fatia sem alterar contratos funcionais.
- Rollback exato da integracao: remover o job `smoke-critical-finance-journey` de `.github/workflows/ci.yml` e o script `test:smoke:critical` de `apps/api/package.json`.

## Criterios verificaveis minimos

- Pelo menos uma jornada critica executada no CI de forma deterministica.
- Falha do smoke bloqueia merge no recorte configurado.
- Evidencia de execucao no pipeline (status/check dedicado).
- Mudancas restritas a AUD-011 sem acoplamento indevido com fatias anteriores.