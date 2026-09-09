using System.Text.Json;
using Centrix.KraAgent.Models;

namespace Centrix.KraAgent.Services;

public sealed class ConfigStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
    };

    private readonly object _gate = new();
    private AgentConfig _config = new();
    private DateTimeOffset _lastReloadAt = DateTimeOffset.MinValue;

    /// <summary>Avoid disk JSON parse on every command poll / heartbeat tick.</summary>
    private static readonly TimeSpan ReloadMinInterval = TimeSpan.FromSeconds(5);

    public string ConfigPath { get; private set; }
    public string ExamplePath { get; private set; }

    public ConfigStore()
    {
        var root = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        ConfigPath = ResolveExisting(root, "config.json") ?? Path.Combine(root, "config.json");
        ExamplePath = ResolveExisting(root, "config.example.json") ?? Path.Combine(root, "config.example.json");
        Reload(force: true);
    }

    /// <summary>Snapshot of current config (cheap field copy — hot path safe).</summary>
    public AgentConfig Current
    {
        get
        {
            lock (_gate) return Clone(_config);
        }
    }

    public void Reload() => Reload(force: false);

    public void Reload(bool force)
    {
        lock (_gate)
        {
            if (!force && (DateTimeOffset.UtcNow - _lastReloadAt) < ReloadMinInterval)
            {
                return;
            }

            var root = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            var found = ResolveExisting(root, "config.json");
            if (found != null) ConfigPath = found;

            var example = ResolveExisting(root, "config.example.json");
            if (example != null) ExamplePath = example;

            if (!File.Exists(ConfigPath) && File.Exists(ExamplePath))
            {
                try
                {
                    var target = Path.Combine(root, "config.json");
                    File.Copy(ExamplePath, target, overwrite: false);
                    ConfigPath = target;
                }
                catch
                {
                    // LocalSystem may not allow copy.
                }
            }

            if (!File.Exists(ConfigPath))
            {
                _config = new AgentConfig();
                _lastReloadAt = DateTimeOffset.UtcNow;
                return;
            }

            try
            {
                var json = File.ReadAllText(ConfigPath);
                _config = JsonSerializer.Deserialize<AgentConfig>(json, JsonOptions) ?? new AgentConfig();
                _config.Normalize();
            }
            catch
            {
                _config = new AgentConfig();
            }

            _lastReloadAt = DateTimeOffset.UtcNow;
        }
    }

    public void ApplyRuntimeOverrides(string? comstoreBaseUrl = null, string? deviceHardwareIp = null)
    {
        lock (_gate)
        {
            var changed = false;
            if (!string.IsNullOrWhiteSpace(comstoreBaseUrl))
            {
                var next = comstoreBaseUrl.Trim().TrimEnd('/');
                if (!string.Equals(_config.ComstoreBaseUrl, next, StringComparison.OrdinalIgnoreCase))
                {
                    _config.ComstoreBaseUrl = next;
                    changed = true;
                }
            }

            if (deviceHardwareIp != null)
            {
                var next = deviceHardwareIp.Trim();
                if (!string.Equals(_config.DeviceHardwareIp, next, StringComparison.OrdinalIgnoreCase))
                {
                    _config.DeviceHardwareIp = next;
                    changed = true;
                }
            }

            if (changed)
            {
                _config.Normalize();
            }
        }
    }

    private static string? ResolveExisting(string startDir, string fileName)
    {
        var dir = startDir;
        for (var i = 0; i < 3; i++)
        {
            var candidate = Path.Combine(dir, fileName);
            if (File.Exists(candidate)) return candidate;
            var parent = Directory.GetParent(dir)?.FullName;
            if (string.IsNullOrEmpty(parent) || parent == dir) break;
            dir = parent;
        }
        return null;
    }

    private static AgentConfig Clone(AgentConfig source)
    {
        // Field copy — avoid JSON round-trip on every poll/heartbeat.
        return new AgentConfig
        {
            CentrixApiUrl = source.CentrixApiUrl,
            CentrixToken = source.CentrixToken,
            OrganizationId = source.OrganizationId,
            AgentId = source.AgentId,
            ComstoreBaseUrl = source.ComstoreBaseUrl,
            PollIntervalSeconds = source.PollIntervalSeconds,
            HeartbeatIntervalSeconds = source.HeartbeatIntervalSeconds,
            CommandTimeoutSeconds = source.CommandTimeoutSeconds,
            LongPollMs = source.LongPollMs,
            AutoStartComstore = source.AutoStartComstore,
            ComstoreWindowsServiceNames = source.ComstoreWindowsServiceNames is { Count: > 0 }
                ? new List<string>(source.ComstoreWindowsServiceNames)
                : new List<string>(),
            ComstoreExecutablePath = source.ComstoreExecutablePath,
            ComstoreExecutableArgs = source.ComstoreExecutableArgs,
            ComstoreStartCommand = source.ComstoreStartCommand,
            ComstoreStartWorkingDirectory = source.ComstoreStartWorkingDirectory,
            ComstoreReadyTimeoutSeconds = source.ComstoreReadyTimeoutSeconds,
            DeviceHardwareIp = source.DeviceHardwareIp,
        };
    }
}
