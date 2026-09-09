using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text.Json;
using Centrix.KraAgent.Models;

namespace Centrix.KraAgent.Services;

/// <summary>
/// Checks whether the fiscal hardware (Smart VSCU) is reachable on the LAN —
/// ICMP ping of kra_device_hardware_ip, plus Comstore /api/health deviceConnection.
/// </summary>
public sealed class DeviceReachabilityProbe
{
    private readonly ILogger<DeviceReachabilityProbe> _log;
    private readonly ComstoreClient _comstore;

    public DeviceReachabilityProbe(ILogger<DeviceReachabilityProbe> log, ComstoreClient comstore)
    {
        _log = log;
        _comstore = comstore;
    }

    public async Task<DeviceReachabilityResult> ProbeAsync(
        AgentConfig config,
        bool comstoreHealthy,
        CancellationToken ct,
        string? hardwareIpOverride = null)
    {
        var hardwareIp = NormalizeHost(
            !string.IsNullOrWhiteSpace(hardwareIpOverride) ? hardwareIpOverride : config.DeviceHardwareIp);
        bool? pingOk = null;
        string? pingDetail = null;

        if (!string.IsNullOrWhiteSpace(hardwareIp))
        {
            (pingOk, pingDetail) = await PingHostAsync(hardwareIp, ct);
        }

        string? deviceConnection = null;
        if (comstoreHealthy)
        {
            try
            {
                var health = await _comstore.ExecuteAsync(config, new AgentCommand
                {
                    Method = "GET",
                    Path = "/api/health",
                }, ct, timeoutSecondsOverride: AgentConstants.ComstoreHealthTimeoutSeconds);

                if (health.Success && !string.IsNullOrWhiteSpace(health.Body))
                {
                    using var doc = JsonDocument.Parse(health.Body);
                    if (doc.RootElement.TryGetProperty("deviceConnection", out var dc) &&
                        dc.ValueKind == JsonValueKind.String)
                    {
                        deviceConnection = dc.GetString();
                    }
                    else if (doc.RootElement.TryGetProperty("device_connection", out var dc2) &&
                             dc2.ValueKind == JsonValueKind.String)
                    {
                        deviceConnection = dc2.GetString();
                    }
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _log.LogDebug(ex, "Could not read Comstore deviceConnection");
            }
        }

        var apiSaysConnected = deviceConnection == null
            || string.Equals(deviceConnection, "Connected", StringComparison.OrdinalIgnoreCase);

        bool reachable;
        string message;

        if (!string.IsNullOrWhiteSpace(hardwareIp))
        {
            if (pingOk == true && apiSaysConnected)
            {
                reachable = true;
                message = $"Fiscal device reachable at {hardwareIp}"
                    + (deviceConnection != null ? $" (Comstore: {deviceConnection})" : " (ICMP OK)");
            }
            else if (pingOk == false)
            {
                reachable = false;
                message =
                    $"Fiscal device network error — cannot reach {hardwareIp}. "
                    + (pingDetail ?? "Ping failed.")
                    + " Check power, LAN cable, and that the Smart VSCU IP is correct.";
            }
            else if (!apiSaysConnected)
            {
                reachable = false;
                message =
                    $"Fiscal device not connected via Comstore (deviceConnection={deviceConnection}). "
                    + "Device may be offline or disconnected from the middleware PC.";
            }
            else
            {
                reachable = false;
                message = $"Could not verify fiscal device at {hardwareIp}.";
            }
        }
        else if (!apiSaysConnected)
        {
            reachable = false;
            message =
                $"Fiscal device not connected via Comstore (deviceConnection={deviceConnection}). "
                + "Set Fiscal hardware IP in Centrix Finance for LAN ping checks.";
        }
        else if (comstoreHealthy)
        {
            // Comstore up and deviceConnection OK/missing — no hardware IP to ping.
            reachable = true;
            message = deviceConnection != null
                ? $"Comstore reports device {deviceConnection}. Set Fiscal hardware IP for LAN ping."
                : "Comstore healthy. Set Fiscal hardware IP in Centrix to ping the Smart VSCU.";
        }
        else
        {
            reachable = false;
            message =
                "Cannot verify fiscal device while Comstore is down. "
                + "Set Fiscal hardware IP in Centrix so the agent can ping the device anyway.";
        }

        return new DeviceReachabilityResult(
            Reachable: reachable,
            HardwareIp: hardwareIp,
            DeviceConnection: deviceConnection,
            PingOk: pingOk,
            Message: message);
    }

    private static string NormalizeHost(string? raw)
    {
        var s = (raw ?? "").Trim();
        if (s.Length == 0) return "";
        if (s.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
            s.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            if (Uri.TryCreate(s, UriKind.Absolute, out var uri))
            {
                return uri.Host;
            }
        }

        var slash = s.IndexOf('/');
        if (slash > 0) s = s[..slash];
        var colon = s.IndexOf(':');
        // IPv6 [::1] or host:port — strip port when single colon (IPv4 host:port).
        if (colon > 0 && s.Count(c => c == ':') == 1 && !s.StartsWith('['))
        {
            s = s[..colon];
        }

        return s.Trim();
    }

    private static async Task<(bool Ok, string Detail)> PingHostAsync(string host, CancellationToken ct)
    {
        try
        {
            using var ping = new Ping();
            // 2s timeout — LAN devices should answer quickly.
            var reply = await ping.SendPingAsync(host, 2000);
            ct.ThrowIfCancellationRequested();
            if (reply.Status == IPStatus.Success)
            {
                return (true, $"ICMP OK ({reply.RoundtripTime} ms)");
            }

            // ICMP may be blocked — fall back to a quick TCP connect on common ports.
            if (await TcpReachableAsync(host, new[] { 80, 443, 8000, 8010, 8080 }, ct))
            {
                return (true, $"TCP reachable (ICMP {reply.Status})");
            }

            return (false, $"ICMP {reply.Status}; TCP ports also unreachable");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            if (await TcpReachableAsync(host, new[] { 80, 443, 8000, 8010, 8080 }, ct))
            {
                return (true, "TCP reachable (ICMP unavailable: " + ex.Message + ")");
            }

            return (false, ex.Message);
        }
    }

    private static async Task<bool> TcpReachableAsync(string host, int[] ports, CancellationToken ct)
    {
        foreach (var port in ports)
        {
            try
            {
                using var client = new TcpClient();
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                cts.CancelAfter(TimeSpan.FromMilliseconds(800));
                await client.ConnectAsync(host, port, cts.Token);
                return true;
            }
            catch
            {
                // try next port
            }
        }

        return false;
    }
}

public sealed record DeviceReachabilityResult(
    bool Reachable,
    string? HardwareIp,
    string? DeviceConnection,
    bool? PingOk,
    string Message);
