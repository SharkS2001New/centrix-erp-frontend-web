using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Centrix.AttendanceAgent.Services;

/// <summary>
/// Hikvision ISAPI HTTP client with Digest (or Basic) authentication.
/// Forces IPv4 + Connection: close (Hikvision firmware often breaks on keep-alive / IPv6).
/// </summary>
public sealed class HikvisionDigestClient
{
    private static readonly SocketsHttpHandler Handler = CreateHandler();

    private static readonly HttpClient Shared = new(Handler)
    {
        Timeout = TimeSpan.FromSeconds(25),
    };

    private static SocketsHttpHandler CreateHandler()
    {
        var handler = new SocketsHttpHandler
        {
            AllowAutoRedirect = false,
            AutomaticDecompression = DecompressionMethods.None,
            PooledConnectionLifetime = TimeSpan.FromSeconds(30),
            MaxConnectionsPerServer = 4,
            ConnectCallback = static async (context, ct) =>
            {
                // Prefer IPv4 — many DS-K1T units misbehave on IPv6 / dual-stack.
                IPAddress[] addresses;
                try
                {
                    addresses = await Dns.GetHostAddressesAsync(context.DnsEndPoint.Host, ct);
                }
                catch (Exception ex)
                {
                    throw new InvalidOperationException(
                        $"Could not resolve Hikvision host '{context.DnsEndPoint.Host}': {ex.Message}",
                        ex);
                }

                var ipv4 = addresses.FirstOrDefault(a => a.AddressFamily == AddressFamily.InterNetwork)
                    ?? addresses.FirstOrDefault()
                    ?? throw new InvalidOperationException(
                        $"No address for Hikvision host '{context.DnsEndPoint.Host}'.");

                var socket = new Socket(ipv4.AddressFamily, SocketType.Stream, ProtocolType.Tcp)
                {
                    NoDelay = true,
                };
                try
                {
                    await socket.ConnectAsync(ipv4, context.DnsEndPoint.Port, ct);
                    return new NetworkStream(socket, ownsSocket: true);
                }
                catch
                {
                    socket.Dispose();
                    throw;
                }
            },
        };
        handler.SslOptions.RemoteCertificateValidationCallback = static (_, _, _, _) => true;
        return handler;
    }

    public Task<HikvisionResponse> SendAsync(
        string url,
        string method,
        string username,
        string password,
        string? body = null,
        string accept = "application/json",
        CancellationToken ct = default) =>
        SendAsync(url, method, username, password, body, accept, contentType: null, ct);

    public async Task<HikvisionResponse> SendAsync(
        string url,
        string method,
        string username,
        string password,
        string? body,
        string accept,
        string? contentType,
        CancellationToken ct)
    {
        method = string.IsNullOrWhiteSpace(method) ? "GET" : method.ToUpperInvariant();
        var mediaType = ResolveContentType(body, accept, contentType);

        var first = await SendRawAsync(url, method, body, accept, mediaType, authorization: null, ct);
        if (first.StatusCode != 401)
        {
            return first;
        }

        var www = first.GetHeader("www-authenticate") ?? "";
        if (!www.Contains("digest", StringComparison.OrdinalIgnoreCase))
        {
            var basic = "Basic " + Convert.ToBase64String(Encoding.UTF8.GetBytes($"{username}:{password}"));
            return await SendRawAsync(url, method, body, accept, mediaType, basic, ct);
        }

        var digest = BuildDigest(www, method, url, username, password);
        var second = await SendRawAsync(url, method, body, accept, mediaType, digest, ct);
        if (second.StatusCode != 401)
        {
            return second;
        }

        // Stale nonce — one retry with the fresh WWW-Authenticate.
        var www2 = second.GetHeader("www-authenticate") ?? "";
        if (!www2.Contains("digest", StringComparison.OrdinalIgnoreCase))
        {
            return second;
        }

        var digest2 = BuildDigest(www2, method, url, username, password);
        return await SendRawAsync(url, method, body, accept, mediaType, digest2, ct);
    }

    private static string? ResolveContentType(string? body, string accept, string? contentType)
    {
        if (body is null) return null;
        if (!string.IsNullOrWhiteSpace(contentType)) return contentType.Trim();
        if (accept.Contains("xml", StringComparison.OrdinalIgnoreCase) &&
            body.TrimStart().StartsWith('<'))
        {
            return "application/xml";
        }
        if (body.TrimStart().StartsWith('<'))
        {
            return "application/xml";
        }
        return "application/json";
    }

    private static async Task<HikvisionResponse> SendRawAsync(
        string url,
        string method,
        string? body,
        string accept,
        string? contentType,
        string? authorization,
        CancellationToken ct)
    {
        using var request = new HttpRequestMessage(new HttpMethod(method), url);
        request.Headers.TryAddWithoutValidation("Accept", accept);
        request.Headers.ConnectionClose = true;
        if (!string.IsNullOrEmpty(authorization))
        {
            request.Headers.TryAddWithoutValidation("Authorization", authorization);
        }

        if (body != null)
        {
            request.Content = new StringContent(body, Encoding.UTF8, contentType ?? "application/json");
        }

        try
        {
            using var response = await Shared.SendAsync(request, HttpCompletionOption.ResponseContentRead, ct);
            var text = await response.Content.ReadAsStringAsync(ct);
            var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var header in response.Headers)
            {
                headers[header.Key] = string.Join(", ", header.Value);
            }
            foreach (var header in response.Content.Headers)
            {
                headers[header.Key] = string.Join(", ", header.Value);
            }

            return new HikvisionResponse
            {
                StatusCode = (int)response.StatusCode,
                Ok = response.IsSuccessStatusCode,
                Body = text,
                Headers = headers,
            };
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(DescribeNetworkError(ex, url), ex);
        }
    }

    private static string BuildDigest(string wwwAuthenticate, string method, string url, string username, string password)
    {
        var parts = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match match in Regex.Matches(wwwAuthenticate, @"(\w+)=(?:""([^""]+)""|([^\s,]+))"))
        {
            parts[match.Groups[1].Value] = match.Groups[2].Success ? match.Groups[2].Value : match.Groups[3].Value;
        }

        var realm = parts.GetValueOrDefault("realm", "");
        var nonce = parts.GetValueOrDefault("nonce", "");
        var qopRaw = parts.GetValueOrDefault("qop", "");
        var qop = string.IsNullOrWhiteSpace(qopRaw)
            ? ""
            : (qopRaw.Split(',')[0] ?? "auth").Trim();
        if (string.IsNullOrEmpty(qop))
        {
            // Hikvision almost always expects auth; default like the Node agent when omitted.
            qop = "auth";
        }

        var opaque = parts.GetValueOrDefault("opaque");
        var algorithm = parts.GetValueOrDefault("algorithm", "MD5");
        const string nc = "00000001";
        var cnonce = Guid.NewGuid().ToString("N")[..16];
        var uri = new Uri(url);
        var digestUri = uri.PathAndQuery;

        var ha1User = Md5Hex($"{username}:{realm}:{password}");
        var ha1 = algorithm.Contains("sess", StringComparison.OrdinalIgnoreCase)
            ? Md5Hex($"{ha1User}:{nonce}:{cnonce}")
            : ha1User;
        var ha2 = Md5Hex($"{method}:{digestUri}");
        var response = string.IsNullOrEmpty(qop)
            ? Md5Hex($"{ha1}:{nonce}:{ha2}")
            : Md5Hex($"{ha1}:{nonce}:{nc}:{cnonce}:{qop}:{ha2}");

        var header =
            $"Digest username=\"{username}\", realm=\"{realm}\", nonce=\"{nonce}\", uri=\"{digestUri}\", " +
            $"algorithm={algorithm}, response=\"{response}\"";
        if (!string.IsNullOrEmpty(qop))
        {
            header += $", qop={qop}, nc={nc}, cnonce=\"{cnonce}\"";
        }
        if (!string.IsNullOrEmpty(opaque))
        {
            header += $", opaque=\"{opaque}\"";
        }
        return header;
    }

    private static string Md5Hex(string input)
    {
        var hash = MD5.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    public static string DescribeNetworkError(Exception err, string targetUrl)
    {
        var blob = err.ToString().ToLowerInvariant();
        var host = TryHost(targetUrl);
        var where = string.IsNullOrEmpty(host) ? "the Hikvision terminal" : $"Hikvision at {host}";

        if (blob.Contains("connection refused") || blob.Contains("actively refused"))
        {
            return $"Nothing accepted the connection on {where}. Wrong LAN IP or port (use HTTP 80, not 8000), or ISAPI/web is disabled.";
        }
        if (blob.Contains("timed out") || blob.Contains("timeout"))
        {
            return $"Timed out waiting for {where}. Ping that IP from this PC.";
        }
        if (blob.Contains("name or service not known") || blob.Contains("no such host") || blob.Contains("nodename nor servname") || blob.Contains("could not resolve"))
        {
            return $"Could not resolve the device hostname for {where}. Use the numeric LAN IP.";
        }
        if (blob.Contains("network unreachable") || blob.Contains("host unreachable"))
        {
            return $"This PC has no route to {where}. Check Wi‑Fi / subnet.";
        }

        return $"Hikvision request to {where} failed: {err.Message}";
    }

    private static string TryHost(string url)
    {
        try
        {
            var u = new Uri(url);
            return $"{u.Host}:{(u.IsDefaultPort ? (u.Scheme == "https" ? 443 : 80) : u.Port)}";
        }
        catch
        {
            return "";
        }
    }
}

public sealed class HikvisionResponse
{
    public int StatusCode { get; init; }
    public bool Ok { get; init; }
    public string Body { get; init; } = "";
    public Dictionary<string, string> Headers { get; init; } = new(StringComparer.OrdinalIgnoreCase);

    public string? GetHeader(string name) =>
        Headers.TryGetValue(name, out var value) ? value : null;
}
