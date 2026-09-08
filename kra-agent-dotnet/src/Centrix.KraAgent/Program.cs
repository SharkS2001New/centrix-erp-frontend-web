using System.Text.Json;
using Centrix.KraAgent;
using Centrix.KraAgent.Services;
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
    options.ListenLocalhost(AgentConstants.StatusPort);
});

builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
    options.SerializerOptions.PropertyNameCaseInsensitive = true;
});

builder.Services.AddSingleton<ConfigStore>();
builder.Services.AddSingleton<CentrixClient>();
builder.Services.AddSingleton<ComstoreClient>();
builder.Services.AddSingleton<ComstoreEnsureService>();
builder.Services.AddSingleton<DeviceReachabilityProbe>();
builder.Services.AddSingleton<KraWorker>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<KraWorker>());

WebApplication app;
try
{
    app = builder.Build();
}
catch (Exception ex)
{
    Console.Error.WriteLine(
        $"CentrixKraAgent failed to start. If port {AgentConstants.StatusPort} is in use, " +
        "stop the old Node kra-agent / other process, then retry. Detail: {0}",
        ex.Message);
    throw;
}

app.MapGet("/", () => Results.Content(StatusHtml(), "text/html; charset=utf-8"));

app.MapGet("/v1/health", (KraWorker worker) => Results.Json(worker.StatusSnapshot()));

app.MapGet("/api/status", (KraWorker worker, ConfigStore config) =>
{
    var cfg = config.Current;
    var token = cfg.CentrixToken ?? "";
    var snap = worker.StatusSnapshot();
    return Results.Json(new
    {
        ready = cfg.IsReady,
        missing = cfg.MissingFields(),
        version = AgentConstants.Version,
        agent = AgentConstants.AgentName,
        comstore_base_url = cfg.ComstoreBaseUrl,
        centrix_api_url = cfg.CentrixApiUrl,
        long_poll_ms = cfg.LongPollMs,
        auto_start_comstore = cfg.AutoStartComstore,
        comstore_executable_path = cfg.ComstoreExecutablePath,
        comstore_windows_service_names = cfg.ComstoreWindowsServiceNames,
        centrix_token_masked = string.IsNullOrEmpty(token)
            ? ""
            : $"{token[..Math.Min(6, token.Length)]}…{(token.Length > 4 ? token[^4..] : "")} ({token.Length} chars)",
        has_centrix_token = !string.IsNullOrEmpty(token),
        status = snap,
    });
});

app.MapPost("/api/test-connection", async (KraWorker worker, CancellationToken ct) =>
{
    try
    {
        var result = await worker.TestConnectionsAsync(ct);
        // Always 200 when the agent reached Centrix — Comstore-down is a signal, not a crash.
        return Results.Json(result);
    }
    catch (Exception ex)
    {
        return Results.Json(new
        {
            ok = false,
            agent_ok = false,
            comstore_ok = false,
            manual_start_required = false,
            error = ex.Message,
            message = ex.Message,
        }, statusCode: StatusCodes.Status502BadGateway);
    }
});

await app.RunAsync();

static string StatusHtml() => """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Centrix KRA Agent</title>
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
    <div style="color:#e2e8f0;font-size:13px;letter-spacing:.04em;text-transform:uppercase;margin-bottom:8px;">Centrix ERP</div>
    <h1>KRA Agent</h1>
    <p class="lead">.NET Windows service — always stays running. Bridges Centrix cloud to local Comstore. If Comstore is down, the agent keeps signalling that it must be started manually.</p>
    <div class="card">
      <div id="banner" class="banner warn">Loading status…</div>
      <button id="refreshBtn" type="button" style="margin-bottom:10px;background:#334155">Refresh status</button>
      <button id="testBtn" type="button">Test connection</button>
      <p class="muted">Keep CentrixKraAgent on Automatic startup. Comstore being offline does <strong>not</strong> stop this service — heartbeats keep telling Centrix to start Comstore manually until /api/health succeeds.</p>
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
        if (!res.ok) throw new Error("CentrixKraAgent returned HTTP " + res.status);
        const data = await res.json();
        const st = data.status || {};
        if (!data.ready) {
          banner.className = "banner warn";
          banner.textContent = "Config incomplete: " + (data.missing || []).join(", ");
        } else if (st.comstore_healthy === false || st.manual_start_required) {
          banner.className = "banner warn";
          banner.textContent = "Agent running · Comstore down — start Comstore manually (service keeps running)";
        } else if (st.comstore_healthy === true) {
          banner.className = "banner ok";
          banner.textContent = "Agent running · Comstore reachable → " + (data.comstore_base_url || "");
        } else {
          banner.className = "banner ok";
          banner.textContent = "Agent running → " + (data.comstore_base_url || "");
        }
        detail.textContent = JSON.stringify(data, null, 2);
      } catch (e) {
        banner.className = "banner err";
        banner.textContent = "CentrixKraAgent is not running. Run BUILD-AND-INSTALL.bat as Administrator.";
        detail.textContent = String(e);
      }
    }

    refreshBtn.addEventListener("click", () => void refresh());
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      banner.className = "banner warn";
      banner.textContent = "Testing Centrix + Comstore…";
      try {
        const res = await fetch("/api/test-connection", { method: "POST" });
        const data = await res.json();
        if (data.agent_ok && data.manual_start_required) {
          banner.className = "banner warn";
          banner.textContent = data.message || "Agent OK — start Comstore manually";
        } else {
          banner.className = data.ok ? "banner ok" : "banner err";
          banner.textContent = data.ok ? (data.message || "OK") : (data.error || data.message || "Failed");
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
    setInterval(() => void refresh(), 15000);
  </script>
</body>
</html>
""";
