using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Centrix.KraAgent.Models;

namespace Centrix.KraAgent.Services;

public sealed class ComstoreClient
{
    private readonly HttpClient _http;

    public ComstoreClient()
    {
        var handler = new SocketsHttpHandler
        {
            PooledConnectionLifetime = TimeSpan.FromMinutes(2),
            AutomaticDecompression = DecompressionMethods.All,
            ConnectTimeout = TimeSpan.FromSeconds(AgentConstants.ComstoreConnectTimeoutSeconds),
        };
        _http = new HttpClient(handler)
        {
            Timeout = TimeSpan.FromSeconds(AgentConstants.ComstoreRequestTimeoutSeconds),
        };
    }

    public async Task<CommandResult> ExecuteAsync(
        AgentConfig config,
        AgentCommand command,
        CancellationToken ct,
        int? timeoutSecondsOverride = null)
    {
        var method = (command.Method ?? "GET").Trim().ToUpperInvariant();
        var path = command.Path ?? "";

        if (path == "/agent/ping")
        {
            return new CommandResult
            {
                Success = true,
                Status = 200,
                Body = JsonSerializer.Serialize(new
                {
                    pong = true,
                    agent = AgentConstants.AgentName,
                    version = AgentConstants.Version,
                }),
                Headers = new Dictionary<string, string[]>
                {
                    ["content-type"] = ["application/json"],
                },
            };
        }

        if (!path.StartsWith('/')) path = "/" + path;
        var url = $"{config.ComstoreBaseUrl.TrimEnd('/')}{path}";

        using var req = new HttpRequestMessage(new HttpMethod(method), url);
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        if (method is not ("GET" or "HEAD") && command.Body != null)
        {
            string json;
            if (command.Body is JsonElement el)
            {
                json = el.GetRawText();
            }
            else
            {
                json = JsonSerializer.Serialize(command.Body);
            }
            req.Content = new StringContent(json, Encoding.UTF8, "application/json");
        }

        var timeoutSec = timeoutSecondsOverride
            ?? Math.Max(10, config.CommandTimeoutSeconds);
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromSeconds(timeoutSec));

        try
        {
            using var res = await _http.SendAsync(req, cts.Token);
            var body = await res.Content.ReadAsStringAsync(cts.Token);
            var headers = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
            foreach (var h in res.Headers)
            {
                headers[h.Key] = h.Value.ToArray();
            }
            foreach (var h in res.Content.Headers)
            {
                headers[h.Key] = h.Value.ToArray();
            }

            return new CommandResult
            {
                Success = res.IsSuccessStatusCode,
                Status = (int)res.StatusCode,
                Body = body,
                Headers = headers,
                Error = res.IsSuccessStatusCode ? null : $"Comstore HTTP {(int)res.StatusCode}",
            };
        }
        catch (Exception ex) when (ex is not OperationCanceledException || ct.IsCancellationRequested)
        {
            return new CommandResult
            {
                Success = false,
                Status = 0,
                Body = "",
                Error = ex is OperationCanceledException
                    ? $"Comstore timed out after {timeoutSec}s"
                    : ex.Message,
            };
        }
    }

    public static bool LooksLikeUnreachable(CommandResult result)
    {
        if (result.Success) return false;
        if (result.Status is > 0 and < 500) return false;
        var err = (result.Error ?? "") + " " + (result.Body ?? "");
        return result.Status is null or 0
            || err.Contains("refused", StringComparison.OrdinalIgnoreCase)
            || err.Contains("timed out", StringComparison.OrdinalIgnoreCase)
            || err.Contains("unreachable", StringComparison.OrdinalIgnoreCase)
            || err.Contains("No connection", StringComparison.OrdinalIgnoreCase)
            || err.Contains("actively refused", StringComparison.OrdinalIgnoreCase)
            || err.Contains("Failed to connect", StringComparison.OrdinalIgnoreCase);
    }
}
