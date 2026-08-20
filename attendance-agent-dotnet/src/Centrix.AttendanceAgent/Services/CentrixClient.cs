using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Centrix.AttendanceAgent.Models;

namespace Centrix.AttendanceAgent.Services;

public sealed class CentrixClient
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    private readonly HttpClient _http;

    public CentrixClient()
    {
        var handler = new SocketsHttpHandler
        {
            PooledConnectionLifetime = TimeSpan.FromMinutes(2),
            AutomaticDecompression = DecompressionMethods.All,
        };
        _http = new HttpClient(handler)
        {
            Timeout = TimeSpan.FromSeconds(90),
        };
        _http.DefaultRequestHeaders.ConnectionClose = false;
    }

    private static string DeviceBase(AgentConfig config) =>
        $"{config.CentrixApiUrl.TrimEnd('/')}/attendance-clock-devices/{config.DeviceId}/hikvision";

    private static HttpRequestMessage Request(AgentConfig config, HttpMethod method, string url, object? body = null)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.CentrixToken);
        if (body != null)
        {
            var json = JsonSerializer.Serialize(body, JsonOptions);
            req.Content = new StringContent(json, Encoding.UTF8, "application/json");
        }
        return req;
    }

    public async Task<JsonDocument?> PostHeartbeatAsync(AgentConfig config, CancellationToken ct)
    {
        var url = $"{DeviceBase(config)}/agent/heartbeat";
        using var req = Request(config, HttpMethod.Post, url, new { agent_version = AgentConstants.Version });
        using var res = await _http.SendAsync(req, ct);
        var text = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Heartbeat HTTP {(int)res.StatusCode}: {Trim(text)}");
        }
        return string.IsNullOrWhiteSpace(text) ? null : JsonDocument.Parse(text);
    }

    public async Task<(IReadOnlyList<AgentCommand> Commands, JsonElement Root)> PullCommandsAsync(
        AgentConfig config,
        CancellationToken ct)
    {
        var url =
            $"{DeviceBase(config)}/agent/commands/pending" +
            $"?limit=5&agent_version={Uri.EscapeDataString(AgentConstants.Version)}";
        using var req = Request(config, HttpMethod.Get, url);
        using var res = await _http.SendAsync(req, ct);
        var text = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Command poll HTTP {(int)res.StatusCode}: {Trim(text)}");
        }

        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(text) ? "{}" : text);
        var root = doc.RootElement.Clone();
        var commands = new List<AgentCommand>();
        if (root.TryGetProperty("commands", out var arr) && arr.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in arr.EnumerateArray())
            {
                commands.Add(new AgentCommand
                {
                    Id = ReadCommandId(item),
                    Method = item.TryGetProperty("method", out var method) ? method.GetString() ?? "GET" : "GET",
                    Path = item.TryGetProperty("path", out var path) ? path.GetString() ?? "" : "",
                    Body = item.TryGetProperty("body", out var body) ? body.Clone() : null,
                    Accept = item.TryGetProperty("accept", out var accept) ? accept.GetString() : null,
                });
            }
        }

        return (commands, root);
    }

    public async Task SubmitCommandResultAsync(AgentConfig config, string commandId, CommandResult result, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(commandId))
        {
            throw new InvalidOperationException("Command id missing from Centrix pending payload.");
        }

        var url = $"{DeviceBase(config)}/agent/commands/{Uri.EscapeDataString(commandId)}/result";
        using var req = Request(config, HttpMethod.Post, url, new
        {
            agent_version = AgentConstants.Version,
            success = result.Success,
            status = result.Status,
            headers = result.Headers,
            body = result.Body,
            error = result.Error,
        });
        using var res = await _http.SendAsync(req, ct);
        if (!res.IsSuccessStatusCode)
        {
            var text = await res.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException($"Command result HTTP {(int)res.StatusCode}: {Trim(text)}");
        }
    }

    public async Task<(int Applied, int Skipped, int Stored)> IngestEventsAsync(
        AgentConfig config,
        IReadOnlyList<PunchEvent> events,
        CancellationToken ct)
    {
        var url = $"{DeviceBase(config)}/agent/ingest-events";
        var payload = new
        {
            agent_version = AgentConstants.Version,
            events = events.Select(e => new
            {
                employee_no = e.EmployeeNo,
                employee_name = e.EmployeeName,
                punched_at = e.PunchedAt,
                attendance_status = e.AttendanceStatus,
                verification_method = e.VerificationMethod,
                card_no = e.CardNo,
                serial_no = e.SerialNo,
                major = e.Major,
                minor = e.Minor,
                raw = e.Raw,
            }),
        };
        using var req = Request(config, HttpMethod.Post, url, payload);
        using var res = await _http.SendAsync(req, ct);
        var text = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Centrix ingest HTTP {(int)res.StatusCode}: {Trim(text)}");
        }

        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(text) ? "{}" : text);
        var root = doc.RootElement;
        return (
            root.TryGetProperty("applied", out var a) ? a.GetInt32() : 0,
            root.TryGetProperty("skipped", out var s) ? s.GetInt32() : 0,
            root.TryGetProperty("stored", out var st) ? st.GetInt32() : 0
        );
    }

    public async Task PostPunchLegacyAsync(AgentConfig config, PunchEvent punch, CancellationToken ct)
    {
        var url = $"{config.CentrixApiUrl.TrimEnd('/')}/attendance/clock-punch";
        using var req = Request(config, HttpMethod.Post, url, new
        {
            employee_code = punch.EmployeeNo,
            device_no = config.DeviceNo,
            punched_at = punch.PunchedAt,
            direction = punch.Direction,
        });
        using var res = await _http.SendAsync(req, ct);
        if (!res.IsSuccessStatusCode)
        {
            var text = await res.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException($"Centrix clock-punch HTTP {(int)res.StatusCode}: {Trim(text)}");
        }
    }

    private static string Trim(string text) =>
        text.Length <= 300 ? text : text[..300];

    private static string ReadCommandId(JsonElement item)
    {
        if (!item.TryGetProperty("id", out var id)) return "";
        return id.ValueKind switch
        {
            JsonValueKind.String => id.GetString()?.Trim() ?? "",
            JsonValueKind.Number => id.GetRawText(),
            _ => id.ToString(),
        };
    }
}
