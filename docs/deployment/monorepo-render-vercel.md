# Deploy (Monorepo) - Render (API) + Vercel (Web)

Este repositorio e um monorepo com:
- API: `apps/api`
- Web: `apps/web`

## Render - API (Node/Express)

### Opcao recomendada (Root Directory = `apps/api`)

Settings -> Build & Deploy:
- Root Directory: `apps/api`
- Build Command:
  ```bash
  npm ci --omit=dev && npm run build
  ```
- Start Command:
  ```bash
  npm start
  ```

> O build da API e no-op, entao `--omit=dev` e seguro para deploy.

### Alternativa (Root Directory = repo root)

Se o service estiver com Root Directory no root do monorepo:
- Build Command:
  ```bash
  npm ci --omit=dev -w apps/api
  ```
- Start Command:
  ```bash
  npm start -w apps/api
  ```

### Variaveis de ambiente (Render API)

- `DATABASE_URL` (preferir Internal Database URL do Render Postgres)
- `DB_SSL=false` (Internal URL)
- `DB_SSL=true` (External URL)
- `JWT_SECRET`
- `JWT_EXPIRES_IN` (ex.: `24h`)
- `CORS_ORIGIN` (ex.: `http://localhost:5173,https://<seu-vercel>.vercel.app`)
- `TRUST_PROXY=1`
- `IMPORT_OCR_ENABLED=false` por padrao; habilite apenas se o host da API tiver pelo menos 1GB de RAM disponivel
- `APP_VERSION` (opcional para override; por padrao, `/health.version` usa `apps/api/package.json`)
- `APP_COMMIT` (opcional; `RENDER_GIT_COMMIT` continua prioridade no `/health.commit`)

### Checklist pos-deploy (Render)

- `GET /health` -> 200
- `POST /auth/register` -> 201/200
- `POST /auth/login` -> 200

---

## Vercel - Web (Vite/React)

Settings -> General:
- Root Directory: `apps/web`
- Framework: `Vite`

### Variavel de ambiente (Vercel Web)

- `VITE_API_URL=https://<url-da-api-no-render>`

### Checklist pos-deploy (Vercel)

- Build finaliza sem erros
- Web carrega normalmente
- Login/register chamando API via `VITE_API_URL` (sem fallback para localhost)

---

## Observacao importante (monorepo)

Evite rodar `npm ci --omit=dev` no root se o pipeline tambem buildar o web junto. O web pode depender de devDependencies na etapa de build.
