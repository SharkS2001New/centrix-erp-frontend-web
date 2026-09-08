using Centrix.KraAgent.Models;

namespace Centrix.KraAgent.Services;

/// <summary>
/// Fast fiscal bridge: long-poll Centrix for commands, proxy to local Comstore.
/// Keeps pinging Centrix + fiscal hardware; does not start Comstore (Windows does).
/// </summary>
public sealed class KraWorker : BackgroundService
{
    private readonly ILogger<KraWorker> _log;
    private readonly ConfigStore _config;
    private readonly CentrixClient _centrix;
    private readonly ComstoreClient _comstore;
    private readonly ComstoreEnsureService _ensure;
    private readonly DeviceReachabilityProbe _deviceProbe;

    private int _commandsHandled;
    private string? _lastError;
    private string? _lastComstoreEnsureNote;
    private string? _lastDeviceMessage;
    private DateTimeOffset? _lastHeartbeatAt;
    private DateTimeOffset? _lastPollAt;
    private bool _online;
    private bool _comstoreHealthy;
    private bool? _deviceReachable;

    public KraWorker(
        ILogger<KraWorker> log,
        ConfigStore config,
        CentrixClient centrix,
        ComstoreClient comstore,
        ComstoreEnsureService ensure,
        DeviceReachabilityProbe deviceProbe)
    {
        _log = log;
        _config = config;
        _centrix = centrix;
        _comstore = comstore;
        _ensure = ensure;
        _deviceProbe = deviceProbe;
    }

    public object StatusSnapshot()
    {
        var cfg = _config.Current;
        return new
        {
            ok = cfg.IsReady,
            agent = AgentConstants.AgentName,
            version = AgentConstants.Version,
            ready = cfg.IsReady,
            missing = cfg.MissingFields(),
            online = _online,
            comstore_healthy = _comstoreHealthy,
            manual_start_required = !_comstoreHealthy,
            device_reachable = _deviceReachable,
            device_hardware_ip = cfg.DeviceHardwareIp,
            last_device_status = _lastDeviceMessage,
            auto_start_comstore = cfg.AutoStartComstore,
            last_comstore_ensure = _lastComstoreEnsureNote ?? _ensure.LastStartNote,
            last_heartbeat_at = _lastHeartbeatAt?.ToString("o"),
            last_poll_at = _lastPollAt?.ToString("o"),
            last_error = _lastError,
            commands_handled = _commandsHandled,
            comstore_base_url = cfg.ComstoreBaseUrl,
            centrix_api_url = cfg.CentrixApiUrl,
            long_poll_ms = cfg.LongPollMs,
            status_url = $"http://127.0.0.1:{AgentConstants.StatusPort}",
            note = _comstoreHealthy
                ? (_deviceReachable == false
                    ? "Agent running; fiscal device not reachable on the LAN."
                    : null)
                : "Agent Windows service stays running; start Comstore manually. Heartbeats keep reporting until Comstore is up.",
        };
    }

    /// <summary>
    /// Probe Centrix + Comstore. Never stops the service when Comstore is down —
    /// returns manual_start_required so Centrix / the status page can show the amber signal.
    /// </summary>
    public async Task<object> TestConnectionsAsync(CancellationToken ct)
    {
        _config.Reload();
        var config = _config.Current;
        if (!config.IsReady)
        {
            throw new InvalidOperationException("Config incomplete: " + string.Join(", ", config.MissingFields()));
        }

        var (ok, detail) = await _ensure.EnsureRunningAsync(config, ct, forceStartAttempt: true);
        _comstoreHealthy = ok;
        _lastComstoreEnsureNote = detail;

        var comstoreMessage = ok
            ? detail
            : $"{AgentConstants.ComstoreManualStartPrefix} {AgentConstants.ComstoreManualStartUserMessage}";

        var device = await _deviceProbe.ProbeAsync(config, ok, ct);
        _deviceReachable = device.Reachable;
        _lastDeviceMessage = device.Message;

        await _centrix.PostHeartbeatAsync(
            config,
            ct,
            comstoreHealthy: ok,
            comstoreMessage: comstoreMessage,
            deviceReachable: device.Reachable,
            deviceMessage: device.Message,
            deviceHardwareIp: device.HardwareIp,
            deviceConnection: device.DeviceConnection);

        _online = true;
        _lastHeartbeatAt = DateTimeOffset.UtcNow;
        _lastError = ok ? null : comstoreMessage;

        return new
        {
            ok = ok && device.Reachable,
            agent_ok = true,
            comstore_ok = ok,
            device_ok = device.Reachable,
            manual_start_required = !ok,
            device_unreachable = !device.Reachable,
            message = !ok
                ? AgentConstants.ComstoreManualStartUserMessage
                : !device.Reachable
                    ? device.Message
                    : $"{AgentConstants.AgentName} reached Centrix, Comstore, and the fiscal device.",
            detail = detail,
            device_status = device.Message,
            device_hardware_ip = device.HardwareIp,
            device_connection = device.DeviceConnection,
            comstore_base_url = config.ComstoreBaseUrl,
        };
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            _config.Reload();
            if (_config.Current.IsReady) break;
            _log.LogError(
                "Config incomplete ({Missing}) at {Path}. Re-download from Finance → KRA device.",
                string.Join(", ", _config.Current.MissingFields()),
                _config.ConfigPath);
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }

        if (stoppingToken.IsCancellationRequested) return;

        var cfg = _config.Current;
        _log.LogInformation(
            "{Agent} v{Version} — Comstore {Comstore}; long-poll {Poll}ms; heartbeat {Hb}s; auto-start {Auto}",
            AgentConstants.AgentName,
            AgentConstants.Version,
            cfg.ComstoreBaseUrl,
            cfg.LongPollMs,
            cfg.HeartbeatIntervalSeconds,
            cfg.AutoStartComstore);
        _log.LogInformation("Local status: http://127.0.0.1:{Port}", AgentConstants.StatusPort);

        // Bring Comstore up before accepting fiscal traffic (does nothing when already healthy).
        try
        {
            var (ok, detail) = await _ensure.EnsureRunningAsync(cfg, stoppingToken, forceStartAttempt: true);
            _comstoreHealthy = ok;
            _lastComstoreEnsureNote = detail;
            if (!ok)
            {
                // Service keeps running — only warn. Heartbeats will keep signalling manual start.
                _log.LogWarning(
                    "Comstore not ready at startup ({Detail}). {Agent} stays running and will keep reporting until Comstore is started manually.",
                    detail,
                    AgentConstants.AgentName);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _log.LogWarning(ex, "Comstore ensure at startup failed");
        }

        await Task.WhenAll(
            RunCommandLoopAsync(stoppingToken),
            RunHeartbeatLoopAsync(stoppingToken));
    }

    private async Task RunHeartbeatLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                _config.Reload();
                var config = _config.Current;
                if (config.IsReady)
                {
                    // Keep Comstore alive across reboots / crashes without slowing the poll loop.
                    var (ok, detail) = await _ensure.EnsureRunningAsync(config, ct);
                    _comstoreHealthy = ok;
                    if (detail != null) _lastComstoreEnsureNote = detail;

                    var comstoreMessage = ok
                        ? detail
                        : $"{AgentConstants.ComstoreManualStartPrefix} {AgentConstants.ComstoreManualStartUserMessage}";

                    var device = await _deviceProbe.ProbeAsync(config, ok, ct);
                    _deviceReachable = device.Reachable;
                    _lastDeviceMessage = device.Message;

                    await _centrix.PostHeartbeatAsync(
                        config,
                        ct,
                        comstoreHealthy: ok,
                        comstoreMessage: comstoreMessage,
                        deviceReachable: device.Reachable,
                        deviceMessage: device.Message,
                        deviceHardwareIp: device.HardwareIp,
                        deviceConnection: device.DeviceConnection);
                    _online = true;
                    _lastHeartbeatAt = DateTimeOffset.UtcNow;
                    _lastError = !ok
                        ? comstoreMessage
                        : !device.Reachable
                            ? device.Message
                            : null;
                    if (!ok)
                    {
                        _log.LogWarning(
                            "Comstore still down — agent service continues; signalling manual start to Centrix.");
                    }
                    else if (!device.Reachable)
                    {
                        _log.LogWarning("Fiscal device not reachable: {Detail}", device.Message);
                    }
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _online = false;
                _lastError = ex.Message;
                _log.LogWarning(ex, "Heartbeat failed");
            }

            try
            {
                var seconds = Math.Clamp(_config.Current.HeartbeatIntervalSeconds, 30, AgentConstants.MaxHeartbeatSeconds);
                await Task.Delay(TimeSpan.FromSeconds(seconds), ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task RunCommandLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await PollAndExecuteAsync(ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _lastError = ex.Message;
                _log.LogWarning(ex, "Command poll failed");
                try
                {
                    await Task.Delay(AgentConstants.CommandIdleDelayMs, ct);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }
    }

    private async Task PollAndExecuteAsync(CancellationToken ct)
    {
        _config.Reload();
        var config = _config.Current;
        if (!config.IsReady) return;

        _lastPollAt = DateTimeOffset.UtcNow;
        var (commands, comstoreUrl, hardwareIp) = await _centrix.PullCommandsAsync(config, ct);
        _config.ApplyRuntimeOverrides(comstoreUrl, hardwareIp);
        config = _config.Current;

        if (commands.Count == 0)
        {
            // Long-poll already waited; only a tiny yield if wait_ms was 0.
            if (config.LongPollMs <= 0)
            {
                await Task.Delay(AgentConstants.CommandIdleDelayMs, ct);
            }
            return;
        }

        // Only ensure when we already know Comstore is down — never add a health RTT on the warm path.
        if (!_comstoreHealthy)
        {
            var (ok, detail) = await _ensure.EnsureRunningAsync(config, ct);
            _comstoreHealthy = ok;
            if (detail != null) _lastComstoreEnsureNote = detail;
        }

        foreach (var command in commands)
        {
            CommandResult result;
            try
            {
                result = await _comstore.ExecuteAsync(config, command, ct);
                if (!result.Success && ComstoreClient.LooksLikeUnreachable(result) && config.AutoStartComstore)
                {
                    var (ok, detail) = await _ensure.EnsureRunningAsync(config, ct, forceStartAttempt: true);
                    _comstoreHealthy = ok;
                    if (detail != null) _lastComstoreEnsureNote = detail;
                    if (ok)
                    {
                        result = await _comstore.ExecuteAsync(config, command, ct);
                    }
                    else
                    {
                        result = ManualStartRequiredResult(config, detail, result);
                    }
                }
                else if (!result.Success && ComstoreClient.LooksLikeUnreachable(result))
                {
                    _comstoreHealthy = false;
                    result = ManualStartRequiredResult(config, _lastComstoreEnsureNote, result);
                }
                else
                {
                    _comstoreHealthy = result.Success || _comstoreHealthy;
                }
            }
            catch (Exception ex)
            {
                result = new CommandResult
                {
                    Success = false,
                    Status = 0,
                    Body = "",
                    Error = ex.Message,
                };
            }

            try
            {
                await _centrix.SubmitCommandResultAsync(config, command.Id, result, ct);
                _commandsHandled++;
                _lastError = result.Success ? null : result.Error;
            }
            catch (Exception ex)
            {
                _lastError = ex.Message;
                _log.LogWarning(ex, "Failed to post result for command {Id}", command.Id);
            }
        }
    }

    private static CommandResult ManualStartRequiredResult(
        AgentConfig config,
        string? detail,
        CommandResult prior)
    {
        var detailPart = string.IsNullOrWhiteSpace(detail)
            ? (prior.Error ?? "unreachable")
            : detail;
        return new CommandResult
        {
            Success = false,
            Status = 0,
            Body = System.Text.Json.JsonSerializer.Serialize(new
            {
                manual_start_required = true,
                message = AgentConstants.ComstoreManualStartUserMessage,
                comstore_base_url = config.ComstoreBaseUrl,
                detail = detailPart,
            }),
            Error =
                $"{AgentConstants.ComstoreManualStartPrefix} {AgentConstants.ComstoreManualStartUserMessage} "
                + $"({config.ComstoreBaseUrl}: {detailPart})",
            Headers = new Dictionary<string, string[]>
            {
                ["content-type"] = ["application/json"],
            },
        };
    }
}
