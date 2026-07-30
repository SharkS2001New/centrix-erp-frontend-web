using System.Threading.Channels;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Centrix.PrintAgent.Services;

/// <summary>
/// Queues receipt print jobs so HTTP can return immediately while PDF/print runs in the background.
/// </summary>
public sealed class PrintJobQueue : IHostedService, IDisposable
{
    private readonly HtmlPrintService _printer;
    private readonly ILogger<PrintJobQueue>? _logger;
    private readonly Channel<QueuedPrintJob> _channel;
    private readonly CancellationTokenSource _cts = new();
    private Task? _worker;

    public PrintJobQueue(HtmlPrintService printer, ILogger<PrintJobQueue>? logger = null)
    {
        _printer = printer;
        _logger = logger;
        _channel = Channel.CreateUnbounded<QueuedPrintJob>(new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = false,
        });
    }

    public string Enqueue(string html, string? printerName, int copies, string documentId)
    {
        var stamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var jobId = $"{Sanitize(documentId)}-{stamp}";
        var job = new QueuedPrintJob(jobId, html, printerName, Math.Max(1, copies), documentId);
        if (!_channel.Writer.TryWrite(job))
        {
            throw new InvalidOperationException("Print queue is unavailable.");
        }

        return jobId;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        _worker = Task.Run(() => ProcessLoopAsync(_cts.Token), CancellationToken.None);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _channel.Writer.TryComplete();
        _cts.Cancel();
        if (_worker is not null)
        {
            try
            {
                await _worker.WaitAsync(cancellationToken);
            }
            catch (OperationCanceledException)
            {
                // shutting down
            }
        }
    }

    public void Dispose()
    {
        _cts.Cancel();
        _cts.Dispose();
    }

    private async Task ProcessLoopAsync(CancellationToken cancellationToken)
    {
        try
        {
            await foreach (var job in _channel.Reader.ReadAllAsync(cancellationToken))
            {
                try
                {
                    await _printer.PrintHtmlAsync(
                        job.Html,
                        job.PrinterName,
                        job.Copies,
                        job.DocumentId,
                        cancellationToken);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger?.LogError(ex, "Background print failed for job {JobId}", job.JobId);
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // normal shutdown
        }
    }

    private static string Sanitize(string value)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var chars = value.Select(ch => invalid.Contains(ch) ? '_' : ch).ToArray();
        var cleaned = new string(chars).Trim();
        return string.IsNullOrWhiteSpace(cleaned) ? "job" : cleaned;
    }

    private sealed record QueuedPrintJob(
        string JobId,
        string Html,
        string? PrinterName,
        int Copies,
        string DocumentId);
}
