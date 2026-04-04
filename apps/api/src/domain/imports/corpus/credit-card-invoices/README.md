# Credit Card Invoices Golden Corpus (v1)

Este corpus e anonimo e deterministico.

## Regras de anonimizacao

- Nao conter CPF real, e-mail real, telefone real ou numero completo de cartao.
- Campos de identidade devem usar placeholders neutros.
- Valores monetarios, datas e padroes documentais necessarios para classificacao/extracao devem ser preservados.

## Politica de atualizacao

- Atualizacoes de expected devem acontecer apenas quando houver mudanca intencional de contrato.
- Toda mudanca deve ser acompanhada de explicacao no PR sobre impacto de regressao.
- Evitar ampliar corpus em lote grande nesta fatia; manter recorte pequeno e representativo.

## Execucao

- Local: `npm -w apps/api run test:golden`
- CI: suite executada pelo job de testes da API.
