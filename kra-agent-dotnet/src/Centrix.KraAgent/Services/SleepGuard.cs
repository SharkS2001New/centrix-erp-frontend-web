using System.Runtime.InteropServices;

namespace Centrix.KraAgent.Services;

/// <summary>
/// Keeps the Comstore PC awake while CentrixKraAgent runs.
/// Sleep/hibernate freezes the service and drops Centrix long-polls — fiscalization goes dark for all tills.
/// </summary>
public sealed class SleepGuard : IDisposable
{
    private const uint EsContinuous = 0x80000000;
    private const uint EsSystemRequired = 0x00000001;
    private const uint EsAwayModeRequired = 0x00000040;

    private readonly ILogger<SleepGuard> _log;
    private bool _active;

    public SleepGuard(ILogger<SleepGuard> log)
    {
        _log = log;
    }

    public bool IsActive => _active;

    /// <summary>
    /// Tell Windows this machine must stay awake (AC Comstore PCs). Refresh periodically —
    /// Windows can clear the request after idle timeouts.
    /// </summary>
    public void RequestStayAwake()
    {
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

        try
        {
            // SYSTEM_REQUIRED blocks sleep; AWAYMODE soft-blocks modern standby where supported.
            var flags = EsContinuous | EsSystemRequired | EsAwayModeRequired;
            var previous = SetThreadExecutionState(flags);
            if (previous == 0)
            {
                // Away-mode unsupported on some SKUs — retry without it.
                previous = SetThreadExecutionState(EsContinuous | EsSystemRequired);
            }

            _active = previous != 0 || _active;
            if (previous == 0)
            {
                _log.LogWarning(
                    "Could not arm sleep prevention (SetThreadExecutionState). " +
                    "Set Windows power plan: Sleep = Never when plugged in.");
            }
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Sleep prevention failed");
        }
    }

    public void Clear()
    {
        if (!OperatingSystem.IsWindows())
        {
            return;
        }

        try
        {
            SetThreadExecutionState(EsContinuous);
            _active = false;
        }
        catch
        {
            // ignore on shutdown
        }
    }

    public void Dispose() => Clear();

    [DllImport("kernel32.dll")]
    private static extern uint SetThreadExecutionState(uint esFlags);
}
