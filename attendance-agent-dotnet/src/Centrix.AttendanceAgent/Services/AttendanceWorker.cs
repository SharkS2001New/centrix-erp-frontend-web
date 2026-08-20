using System.Globalization;
using System.Text.Json;
using Centrix.AttendanceAgent.Models;

namespace Centrix.AttendanceAgent.Services;

/// <summary>
/// Main agent loop. Priority: keep pulling Hikvision punches and posting them to
/// Centrix HR attendance. Command polling is independent so Manage Hikvision / PING
/// never blocks punch upload.
/// </summary>
public sealed class AttendanceWorker : BackgroundService
{
    private readonly ILogger<AttendanceWorker> _log;
    private readonly ConfigStore _config;
    private readonly CentrixClient _centrix;
    private readonly AcsEventService _acs;

    private int _heartbeatSeconds = 600;
    private string _timezone = "Africa/Nairobi";
    /// <summary>Last Nairobi hour key we successfully finished an hourly upload for (yyyy-MM-ddTHH).</summary>
    private string? _lastSuccessfulHourKey;

    private int _commandPollInFlight;
    private int _attendanceSyncInFlight;

    public AttendanceWorker(
        ILogger<AttendanceWorker> log,
        ConfigStore config,
        CentrixClient centrix,
        AcsEventService acs)
    {
        _log = log;
        _config = config;
        _centrix = centrix;
        _acs = acs;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            _config.Reload();
            var config = _config.Current;
            if (config.IsReady)
            {
                ApplyScheduleFromConfig(config);
                break;
            }

            _log.LogError(
                "Config incomplete ({Missing}) at {Path}. Waiting… Re-download from HR → Attendance clock-in, or copy config.json next to the exe.",
                string.Join(", ", config.MissingFields()),
                _config.ConfigPath);
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }

        if (stoppingToken.IsCancellationRequested) return;

        _log.LogInformation(
            "{Agent} v{Version} — punch upload {Start}:00–{End}:00 {Tz} (after each hour + keep retrying); heartbeat every {Heartbeat}s; command poll every {Command}s",
            AgentConstants.AgentName,
            AgentConstants.Version,
            AgentConstants.PunchUploadStartHour,
            AgentConstants.PunchUploadEndHour,
            _timezone,
            _heartbeatSeconds,
            AgentConstants.CommandPollSeconds);
        _log.LogInformation("Local status page: http://127.0.0.1:{Port}", AgentConstants.StatusPort);
        _log.LogInformation("Config: {Path}", _config.ConfigPath);

        await Task.WhenAll(
            RunCommandLoopAsync(stoppingToken),
            RunHeartbeatLoopAsync(stoppingToken),
            RunPunchLoopAsync(stoppingToken),
            RunStartupCatchupAsync(stoppingToken));
    }

    private async Task RunCommandLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await PollCommandsSafeAsync(ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _log.LogWarning(ex, "Command poll failed");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(AgentConstants.CommandPollSeconds), ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
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
                    ApplyScheduleFromConfig(config);
                    var payload = await _centrix.PostHeartbeatAsync(config, ct);
                    ApplyAgentSchedule(payload);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _log.LogWarning(ex, "Heartbeat failed");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(_heartbeatSeconds), ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task RunPunchLoopAsync(CancellationToken ct)
    {
        // Schedule (Africa/Nairobi by default):
        // - 06:00–14:00 (2pm): after each hour, upload punches; keep retrying every 5 minutes
        //   so new scans still go online during the morning.
        // - Outside that window: wait until the next 06:00 (punches stay on the terminal).
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var local = TimezoneHelper.ToZoneLocal(DateTime.UtcNow, _timezone);
                if (!IsInsideDailyUploadWindow(local))
                {
                    var wait = DelayUntilNextWindowOpen(local);
                    _log.LogInformation(
                        "Outside punch upload window ({Start}:00–{End}:00 {Tz}). Sleeping ~{Minutes} min.",
                        AgentConstants.PunchUploadStartHour,
                        AgentConstants.PunchUploadEndHour,
                        _timezone,
                        Math.Max(1, (int)wait.TotalMinutes));
                    await Task.Delay(wait, ct);
                    continue;
                }

                var hourKey = HourKey(local);
                var isNewHour = !string.Equals(_lastSuccessfulHourKey, hourKey, StringComparison.Ordinal);
                if (isNewHour)
                {
                    _log.LogInformation(
                        "Punch upload for hour {HourKey} ({Tz}) — keep retrying new punches until 14:00",
                        hourKey,
                        _timezone);
                }

                await RunPunchSyncAsync(includeHeartbeat: false, ct);
                _lastSuccessfulHourKey = hourKey;

                // Keep trying inside the daily window so late scans still upload.
                await Task.Delay(TimeSpan.FromSeconds(AgentConstants.PunchRetrySeconds), ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Punch sync failed — will keep trying");
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(60), ct);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }
        }
    }

    private static bool IsInsideDailyUploadWindow(DateTime localWallClock)
    {
        var hour = localWallClock.Hour;
        return hour >= AgentConstants.PunchUploadStartHour && hour <= AgentConstants.PunchUploadEndHour;
    }

    private static string HourKey(DateTime localWallClock) =>
        localWallClock.ToString("yyyy-MM-dd'T'HH", CultureInfo.InvariantCulture);

    private static TimeSpan DelayUntilNextWindowOpen(DateTime localWallClock)
    {
        var startToday = new DateTime(
            localWallClock.Year,
            localWallClock.Month,
            localWallClock.Day,
            AgentConstants.PunchUploadStartHour,
            0,
            0,
            DateTimeKind.Unspecified);

        var nextOpen = localWallClock.Hour < AgentConstants.PunchUploadStartHour
            ? startToday
            : startToday.AddDays(1);

        var wait = nextOpen - localWallClock;
        if (wait < TimeSpan.FromMinutes(1)) wait = TimeSpan.FromMinutes(1);
        // Cap sleep so clock/TZ changes are noticed overnight.
        if (wait > TimeSpan.FromHours(1)) wait = TimeSpan.FromHours(1);
        return wait;
    }

    private async Task RunStartupCatchupAsync(CancellationToken ct)
    {
        var delays = new[] { 0, 5_000, 15_000, 30_000, 60_000, 120_000 };
        Exception? last = null;
        for (var i = 0; i < delays.Length; i++)
        {
            if (ct.IsCancellationRequested) return;
            if (delays[i] > 0)
            {
                _log.LogInformation("Retrying catch-up in {Seconds}s", delays[i] / 1000);
                try
                {
                    await Task.Delay(delays[i], ct);
                }
                catch (OperationCanceledException)
                {
                    return;
                }
            }

            try
            {
                _config.Reload();
                var config = _config.Current;
                if (!config.IsReady) continue;

                var local = TimezoneHelper.ToZoneLocal(DateTime.UtcNow, _timezone);
                if (!IsInsideDailyUploadWindow(local))
                {
                    _log.LogInformation(
                        "Startup catch-up deferred until {Start}:00–{End}:00 {Tz}",
                        AgentConstants.PunchUploadStartHour,
                        AgentConstants.PunchUploadEndHour,
                        _timezone);
                    return;
                }

                try
                {
                    var payload = await _centrix.PostHeartbeatAsync(config, ct);
                    ApplyAgentSchedule(payload);
                }
                catch (Exception ex)
                {
                    _log.LogWarning(ex, "Startup heartbeat failed");
                }

                await SyncOnceAsync(config, ct);
                _log.LogInformation("Startup catch-up finished");
                return;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                last = ex;
                _log.LogError(ex, "Catch-up attempt {Attempt} failed", i + 1);
            }
        }

        if (last != null)
        {
            _log.LogError(last, "Startup catch-up failed — ongoing punch loop will keep trying");
        }
    }

    public Task<(int Applied, int Skipped, int Pulled)> SyncOncePublicAsync(CancellationToken ct) =>
        SyncOnceAsync(_config.Current, ct);

    public async Task TestConnectionsAsync(CancellationToken ct)
    {
        var config = _config.Current;
        if (!config.IsReady)
        {
            throw new InvalidOperationException("Config incomplete: " + string.Join(", ", config.MissingFields()));
        }

        await _acs.TestDeviceAsync(config, ct);
        await _centrix.PostHeartbeatAsync(config, ct);
    }

    private async Task PollCommandsSafeAsync(CancellationToken ct)
    {
        if (Interlocked.CompareExchange(ref _commandPollInFlight, 1, 0) != 0) return;
        try
        {
            _config.Reload();
            var config = _config.Current;
            if (!config.IsReady || config.DeviceId is null) return;

            var (commands, root) = await _centrix.PullCommandsAsync(config, ct);
            ApplyAgentSchedule(root);
            var handled = 0;
            foreach (var command in commands)
            {
                if (string.IsNullOrWhiteSpace(command.Id))
                {
                    _log.LogWarning("Skipping Centrix command with empty id (path={Path})", command.Path);
                    continue;
                }

                CommandResult result;
                try
                {
                    result = await _acs.ExecuteIsapiCommandAsync(config, command, ct);
                    if (!result.Success)
                    {
                        result = new CommandResult
                        {
                            Success = false,
                            Error = result.Error ?? $"HTTP {result.Status}",
                        };
                    }
                }
                catch (Exception ex)
                {
                    result = new CommandResult { Success = false, Error = ex.Message };
                }

                try
                {
                    await _centrix.SubmitCommandResultAsync(config, command.Id, result, ct);
                    handled++;
                }
                catch (Exception ex)
                {
                    _log.LogWarning(ex, "Failed to submit result for command {Id}", command.Id);
                }
            }

            if (handled > 0)
            {
                _log.LogInformation("Proxied {Count} ISAPI command(s)", handled);
            }
        }
        finally
        {
            Interlocked.Exchange(ref _commandPollInFlight, 0);
        }
    }

    private async Task RunPunchSyncAsync(bool includeHeartbeat, CancellationToken ct)
    {
        if (Interlocked.CompareExchange(ref _attendanceSyncInFlight, 1, 0) != 0)
        {
            return;
        }

        try
        {
            _config.Reload();
            var config = _config.Current;
            if (!config.IsReady)
            {
                _log.LogWarning("Punch sync skipped — config not ready");
                return;
            }

            if (includeHeartbeat)
            {
                try
                {
                    var payload = await _centrix.PostHeartbeatAsync(config, ct);
                    ApplyAgentSchedule(payload);
                }
                catch (Exception ex)
                {
                    _log.LogWarning(ex, "Heartbeat failed");
                }
            }

            await SyncOnceAsync(config, ct);
        }
        finally
        {
            Interlocked.Exchange(ref _attendanceSyncInFlight, 0);
        }
    }

    private async Task<(int Applied, int Skipped, int Pulled)> SyncOnceAsync(AgentConfig config, CancellationToken ct)
    {
        var state = _config.LoadState();
        var lookback = Math.Max(AgentConstants.CatchupLookbackMinutes, config.LookbackMinutes);
        DateTime initialFrom;
        if (!string.IsNullOrWhiteSpace(state.LastEventAt) &&
            DateTime.TryParse(state.LastEventAt, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var last))
        {
            initialFrom = last.ToUniversalTime().AddMilliseconds(-AgentConstants.CatchupOverlapMs);
        }
        else
        {
            initialFrom = DateTime.UtcNow.AddMinutes(-lookback);
        }

        var initialTo = DateTime.UtcNow;
        _log.LogInformation(
            "Uploading punches from {Host} since {From:o}",
            config.Hikvision.Host,
            initialFrom);

        var queue = new Queue<(DateTime From, DateTime To)>();
        queue.Enqueue((initialFrom, initialTo));
        var applied = 0;
        var skipped = 0;
        var pulled = 0;
        var maxUploadedAt = state.LastEventAt;
        var failed = false;
        var windows = 0;

        while (queue.Count > 0 && windows < AgentConstants.MaxCatchupWindows)
        {
            windows++;
            var (from, to) = queue.Dequeue();
            if (from >= to) continue;

            try
            {
                await PollCommandsSafeAsync(ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _log.LogDebug(ex, "Command poll during punch sync failed");
            }

            List<PunchEvent> events;
            bool truncated;
            try
            {
                (events, truncated) = await FetchAcsEventsWithRetryAsync(config, from, to, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                failed = true;
                _log.LogWarning(ex, "Could not read punches from Hikvision for {From:o}–{To:o}", from, to);
                break;
            }

            _log.LogInformation(
                "Pulled {Count} event(s){Truncated}",
                events.Count,
                truncated ? " (window full — splitting)" : "");
            pulled += events.Count;

            if (events.Count > 0)
            {
                var ordered = events
                    .OrderBy(e => e.PunchedAt, StringComparer.Ordinal)
                    .ToList();
                var result = await IngestEventBatchAsync(config, state, ordered, ct);
                applied += result.Applied;
                skipped += result.Skipped;
                failed = failed || result.Failed;
                if (!string.IsNullOrEmpty(result.LastEventAt))
                {
                    maxUploadedAt = Later(maxUploadedAt, result.LastEventAt);
                }
                if (result.Failed)
                {
                    // Retry remaining punches on the next poll from the last good watermark.
                    break;
                }
            }

            if (truncated && events.Count > 0)
            {
                var times = events
                    .Select(e => DateTime.TryParse(e.PunchedAt, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var t) ? t : (DateTime?)null)
                    .Where(t => t.HasValue)
                    .Select(t => t!.Value)
                    .ToList();
                if (times.Count > 0)
                {
                    var oldest = times.Min().AddSeconds(-1);
                    var newest = times.Max();
                    if (oldest > from) queue.Enqueue((from, oldest));
                    if (newest < to) queue.Enqueue((newest, to));
                }
            }
        }

        if (windows >= AgentConstants.MaxCatchupWindows && queue.Count > 0)
        {
            failed = true;
            _log.LogWarning("Catch-up paused after {Windows} windows; remaining punches sync on next poll", windows);
        }

        var cutoff = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - 7L * 24 * 60 * 60 * 1000;
        foreach (var key in state.Seen.Keys.ToList())
        {
            if (state.Seen[key] < cutoff) state.Seen.Remove(key);
        }

        // Advance watermark only after a successful upload path (applied or already-known skips).
        // Never advance when ingest/device read failed — punches would be dropped.
        if (!failed && (applied > 0 || skipped > 0))
        {
            state.LastEventAt = Later(state.LastEventAt, maxUploadedAt);
        }

        state.LastSyncedAt = DateTime.UtcNow.ToString("o");
        _config.SaveState(state);

        _log.LogInformation(
            "Done applied={Applied} skipped={Skipped} pulled={Pulled} failed={Failed}",
            applied,
            skipped,
            pulled,
            failed);
        return (applied, skipped, pulled);
    }

    private async Task<(List<PunchEvent> Events, bool Truncated)> FetchAcsEventsWithRetryAsync(
        AgentConfig config,
        DateTime from,
        DateTime to,
        CancellationToken ct)
    {
        Exception? last = null;
        for (var attempt = 1; attempt <= 3; attempt++)
        {
            try
            {
                return await _acs.FetchAcsEventsAsync(config, from, to, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                last = ex;
                _log.LogWarning(ex, "Hikvision AcsEvent attempt {Attempt}/3 failed", attempt);
                if (attempt < 3)
                {
                    await Task.Delay(TimeSpan.FromSeconds(attempt * 2), ct);
                }
            }
        }

        throw last ?? new InvalidOperationException("Hikvision AcsEvent failed");
    }

    private async Task<(int Applied, int Skipped, string? LastEventAt, bool Failed)> IngestEventBatchAsync(
        AgentConfig config,
        AgentState state,
        List<PunchEvent> events,
        CancellationToken ct)
    {
        if (events.Count == 0)
        {
            return (0, 0, null, false);
        }

        var applied = 0;
        var skipped = 0;
        string? lastOk = null;
        var failed = false;

        if (config.DeviceId is not > 0)
        {
            return await IngestLegacyAsync(config, state, events, ct);
        }

        for (var offset = 0; offset < events.Count; offset += AgentConstants.IngestChunkSize)
        {
            var chunk = events.Skip(offset).Take(AgentConstants.IngestChunkSize).ToList();
            var chunkOk = false;
            Exception? lastEx = null;

            for (var attempt = 1; attempt <= AgentConstants.IngestMaxAttempts; attempt++)
            {
                try
                {
                    var (a, s, stored) = await _centrix.IngestEventsAsync(config, chunk, ct);
                    applied += a;
                    skipped += s;
                    lastOk = Later(lastOk, chunk[^1].PunchedAt);
                    chunkOk = true;
                    _log.LogInformation(
                        "Ingest chunk stored={Stored} applied={Applied} skipped={Skipped} (attempt {Attempt})",
                        stored,
                        a,
                        s,
                        attempt);
                    break;
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    lastEx = ex;
                    _log.LogWarning(
                        ex,
                        "Ingest attempt {Attempt}/{Max} failed for {Count} punches",
                        attempt,
                        AgentConstants.IngestMaxAttempts,
                        chunk.Count);
                    if (attempt < AgentConstants.IngestMaxAttempts)
                    {
                        await Task.Delay(TimeSpan.FromSeconds(attempt * 2), ct);
                    }
                }
            }

            if (chunkOk) continue;

            _log.LogWarning(lastEx, "Ingest chunk failed — falling back to per-punch clock-punch");
            var legacy = await IngestLegacyAsync(config, state, chunk, ct);
            applied += legacy.Applied;
            skipped += legacy.Skipped;
            lastOk = Later(lastOk, legacy.LastEventAt);
            if (legacy.Failed)
            {
                failed = true;
                break;
            }
        }

        return (applied, skipped, lastOk, failed);
    }

    private async Task<(int Applied, int Skipped, string? LastEventAt, bool Failed)> IngestLegacyAsync(
        AgentConfig config,
        AgentState state,
        List<PunchEvent> events,
        CancellationToken ct)
    {
        var appliedLegacy = 0;
        var skippedLegacy = 0;
        string? last = null;
        var failed = false;

        foreach (var punch in events)
        {
            var key = $"{punch.EmployeeNo}|{punch.PunchedAt}|{punch.SerialNo ?? ""}";
            if (state.Seen.ContainsKey(key))
            {
                skippedLegacy++;
                if (!failed) last = Later(last, punch.PunchedAt);
                continue;
            }

            var posted = false;
            for (var attempt = 1; attempt <= AgentConstants.IngestMaxAttempts; attempt++)
            {
                try
                {
                    await _centrix.PostPunchLegacyAsync(config, punch, ct);
                    appliedLegacy++;
                    state.Seen[key] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    if (!failed) last = Later(last, punch.PunchedAt);
                    posted = true;
                    break;
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    _log.LogWarning(ex, "clock-punch attempt {Attempt} failed for {Employee}", attempt, punch.EmployeeNo);
                    if (attempt < AgentConstants.IngestMaxAttempts)
                    {
                        await Task.Delay(TimeSpan.FromSeconds(attempt), ct);
                    }
                }
            }

            if (!posted)
            {
                failed = true;
                skippedLegacy++;
                break;
            }
        }

        return (appliedLegacy, skippedLegacy, last, failed);
    }

    private void ApplyScheduleFromConfig(AgentConfig config)
    {
        _heartbeatSeconds = Clamp(config.HeartbeatIntervalSeconds, 60, 3600, 600);
        _timezone = string.IsNullOrWhiteSpace(config.Timezone) ? "Africa/Nairobi" : config.Timezone;
    }

    private void ApplyAgentSchedule(JsonDocument? doc)
    {
        if (doc is null) return;
        ApplyAgentSchedule(doc.RootElement);
    }

    private void ApplyAgentSchedule(JsonElement payload)
    {
        if (payload.ValueKind != JsonValueKind.Object) return;

        if (TryGetInt(payload, "heartbeat_interval_seconds", out var heartbeat) ||
            TryGetInt(payload, "poll_interval_seconds", out heartbeat))
        {
            if (heartbeat >= 60)
            {
                var next = Math.Min(3600, heartbeat);
                if (next != _heartbeatSeconds)
                {
                    _heartbeatSeconds = next;
                    _log.LogInformation("Health check every {Seconds}s", _heartbeatSeconds);
                }
            }
        }

        if (payload.TryGetProperty("timezone", out var tz) && tz.ValueKind == JsonValueKind.String)
        {
            _timezone = tz.GetString() ?? _timezone;
        }
    }

    private static string? Later(string? a, string? b)
    {
        if (a is null) return b;
        if (b is null) return a;
        return string.CompareOrdinal(b, a) > 0 ? b : a;
    }

    private static bool TryGetInt(JsonElement el, string name, out int value)
    {
        value = 0;
        if (!el.TryGetProperty(name, out var p)) return false;
        if (p.ValueKind == JsonValueKind.Number && p.TryGetInt32(out value)) return true;
        if (p.ValueKind == JsonValueKind.String && int.TryParse(p.GetString(), out value)) return true;
        return false;
    }

    private static int Clamp(int value, int min, int max, int fallback) =>
        value < min ? fallback : Math.Min(max, value);
}
