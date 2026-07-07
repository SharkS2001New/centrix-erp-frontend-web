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
| `NEXT_PUBLIC_USE_COOKIE_AUTH` | `false` locally; set `true` in production with API `WEB_COOKIE_AUTH=true` |
| `NEXT_PUBLIC_COMPANY_CODE` | `DEMO` (organization for this install) |
| `NEXT_PUBLIC_COMPANY_NAME` | Optional display name on login screen |
| `NEXT_PUBLIC_REVERB_APP_KEY` | Reverb app key (must match API `REVERB_APP_KEY`) |
| `NEXT_PUBLIC_REVERB_HOST` | WebSocket host (e.g. `localhost` or your API host) |
| `NEXT_PUBLIC_REVERB_PORT` | WebSocket port (default `8080` local, `443` HTTPS) |
| `NEXT_PUBLIC_REVERB_SCHEME` | `http` or `https` |

### Real-time notifications (optional)

With [Laravel Reverb](https://laravel.com/docs/reverb) enabled on the API, the notification bell updates instantly when another user triggers an approval.

**API** (`.env`): set `BROADCAST_CONNECTION=reverb` and matching `REVERB_*` keys, then run `php artisan reverb:start`.

**Web** (`.env.local`): set the `NEXT_PUBLIC_REVERB_*` variables from `.env.local.example`.

If Reverb is not configured, the app keeps using polling (no breakage).

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

## Testing

Vitest covers RBAC helpers (`approval-permissions`, route access). CI runs `npm test` on every pull request.

```bash
npm test              # run once (CI)
npm run test:watch    # local watch mode
npm run lint
```

When the API sibling checkout is available, verify frontend permission codes against the backend registry:

```bash
npm run test:permissions
# refresh snapshot after registry changes on the API:
npm run sync:permission-snapshot
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

Images are published to `ghcr.io/<owner>/centrix-erp-frontend-web` on push to `main`/`master` via `.github/workflows/docker-publish.yml`. Each push also updates `tag` in `pitchpredk3ssetup/centrix-erp-frontend-web/values.yaml` (same pattern as pitchpredictionswebsite).

Requires GitHub secret `PERSONAL_ACCESS_TOKEN` with `repo` and `write:packages` scopes.
