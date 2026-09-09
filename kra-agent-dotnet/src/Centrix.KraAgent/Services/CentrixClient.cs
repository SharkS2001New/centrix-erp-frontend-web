using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Centrix.KraAgent.Models;

namespace Centrix.KraAgent.Services;

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
            // Keep connections warm for rapid command polls.
            PooledConnectionIdleTimeout = TimeSpan.FromMinutes(5),
            MaxConnectionsPerServer = 8,
        };
        _http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(90) };
        _http.DefaultRequestHeaders.ConnectionClose = false;
    }

    private static string KraBase(AgentConfig config) =>
        $"{config.CentrixApiUrl.TrimEnd('/')}/kra";

    private static HttpRequestMessage Request(AgentConfig config, HttpMethod method, string url, object? body = null)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config.CentrixToken);
        req.Headers.TryAddWithoutValidation("X-Centrix-Agent", AgentConstants.AgentName);
        req.Headers.TryAddWithoutValidation("X-Centrix-Agent-Version", AgentConstants.Version);
        if (body != null)
        {
            var json = JsonSerializer.Serialize(body, JsonOptions);
            req.Content = new StringContent(json, Encoding.UTF8, "application/json");
        }
        return req;
    }

    private async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, int timeoutSeconds, CancellationToken ct)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromSeconds(timeoutSeconds));
        try
        {
            return await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cts.Token);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new TimeoutException($"Centrix request timed out after {timeoutSeconds}s.");
        }
    }

    public async Task PostHeartbeatAsync(
        AgentConfig config,
        CancellationToken ct,
        bool? comstoreHealthy = null,
        string? comstoreMessage = null,
        bool? deviceReachable = null,
        string? deviceMessage = null,
        string? deviceHardwareIp = null,
        string? deviceConnection = null)
    {
        var url = $"{KraBase(config)}/agent/heartbeat";
        using var req = Request(config, HttpMethod.Post, url, new
        {
            agent_version = AgentConstants.Version,
            comstore_base_url = config.ComstoreBaseUrl,
            comstore_healthy = comstoreHealthy,
            comstore_message = Truncate(comstoreMessage, 400),
            device_reachable = deviceReachable,
            device_status_message = Truncate(deviceMessage, 400),
            device_hardware_ip = string.IsNullOrWhiteSpace(deviceHardwareIp)
                ? config.DeviceHardwareIp
                : deviceHardwareIp,
            device_connection = deviceConnection,
        });
        using var res = await SendAsync(req, 15, ct);
        if (!res.IsSuccessStatusCode)
        {
            var text = await res.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException($"Heartbeat HTTP {(int)res.StatusCode}: {Trim(text)}");
        }
    }

    public async Task<(IReadOnlyList<AgentCommand> Commands, string? ComstoreBaseUrl, string? DeviceHardwareIp)> PullCommandsAsync(
        AgentConfig config,
        CancellationToken ct)
    {
        var waitMs = Math.Max(0, config.LongPollMs);
        var url =
            $"{KraBase(config)}/agent/commands/pending" +
            $"?limit={AgentConstants.CommandPullLimit}&wait_ms={waitMs}&agent_version={Uri.EscapeDataString(AgentConstants.Version)}";
        using var req = Request(config, HttpMethod.Get, url);
        var timeout = Math.Max(15, 8 + (waitMs / 1000));
        using var res = await SendAsync(req, timeout, ct);
        var text = await res.Content.ReadAsStringAsync(ct);
        if (!res.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Command poll HTTP {(int)res.StatusCode}: {Trim(text)}");
        }

        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(text) ? "{}" : text);
        var root = doc.RootElement;
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

        string? comstore = null;
        if (root.TryGetProperty("comstore_base_url", out var cs) && cs.ValueKind == JsonValueKind.String)
        {
            comstore = cs.GetString();
        }

        string? hardwareIp = null;
        if (root.TryGetProperty("device_hardware_ip", out var hip) && hip.ValueKind == JsonValueKind.String)
        {
            hardwareIp = hip.GetString();
        }

        return (commands, comstore, hardwareIp);
    }

    public async Task SubmitCommandResultAsync(AgentConfig config, string commandId, CommandResult result, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(commandId))
        {
            throw new InvalidOperationException("Command id missing from Centrix pending payload.");
        }

        var url = $"{KraBase(config)}/agent/commands/{Uri.EscapeDataString(commandId)}/result";
        using var req = Request(config, HttpMethod.Post, url, new
        {
            agent_version = AgentConstants.Version,
            success = result.Success,
            status = result.Status,
            headers = result.Headers,
            body = result.Body,
            error = result.Error,
        });
        using var res = await SendAsync(req, 20, ct);
        if (!res.IsSuccessStatusCode)
        {
            var text = await res.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException($"Command result HTTP {(int)res.StatusCode}: {Trim(text)}");
        }
    }

    private static string Trim(string text) =>
        text.Length <= 300 ? text : text[..300];

    private static string? Truncate(string? text, int max)
    {
        if (string.IsNullOrEmpty(text)) return text;
        return text.Length <= max ? text : text[..max];
    }

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
