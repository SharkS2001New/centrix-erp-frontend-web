using System.Text.Json.Serialization;

namespace Centrix.AttendanceAgent.Models;

public sealed class AgentConfig
{
    [JsonPropertyName("centrixApiUrl")]
    public string CentrixApiUrl { get; set; } = "";

    [JsonPropertyName("centrixToken")]
    public string CentrixToken { get; set; } = "";

    [JsonPropertyName("deviceId")]
    public long? DeviceId { get; set; }

    [JsonPropertyName("deviceNo")]
    public string DeviceNo { get; set; } = "";

    [JsonPropertyName("hikvision")]
    public HikvisionConfig Hikvision { get; set; } = new();

    [JsonPropertyName("pollIntervalSeconds")]
    public int PollIntervalSeconds { get; set; } = 600;

    [JsonPropertyName("heartbeatIntervalSeconds")]
    public int HeartbeatIntervalSeconds { get; set; } = 600;

    [JsonPropertyName("punchPollSeconds")]
    public int PunchPollSeconds { get; set; } = 30;

    [JsonPropertyName("punchLeadMinutes")]
    public int PunchLeadMinutes { get; set; } = 10;

    [JsonPropertyName("punchLagMinutes")]
    public int PunchLagMinutes { get; set; } = 20;

    [JsonPropertyName("punchWindows")]
    public List<PunchWindow> PunchWindows { get; set; } = DefaultWindows();

    [JsonPropertyName("timezone")]
    public string Timezone { get; set; } = "Africa/Nairobi";

    [JsonPropertyName("lookbackMinutes")]
    public int LookbackMinutes { get; set; } = 10080;

    public static List<PunchWindow> DefaultWindows() =>
    [
        new() { Name = "morning_clock_in", From = "08:00", To = "10:00" },
        new() { Name = "lunch_clock_out", From = "12:30", To = "14:00" },
        new() { Name = "lunch_clock_in", From = "13:00", To = "16:00" },
        new() { Name = "evening_clock_out", From = "16:00", To = "22:00" },
    ];

    public IReadOnlyList<string> MissingFields()
    {
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(CentrixApiUrl)) missing.Add("Centrix API URL");
        if (string.IsNullOrWhiteSpace(CentrixToken)) missing.Add("Centrix token");
        if (DeviceId is null or <= 0) missing.Add("device id");
        if (string.IsNullOrWhiteSpace(DeviceNo)) missing.Add("device number");
        if (string.IsNullOrWhiteSpace(Hikvision.Host)) missing.Add("Hikvision LAN IP");
        if (string.IsNullOrEmpty(Hikvision.Password)) missing.Add("Hikvision password");
        return missing;
    }

    public bool IsReady => MissingFields().Count == 0;

    public void Normalize()
    {
        CentrixApiUrl = CentrixApiUrl.Trim().TrimEnd('/');
        CentrixToken = CentrixToken.Trim();
        DeviceNo = DeviceNo.Trim();
        Hikvision.Host = Hikvision.Host.Trim();
        Hikvision.Username = string.IsNullOrWhiteSpace(Hikvision.Username) ? "admin" : Hikvision.Username.Trim();
        if (Hikvision.Port <= 0)
        {
            Hikvision.Port = Hikvision.UseHttps ? 443 : 80;
        }
        if (Hikvision.Port == 8000 && !Hikvision.UseHttps)
        {
            Hikvision.Port = 80;
        }
        if (PollIntervalSeconds < 60) PollIntervalSeconds = 600;
        if (HeartbeatIntervalSeconds < 60)
        {
            HeartbeatIntervalSeconds = PollIntervalSeconds > 0 ? PollIntervalSeconds : 600;
        }
        if (PunchPollSeconds < 15) PunchPollSeconds = 60;
        if (LookbackMinutes < 1) LookbackMinutes = 10080;
        if (string.IsNullOrWhiteSpace(Timezone)) Timezone = "Africa/Nairobi";
        if (PunchWindows is null || PunchWindows.Count == 0)
        {
            PunchWindows = DefaultWindows();
        }
    }
}

public sealed class HikvisionConfig
{
    [JsonPropertyName("host")]
    public string Host { get; set; } = "";

    [JsonPropertyName("port")]
    public int Port { get; set; } = 80;

    [JsonPropertyName("username")]
    public string Username { get; set; } = "admin";

    [JsonPropertyName("password")]
    public string Password { get; set; } = "";

    [JsonPropertyName("useHttps")]
    public bool UseHttps { get; set; }

    public string BaseUrl
    {
        get
        {
            var scheme = UseHttps ? "https" : "http";
            var port = Port;
            if (port == 8000 && !UseHttps) port = 80;
            return $"{scheme}://{Host}:{port}";
        }
    }
}

public sealed class PunchWindow
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("from")]
    public string From { get; set; } = "";

    [JsonPropertyName("to")]
    public string To { get; set; } = "";
}

public sealed class AgentState
{
    [JsonPropertyName("lastEventAt")]
    public string? LastEventAt { get; set; }

    [JsonPropertyName("lastSyncedAt")]
    public string? LastSyncedAt { get; set; }

    [JsonPropertyName("seen")]
    public Dictionary<string, long> Seen { get; set; } = new();
}

public sealed class PunchEvent
{
    public string EmployeeNo { get; set; } = "";
    public string? EmployeeName { get; set; }
    public string PunchedAt { get; set; } = "";
    public string? AttendanceStatus { get; set; }
    public string? VerificationMethod { get; set; }
    public string? CardNo { get; set; }
    public string? SerialNo { get; set; }
    public int? Major { get; set; }
    public int? Minor { get; set; }
    public string Direction { get; set; } = "auto";
    public object? Raw { get; set; }
}

public sealed class AgentCommand
{
    /// <summary>Centrix stores command ids as UUIDs (string), not integers.</summary>
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
    public Dictionary<string, string> Headers { get; set; } = new();
    public string Body { get; set; } = "";
    public string? Error { get; set; }
}
