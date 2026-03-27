# Auditoria Final — Épico de Importação Inteligente + Limites + Cartão

> Relatório executivo final do épico já entregue em `main`.
> Foco: separar o que foi realmente entregue no MVP dos follow-ups legítimos de pós-MVP.

---

## 1. Entregue

O épico está **majoritariamente entregue no MVP**.

Entrou em `main`:

- dedupe entre comprovante de renda e crédito bancário
- documento importado podendo compor renda
- sugestão confirmável para atualizar perfil e planejamento
- preview com busca e filtros para extratos grandes
- categorização em lote com regras reaproveitáveis
- guard rails operacionais de importação
- limite bancário no perfil e no `forecast`
- cartão com limite, compras abertas, fechamento manual de fatura e pagamento da fatura como saída real de caixa

Leitura correta:

- a fundação do domínio foi entregue
- o MVP já tem valor real de produto
- o que falta agora é refino pós-MVP, não base estrutural

---

## 2. Gaps

### 2.1 Undo incompleto dos derivados

O desfazer importação ainda não fecha o ciclo inteiro.

Hoje:

- a sessão pode ser revertida pelo histórico
- `transactions` da sessão são revertidas
- mas artefatos derivados como `income_statements` ou `bills` não entram automaticamente nessa mesma reversão

Esse é o gap mais sério do pacote porque cria risco de inconsistência operacional.

### 2.2 Documento vira renda, mas ainda mais forte para INSS

O núcleo existe e está bom, mas o trilho mais maduro hoje ainda é o de INSS.

O produto ainda não está igualmente maduro para:

- holerite/CLT
- outros comprovantes de renda documental
- generalização ampla do parser documental para “renda estruturada”

### 2.3 Cartão/fatura entrou como MVP manual

O modelo está correto para MVP, mas ainda curto para ciclo real mais rico.

Follow-ups naturais:

- parcelamento
- ciclos mais sofisticados
- conciliação por conta pagadora
- regras mais ricas de fechamento

### 2.4 Documentação fora do git

Quando o código anda e a documentação fica só local, o produto começa a mentir no papel.

Esse risco não é de runtime, mas é risco real de operação e alinhamento do time.

---

## 3. Riscos

Os riscos reais deste épico, no estado atual, são:

- sensação de conciliação completa sem existir reconciliador explícito
- inconsistência entre sessão de importação e entidades derivadas
- edge cases de cartão/fatura ainda abertos
- drift entre `main` e documentação local

---

## 4. Entregue vs planejado

### PR1 — dedupe entre comprovante de renda e extrato bancário

- Status: entregue no MVP

### PR2 — documento importado compõe renda

- Status: entregue parcial/MVP

### PR3 — sugestão para perfil e planejamento

- Status: entregue no MVP

### PR4 — preview com busca e filtros

- Status: entregue no MVP

### PR5 — categorização em lote + regras

- Status: entregue no MVP

### PR8 — guard rails operacionais

- Status: entregue parcial/MVP
- ressalva: undo ainda não cascata para derivados

### Limite bancário

- Status: entregue com recorte MVP

### Cartão + ciclo de fatura

- Status: entregue com recorte MVP

---

## 5. Backlog pós-MVP

### P0

- fazer o undo de importação bloquear ou reverter também `income_statements` e `bills` derivados

### P1

- ampliar renda documental além do trilho forte de INSS
- criar visão explícita de conciliação entre renda documental e crédito bancário
- evoluir cartão para parcelamento e ciclo mais realista
- fazer polish e performance do preview/import em volume alto

---

## 6. Veredito

O épico está **entregue no que prometia como fundação de MVP**.

Não há blocker estrutural.

O que existe agora é um conjunto de follow-ups legítimos para:

- fechar consistência operacional
- ampliar cobertura documental
- sofisticar o subdomínio de cartão
- manter a documentação alinhada ao estado real do código

Próximo passo correto:

1. manter esta auditoria versionada no repositório
2. usar este documento como referência para o backlog pós-MVP
3. não reabrir a fundação já entregue como se ela ainda estivesse pendente
