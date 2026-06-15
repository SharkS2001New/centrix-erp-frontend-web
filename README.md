# POS / ERP Web

Next.js frontend for [pos-erp-api](../pos-erp-api). Uses **Laravel Sanctum** bearer tokens against `/api/v1`.

## Stack

- Next.js 16 (App Router)
- JavaScript + Tailwind CSS v4
- Client-side auth (`localStorage` token)

## Setup

```bash
cd pos-erp-web
cp .env.local.example .env.local
npm install
```

Start the API (sibling project):

```bash
cd ../pos-erp-api
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
  lib/           # api client, token storage
  types/         # API types
```

## Build

```bash
npm run build
npm start
```
