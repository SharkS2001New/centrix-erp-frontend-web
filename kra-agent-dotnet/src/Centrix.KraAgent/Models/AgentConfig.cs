using System.Text.Json.Serialization;

namespace Centrix.KraAgent.Models;

public sealed class AgentConfig
{
    [JsonPropertyName("centrixApiUrl")]
    public string CentrixApiUrl { get; set; } = "";

    [JsonPropertyName("centrixToken")]
    public string CentrixToken { get; set; } = "";

    [JsonPropertyName("organizationId")]
    public long? OrganizationId { get; set; }

    [JsonPropertyName("agentId")]
    public long? AgentId { get; set; }

    [JsonPropertyName("comstoreBaseUrl")]
    public string ComstoreBaseUrl { get; set; } = "http://localhost:4000";

    [JsonPropertyName("pollIntervalSeconds")]
    public double PollIntervalSeconds { get; set; } = 0.25;

    [JsonPropertyName("heartbeatIntervalSeconds")]
    public int HeartbeatIntervalSeconds { get; set; } = 30;

    [JsonPropertyName("commandTimeoutSeconds")]
    public int CommandTimeoutSeconds { get; set; } = 22;

    [JsonPropertyName("longPollMs")]
    public int LongPollMs { get; set; } = 750;

    /// <summary>When true, agent starts Comstore if /api/health fails. Default false — start Comstore via Windows.</summary>
    [JsonPropertyName("autoStartComstore")]
    public bool AutoStartComstore { get; set; } = false;

    /// <summary>Preferred Windows service names to start (first match wins). Empty = built-in defaults + discovery.</summary>
    [JsonPropertyName("comstoreWindowsServiceNames")]
    public List<string> ComstoreWindowsServiceNames { get; set; } = new();

    /// <summary>Full path to Comstore API exe when it is not a Windows service.</summary>
    [JsonPropertyName("comstoreExecutablePath")]
    public string ComstoreExecutablePath { get; set; } = "";

    [JsonPropertyName("comstoreExecutableArgs")]
    public string ComstoreExecutableArgs { get; set; } = "";

    /// <summary>Optional shell command (cmd /c …) used last if service/exe start fails.</summary>
    [JsonPropertyName("comstoreStartCommand")]
    public string ComstoreStartCommand { get; set; } = "";

    [JsonPropertyName("comstoreStartWorkingDirectory")]
    public string ComstoreStartWorkingDirectory { get; set; } = "";

    /// <summary>How long to wait after starting Comstore before giving up on /api/health.</summary>
    [JsonPropertyName("comstoreReadyTimeoutSeconds")]
    public int ComstoreReadyTimeoutSeconds { get; set; } = 45;

    /// <summary>Smart VSCU / fiscal hardware LAN IP (from Centrix Finance). Used for ICMP/TCP reachability.</summary>
    [JsonPropertyName("deviceHardwareIp")]
    public string DeviceHardwareIp { get; set; } = "";

    public IReadOnlyList<string> MissingFields()
    {
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(CentrixApiUrl)) missing.Add("Centrix API URL");
        if (string.IsNullOrWhiteSpace(CentrixToken)) missing.Add("Centrix token");
        if (string.IsNullOrWhiteSpace(ComstoreBaseUrl)) missing.Add("Comstore base URL");
        return missing;
    }

    public bool IsReady => MissingFields().Count == 0;

    public void Normalize()
    {
        CentrixApiUrl = CentrixApiUrl.Trim().TrimEnd('/');
        CentrixToken = CentrixToken.Trim();
        ComstoreBaseUrl = ComstoreBaseUrl.Trim().TrimEnd('/');
        if (string.IsNullOrWhiteSpace(ComstoreBaseUrl))
        {
            ComstoreBaseUrl = "http://localhost:4000";
        }

        if (!ComstoreBaseUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            && !ComstoreBaseUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            ComstoreBaseUrl = "http://" + ComstoreBaseUrl;
        }

        ComstoreExecutablePath = (ComstoreExecutablePath ?? "").Trim();
        ComstoreExecutableArgs = (ComstoreExecutableArgs ?? "").Trim();
        ComstoreStartCommand = (ComstoreStartCommand ?? "").Trim();
        ComstoreStartWorkingDirectory = (ComstoreStartWorkingDirectory ?? "").Trim();
        DeviceHardwareIp = (DeviceHardwareIp ?? "").Trim();
        ComstoreWindowsServiceNames ??= new List<string>();
        ComstoreWindowsServiceNames = ComstoreWindowsServiceNames
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Select(n => n.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (HeartbeatIntervalSeconds < 30) HeartbeatIntervalSeconds = 30;
        if (HeartbeatIntervalSeconds > 120)
        {
            HeartbeatIntervalSeconds = 120;
        }

        if (CommandTimeoutSeconds < 10) CommandTimeoutSeconds = 22;
        if (CommandTimeoutSeconds > 55) CommandTimeoutSeconds = 55;
        if (LongPollMs < 0) LongPollMs = 0;
        if (LongPollMs > 10_000) LongPollMs = 10_000;
        if (PollIntervalSeconds <= 0) PollIntervalSeconds = 0.25;
        if (ComstoreReadyTimeoutSeconds < 5) ComstoreReadyTimeoutSeconds = 45;
        if (ComstoreReadyTimeoutSeconds > 120) ComstoreReadyTimeoutSeconds = 120;
    }
}

public sealed class AgentCommand
{
    public string Id { get; set; } = "";
    public string Method { get; set; } = "GET";
    public string Path { get; set; } = "";
    public object? Body { get; set; }
    public string? Accept { get; set; }
}

public sealed class CommandResult
{
    public bool Success { get; set; }
    public int? Status { get; set; }
    public Dictionary<string, string[]> Headers { get; set; } = new();
    public string Body { get; set; } = "";
    public string? Error { get; set; }
}
