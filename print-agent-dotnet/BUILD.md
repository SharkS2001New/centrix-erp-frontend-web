# Build Centrix Print Agent (Windows)

Follow these steps **exactly** on a **Windows 10/11 x64** PC (your till PC or a build PC).  
You do **not** need this folder to already exist on the till — download the source zip from Centrix first.

---

## 1. Download the source

1. Open Centrix → **Administration → Local printing**
2. Choose **Centrix Print Agent (Windows)**
3. Click **Download build package (source)**
4. Save `CentrixPrintAgent-source.zip` and **unzip** it  
   You should get a folder named `print-agent-dotnet`

---

## 2. Install the .NET 8 SDK (one time)

1. Open: https://dotnet.microsoft.com/download/dotnet/8.0  
2. Download **SDK 8.x** for **Windows x64** (not “Runtime” — you need the **SDK**)
3. Install it, then **close and reopen** PowerShell
4. Check:

```powershell
dotnet --version
```

You should see something like `8.0.x`. If the command is not found, the SDK is not installed or PATH needs a new terminal.

---

## 3. Build the installer zip

Open **PowerShell**, go into the unzipped folder, then publish:

```powershell
cd path\to\print-agent-dotnet
.\scripts\publish.ps1
```

**Expected result:**

- `publish\Centrix.PrintAgent.exe`
- `publish\CentrixPrintAgent-win-x64.zip`  ← this is what tills install

If `publish.ps1` is blocked, run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\publish.ps1
```

---

## 4. Install on this PC (or copy the zip to each till)

Still in `print-agent-dotnet`, run **as Administrator**:

```powershell
.\scripts\install-windows-service.ps1
```

Or copy `publish\CentrixPrintAgent-win-x64.zip` to another till, unzip it, then run `install-windows-service.ps1` from that folder.

Check the service:

```powershell
Get-Service CentrixPrintAgent
# or open http://127.0.0.1:9247/v1/health in a browser
```

---

## 5. Optional (recommended for silent thermal print)

Install **SumatraPDF**: https://www.sumatrapdfreader.org/download-free-pdf-viewer

---

## 6. Wire it in Centrix

1. **Administration → Local printing**
2. **Centrix Print Agent (Windows)**
3. **Test connection** → pick printer → **Save**

If the agent is offline, Centrix falls back to the **browser print dialog**.

---

## 7. Put the ready zip on the ERP server (so Download works for everyone)

After a successful build, host `CentrixPrintAgent-win-x64.zip` for the company:

**Option A — env on the frontend server**

```text
PRINT_AGENT_DOTNET_URL=https://your-cdn.example.com/print-agent/CentrixPrintAgent-win-x64.zip
```

**Option B — copy onto the web server**

```text
centrix-erp-frontend-web/print-agent-dotnet/publish/CentrixPrintAgent-win-x64.zip
```

Then **Download Windows print service** in Local printing becomes enabled (no rebuild needed on every till).

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `dotnet` not found | Install **.NET 8 SDK**, open a **new** PowerShell |
| Publish fails / wrong RID | Must build on **Windows x64** (`win-x64`) |
| Service won't start | Run PowerShell **as Administrator** for `install-windows-service.ps1` |
| Health URL fails | Confirm service is Running; nothing else should use port **9247** |
| Print shows a dialog | Install SumatraPDF for silent printing |

---

## Uninstall

```powershell
.\scripts\uninstall-windows-service.ps1
```
