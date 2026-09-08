namespace Centrix.KraAgent;

public static class AgentConstants
{
    public const string AgentName = "CentrixKraAgent";
    public const string Version = "1.2.0";
    public const string ServiceName = "CentrixKraAgent";
    public const int StatusPort = 9261;

    /// <summary>Long-poll hold on Centrix pending commands (ms). Wakes as soon as a fiscal call is queued.</summary>
    public const int CommandLongPollMs = 2000;

    /// <summary>Tiny pause only after a long-poll returns empty without wait (fallback).</summary>
    public const int CommandIdleDelayMs = 50;

    public const int LiveHeartbeatSeconds = 60;
    public const int MaxHeartbeatSeconds = 120;

    public const int ComstoreConnectTimeoutSeconds = 5;
    public const int ComstoreRequestTimeoutSeconds = 50;

    /// <summary>Cheap /api/health probe used before auto-start (keep low for speed path).</summary>
    public const int ComstoreHealthTimeoutSeconds = 3;

    /// <summary>Prefix Centrix recognizes to show “start Comstore manually” in Finance settings.</summary>
    public const string ComstoreManualStartPrefix = "COMSTORE_MANUAL_START_REQUIRED:";

    public const string ComstoreManualStartUserMessage =
        "CentrixKraAgent is still running. Comstore could not be started from the agent — "
        + "please start Comstore manually on this shop PC (Windows service or Comstore app, "
        + "usually http://localhost:4000). The agent will keep reporting until Comstore is reachable.";
}
