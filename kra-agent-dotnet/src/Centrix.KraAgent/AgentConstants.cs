namespace Centrix.KraAgent;

public static class AgentConstants
{
    public const string AgentName = "CentrixKraAgent";
    public const string Version = "1.3.11";
    public const string ServiceName = "CentrixKraAgent";
    public const int StatusPort = 9261;

    /// <summary>Pull one fiscal command at a time so checkout waiters are not starved by a claimed batch.</summary>
    public const int CommandPullLimit = 1;

    /// <summary>Long-poll hold on Centrix pending commands (ms). Shorter = faster fiscal pickup after idle.</summary>
    public const int CommandLongPollMs = 200;

    /// <summary>Tiny pause only after a long-poll returns empty without wait (fallback).</summary>
    public const int CommandIdleDelayMs = 25;

    public const int LiveHeartbeatSeconds = 30;
    public const int MaxHeartbeatSeconds = 120;

    public const int ComstoreConnectTimeoutSeconds = 5;
    /// <summary>
    /// Default per-request CancelAfter when Centrix does not send timeout_seconds.
    /// Checkout stays ~22–28s via commandTimeoutSeconds / pending timeout_seconds;
    /// credit notes may request up to MaxCommandTimeoutSeconds.
    /// </summary>
    public const int ComstoreRequestTimeoutSeconds = 22;

    public const int MaxCommandTimeoutSeconds = 55;

    /// <summary>Cheap /api/health probe used before auto-start (keep low for speed path).</summary>
    public const int ComstoreHealthTimeoutSeconds = 3;

    /// <summary>Prefix Centrix recognizes to show “start Comstore manually” in Finance settings.</summary>
    public const string ComstoreManualStartPrefix = "COMSTORE_MANUAL_START_REQUIRED:";

    public const string ComstoreManualStartUserMessage =
        "CentrixKraAgent is still running. Start Comstore with Windows (its own service or startup — "
        + "usually http://localhost:4000). The agent keeps pinging Centrix and the fiscal device until Comstore is reachable.";
}
