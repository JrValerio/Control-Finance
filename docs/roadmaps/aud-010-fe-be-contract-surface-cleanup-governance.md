# AUD-010 - Limpeza de superficie FE/BE (Governanca de Slice)

Fonte oficial de sequenciamento: docs/roadmaps/audit-backlog-executable-plan-2026-04-03.md.

## Objetivo da fatia

Classificar a superficie publica de contrato FE/BE (endpoints e payloads expostos), identificar o que esta sem owner/uso ativo e iniciar poda controlada sem quebrar fluxo ativo.

## Contrato herdado (nao regredir)

- AUD-007: transparencia de status/erro em OCR continua obrigatoria.
- AUD-008: ambiguidade exige confirmacao explicita quando aplicavel.
- AUD-009: guardrail inicial de regressao documental foi entregue; nao representa cobertura documental ampla.

## Escopo que entra

- Inventario objetivo de endpoints/contratos expostos para fluxo financeiro ativo.
- Classificacao por owner/status (ativo, deprecado, candidato a remocao).
- Primeira poda segura de superficie sem uso, com compatibilidade monitorada.
- Testes de compatibilidade para evitar quebra de fluxo ativo.

## Escopo que nao entra

- Reabertura semantica de AUD-007/AUD-008/AUD-009.
- Expansao de parser, OCR, corpus ou golden tests.
- Mudancas de UX fora do necessario para manter compatibilidade.
- Introducao de fila/background ou alteracao arquitetural ampla.

## Rollback

- Reversao unica da fatia.
- Restauracao rapida por alias curto para endpoint deprecado, se houver impacto inesperado.

## Criterios verificaveis minimos

- Mapa de superficie publica com owner/status por endpoint afetado.
- Pelo menos um teste de compatibilidade cobrindo fluxo financeiro ativo apos a poda.
- Nenhuma quebra funcional em smoke basico do fluxo ativo.
- Mudancas restritas a AUD-010, sem acoplamento indevido com outras fatias.