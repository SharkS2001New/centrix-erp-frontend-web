using System.Text.Json;
using Centrix.AttendanceAgent;
using Centrix.AttendanceAgent.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory,
});

builder.Host.UseWindowsService(options =>
{
    options.ServiceName = AgentConstants.ServiceName;
});

builder.WebHost.ConfigureKestrel(options =>
{
    // Local status UI only — bind loopback so we never expose the agent on the LAN.
    options.ListenLocalhost(AgentConstants.StatusPort);
});

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
    options.SerializerOptions.PropertyNameCaseInsensitive = true;
});

builder.Services.AddSingleton<ConfigStore>();
builder.Services.AddSingleton<HikvisionDigestClient>();
builder.Services.AddSingleton<CentrixClient>();
builder.Services.AddSingleton<AcsEventService>();
builder.Services.AddSingleton<AttendanceWorker>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<AttendanceWorker>());

WebApplication app;
try
{
    app = builder.Build();
}
catch (Exception ex)
{
    Console.Error.WriteLine(
        $"CentrixAttendanceAgent failed to start. If port {AgentConstants.StatusPort} is in use, " +
        "uninstall the old Node attendance agent / stop the other process, then retry. Detail: {0}",
        ex.Message);
    throw;
}

app.MapGet("/", () => Results.Content(StatusHtml(), "text/html; charset=utf-8"));

app.MapGet("/v1/health", (ConfigStore config) =>
{
    var cfg = config.Current;
    return Results.Json(new
    {
        ok = cfg.IsReady,
        agent = AgentConstants.AgentName,
        version = AgentConstants.Version,
        platform = "win32",
        running_as_service = !Environment.UserInteractive,
        ready = cfg.IsReady,
        missing = cfg.MissingFields(),
        device_no = cfg.DeviceNo,
        device_id = cfg.DeviceId,
        hikvision_host = cfg.Hikvision.Host,
        status_url = $"http://127.0.0.1:{AgentConstants.StatusPort}",
    });
});

app.MapGet("/api/status", (ConfigStore config) =>
{
    var cfg = config.Current;
    var token = cfg.CentrixToken ?? "";
    return Results.Json(new
    {
        ready = cfg.IsReady,
        missing = cfg.MissingFields(),
        version = AgentConstants.Version,
        agent = AgentConstants.AgentName,
        device_no = cfg.DeviceNo,
        device_id = cfg.DeviceId,
        hikvision_host = cfg.Hikvision.Host,
        centrix_api_url = cfg.CentrixApiUrl,
        centrix_token_masked = string.IsNullOrEmpty(token)
            ? ""
            : $"{token[..Math.Min(6, token.Length)]}…{(token.Length > 4 ? token[^4..] : "")} ({token.Length} chars)",
        has_centrix_token = !string.IsNullOrEmpty(token),
    });
});

app.MapPost("/api/test-connection", async (AttendanceWorker worker, CancellationToken ct) =>
{
    try
    {
        await worker.TestConnectionsAsync(ct);
        return Results.Json(new
        {
            ok = true,
            message = $"{AgentConstants.AgentName} reached Hikvision on the LAN and checked in with Centrix.",
        });
    }
    catch (Exception ex)
    {
        return Results.Json(new { ok = false, error = ex.Message }, statusCode: StatusCodes.Status502BadGateway);
    }
});

app.MapPost("/api/sync-once", async (AttendanceWorker worker, CancellationToken ct) =>
{
    try
    {
        var result = await worker.SyncOncePublicAsync(ct);
        return Results.Json(new
        {
            ok = true,
            applied = result.Applied,
            skipped = result.Skipped,
            pulled = result.Pulled,
        });
    }
    catch (Exception ex)
    {
        return Results.Json(new { ok = false, error = ex.Message }, statusCode: StatusCodes.Status502BadGateway);
    }
});

await app.RunAsync();

static string StatusHtml() => """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Centrix Attendance Agent</title>
  <style>
    body { font-family: "Segoe UI", system-ui, sans-serif; margin: 0; background: #0f172a; color: #0f172a; }
    .wrap { max-width: 560px; margin: 0 auto; padding: 32px 16px; }
    h1 { color: #f8fafc; font-size: 26px; margin: 0 0 8px; }
    .lead { color: #94a3b8; margin: 0 0 24px; }
    .card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 20px 50px rgba(0,0,0,.25); }
    .banner { border-radius: 10px; padding: 12px 14px; font-size: 13px; margin-bottom: 16px; }
    .ok { background: #dcfce7; color: #166534; }
    .err { background: #fee2e2; color: #991b1b; }
    .warn { background: #fef3c7; color: #92400e; }
    button { background: #185fa5; color: #fff; border: 0; border-radius: 10px; padding: 12px 16px; font-weight: 600; cursor: pointer; width: 100%; }
    button:disabled { opacity: .6; }
    .muted { color: #64748b; font-size: 13px; margin-top: 12px; line-height: 1.45; }
    pre { white-space: pre-wrap; font-size: 12px; background: #f8fafc; padding: 12px; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand" style="color:#e2e8f0;font-size:13px;letter-spacing:.04em;text-transform:uppercase;margin-bottom:8px;">Centrix ERP</div>
    <h1>Attendance Agent</h1>
    <p class="lead">.NET Windows service — bridges Hikvision on your LAN to Centrix cloud.</p>
    <div class="card">
      <div id="banner" class="banner warn">Loading status…</div>
      <button id="refreshBtn" type="button" style="margin-bottom:10px;background:#334155">Refresh status</button>
      <button id="testBtn" type="button">Test connection</button>
      <p class="muted">Uses the config.json from your Centrix download. Change IP or password in Centrix, then download the agent again.</p>
      <pre id="detail"></pre>
    </div>
  </div>
  <script>
    const banner = document.getElementById("banner");
    const detail = document.getElementById("detail");
    const refreshBtn = document.getElementById("refreshBtn");
    const btn = document.getElementById("testBtn");

    async function refresh() {
      try {
        const res = await fetch("/api/status");
        if (!res.ok) throw new Error("CentrixAttendanceAgent returned HTTP " + res.status);
        const data = await res.json();
        if (data.ready) {
          banner.className = "banner ok";
          banner.textContent = "Configured for device " + (data.device_no || "") + " → " + (data.hikvision_host || "");
        } else {
          banner.className = "banner warn";
          banner.textContent = "Config incomplete: " + (data.missing || []).join(", ");
        }
        detail.textContent = JSON.stringify(data, null, 2);
      } catch (e) {
        banner.className = "banner err";
        banner.textContent = "CentrixAttendanceAgent is not running on this PC. Start the Windows service or run BUILD-AND-INSTALL.bat as Administrator.";
        detail.textContent = String(e);
      }
    }

    refreshBtn.addEventListener("click", () => void refresh());

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      banner.className = "banner warn";
      banner.textContent = "Testing Hikvision + Centrix…";
      try {
        const res = await fetch("/api/test-connection", { method: "POST" });
        const data = await res.json();
        if (data.ok) {
          banner.className = "banner ok";
          banner.textContent = data.message || "OK";
        } else {
          banner.className = "banner err";
          banner.textContent = data.error || "Failed";
        }
      } catch (e) {
        banner.className = "banner err";
        banner.textContent = String(e);
      } finally {
        btn.disabled = false;
        refresh();
      }
    });

    refresh();
  </script>
</body>
</html>
""";
