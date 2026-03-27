# Importação Inteligente de Renda e Extratos

> Documento interno de execução do épico pós-IRPF.
> Status atual: **entregue em `main` no recorte MVP**, com follow-ups pós-MVP ainda abertos.

---

## 1. Objetivo do épico

Transformar importações bancárias e comprovantes de renda em dados financeiros utilizáveis pelo produto:

- sem duplicidade entre comprovante de renda e crédito no extrato
- sem contaminar `forecast` e perfil sem confirmação humana
- sem reduzir `PIX` a uma categoria simplista
- sem misturar compra em cartão com saída imediata de caixa

---

## 2. Estado consolidado

PRs mergeados:

1. `#298` dedupe entre comprovante de renda e extrato bancário
2. `#299` documentos de renda podem compor renda estruturada
3. `#300` sugestão assistida para perfil e planejamento
4. `#301` busca e filtros no preview de importação
5. `#302` categorização em lote + regras recorrentes
6. `#303` guard rails operacionais / undo / histórico auditável
7. `#304` limite bancário
8. `#305` cartão + ciclo inicial de fatura

Resumo executivo:

- a fundação da importação inteligente foi entregue
- o preview pesado já é revisável
- renda documental já conversa com perfil e planejamento
- limites e cartão já abriram o subdomínio financeiro correspondente
- o que sobra agora é backlog pós-MVP, não base estrutural

Auditoria final deste épico:

- `docs/audits/importacao-inteligente-mvp-auditoria-final.md`

---

## 3. Base de código usada no épico

Esta frente não nasceu do zero. O ponto de partida real do repositório foi:

- importação bancária com preview em `ImportCsvModal`
- fluxo de renda estruturada com `income_sources` e `income_statements`
- planejamento mensal já apoiado em `forecast`
- perfil salarial/beneficiário já existente

Arquivos de referência:

- `apps/web/src/components/ImportCsvModal.jsx`
- `apps/web/src/components/IncomeStatementQuickModal.tsx`
- `apps/web/src/pages/IncomeSourcesPage.tsx`
- `apps/api/src/services/transactions-import.service.js`
- `apps/api/src/services/income-sources.service.js`
- `apps/api/src/services/forecast.service.js`
- `apps/api/src/services/salary-profile.service.js`
- `apps/api/src/services/credit-cards.service.js`

---

## 4. Entrega por etapa

### PR1 — dedupe entre comprovante de renda e extrato bancário

- Status: entregue no MVP
- Título: `feat(import): add income import dedupe foundation`

O que entrou:

- fingerprint estável por item importado
- status de preview `valid | duplicate | invalid | conflict`
- vínculo entre crédito bancário e evento de renda estruturado
- motivo de duplicidade visível no preview

### PR2 — documentos de renda viram renda estruturada

- Status: entregue parcial/MVP
- Título: `feat(income): allow imported income documents to compose monthly income`

O que entrou:

- promoção de documento importado para renda estruturada
- vínculo com transação existente quando disponível
- lançamento de entrada quando não há transação compatível
- preservação de bruto, descontos e líquido no histórico

### PR3 — sugestão para perfil e planejamento

- Status: entregue no MVP
- Título: `feat(profile): suggest income updates from structured imports`

O que entrou:

- sugestão confirmável de atualização de renda principal
- sugestão de valor líquido e dia provável
- `forecast` usando só renda confirmada
- fluxo `aceitar | ignorar | revisar depois`

### PR4 — preview de importação com busca e filtros

- Status: entregue no MVP
- Título: `feat(import): add searchable import preview for large statements`

O que entrou:

- busca textual
- filtro por status
- filtro por descrição e categoria
- revisão estável para extratos grandes

### PR5 — categorização em lote e regras simples

- Status: entregue no MVP
- Título: `feat(import): add bulk categorization and import rules`

O que entrou:

- categoria em massa
- regra simples baseada em descrição
- reaproveitamento em imports futuros

### PR8 — guard rails operacionais

- Status: entregue parcial/MVP
- Título: `feat(import): add import safety rails and rollback UX`

O que entrou:

- histórico auditável por sessão
- confirmação antes do undo
- estado revertido no histórico
- resumo mais claro no pós-import

### PR6 — limite bancário / cheque especial

- Status: entregue com recorte MVP
- Título: `feat(finance): add bank limit tracking`

O que entrou:

- `bank_limit_total` no perfil
- cálculo de uso atual do limite
- visão de risco no `forecast`

### PR7 — limite de cartão e ciclo de fatura

- Status: entregue com recorte MVP
- Título: `feat(cards): add credit card limits and bill lifecycle`

O que entrou:

- cadastro de cartão
- limite total / usado / disponível
- compras abertas fora do caixa imediato
- fechamento manual de fatura
- pagamento da fatura como saída real de caixa

---

## 5. Guard rails fixados

- nada de atualizar perfil automaticamente
- nada de jogar renda documental no `forecast` sem confirmação
- `PIX` continua meio de pagamento, não categoria
- compra no cartão não é saída imediata de caixa
- importação grande precisa continuar reversível e auditável

---

## 6. Próxima leitura correta

Este épico **não está mais em construção**.

O backlog correto a partir daqui é:

- consistência operacional do undo
- conciliação mais explícita entre renda documental e crédito bancário
- ampliação do trilho documental além do caso mais forte de INSS
- evolução do domínio de cartão para casos mais ricos

Esses itens devem ser tratados como **pós-MVP**, não como reabertura da fundação já entregue.
