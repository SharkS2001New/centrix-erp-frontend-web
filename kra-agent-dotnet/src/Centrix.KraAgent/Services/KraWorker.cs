using System.Text.Json;
using Centrix.KraAgent.Models;

namespace Centrix.KraAgent.Services;

/// <summary>
/// Fast fiscal bridge: long-poll Centrix for commands, proxy to local Comstore when available.
/// Always stays running as a Windows service — Comstore off only marks unhealthy heartbeats.
/// </summary>
public sealed class KraWorker : BackgroundService
{
    private readonly ILogger<KraWorker> _log;
    private readonly ConfigStore _config;
    private readonly CentrixClient _centrix;
    private readonly ComstoreClient _comstore;
    private readonly ComstoreEnsureService _ensure;
    private readonly DeviceReachabilityProbe _deviceProbe;
    private readonly SleepGuard _sleepGuard;

    private int _commandsHandled;
    private string? _lastError;
    private string? _lastComstoreEnsureNote;
    private string? _lastDeviceMessage;
    private DateTimeOffset? _lastHeartbeatAt;
    private DateTimeOffset? _lastPollAt;
    private bool _online;
    private bool _comstoreHealthy;
    private bool? _deviceReachable;
    /// <summary>True while a Comstore fiscal command is in flight — heartbeat must not probe the busy device.</summary>
    private int _fiscalBusyDepth;

    public KraWorker(
        ILogger<KraWorker> log,
        ConfigStore config,
        CentrixClient centrix,
        ComstoreClient comstore,
        ComstoreEnsureService ensure,
        DeviceReachabilityProbe deviceProbe,
        SleepGuard sleepGuard)
    {
        _log = log;
        _config = config;
        _centrix = centrix;
        _comstore = comstore;
        _ensure = ensure;
        _deviceProbe = deviceProbe;
        _sleepGuard = sleepGuard;
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
            fiscal_busy = _fiscalBusyDepth > 0,
            stay_awake = _sleepGuard.IsActive,
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
        _config.Reload(force: true);
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
        // Keep the Comstore PC from sleeping while this service runs.
        _sleepGuard.RequestStayAwake();
        try
        {
            // Outer guard: a fault in poll/heartbeat must never stop CentrixKraAgent.
            // Comstore being off is normal — heartbeats keep reporting until it is started.
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await RunWorkerLoopsAsync(stoppingToken);
                    break;
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _log.LogError(
                        ex,
                        "{Agent} worker faulted; restarting in 5s. Comstore being down must never stop this service.",
                        AgentConstants.AgentName);
                    try
                    {
                        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                    }
                    catch (OperationCanceledException)
                    {
                        break;
                    }
                }
            }
        }
        finally
        {
            _sleepGuard.Clear();
        }
    }

    private async Task RunWorkerLoopsAsync(CancellationToken stoppingToken)
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

        // Probe Comstore once at startup. Never exit if it is down — only warn.
        try
        {
            var (ok, detail) = await _ensure.EnsureRunningAsync(cfg, stoppingToken, forceStartAttempt: true);
            _comstoreHealthy = ok;
            _lastComstoreEnsureNote = detail;
            if (!ok)
            {
                _log.LogWarning(
                    "Comstore not ready at startup ({Detail}). {Agent} stays running and will keep reporting until Comstore is started manually.",
                    detail,
                    AgentConstants.AgentName);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _comstoreHealthy = false;
            _log.LogWarning(ex, "Comstore ensure at startup failed — agent continues without Comstore");
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
                    // While complete-workflow is running, do not hammer Comstore/device with health+ICMP.
                    // That contention looks like "agent stopped" and soft-skips the next sales.
                    var busy = Volatile.Read(ref _fiscalBusyDepth) > 0;
                    bool ok;
                    string? detail;
                    if (busy)
                    {
                        ok = _comstoreHealthy;
                        detail = _lastComstoreEnsureNote;
                    }
                    else
                    {
                        (ok, detail) = await _ensure.EnsureRunningAsync(config, ct);
                        _comstoreHealthy = ok;
                        if (detail != null) _lastComstoreEnsureNote = detail;
                    }

                    var comstoreMessage = ok
                        ? detail
                        : $"{AgentConstants.ComstoreManualStartPrefix} {AgentConstants.ComstoreManualStartUserMessage}";

                    bool? deviceReachable;
                    string? deviceMessage;
                    string? deviceHardwareIp;
                    string? deviceConnection;
                    if (busy)
                    {
                        deviceReachable = _deviceReachable;
                        deviceMessage = _lastDeviceMessage
                            ?? "Fiscal device probe deferred — CentrixKraAgent is busy fiscalizing.";
                        deviceHardwareIp = config.DeviceHardwareIp;
                        deviceConnection = null;
                    }
                    else
                    {
                        var device = await _deviceProbe.ProbeAsync(config, ok, ct);
                        _deviceReachable = device.Reachable;
                        _lastDeviceMessage = device.Message;
                        deviceReachable = device.Reachable;
                        deviceMessage = device.Message;
                        deviceHardwareIp = device.HardwareIp;
                        deviceConnection = device.DeviceConnection;
                    }

                    await _centrix.PostHeartbeatAsync(
                        config,
                        ct,
                        comstoreHealthy: ok,
                        comstoreMessage: comstoreMessage,
                        deviceReachable: deviceReachable,
                        deviceMessage: deviceMessage,
                        deviceHardwareIp: deviceHardwareIp,
                        deviceConnection: deviceConnection);
                    _online = true;
                    _lastHeartbeatAt = DateTimeOffset.UtcNow;
                    _lastError = !ok
                        ? comstoreMessage
                        : deviceReachable == false
                            ? deviceMessage
                            : null;
                    if (!ok)
                    {
                        _log.LogWarning(
                            "Comstore still down — agent service continues; signalling manual start to Centrix.");
                    }
                    else if (!busy && deviceReachable == false)
                    {
                        _log.LogWarning("Fiscal device not reachable: {Detail}", deviceMessage);
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
                var before = DateTimeOffset.UtcNow;
                await Task.Delay(TimeSpan.FromSeconds(seconds), ct);
                // Sleep/hibernate pauses Delay; after resume the clock jump is large — reconnect immediately.
                if (DateTimeOffset.UtcNow - before > TimeSpan.FromSeconds(seconds + 45))
                {
                    await OnResumedFromSleepAsync(ct);
                }
                else
                {
                    // Refresh the stay-awake request (Windows can clear it over time).
                    _sleepGuard.RequestStayAwake();
                }
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
        var pullStarted = DateTimeOffset.UtcNow;
        var (commands, comstoreUrl, hardwareIp) = await _centrix.PullCommandsAsync(config, ct);
        // Long-poll can be paused for minutes while the PC slept — treat as resume.
        var waitedMs = Math.Max(0, config.LongPollMs);
        if (DateTimeOffset.UtcNow - pullStarted > TimeSpan.FromMilliseconds(waitedMs + 45_000))
        {
            await OnResumedFromSleepAsync(ct);
            config = _config.Current;
        }
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
            var isLocal = IsAgentLocalPath(command.Path);
            if (!isLocal)
            {
                Interlocked.Increment(ref _fiscalBusyDepth);
            }

            CommandResult result;
            try
            {
                result = await ExecuteLocalOrComstoreAsync(config, command, ct);
                if (isLocal)
                {
                    // Local agent probes — do not wrap with Comstore manual-start messaging.
                }
                else if (!result.Success && ComstoreClient.LooksLikeUnreachable(result) && config.AutoStartComstore)
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
            finally
            {
                if (!isLocal)
                {
                    Interlocked.Decrement(ref _fiscalBusyDepth);
                }
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

    private async Task OnResumedFromSleepAsync(CancellationToken ct)
    {
        _log.LogWarning(
            "{Agent} detected PC resume from sleep/hibernate — re-arming stay-awake and refreshing Centrix/Comstore.",
            AgentConstants.AgentName);
        _sleepGuard.RequestStayAwake();
        _config.Reload(force: true);
        _comstoreHealthy = false;
        _lastError = "PC resumed from sleep — reconnecting.";

        try
        {
            var config = _config.Current;
            if (!config.IsReady) return;

            var (ok, detail) = await _ensure.EnsureRunningAsync(config, ct, forceStartAttempt: true);
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
            _lastError = ok ? null : comstoreMessage;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _online = false;
            _lastError = ex.Message;
            _log.LogWarning(ex, "Post-sleep reconnect failed");
        }
    }

    private static bool IsAgentLocalPath(string? path)
    {
        var p = (path ?? "").Trim();
        if (!p.StartsWith('/')) p = "/" + p;
        return p.Equals("/agent/ping", StringComparison.OrdinalIgnoreCase)
            || p.Equals("/agent/device-probe", StringComparison.OrdinalIgnoreCase);
    }

    private async Task<CommandResult> ExecuteLocalOrComstoreAsync(
        AgentConfig config,
        AgentCommand command,
        CancellationToken ct)
    {
        var path = (command.Path ?? "").Trim();
        if (!path.StartsWith('/')) path = "/" + path;

        if (path.Equals("/agent/device-probe", StringComparison.OrdinalIgnoreCase))
        {
            return await ExecuteDeviceProbeAsync(config, command, ct);
        }

        return await _comstore.ExecuteAsync(config, command, ct);
    }

    private async Task<CommandResult> ExecuteDeviceProbeAsync(
        AgentConfig config,
        AgentCommand command,
        CancellationToken ct)
    {
        string? hardwareOverride = null;
        try
        {
            if (command.Body is JsonElement el && el.ValueKind == JsonValueKind.Object)
            {
                if (el.TryGetProperty("hardware_ip", out var hip) && hip.ValueKind == JsonValueKind.String)
                {
                    hardwareOverride = hip.GetString();
                }
                else if (el.TryGetProperty("device_hardware_ip", out var hip2) && hip2.ValueKind == JsonValueKind.String)
                {
                    hardwareOverride = hip2.GetString();
                }
            }
        }
        catch
        {
            // ignore body parse issues — fall back to config IP
        }

        if (!string.IsNullOrWhiteSpace(hardwareOverride))
        {
            _config.ApplyRuntimeOverrides(deviceHardwareIp: hardwareOverride);
            config = _config.Current;
        }

        // Prefer live Comstore health; still ping hardware IP when Comstore is down.
        var comstoreOk = _comstoreHealthy;
        try
        {
            var (ok, _) = await _ensure.EnsureRunningAsync(config, ct);
            comstoreOk = ok;
            _comstoreHealthy = ok;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _log.LogDebug(ex, "Comstore probe during device-probe failed");
            comstoreOk = false;
            _comstoreHealthy = false;
        }

        var device = await _deviceProbe.ProbeAsync(config, comstoreOk, ct, hardwareOverride);
        _deviceReachable = device.Reachable;
        _lastDeviceMessage = device.Message;

        var payload = new
        {
            success = device.Reachable,
            reachable = device.Reachable,
            hardware_ip = device.HardwareIp,
            device_connection = device.DeviceConnection,
            ping_ok = device.PingOk,
            comstore_healthy = comstoreOk,
            message = device.Message,
        };

        return new CommandResult
        {
            Success = device.Reachable,
            Status = 200,
            Body = System.Text.Json.JsonSerializer.Serialize(payload),
            Error = device.Reachable ? null : device.Message,
            Headers = new Dictionary<string, string[]>
            {
                ["content-type"] = ["application/json"],
            },
        };
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
