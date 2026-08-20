using System.Text.Json;
using System.Text.RegularExpressions;
using Centrix.AttendanceAgent.Models;

namespace Centrix.AttendanceAgent.Services;

public sealed class AcsEventService
{
    private readonly HikvisionDigestClient _http;

    public AcsEventService(HikvisionDigestClient http)
    {
        _http = http;
    }

    public async Task<(List<PunchEvent> Events, bool Truncated)> FetchAcsEventsAsync(
        AgentConfig config,
        DateTime from,
        DateTime to,
        CancellationToken ct)
    {
        if (from > to)
        {
            from = to.AddHours(-6);
        }

        var hik = config.Hikvision;
        var url = $"{hik.BaseUrl}/ISAPI/AccessControl/AcsEvent?format=json";
        var timePairs = new[]
        {
            (FormatAcs(from, withOffset: true), FormatAcs(to, withOffset: true)),
            (FormatAcs(from, withOffset: false), FormatAcs(to, withOffset: false)),
        };
        var filters = new (int Major, int Minor, string? Attr)[]
        {
            (5, 75, null),
            (5, 0, null),
            (0, 0, "attendance"),
            (0, 0, null),
        };

        Exception? lastError = null;
        var emptyAttempts = 0;

        foreach (var (start, end) in timePairs)
        {
            foreach (var filter in filters)
            {
                var searchId = Guid.NewGuid().ToString("N")[..16];
                try
                {
                    var events = new List<PunchEvent>();
                    var rawRows = 0;
                    var position = 0;
                    var truncated = false;

                    for (var page = 0; page < AgentConstants.AcsEventMaxPages; page++)
                    {
                        var cond = new Dictionary<string, object?>
                        {
                            ["searchID"] = searchId,
                            ["searchResultPosition"] = position,
                            ["maxResults"] = AgentConstants.AcsEventPageSize,
                            ["startTime"] = start,
                            ["endTime"] = end,
                            ["major"] = filter.Major,
                            ["minor"] = filter.Minor,
                        };
                        if (filter.Attr != null)
                        {
                            cond["eventAttribute"] = filter.Attr;
                        }

                        var body = JsonSerializer.Serialize(new { AcsEventCond = cond });
                        var res = await _http.SendAsync(
                            url,
                            "POST",
                            hik.Username,
                            hik.Password,
                            body,
                            ct: ct);

                        if (!res.Ok)
                        {
                            var msg = $"Hikvision AcsEvent HTTP {res.StatusCode}: {res.Body[..Math.Min(300, res.Body.Length)]}";
                            if (res.StatusCode == 400 || Regex.IsMatch(res.Body, "badparameters|invalid content|0x60000001", RegexOptions.IgnoreCase))
                            {
                                lastError = new InvalidOperationException(msg);
                                break;
                            }
                            throw new InvalidOperationException(msg);
                        }

                        using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(res.Body) ? "{}" : res.Body);
                        var root = doc.RootElement;
                        var acs = root.TryGetProperty("AcsEvent", out var a) ? a
                            : root.TryGetProperty("acsEvent", out var b) ? b
                            : root;

                        var list = GetList(acs);
                        rawRows += list.Count;
                        foreach (var row in list)
                        {
                            var normalized = NormalizeEventRow(row);
                            if (normalized != null) events.Add(normalized);
                        }

                        var matches = acs.TryGetProperty("numOfMatches", out var m) ? m.GetInt32() : list.Count;
                        position += Math.Max(1, matches);
                        var status = acs.TryGetProperty("responseStatusStrg", out var st) ? st.GetString()?.ToLowerInvariant() ?? "" : "";
                        if (matches < 1 || list.Count < 1 || status != "more")
                        {
                            break;
                        }
                        if (page == AgentConstants.AcsEventMaxPages - 1)
                        {
                            truncated = true;
                        }
                    }

                    if (events.Count > 0)
                    {
                        events.Sort((x, y) => string.CompareOrdinal(x.PunchedAt, y.PunchedAt));
                        return (events, truncated);
                    }

                    if (rawRows > 0)
                    {
                        lastError = new InvalidOperationException(
                            $"Hikvision returned {rawRows} event row(s) but none had employee ID + time. Enroll the person with an employee number matching Centrix.");
                    }
                    else
                    {
                        emptyAttempts++;
                    }
                }
                catch (Exception ex)
                {
                    lastError = ex;
                }
            }
        }

        if (emptyAttempts > 0)
        {
            return ([], false);
        }

        throw lastError ?? new InvalidOperationException("Hikvision AcsEvent search failed.");
    }

    public async Task<CommandResult> ExecuteIsapiCommandAsync(AgentConfig config, AgentCommand command, CancellationToken ct)
    {
        var method = string.IsNullOrWhiteSpace(command.Method) ? "GET" : command.Method.ToUpperInvariant();
        var path = command.Path.StartsWith('/') ? command.Path : "/" + command.Path;
        if (method == "PING" || path == "/agent/ping")
        {
            return new CommandResult
            {
                Success = true,
                Status = 200,
                Headers = new Dictionary<string, string> { ["content-type"] = "application/json" },
                Body = JsonSerializer.Serialize(new
                {
                    pong = true,
                    agent = AgentConstants.AgentName,
                    version = AgentConstants.Version,
                }),
            };
        }

        var hik = config.Hikvision;
        var wantXml = string.Equals(command.Accept, "xml", StringComparison.OrdinalIgnoreCase);
        var accept = wantXml ? "application/xml" : "application/json";
        var url = $"{hik.BaseUrl}{path}";
        string? body = null;
        if (command.Body is JsonElement el && el.ValueKind is not JsonValueKind.Null and not JsonValueKind.Undefined)
        {
            body = el.ValueKind == JsonValueKind.String ? el.GetString() : el.GetRawText();
        }
        else if (command.Body is string s)
        {
            body = s;
        }
        else if (command.Body != null)
        {
            body = JsonSerializer.Serialize(command.Body);
        }

        // Centrix may send XML payloads with accept=xml; never force JSON content-type then.
        string? contentType = null;
        if (body != null)
        {
            var trimmed = body.TrimStart();
            if (wantXml || trimmed.StartsWith('<'))
            {
                contentType = "application/xml";
            }
            else
            {
                contentType = "application/json";
            }
        }

        var res = await _http.SendAsync(url, method, hik.Username, hik.Password, body, accept, contentType, ct);
        return new CommandResult
        {
            Success = res.Ok,
            Status = res.StatusCode,
            Headers = res.Headers,
            Body = res.Body,
            Error = res.Ok ? null : res.Body[..Math.Min(500, res.Body.Length)],
        };
    }

    public async Task TestDeviceAsync(AgentConfig config, CancellationToken ct)
    {
        var hik = config.Hikvision;
        var url = $"{hik.BaseUrl}/ISAPI/System/deviceInfo";
        var res = await _http.SendAsync(url, "GET", hik.Username, hik.Password, accept: "application/xml, application/json", ct: ct);
        if (!res.Ok)
        {
            throw new InvalidOperationException($"Device info HTTP {res.StatusCode}: {res.Body[..Math.Min(180, res.Body.Length)]}");
        }
    }

    private static List<JsonElement> GetList(JsonElement acs)
    {
        if (acs.TryGetProperty("InfoList", out var list) || acs.TryGetProperty("infoList", out list))
        {
            if (list.ValueKind == JsonValueKind.Array)
            {
                return list.EnumerateArray().Select(e => e.Clone()).ToList();
            }
            if (list.ValueKind == JsonValueKind.Object)
            {
                return [list.Clone()];
            }
        }
        return [];
    }

    private static PunchEvent? NormalizeEventRow(JsonElement row)
    {
        var employeeNo = Usable(
            GetString(row, "employeeNoString"),
            GetString(row, "employeeNo"),
            GetString(row, "EmployeeNo"),
            GetString(row, "cardNo"));
        var punchedAt = PunchedAtNairobi(
            GetString(row, "time") ?? GetString(row, "dateTime") ?? GetString(row, "Time"));
        if (employeeNo is null || punchedAt is null)
        {
            return null;
        }

        var attendanceStatus = MapAttendanceStatus(row);
        return new PunchEvent
        {
            EmployeeNo = employeeNo,
            EmployeeName = Usable(GetString(row, "name")),
            PunchedAt = punchedAt,
            AttendanceStatus = attendanceStatus,
            VerificationMethod = MapVerifyMode(row),
            CardNo = Usable(GetString(row, "cardNo"), GetString(row, "CardNo")),
            SerialNo = Usable(GetString(row, "serialNo"), GetString(row, "SerialNo")),
            Major = GetInt(row, "major"),
            Minor = GetInt(row, "minor"),
            Direction = MapDirection(attendanceStatus),
            Raw = JsonSerializer.Deserialize<object>(row.GetRawText()),
        };
    }

    private static string? MapAttendanceStatus(JsonElement row)
    {
        var raw = Usable(
            GetString(row, "attendanceStatus"),
            GetString(row, "AttendanceStatus"),
            GetString(row, "status"),
            GetString(row, "label"));
        if (raw != null) return raw;
        var minor = GetInt(row, "minor");
        return minor == 75 ? "checkIn" : null;
    }

    private static string? MapVerifyMode(JsonElement row)
    {
        var raw = Usable(
            GetString(row, "currentVerifyMode"),
            GetString(row, "CurrentVerifyMode"),
            GetString(row, "verifyMode"),
            GetString(row, "VerifyMode"));
        if (raw != null && Regex.IsMatch(raw, "finger|card|face|iris|password|pin|pw", RegexOptions.IgnoreCase))
        {
            return raw.ToLowerInvariant();
        }
        if (int.TryParse(raw, out var n))
        {
            return n switch
            {
                1 or 3 => "card",
                2 or 4 or 15 => "fingerprint",
                5 => "card+fingerprint",
                8 => "face",
                _ => raw,
            };
        }
        return GetInt(row, "minor") == 75 ? "fingerprint" : raw;
    }

    private static string MapDirection(string? status)
    {
        var s = (status ?? "").ToLowerInvariant();
        if (s is "checkin" or "check_in" or "in" or "1") return "in";
        if (s is "checkout" or "check_out" or "out" or "2") return "out";
        return "auto";
    }

    private static string? PunchedAtNairobi(string? raw)
    {
        var text = Usable(raw);
        if (text is null) return null;
        var stripped = Regex.Replace(text, @"[Zz]$", "");
        stripped = Regex.Replace(stripped, @"[+-]\d{2}:?\d{2}$", "");
        var normalized = stripped.Contains('T') ? stripped : stripped.Replace(' ', 'T');
        if (Regex.IsMatch(normalized, @"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$"))
        {
            normalized += ":00";
        }
        normalized = Regex.Replace(normalized, @"\.\d+$", "");
        return $"{normalized}+03:00";
    }

    private static string FormatAcs(DateTime date, bool withOffset) =>
        // Use org timezone (Africa/Nairobi), not the PC's Windows timezone — wrong TZ
        // silently shifts AcsEvent search windows and misses punches.
        TimezoneHelper.FormatAcsEventDateTime(date, TimezoneHelper.DefaultIana, withOffset);

    private static string? GetString(JsonElement el, string name) =>
        el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() :
        el.TryGetProperty(name, out v) && v.ValueKind is JsonValueKind.Number ? v.ToString() : null;

    private static int? GetInt(JsonElement el, string name) =>
        el.TryGetProperty(name, out var v) && v.TryGetInt32(out var n) ? n : null;

    private static string? Usable(params string?[] values)
    {
        foreach (var value in values)
        {
            if (string.IsNullOrWhiteSpace(value)) continue;
            var text = value.Trim();
            if (text is "undefined" or "null") continue;
            return text;
        }
        return null;
    }
}
