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

---

## 2. Objetivo do backlog pós-MVP

Fechar o principal gap operacional remanescente e abrir a próxima camada de evolução do produto sem reabrir escopo já entregue.

---

## 3. P0 — Undo de importação com cascata para derivados

### Prioridade

Crítica

### Problema

Hoje o desfazer importação pode reverter a sessão principal, mas ainda existe risco de deixar artefatos derivados ativos, o que quebra a consistência entre:

- sessão de importação
- entidades derivadas
- histórico auditável
- estado real do produto

Em produto financeiro, “quase desfeito” é bug, não detalhe.

### Escopo

Implementar `undo` de importação com consistência transacional e/ou bloqueio explícito para derivados.

#### Deve cobrir

- reverter `transactions` da sessão
- reverter ou bloquear `income_statements` derivados da sessão
- reverter ou bloquear `bills` derivados da sessão
- manter o histórico coerente com o estado real após reversão
- preservar auditabilidade do que foi criado, revertido, bloqueado ou mantido

### Regras de negócio

- uma sessão desfeita não pode deixar artefato derivado ativo sem sinalização explícita
- se não for possível reverter automaticamente um derivado, a operação deve:
  - bloquear o undo completo com mensagem clara, ou
  - marcar o derivado de forma explícita como pendente/incompatível e exigir ação consciente
- histórico e estado persistido precisam contar a mesma história

### Risco

Alto

### Critérios de aceite

- sessão desfeita não deixa `transactions` ativas daquela importação
- sessão desfeita não deixa `income_statements` derivados ativos sem tratamento explícito
- sessão desfeita não deixa `bills` derivados ativos sem tratamento explícito
- histórico reflete reversão completa ou bloqueio justificado
- operação continua auditável ponta a ponta

### Observações de implementação

- preferir abordagem determinística e auditável
- evitar `delete` cego; favorecer `soft-delete` ou `revert status` quando fizer sentido
- garantir que o histórico final seja inteligível para usuário e auditoria interna

---

## 4. P1 — Evolução funcional real do produto

### 4.1 Conciliação explícita entre renda documental e crédito bancário

#### Objetivo

Parar de depender só de heurística implícita e tornar visível a ligação entre:

- documento de renda
- crédito bancário correspondente
- entrada considerada oficial no fluxo do usuário

#### Escopo

- exibir vínculo entre documento e crédito conciliado
- mostrar casos conciliados, pendentes e conflitantes
- permitir revisão manual quando necessário
- evitar dupla leitura de renda em fluxos ambíguos

#### Critérios de aceite

- usuário consegue ver quando uma renda documental já foi conciliada com um crédito bancário
- conflitos ficam visíveis e não silenciosos
- o produto não duplica renda em caso conciliado

### 4.2 Evolução do cartão para casos mais reais

#### Objetivo

Sair do ciclo inicial de fatura para um modelo mais próximo do uso cotidiano.

#### Escopo

- compras parceladas
- melhor modelagem de fechamento e vencimento
- relação mais clara entre compra, fatura e pagamento
- possibilidade de múltiplos cenários reais de uso

#### Critérios de aceite

- compra parcelada não distorce visão de gasto
- fatura continua inteligível
- pagamento da fatura continua separado da compra

### 4.3 Expansão do pipeline documental além do trilho forte de INSS

#### Objetivo

Generalizar o fluxo documental sem ficar dependente demais do caso mais forte atual.

#### Escopo

- ampliar cobertura para CLT/holerite
- estruturar melhor casos de renda autônoma documental
- manter a mesma disciplina de extração, confirmação e impacto no planejamento

#### Critérios de aceite

- fluxo documental funciona de forma consistente para além de INSS
- perfil e planejamento continuam dependendo de confirmação humana
- sem perda de determinismo

### 4.4 Performance e polish em imports grandes

#### Objetivo

Melhorar experiência com massa maior de dados sem mexer desnecessariamente no domínio.

#### Escopo

- refinamento de busca/filtros
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

1. **P0 — undo com cascata para derivados**
2. **P1 — conciliação explícita**
3. **P1 — evolução de cartão**
4. **P1 — expansão documental**
5. **P1 — performance/polish**
6. **P2 — refinamentos de UX e automações assistidas**

---

## 8. Veredito

O pós-MVP certo não é abrir escopo novo por impulso.
É fechar primeiro a **consistência operacional que ainda pode mentir sobre o estado real**, e depois evoluir reconciliação, cartão e pipeline documental com calma e critério.
