# Control Finance

[![CI](https://github.com/JrValerio/Control-Finance-React-TailWind/actions/workflows/ci.yml/badge.svg)](https://github.com/JrValerio/Control-Finance-React-TailWind/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Control Finance: seu Copiloto Financeiro com IA.**

Não é só um app para registrar entradas e saídas.
É um cockpit financeiro pessoal para acompanhar o presente, visualizar a trajetória do mês e tomar decisões com mais clareza usando metas, projeções, insights acionáveis e uma trilha fiscal assistida para preparação do IRPF.

## Proposta de valor

O Control Finance evoluiu de um gerenciador de gastos para uma experiência de **pilotagem financeira**:

* registra e organiza transações com persistência real
* projeta o comportamento do saldo no mês
* destaca sinais de risco antes do problema explodir
* conecta metas de poupança ao contexto financeiro real
* entrega um insight objetivo do **Especialista IA** no dashboard
* organiza o **IRPF** com a Central do Leão: documentos, revisão, resumo anual e dossiê fiscal exportável

## O que o produto entrega

### 1. Base financeira confiável

* autenticação com JWT
* proteção de login com rate limit e bloqueio temporário por brute force
* transações por usuário com isolamento real de dados
* CRUD com soft delete e restore
* filtros por tipo, período e busca textual
* exportação CSV com totais consolidados

### 2. Visão operacional do mês

* saldo e totais por tipo
* visualização de receita x despesa
* Health Overview com leitura mais executiva do momento financeiro
* alertas proativos quando a trajetória exige ajuste

### 3. Especialista IA com preferências do usuário

* endpoint dedicado para geração de insight financeiro contextual
* análise baseada em forecast, categorias de gasto e metas em andamento
* **tom configurável**: Pragmático · Motivador · Sarcástico — o usuário define como o Especialista se comunica
* **frequência configurável**: Sempre · Só quando há risco — suprime insights positivos e economiza chamadas ao LLM
* falha silenciosa do LLM sem quebrar o dashboard
* proteção por rate limiter para controle de abuso e custo

### 4. Saving Goals

* CRUD completo de metas
* cálculo automático de quanto poupar por mês
* progresso visual por objetivo
* integração das metas ao contexto da IA
* ação rápida para reduzir fricção no uso

### 5. Painel de controle do usuário

* Perfil reestruturado em três seções: Dados da conta · Preferências · Assinatura
* Modo Discreto: oculta valores monetários com máscara textual `R$ ••••` (sem blur — layout estável)
* Preferências do Copiloto: tom e frequência do Especialista IA configuráveis e persistidos no backend

### 6. Onboarding orientado a valor

* WelcomeCard v2 com a jornada:

  * registre uma transação
  * configure seu perfil
  * defina suas metas de poupança
  * ouça o Especialista IA

### 7. Central do Leão (IRPF MVP)

* rota dedicada em `/app/tax` e `/app/tax/:taxYear`
* upload fiscal de `PDF`, `CSV`, `PNG` e `JPG`
* pipeline determinístico: documento -> classificação -> extração -> fatos fiscais -> revisão
* comparação de obrigatoriedade e resumo anual por exercício
* rebuild explícito de snapshot fiscal e export oficial de dossiê em `JSON` e `CSV`
* guardrail de produto: prepara e organiza o IRPF, mas **não** transmite DIRPF nem substitui os canais oficiais da Receita

## Stack

### Web

* React
* Vite
* Tailwind CSS
* React Router
* Axios
* Recharts
* Vitest + Testing Library

### API

* Node.js
* Express
* PostgreSQL
* JWT
* rate limiting
* migrations SQL
* Vitest + Supertest

### IA

* Anthropic SDK
* geração de insight financeiro contextual
* estratégia de degradação graciosa em caso de falha

## Arquitetura

```text
apps/
  web/  -> Frontend React + Vite
  api/  -> Backend Express + PostgreSQL
```

### Fluxo principal

```text
Web (apps/web)
  -> autenticação JWT
  -> chamadas para API autenticada
  -> dashboard financeiro
  -> metas + forecast + IA

API (apps/api)
  -> auth
  -> transactions
  -> goals
  -> tax (Central do Leao / IRPF)
  -> export CSV
  -> insight de IA
  -> Postgres
```

## Funcionalidades principais

### Dashboard

* visão consolidada de entradas, saídas e saldo
* leitura rápida do estado financeiro do mês
* insight contextual do Especialista IA
* experiência orientada a decisão, não só a registro

### Transações

* criação, edição e exclusão
* soft delete e restauração
* filtros por tipo, data e busca
* exportação CSV com resumo final

### Metas

* criar, editar e remover metas
* acompanhar progresso percentual
* visualizar valor restante
* saber exatamente quanto precisa guardar por mês

### Central do Leão

* subir documentos fiscais e reprocessar quando necessário
* revisar fatos fiscais aprovando, corrigindo ou rejeitando
* rebuildar o resumo anual do exercício com snapshot versionado
* baixar o dossiê oficial do produto em `JSON` e `CSV`
* trabalhar com um fluxo honesto de preparação do IRPF sem prometer envio oficial à Receita

### Segurança e resiliência

* brute force protection no login
* isolamento por usuário autenticado
* middleware global de erro
* migrations automáticas no startup
* fallback seguro quando a IA falha

## Como rodar localmente

### 1. Instale as dependências

```bash
npm ci
```

### 2. Configure os arquivos `.env`

Use como referência:

* `.env.example`
* `apps/web/.env.example`
* `apps/api/.env.example`

### 3. Suba web + api

```bash
npm run dev
```

### 4. Endpoints locais

* Web: `http://localhost:5173`
* API: `http://localhost:3001/health`

## Variáveis de ambiente

### API

```env
DATABASE_URL=
DB_SSL=false
JWT_SECRET=
JWT_EXPIRES_IN=24h
CORS_ORIGIN=http://localhost:5173
TRUST_PROXY=1
```

### Hardening de auth

```env
AUTH_RATE_LIMIT_MAX=
AUTH_RATE_LIMIT_WINDOW_MS=
AUTH_BRUTE_FORCE_MAX_ATTEMPTS=
AUTH_BRUTE_FORCE_WINDOW_MS=
AUTH_BRUTE_FORCE_LOCK_MS=
TAX_DOCUMENTS_STORAGE_DIR=
TAX_DOCUMENT_MAX_FILE_SIZE_BYTES=10485760
```

### IA

```env
ANTHROPIC_API_KEY=
AI_RATE_LIMIT_MAX=10
AI_RATE_LIMIT_WINDOW_MS=600000
```

### Web

```env
VITE_API_URL=http://localhost:3001
```

## Deploy

### API no Render

Configuração recomendada:

* Root Directory: `apps/api`
* Build Command:

```bash
npm ci --omit=dev && npm run build
```

* Start Command:

```bash
npm start
```

### Web no Vercel

Configuração recomendada:

* Root Directory: `apps/web`
* Framework: `Vite`

### Checklist de deploy

* API sobe com migrations executadas
* `GET /health` responde 200
* login e registro funcionam
* `VITE_API_URL` aponta para a API pública
* `ANTHROPIC_API_KEY` está configurada na API se a camada de IA estiver habilitada
* `TAX_DOCUMENTS_STORAGE_DIR` aponta para storage persistente se a Central do Leão estiver habilitada em produção

## Scripts

### Root

```bash
npm run dev
npm run lint
npm run test
npm run build
npm run preview
```

### API

```bash
npm -w apps/api run db:migrate
npm -w apps/api run db:seed
npm -w apps/api run test
```

### Web

```bash
npm -w apps/web run test:run
npm -w apps/web run build
```

## Qualidade

* monorepo com npm workspaces
* CI com web e API
* runtime padronizado em Node 24.x
* cobertura de fluxos críticos com testes automatizados
* arquitetura evolutiva para produto SaaS

## Documentação técnica

* `docs/roadmap-execution.md` — mapa interno de execução: estado atual, próximo sprint, backlog e decisões arquiteturais

* `docs/architecture/v1.31.0-central-do-leao-irpf.md`
* `docs/architecture/v1.6.11-billing-state-machine.md`
* `docs/architecture/v1.3.0.md`
* `docs/architecture/v1.3.0-auth.md`
* `docs/architecture/v1.3.1-transactions.md`
* `docs/architecture/v1.4.0-postgres.md`
* `docs/architecture/v1.4.2-auth-hardening.md`
* `docs/architecture/v1.4.3-transactions-crud-plus.md`
* `docs/architecture/v1.5.0-export-csv.md`
* `docs/architecture/v1.6.6-web-typescript-services-and-routes.md`

## Roadmap

* [x] Auth + rotas protegidas
* [x] Persistência real em Postgres
* [x] CRUD de transações com restore
* [x] Exportação CSV com filtros
* [x] Health Overview
* [x] Saving Goals
* [x] Especialista IA
* [x] Central do Leão (IRPF MVP)
* [x] Onboarding orientado a valor
* [ ] Importação com revisão assistida
* [ ] Simulações "e se?"
* [ ] Expansão de inteligência financeira contextual

## Licença

MIT. Consulte `LICENSE`.
