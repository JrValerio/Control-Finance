# Pós-MVP — Consistência Operacional e Evolução da Importação Inteligente

> Documento operacional do backlog pós-MVP da trilha de importação inteligente.
> Este arquivo não reabre a fundação já entregue; ele organiza os follow-ups reais do produto.

---

## 1. Contexto

O épico de importação inteligente foi entregue no MVP e já está documentado e auditado em `main`.

A fundação foi fechada com:

- dedupe
- documento compondo renda
- sugestão para perfil/planejamento
- preview com busca/filtros
- categorização em lote + regras
- guard rails operacionais
- limite bancário
- cartão + ciclo inicial de fatura

A partir daqui, o trabalho deixa de ser fundação e passa a ser **consistência operacional, reconciliação mais explícita e evolução de casos reais de uso**.

Documentos de referência:

- `docs/roadmaps/importacao-inteligente-renda-extratos.md`
- `docs/audits/importacao-inteligente-mvp-auditoria-final.md`

Follow-ups já entregues em `main` depois do MVP inicial:

- `#309` conciliação explícita entre renda documental e crédito bancário
- `#310` parcelamento simples no cartão
- `#311` bridge documental para holerite/CLT
- `#312` polish e performance do preview grande
- `#313` undo com cascata segura para derivados

---

## 2. Objetivo do backlog pós-MVP

Seguir evoluindo o produto a partir de uma base já estável, sem reabrir escopo já entregue e sem perder auditabilidade.

---

## 3. P0 — Encerrado em `#313`

O principal gap operacional do pós-MVP foi resolvido com:

- planner de undo por sessão
- cascata segura para `income_statements` revertíveis
- cascata segura para `bills` revertíveis
- bloqueio explícito para derivados evoluídos fora do fluxo seguro

A partir daqui, o backlog segue só com follow-ups reais de produto.

---

## 4. P1 — Evolução funcional real do produto

### 4.1 Conciliação explícita entre renda documental e crédito bancário

**Status:** entregue no recorte inicial via `#309`

#### Objetivo

Evoluir a visibilidade e a revisão do vínculo já existente entre:

- documento de renda
- crédito bancário correspondente
- entrada considerada oficial no fluxo do usuário

#### Escopo

- painéis mais claros de conciliado, pendente e conflitante
- revisão manual mais fluida
- acabamento da comunicação de conflito
- ampliar confiança do usuário na reconciliação já feita

#### Critérios de aceite

- usuário entende o vínculo conciliado sem precisar inferir pela UI
- conflitos continuam visíveis e não silenciosos
- o produto continua sem duplicar renda em caso conciliado

### 4.2 Evolução do cartão para casos mais reais

**Status:** MVP entregue com parcelamento simples via `#310`

#### Objetivo

Ir além do ciclo inicial já entregue para um modelo mais próximo do uso cotidiano.

#### Escopo

- parcelamento mais rico
- melhor modelagem de fechamento e vencimento
- relação mais clara entre compra, fatura e pagamento
- possibilidade de múltiplos cenários reais de uso

#### Critérios de aceite

- compra parcelada não distorce visão de gasto
- fatura continua inteligível
- pagamento da fatura continua separado da compra

### 4.3 Expansão do pipeline documental além do trilho forte de INSS

**Status:** bridge inicial de holerite/CLT entregue via `#311`

#### Objetivo

Generalizar ainda mais o fluxo documental sem ficar dependente demais dos casos já fortes.

#### Escopo

- ampliar cobertura para outros formatos além de INSS/CLT
- estruturar melhor casos de renda autônoma documental
- manter a mesma disciplina de extração, confirmação e impacto no planejamento

#### Critérios de aceite

- fluxo documental funciona de forma consistente para além de INSS
- perfil e planejamento continuam dependendo de confirmação humana
- sem perda de determinismo

### 4.4 Performance e polish em imports grandes

**Status:** MVP entregue no recorte inicial via `#312`

#### Objetivo

Seguir melhorando a experiência com massa maior de dados sem mexer desnecessariamente no domínio.

#### Escopo

- refinamento contínuo de busca/filtros
- UX para grandes volumes
- revisão de performance em listas extensas
- acabamento de preview/import

#### Critérios de aceite

- imports grandes continuam navegáveis
- busca/filtros seguem responsivos
- revisão manual não vira sofrimento bíblico em planilha disfarçada

---

## 5. P2 — Camada de refinamento e automação assistida

### 5.1 UX mais rica de reconciliação

- painéis mais claros de conciliado vs pendente vs conflitante
- ações de revisão mais fluidas
- linguagem mais explícita para o usuário

### 5.2 Regras mais sofisticadas de cartão/fatura

- cenários mais completos de ciclo
- ajustes finos de fechamento
- regras adicionais sem quebrar clareza do MVP

### 5.3 Automações assistidas extras, sem perder determinismo

- sugestões mais inteligentes
- regras reaproveitáveis mais ricas
- apoio contextual ao usuário
- sempre com confirmação e trilha auditável

### Critério geral de P2

Ganhar conveniência sem transformar o produto em caixa-preta.

---

## 6. Fora de escopo deste backlog

- reabrir o backlog já entregue no MVP
- reinventar fundação de importação
- automatizar demais a ponto de sacrificar auditabilidade
- criar reconciliação “mágica” sem visibilidade clara

---

## 7. Ordem recomendada

1. **P1 — evolução de cartão**
2. **P1 — expansão documental**
3. **P1 — reconciliação com UX mais explícita**
4. **P1 — performance/polish orientado por uso real**
5. **P2 — refinamentos de UX e automações assistidas**

---

## 8. Veredito

O pós-MVP certo não é abrir escopo novo por impulso.
É evoluir reconciliação, cartão e pipeline documental com calma e critério, a partir de uma base operacional já consistente.
