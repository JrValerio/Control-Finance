# AUD-012 - Baseline hardening HTTP (Governanca de Slice)

Fonte oficial de sequenciamento: docs/roadmaps/audit-backlog-executable-plan-2026-04-03.md.

## Objetivo da fatia

Estabelecer baseline minimo de hardening HTTP para workloads sensiveis, com contrato objetivo de headers/cors/cookies e validacao automatizada contra regressao.

## Dependencia recomendada

- AUD-002 (hard fail de JWT) como base de seguranca para o recorte de hardening.

## Contrato herdado (nao regredir)

- AUD-007, AUD-008 e AUD-009: sem reabertura de parser/OCR/ambiguidade/corpus.
- AUD-011: primeiro gate integrado de jornada critica ja entregue; esta fatia nao expande smoke amplo/e2e.

## Escopo que entra

- Definir baseline minima de headers de seguranca para respostas HTTP sensiveis.
- Definir regra minima de CORS/cookies no recorte atual.
- Adicionar teste(s) de contrato para impedir regressao do baseline no CI.
- Produzir metrica basica de violacao de policy no recorte validado.

## Escopo que nao entra

- Reestruturacao ampla de middlewares/roteamento.
- Mudanca de semantica funcional de endpoints de negocio.
- Expansao para auditoria completa de todo trafego HTTP fora do recorte minimo.
- Reabertura de temas das fatias AUD-007/008/009/011.

## Rollback

- Reversao unica da fatia.
- Fallback por profile de headers por ambiente, conforme plano executavel.

## Criterios verificaveis minimos

- Contrato explicito de headers/cors/cookies para o recorte sensivel definido.
- Teste automatizado falha quando houver regressao do baseline.
- CI sinaliza a validacao de hardening no recorte minimo.
- Mudancas restritas a AUD-012, sem acoplamento indevido com outras fatias.