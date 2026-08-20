namespace Centrix.AttendanceAgent;

public static class AgentConstants
{
    public const string AgentName = "CentrixAttendanceAgent";
    public const string Version = "3.2.0";
    public const string ServiceName = "CentrixAttendanceAgent";
    public const int StatusPort = 9251;
    public const int AcsEventPageSize = 30;
    public const int AcsEventMaxPages = 200;
    public const int CatchupLookbackMinutes = 7 * 24 * 60;
    public const int CatchupOverlapMs = 15 * 60 * 1000;
    public const int MaxCatchupWindows = 30;
    public const int CommandPollSeconds = 2;
    /// <summary>Centrix ingest accepts max 500 events; keep batches smaller for reliable posts.</summary>
    public const int IngestChunkSize = 100;
    public const int IngestMaxAttempts = 4;

    /// <summary>Nairobi wall-clock: first upload hour (06:00) through last (14:00 / 2pm).</summary>
    public const int PunchUploadStartHour = 6;
    public const int PunchUploadEndHour = 14;
    /// <summary>While inside the daily window, keep retrying new punches this often.</summary>
    public const int PunchRetrySeconds = 300;
}
