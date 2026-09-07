using System.Diagnostics;
using System.Runtime.InteropServices;
using System.ServiceProcess;
using Centrix.KraAgent.Models;

namespace Centrix.KraAgent.Services;

/// <summary>
/// Ensures local Comstore is reachable; starts Windows service / exe when down.
/// Happy path is a single cheap health probe — no start work when already up.
/// </summary>
public sealed class ComstoreEnsureService
{
    private static readonly string[] DefaultServiceNames =
    [
        "Comstore",
        "ComStore",
        "ComstoreAPI",
        "Comstore API",
        "Smart VSCU",
        "SmartVSCU",
        "VSCU",
        "etims-vscu",
    ];

    private static readonly string[] DefaultExecutableCandidates =
    [
        @"C:\Comstore\Comstore.exe",
        @"C:\Comstore\ComstoreAPI.exe",
        @"C:\Program Files\Comstore\Comstore.exe",
        @"C:\Program Files\Comstore\ComstoreAPI.exe",
        @"C:\Program Files (x86)\Comstore\Comstore.exe",
        @"C:\Program Files\Smart VSCU\Comstore.exe",
        @"C:\Program Files\SmartVSCU\Comstore.exe",
    ];

    private readonly ILogger<ComstoreEnsureService> _log;
    private readonly ComstoreClient _comstore;
    private readonly object _gate = new();
    private DateTimeOffset _lastHealthyAt = DateTimeOffset.MinValue;
    private DateTimeOffset _lastStartAttemptAt = DateTimeOffset.MinValue;
    private string? _lastStartNote;

    public ComstoreEnsureService(ILogger<ComstoreEnsureService> log, ComstoreClient comstore)
    {
        _log = log;
        _comstore = comstore;
    }

    public string? LastStartNote => _lastStartNote;

    public async Task<bool> IsHealthyAsync(AgentConfig config, CancellationToken ct)
    {
        var health = await ProbeAsync(config, ct);
        if (health.Success)
        {
            _lastHealthyAt = DateTimeOffset.UtcNow;
            return true;
        }

        return false;
    }

    /// <summary>
    /// Returns true when Comstore answers /api/health. Starts it when configured and down.
    /// Skips start attempts when recently healthy (speed path).
    /// </summary>
    public async Task<(bool Ok, string? Detail)> EnsureRunningAsync(
        AgentConfig config,
        CancellationToken ct,
        bool forceStartAttempt = false)
    {
        // Hot path: skip probe if we saw a healthy response moments ago.
        if (!forceStartAttempt &&
            (DateTimeOffset.UtcNow - _lastHealthyAt) < TimeSpan.FromSeconds(8))
        {
            return (true, null);
        }

        if (await IsHealthyAsync(config, ct))
        {
            return (true, null);
        }

        if (!config.AutoStartComstore)
        {
            return (false, $"Comstore not reachable at {config.ComstoreBaseUrl} (auto-start disabled).");
        }

        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            return (false, "Comstore auto-start is only supported on Windows.");
        }

        lock (_gate)
        {
            // Avoid hammering start when many fiscal calls arrive while Comstore is booting.
            if (!forceStartAttempt &&
                (DateTimeOffset.UtcNow - _lastStartAttemptAt) < TimeSpan.FromSeconds(8))
            {
                return (false, _lastStartNote ?? "Comstore start already in progress.");
            }

            _lastStartAttemptAt = DateTimeOffset.UtcNow;
        }

        var notes = new List<string>();
        var started = TryStartWindowsServices(config, notes)
            || TryStartExecutable(config, notes)
            || TryStartCommand(config, notes);

        if (!started)
        {
            _lastStartNote = string.Join("; ", notes);
            _log.LogWarning("Could not start Comstore: {Detail}", _lastStartNote);
            return (false, _lastStartNote);
        }

        var readyTimeout = Math.Clamp(config.ComstoreReadyTimeoutSeconds, 5, 120);
        var deadline = DateTimeOffset.UtcNow.AddSeconds(readyTimeout);
        while (DateTimeOffset.UtcNow < deadline)
        {
            ct.ThrowIfCancellationRequested();
            if (await IsHealthyAsync(config, ct))
            {
                _lastStartNote = "Comstore started and healthy. " + string.Join("; ", notes);
                _log.LogInformation("{Note}", _lastStartNote);
                return (true, _lastStartNote);
            }

            await Task.Delay(500, ct);
        }

        _lastStartNote =
            $"Started Comstore process/service but /api/health still failed after {readyTimeout}s at {config.ComstoreBaseUrl}. "
            + string.Join("; ", notes);
        _log.LogWarning("{Note}", _lastStartNote);
        return (false, _lastStartNote);
    }

    private Task<CommandResult> ProbeAsync(AgentConfig config, CancellationToken ct) =>
        _comstore.ExecuteAsync(config, new AgentCommand
        {
            Method = "GET",
            Path = "/api/health",
        }, ct, timeoutSecondsOverride: AgentConstants.ComstoreHealthTimeoutSeconds);

    private bool TryStartWindowsServices(AgentConfig config, List<string> notes)
    {
        var names = config.ComstoreWindowsServiceNames
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Select(n => n.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (names.Count == 0)
        {
            names.AddRange(DefaultServiceNames);
        }

        // Also match any installed service whose name contains comstore / vscu.
        try
        {
            foreach (var svc in ServiceController.GetServices())
            {
                var n = svc.ServiceName ?? "";
                var d = svc.DisplayName ?? "";
                if (ContainsComstoreHint(n) || ContainsComstoreHint(d))
                {
                    if (!names.Contains(n, StringComparer.OrdinalIgnoreCase))
                    {
                        names.Add(n);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            notes.Add("Service enumeration failed: " + ex.Message);
        }

        foreach (var name in names)
        {
            try
            {
                using var sc = new ServiceController(name);
                if (sc.Status is ServiceControllerStatus.Running or ServiceControllerStatus.StartPending)
                {
                    notes.Add($"Windows service '{name}' already {sc.Status}.");
                    return true;
                }

                if (sc.Status is ServiceControllerStatus.Stopped or ServiceControllerStatus.Paused)
                {
                    _log.LogInformation("Starting Windows service {Service}", name);
                    sc.Start();
                    sc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(20));
                    notes.Add($"Started Windows service '{name}'.");
                    return true;
                }

                notes.Add($"Service '{name}' status {sc.Status} — skipped.");
            }
            catch (InvalidOperationException)
            {
                // Service name not installed.
            }
            catch (Exception ex)
            {
                notes.Add($"Service '{name}': {ex.Message}");
            }
        }

        return false;
    }

    private bool TryStartExecutable(AgentConfig config, List<string> notes)
    {
        var candidates = new List<string>();
        if (!string.IsNullOrWhiteSpace(config.ComstoreExecutablePath))
        {
            candidates.Add(config.ComstoreExecutablePath.Trim());
        }

        candidates.AddRange(DefaultExecutableCandidates);

        foreach (var path in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (!File.Exists(path)) continue;

            try
            {
                var exeName = Path.GetFileNameWithoutExtension(path);
                if (Process.GetProcessesByName(exeName).Length > 0)
                {
                    notes.Add($"Process '{exeName}' already running.");
                    return true;
                }

                var psi = new ProcessStartInfo
                {
                    FileName = path,
                    Arguments = config.ComstoreExecutableArgs?.Trim() ?? "",
                    WorkingDirectory = string.IsNullOrWhiteSpace(config.ComstoreStartWorkingDirectory)
                        ? Path.GetDirectoryName(path) ?? ""
                        : config.ComstoreStartWorkingDirectory.Trim(),
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };

                _log.LogInformation("Starting Comstore exe {Path}", path);
                Process.Start(psi);
                notes.Add($"Started executable '{path}'.");
                return true;
            }
            catch (Exception ex)
            {
                notes.Add($"Exe '{path}': {ex.Message}");
            }
        }

        return false;
    }

    private bool TryStartCommand(AgentConfig config, List<string> notes)
    {
        var cmd = config.ComstoreStartCommand?.Trim();
        if (string.IsNullOrWhiteSpace(cmd)) return false;

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c " + cmd,
                WorkingDirectory = string.IsNullOrWhiteSpace(config.ComstoreStartWorkingDirectory)
                    ? Environment.GetFolderPath(Environment.SpecialFolder.System)
                    : config.ComstoreStartWorkingDirectory.Trim(),
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            _log.LogInformation("Starting Comstore via command: {Cmd}", cmd);
            Process.Start(psi);
            notes.Add($"Ran start command.");
            return true;
        }
        catch (Exception ex)
        {
            notes.Add("Start command failed: " + ex.Message);
            return false;
        }
    }

    private static bool ContainsComstoreHint(string value)
    {
        var v = value.ToLowerInvariant();
        return v.Contains("comstore") || v.Contains("smart vscu") || v.Contains("smartvscu")
            || (v.Contains("vscu") && !v.Contains("centrix"));
    }
}
