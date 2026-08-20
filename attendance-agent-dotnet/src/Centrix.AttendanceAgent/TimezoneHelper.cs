using System.Globalization;
using System.Runtime.InteropServices;

namespace Centrix.AttendanceAgent;

/// <summary>
/// Windows uses "E. Africa Standard Time"; Linux/macOS use IANA "Africa/Nairobi".
/// Never fall back to the office PC's local timezone for punch windows / AcsEvent search.
/// </summary>
public static class TimezoneHelper
{
    public const string DefaultIana = "Africa/Nairobi";
    public const string WindowsEastAfrica = "E. Africa Standard Time";

    public static TimeZoneInfo Resolve(string? preferredIanaOrWindows = null)
    {
        var preferred = string.IsNullOrWhiteSpace(preferredIanaOrWindows)
            ? DefaultIana
            : preferredIanaOrWindows.Trim();

        foreach (var id in CandidateIds(preferred))
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (TimeZoneNotFoundException)
            {
            }
            catch (InvalidTimeZoneException)
            {
            }
        }

        return TimeZoneInfo.CreateCustomTimeZone(
            "Centrix-EAT",
            TimeSpan.FromHours(3),
            "East Africa Time",
            "East Africa Time");
    }

    public static DateTime ToZoneLocal(DateTime utcOrAny, string? preferredIanaOrWindows = null)
    {
        var tz = Resolve(preferredIanaOrWindows);
        var utc = utcOrAny.Kind switch
        {
            DateTimeKind.Utc => utcOrAny,
            DateTimeKind.Local => utcOrAny.ToUniversalTime(),
            _ => DateTime.SpecifyKind(utcOrAny, DateTimeKind.Local).ToUniversalTime(),
        };
        return TimeZoneInfo.ConvertTimeFromUtc(utc, tz);
    }

    /// <summary>
    /// Hikvision AcsEvent wants wall-clock in the org timezone, never trailing Z.
    /// Example: 2026-08-13T20:05:01+03:00
    /// </summary>
    public static string FormatAcsEventDateTime(
        DateTime instant,
        string? preferredIanaOrWindows = null,
        bool withOffset = true)
    {
        var tz = Resolve(preferredIanaOrWindows);
        var local = ToZoneLocal(instant, preferredIanaOrWindows);
        var stamp = local.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture);
        if (!withOffset) return stamp;

        var offset = tz.GetUtcOffset(DateTime.SpecifyKind(local, DateTimeKind.Unspecified));
        var sign = offset >= TimeSpan.Zero ? "+" : "-";
        var abs = offset.Duration();
        return $"{stamp}{sign}{abs.Hours:00}:{abs.Minutes:00}";
    }

    private static IEnumerable<string> CandidateIds(string preferred)
    {
        yield return preferred;

        var isEastAfrica =
            preferred.Equals(DefaultIana, StringComparison.OrdinalIgnoreCase) ||
            preferred.Equals(WindowsEastAfrica, StringComparison.OrdinalIgnoreCase) ||
            preferred.Contains("Nairobi", StringComparison.OrdinalIgnoreCase) ||
            preferred.Contains("East Africa", StringComparison.OrdinalIgnoreCase);

        if (!isEastAfrica) yield break;

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            yield return WindowsEastAfrica;
            yield return DefaultIana;
        }
        else
        {
            yield return DefaultIana;
            yield return WindowsEastAfrica;
        }
    }
}
