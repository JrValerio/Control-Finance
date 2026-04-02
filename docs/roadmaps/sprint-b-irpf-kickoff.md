# Sprint B — Kickoff IRPF (2026-04-02)

## Objetivo da sprint

Entrar na trilha de entrega do IRPF com execução previsível e sem regressão de comportamento, seguindo a sequência:

1. Decisão de escopo da deduplicação SHA256
2. PR L — fluxo principal de revisão de fatos
3. PR M — validações e alertas de obrigatoriedade
4. PR N — exportação guiada com feedback visual

---

## Gate obrigatório antes do PR L

### Decisão de escopo da deduplicação SHA256

Opções avaliadas:

- Global por usuário (dedupe entre todos os anos)
- Por ano-calendário (dedupe apenas dentro do mesmo exercício)

### Critérios de decisão

- Segurança contra duplicação de fato fiscal real
- Risco de falso positivo em documentos recorrentes
- Simplicidade de explicação para suporte e auditoria
- Custo de implementação e manutenção

### Decisão vigente para início da sprint

- Escopo inicial: **por ano-calendário**
- Revisão posterior: ampliar para global apenas com evidência de ganho líquido

Justificativa curta:

- Minimiza risco de bloquear fatos legítimos em exercícios diferentes
- Mantém comportamento alinhado à lógica de declaração por exercício

---

## Plano de execução

### PR L — fluxo principal de revisão de fatos

Escopo:

- bulk approve
- filtros por status/tipo/fonte
- status visível por fato na fila

Plano cirúrgico detalhado:

- `docs/roadmaps/sprint-b-pr-l-plano-cirurgico.md`

Critério de aceite:

- revisar lotes sem operação manual linha a linha
- ações em lote com feedback visual claro de sucesso/erro

### PR M — validações e alertas de obrigatoriedade

Escopo:

- regras CLT vs INSS
- limites de isenção e sinalização de risco
- alertas explicáveis com origem da regra

Critério de aceite:

- alertas acionam de forma determinística
- sem alerta silencioso e sem bloqueio indevido

### PR N — exportação guiada com feedback visual

Escopo:

- fluxo guiado de exportação
- progresso e resultado explícitos
- snapshot consistente para download

Critério de aceite:

- usuário entende claramente estado da exportação
- erros de geração não ficam silenciosos

---

## Guardrails operacionais da sprint

- Diff pequeno e objetivo por PR
- Causa raiz explícita no corpo do PR
- Suite relevante verde antes de pedir revisão
- Proibição de merge sem:
  - diff completo apresentado
  - aprovação explícita

---

## Checkpoint de início

Sprint B iniciada formalmente em 2026-04-02, com gate de deduplicação definido e sequência L → M → N pronta para execução.
