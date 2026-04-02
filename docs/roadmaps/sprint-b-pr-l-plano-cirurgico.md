# Sprint B - PR L - Plano cirurgico (fluxo principal de revisao de fatos)

Data: 2026-04-02  
Status: pronto para execucao

## Objetivo

Entregar o fluxo principal da fila de revisao de fatos da Central do Leao com foco em produtividade operacional e previsibilidade:

- aprovar em lote sem acao linha a linha;
- filtrar rapidamente o que precisa ser tratado;
- deixar o status de cada fato explicito na tela.

## Escopo (dentro do PR L)

1. Filtros na fila de revisao
- filtro por status de revisao do fato (pending, approved, corrected, rejected);
- filtro por tipo de fato (factType);
- filtro por origem/fonte (com ou sem documento, e/ou sourceLabel quando disponivel);
- atualizacao da listagem via query no backend, sem carregar tudo em memoria para filtrar no frontend.

2. Bulk approve operacional
- manter acao de aprovacao em lote no fluxo principal;
- aplicar a acao sobre o conjunto visivel/ativo da fila (compatibilizado com filtros);
- feedback claro de sucesso/erro e contagem de itens afetados.

3. Status por fato visivel
- badge de status por fato na linha/cartao da fila;
- sem ambiguidade entre pendente, aprovado, corrigido e rejeitado;
- manter alertas ja existentes (conflito, duplicidade, CPF divergente) sem regressao.

## Fora de escopo (nao entra no PR L)

- mudanca de regra de deduplicacao SHA256 (gate ja decidido: por ano-calendario);
- novas regras de obrigatoriedade fiscal (PR M);
- fluxo guiado de exportacao/snapshot e UX de export (PR N);
- refactor amplo de layout da pagina fora da fila de revisao.

## Arquivos-alvo

Frontend:
- apps/web/src/pages/TaxPage.tsx
- apps/web/src/pages/TaxPage.test.tsx
- apps/web/src/services/tax.service.ts

Backend:
- apps/api/src/routes/tax.routes.js
- apps/api/src/services/tax-facts.service.js
- apps/api/src/services/tax-reviews.service.js (somente se ajuste de bulk exigir)
- apps/api/src/tax.test.js

Documentacao de acompanhamento:
- docs/roadmaps/sprint-b-irpf-kickoff.md (referencia de sequencia L -> M -> N)

## Criterios de aceite

1. Filtros funcionam de forma deterministica
- dado um conjunto de fatos com status/tipos diferentes, cada filtro retorna somente o subconjunto esperado;
- combinacao de filtros nao mistura estados nem ignora parametros;
- limpar filtros restaura a visao base da fila.

2. Bulk approve respeita o contexto de revisao
- ao acionar bulk approve, somente fatos elegiveis sao aprovados;
- UI remove/atualiza itens afetados sem estado fantasma;
- usuario recebe mensagem com resultado da operacao.

3. Status por fato fica evidente
- cada item da fila exibe status de revisao sem depender de inferencia;
- rotulos de conflito continuam visiveis em paralelo;
- nao ha regressao na leitura de alertas fiscais.

4. Sem regressao de contratos
- chamadas existentes de revisao individual continuam funcionando;
- contrato de listagem de fatos permanece retrocompativel para campos existentes.

## Validacao

Frontend (foco):
- npm -w apps/web run test:run -- src/pages/TaxPage.test.tsx

Backend (foco):
- npm -w apps/api run test -- src/tax.test.js

Validacao de seguranca do PR:
- npm run test

## Estrategia de implementacao (pequena e segura)

1. Expandir contrato de listagem de fatos
- adicionar parametros opcionais de filtro no service web e no endpoint de listagem.

2. Aplicar filtros no backend
- traduzir query params para where clauses seguras no listTaxFactsByUser;
- manter paginacao e resposta padrao.

3. Conectar filtros na TaxPage
- estados de filtro locais + disparo de recarga de fila;
- preservar comportamento atual de sucesso/erro e carregamento.

4. Ajustar bulk approve para contexto filtrado
- operar sobre conjunto visivel/elegivel;
- atualizar contadores e feedback sem reload desnecessario quando possivel.

5. Cobrir com testes
- casos de filtro + bulk + status por fato no web;
- caso de listagem com filtros no backend.

## Riscos e mitigacao

- Risco: filtro por fonte gerar consultas caras.
- Mitigacao: comecar com filtros index-friendly (status, tipo, presence de documento) e validar performance.

- Risco: bulk approve em itens nao pendentes.
- Mitigacao: garantir elegibilidade no backend e mensagens claras no retorno.

- Risco: regressao em contadores da tela.
- Mitigacao: atualizar via preview quando disponivel e validar em teste de pagina.

## Definition of Done do PR L

- escopo acima entregue sem extrapolacao;
- testes-alvo verdes + suite relevante verde;
- diff pequeno, causa raiz explicita e sem alteracoes laterais;
- pronto para revisao com diff completo antes de qualquer merge.
