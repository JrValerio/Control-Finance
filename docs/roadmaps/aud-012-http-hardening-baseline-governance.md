# AUD-012 - Baseline hardening HTTP (Governanca de Slice)

Fonte oficial de sequenciamento: docs/roadmaps/audit-backlog-executable-plan-2026-04-03.md.

## Objetivo da fatia

Estabelecer baseline minimo de hardening HTTP para workloads sensiveis, com contrato objetivo de headers/cors/cookies e validacao automatizada contra regressao.

## Dependencia recomendada

- AUD-002 (hard fail de JWT) como base de seguranca para o recorte de hardening.

## Contrato herdado (nao regredir)

- AUD-007, AUD-008 e AUD-009: sem reabertura de parser/OCR/ambiguidade/corpus.
- AUD-011: primeiro gate integrado de jornada critica ja entregue; esta fatia nao expande smoke amplo/e2e.

## Escopo que entra

- Definir baseline minima de headers de seguranca para respostas HTTP sensiveis.
- Definir regra minima de CORS/cookies no recorte atual.
- Adicionar teste(s) de contrato para impedir regressao do baseline no CI.
- Produzir metrica basica de violacao de policy no recorte validado.

## Baseline minimo explicito do recorte

- Headers obrigatorios no recorte sensivel:
	- `Cross-Origin-Opener-Policy` (default `same-origin`, excecao auth `same-origin-allow-popups`)
	- `Cross-Origin-Embedder-Policy: require-corp`
	- `X-Content-Type-Options: nosniff`
	- `X-Frame-Options: SAMEORIGIN`
	- `Referrer-Policy: strict-origin-when-cross-origin`
	- `X-Permitted-Cross-Domain-Policies: none`
	- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- CORS minimo:
	- origem permitida do recorte deve receber `Access-Control-Allow-Origin` e `Access-Control-Allow-Credentials: true`
	- origem nao permitida deve falhar com 403
- Cookies (contrato de flags):
	- cookies de autenticacao com `HttpOnly` e `SameSite` coerente com politica atual do ambiente

## Regressao bloqueante nesta fatia

- Ausencia/alteracao indevida de qualquer item do baseline minimo acima no recorte testado.
- CORS aceitando origem fora da allowlist do recorte.
- Emissao de cookie de autenticacao sem flags minimas de contrato.

## Escopo que nao entra

- Reestruturacao ampla de middlewares/roteamento.
- Mudanca de semantica funcional de endpoints de negocio.
- Expansao para auditoria completa de todo trafego HTTP fora do recorte minimo.
- Reabertura de temas das fatias AUD-007/008/009/011.

## Rollback

- Reversao unica da fatia.
- Fallback por profile de headers por ambiente, conforme plano executavel.
- Rollback exato da integracao:
	- remover script `test:hardening:http` de `apps/api/package.json`
	- remover job `http-hardening-baseline` de `.github/workflows/ci.yml`
	- remover teste de contrato do recorte em `apps/api/src/http-hardening-baseline.test.js`

## Criterios verificaveis minimos

- Contrato explicito de headers/cors/cookies para o recorte sensivel definido.
- Teste automatizado falha quando houver regressao do baseline.
- CI sinaliza a validacao de hardening no recorte minimo.
- Mudancas restritas a AUD-012, sem acoplamento indevido com outras fatias.