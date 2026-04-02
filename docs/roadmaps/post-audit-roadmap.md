# Roadmap pós-auditoria — Control Finance

## Critérios de priorização

- **P0** — compliance, dado errado para o usuário, bug silencioso
- **P1** — valor de produto direto, usuário percebe
- **P2** — qualidade interna, reduz risco operacional
- **P3** — expansão, feature nova

---

## Sprint A — Correções P0 (agora)

| Item | Gap | Origem |
|---|---|---|
| Forecast congelado sem aviso | Usuário vê número desatualizado após trial expirado sem explicação | Auditoria ⚠️ |
| TODO em `api.ts` | Fallback de erro de paywall incompleto | Auditoria ⚠️ |
| Feedback de OCR desativado | Upload de PDF escaneado falha silenciosamente sem explicar ao usuário | Auditoria ⚠️ |

**PRs:** 1 PR por item. Escopo cirúrgico, sem feature nova.

---

## Sprint B — IRPF (urgência de calendário)

| Item | Gap | PR |
|---|---|---|
| Fluxo principal de revisão de fatos | Bulk approve, filtros, status por fato | PR L |
| Validações e alertas de obrigatoriedade | Perfil CLT vs INSS, limites de isenção | PR M |
| Exportação guiada com feedback visual | Geração de resumo, download, snapshot | PR N |
| Deduplicação SHA256 — decisão de escopo | Global vs por ano-calendário | Decisão antes do PR L |

---

## Sprint C — Forecast Engine avançado (P1)

| Item | Gap | PR |
|---|---|---|
| Explicabilidade dos números | Mostrar de onde vem cada componente da projeção | PR O |
| Cenários (otimista / conservador) | Projeção com e sem pendências, com e sem renda esperada | PR P |
| Histórico de projeções | Comparar projeção atual com períodos anteriores | PR Q |

---

## Sprint D — Qualidade e confiabilidade (P2)

| Item | Gap | PR |
|---|---|---|
| Gate pré-merge automatizado | `git log main..HEAD --oneline` + smoke de UI crítica no CI | PR R |
| E2E smoke tests | Fluxo import → commit → transação aparece na lista | PR S |
| AI — estado vazio tratado | Insight nulo tem UX explícita, não desaparece silenciosamente | PR T |

---

## Sprint E — Expansão (P3)

| Item | Gap | PR |
|---|---|---|
| Importação JSON | No README como `[ ]` desde a fundação | PR U |
| OCR browser-side via Web Workers | Tesseract.js no browser, sem impacto de RAM no Render | PR V |
| Forecast premium (feature Pro) | Cenários como diferencial de plano | PR W |

---

## Resumo de prioridade

```text
Agora      → Sprint A (P0): 3 fixes cirúrgicos
Próximo    → Sprint B (P1/compliance): IRPF L→N
Depois     → Sprint C (P1): Forecast avançado O→Q
Paralelo   → Sprint D (P2): qualidade R→T
Expansão   → Sprint E (P3): JSON, OCR, premium U→W
```
