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

    public string ConfigPath { get; private set; }
    public string ExamplePath { get; private set; }

    public ConfigStore()
    {
        var root = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        ConfigPath = ResolveExisting(root, "config.json") ?? Path.Combine(root, "config.json");
        ExamplePath = ResolveExisting(root, "config.example.json") ?? Path.Combine(root, "config.example.json");
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
        var json = JsonSerializer.Serialize(source, JsonOptions);
        var clone = JsonSerializer.Deserialize<AgentConfig>(json, JsonOptions) ?? new AgentConfig();
        clone.Normalize();
        return clone;
    }
}
