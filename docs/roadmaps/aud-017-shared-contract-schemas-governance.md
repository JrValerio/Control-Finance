# AUD-017 - Schemas/Enums Compartilhados (Governanca de Slice)

Fonte oficial de sequenciamento: docs/roadmaps/audit-backlog-executable-plan-2026-04-03.md (ordem 17).

## Objetivo da fatia

Consolidar fonte unica de contrato para schemas e enums compartilhados entre API e Web, em recorte minimo, sem alterar semantica publica vigente.

## Dependencias e contratos herdados

- AUD-014 fechada no recorte minimo de enforcement semantico FE/BE.
- AUD-016 fechada como consolidacao da primeira fronteira critica de classificacao (base historica obrigatoria para futuras extracoes relacionadas).

## Escopo que entra

- Selecionar recorte minimo de contrato compartilhado para eliminar drift entre API e Web.
- Definir fonte canonica unica para schema/enums do recorte escolhido.
- Preservar payloads e comportamento publico observavel.
- Adicionar testes/checks focados para impedir regressao de contrato.

## Escopo que nao entra

- Reorganizacao ampla de dominio.
- Multipla consolidacao de superficies nao relacionadas no mesmo PR.
- Reabertura de AUD-014 ou AUD-016.
- Migracao estrutural ampla FE/BE fora da fronteira da fatia.

## Criterios verificaveis minimos

- Contrato compartilhado unico definido para a fronteira selecionada.
- API e Web consumindo o mesmo schema/enums no recorte.
- Teste/check focado detectando drift no recorte alterado.
- Mudanca delimitada a AUD-017 com diff cirurgico.

## Rollback

- Reversao unica da fatia.
- Caso necessario, restaurar contrato anterior em um unico revert mantendo comportamento publico.
