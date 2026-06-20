# Centrix ERP Web

Next.js frontend for **Centrix ERP** by Alpac Software Solutions. Connects to [centrix-erp-backend-api](../centrix-erp-backend-api) and uses **Laravel Sanctum** bearer tokens against `/api/v1`.

## Stack

- Next.js 16 (App Router)
- JavaScript + Tailwind CSS v4
- Client-side auth (`localStorage` token)

## Setup

```bash
cd centrix-erp-frontend-web
cp .env.local.example .env.local
npm install
```

Start the API (sibling project):

```bash
cd ../centrix-erp-backend-api
php artisan serve   # http://localhost:8000
```

Start the frontend:

```bash
npm run dev   # http://localhost:3000
```

Login: **admin** / **password** (demo seeder).

## Environment

| Variable | Default |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api/v1` |
| `NEXT_PUBLIC_COMPANY_CODE` | `DEMO` (organization for this install) |
| `NEXT_PUBLIC_COMPANY_NAME` | Optional display name on login screen |

Set the same organization on the API with `APP_COMPANY_CODE=DEMO` in `.env` so login can omit company code server-side.

## Pages

| Route | API |
|-------|-----|
| `/login` | `POST /auth/login` |
| `/dashboard` | `GET /erp/capabilities` |
| `/products` | `GET /products` |
| `/sales` | carts, lines, checkout |
| `/inventory` | `GET /inventory/availability` |
| `/employees` | `GET /employees` |
| `/reports` | `GET /reports/` catalog |

Sidebar items hide when the tenant module is disabled (from capabilities).

## Project layout

```
src/
  app/           # routes
  components/    # shell, sidebar, auth guard
  contexts/      # auth + capabilities
  lib/           # api client, token storage, branding
  types/         # API types
```

Branding constants live in `src/lib/branding.js` (`Centrix ERP`, `Alpac Software Solutions`).

## Build

```bash
npm run build
npm start
```

## Docker

Build and run locally (set your API URL at build time — Next.js bakes `NEXT_PUBLIC_*` into the bundle):

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://your-api.example.com/api/v1 \
  --build-arg NEXT_PUBLIC_COMPANY_CODE=DEMO \
  -t centrix-erp-frontend-web .
docker run --rm -p 3000:3000 centrix-erp-frontend-web
```

Images are published to `ghcr.io/<owner>/centrix-erp-frontend-web` on push to `main`/`master` via `.github/workflows/docker-publish.yml`.

Optional GitOps: set repository variable `K8S_SETUP_REPO` (e.g. `centrix-erp-setup`) and secret `PERSONAL_ACCESS_TOKEN` to auto-update Helm `values.yaml` tags (same pattern as pitchpredictionswebsite → pitchpredk3ssetup).
