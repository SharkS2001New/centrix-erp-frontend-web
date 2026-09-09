namespace Centrix.KraAgent;

public static class AgentConstants
{
    public const string AgentName = "CentrixKraAgent";
    public const string Version = "1.3.5";
    public const string ServiceName = "CentrixKraAgent";
    public const int StatusPort = 9261;

    /// <summary>Pull one fiscal command at a time so checkout waiters are not starved by a claimed batch.</summary>
    public const int CommandPullLimit = 1;

    /// <summary>Long-poll hold on Centrix pending commands (ms). Shorter = faster fiscal pickup.</summary>
    public const int CommandLongPollMs = 750;

    /// <summary>Tiny pause only after a long-poll returns empty without wait (fallback).</summary>
    public const int CommandIdleDelayMs = 50;

    public const int LiveHeartbeatSeconds = 30;
    public const int MaxHeartbeatSeconds = 120;

    public const int ComstoreConnectTimeoutSeconds = 5;
    /// <summary>Must stay under Centrix checkout wait (~28–30s) so results are not discarded.</summary>
    public const int ComstoreRequestTimeoutSeconds = 22;

    /// <summary>Cheap /api/health probe used before auto-start (keep low for speed path).</summary>
    public const int ComstoreHealthTimeoutSeconds = 3;

    /// <summary>Prefix Centrix recognizes to show “start Comstore manually” in Finance settings.</summary>
    public const string ComstoreManualStartPrefix = "COMSTORE_MANUAL_START_REQUIRED:";

    public const string ComstoreManualStartUserMessage =
        "CentrixKraAgent is still running. Start Comstore with Windows (its own service or startup — "
        + "usually http://localhost:4000). The agent keeps pinging Centrix and the fiscal device until Comstore is reachable.";
}
