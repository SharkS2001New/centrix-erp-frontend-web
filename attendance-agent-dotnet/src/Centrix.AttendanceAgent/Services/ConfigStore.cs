using System.Text.Json;
using Centrix.AttendanceAgent.Models;

namespace Centrix.AttendanceAgent.Services;

public sealed class ConfigStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
    };

    private readonly object _gate = new();
    private AgentConfig _config = new();

    public string ConfigPath { get; private set; }
    public string StatePath { get; }
    public string ExamplePath { get; private set; }

    public ConfigStore()
    {
        var root = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        StatePath = Path.Combine(root, "state.json");

        ConfigPath = ResolveExisting(root, "config.json")
            ?? Path.Combine(root, "config.json");
        ExamplePath = ResolveExisting(root, "config.example.json")
            ?? Path.Combine(root, "config.example.json");

        Reload();
    }

    public AgentConfig Current
    {
        get
        {
            lock (_gate) return Clone(_config);
        }
    }

    public void Reload()
    {
        lock (_gate)
        {
            // Prefer a newly dropped config next to the exe (or zip parent) on each reload.
            var root = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            var found = ResolveExisting(root, "config.json");
            if (found != null)
            {
                ConfigPath = found;
            }

            var example = ResolveExisting(root, "config.example.json");
            if (example != null)
            {
                ExamplePath = example;
            }

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
                    // Running as LocalSystem may not allow copy; keep waiting for a real config.
                }
            }

            if (!File.Exists(ConfigPath))
            {
                _config = new AgentConfig();
                return;
            }

            try
            {
                var json = File.ReadAllText(ConfigPath);
                _config = JsonSerializer.Deserialize<AgentConfig>(json, JsonOptions) ?? new AgentConfig();
                _config.Normalize();
            }
            catch (Exception)
            {
                _config = new AgentConfig();
            }
        }
    }

    public AgentState LoadState()
    {
        if (!File.Exists(StatePath))
        {
            return new AgentState();
        }

        try
        {
            var json = File.ReadAllText(StatePath);
            return JsonSerializer.Deserialize<AgentState>(json, JsonOptions) ?? new AgentState();
        }
        catch
        {
            return new AgentState();
        }
    }

    public void SaveState(AgentState state)
    {
        try
        {
            var json = JsonSerializer.Serialize(state, JsonOptions);
            File.WriteAllText(StatePath, json + Environment.NewLine);
        }
        catch
        {
            // Non-fatal — next sync may re-pull overlap.
        }
    }

    /// <summary>
    /// Look beside the exe, then up to two parents (publish\ → zip root).
    /// </summary>
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
        var json = JsonSerializer.Serialize(source, JsonOptions);
        var clone = JsonSerializer.Deserialize<AgentConfig>(json, JsonOptions) ?? new AgentConfig();
        clone.Normalize();
        return clone;
    }
}
