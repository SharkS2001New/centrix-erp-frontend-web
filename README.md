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
| `NEXT_PUBLIC_APP_URL` | Public ERP URL (e.g. `https://erp.example.com`) — used by print-agent installers when the server sees `localhost` behind a proxy |
| `PRINT_AGENT_MSI_URL` | Public URL of the Windows MSI on Cloudflare R2 (302 redirect). Synced by **Build Print Agent MSI** when R2 secrets are set. |
| `PRINT_AGENT_MSI_PATH` | Optional absolute path to a mounted `.msi` (PVC) — usually unnecessary when using R2 |
| `PRINT_AGENT_MSI_DIR` | Optional directory to scan for `*.msi` |
| `PRINT_AGENT_MSI_GITHUB_REPO` | Optional fallback: `owner/repo` for private GitHub Release proxy |
| `PRINT_AGENT_MSI_GITHUB_TOKEN` | Optional fallback token for that release proxy |
| `PRINT_AGENT_DOTNET_URL` | Public URL of `CentrixPrintAgent-win-x64.zip` (recommended Windows till installer) |
| `PRINT_AGENT_DOTNET_PATH` | Optional absolute path to the zip on the server |
| `PRINT_AGENT_DOTNET_DIR` | Optional directory to scan for `*.zip` (default: `print-agent-dotnet/publish`) |

### Windows print service (.NET, recommended)

For Windows tills, use **Centrix Print Agent** — a small .NET Windows service in `print-agent-dotnet/` (~15–25 MB self-contained zip). No Node.js, no QZ Tray, no 400MB MSI.

Build on a Windows PC:

```powershell
cd print-agent-dotnet
.\scripts\publish.ps1
```

Host `publish/CentrixPrintAgent-win-x64.zip` via `PRINT_AGENT_DOTNET_URL` or copy into `print-agent-dotnet/publish/` on the server.

### Print Agent MSI on Cloudflare R2 (legacy)

Do **not** bake the ~400MB MSI into the Docker image. CI uploads it to the **same R2 bucket** used for MySQL backups (`BACKUP_R2_*`), under prefix `print-agent/`.

GitHub Actions secrets (frontend repo) — mirror Platform → Database backups / API `BACKUP_R2_*`:

| Secret | Same as |
|--------|---------|
| `BACKUP_R2_ACCESS_KEY_ID` | Backup R2 access key |
| `BACKUP_R2_SECRET_ACCESS_KEY` | Backup R2 secret |
| `BACKUP_R2_BUCKET` | Backup R2 bucket |
| `BACKUP_R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `BACKUP_R2_PUBLIC_URL` | Backup R2 public/custom domain (no trailing slash) |
| `BACKUP_R2_REGION` | Optional; default `auto` |
| `PERSONAL_ACCESS_TOKEN` | Already used by Docker Publish; syncs `PRINT_AGENT_MSI_URL` into Helm |

Object key (stable): `print-agent/CentrixPrintAgent.msi`  
Public URL: `{BACKUP_R2_PUBLIC_URL}/print-agent/CentrixPrintAgent.msi`

Ensure the bucket allows public reads for that prefix (or the whole public domain), then run **Build Print Agent MSI**.

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
  --build-arg NEXT_PUBLIC_APP_URL=https://your-erp.example.com \
  --build-arg NEXT_PUBLIC_COMPANY_CODE=DEMO \
  -t centrix-erp-frontend-web .
docker run --rm -p 3000:3000 centrix-erp-frontend-web
```

Images are published to `ghcr.io/<owner>/centrix-erp-frontend-web` on push to `main`/`master` via `.github/workflows/docker-publish.yml`. Each push also updates `tag` in `pitchpredk3ssetup/centrix-erp-frontend-web/values.yaml` (same pattern as pitchpredictionswebsite).

Requires GitHub secret `PERSONAL_ACCESS_TOKEN` with `repo` and `write:packages` scopes.
