# Centrix Print Agent (.NET Windows Service)

Silent receipt printing for Windows POS tills. Same API as before (`http://127.0.0.1:9247`).

## For till / office staff

1. In Centrix open **Administration → Local printing**
2. Select **Centrix Print Agent (Windows)**
3. Click **Download build package (source)** (always available)
4. Follow the steps in **`BUILD.md`** (inside the zip)

If your company already published the ready installer, use **Download Windows print service** instead (unzip + run `install-windows-service.ps1` as admin — no SDK needed).

## For developers

Full step-by-step: **[BUILD.md](./BUILD.md)**

Quick publish (Windows + .NET 8 SDK):

```powershell
cd print-agent-dotnet
.\scripts\publish.ps1
.\scripts\install-windows-service.ps1
```

Host `publish/CentrixPrintAgent-win-x64.zip` via `PRINT_AGENT_DOTNET_URL` or `print-agent-dotnet/publish/` so tills can download the ready zip.

## API

- `GET /v1/health`
- `POST /v1/print` with `{ "html", "copies", "printer", "document_id" }`
