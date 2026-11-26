using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Threading;

namespace Centrix.PrintAgent.Services
{
    /// <summary>
    /// Queues print jobs so HTTP can return immediately while PDF rendering runs in the background.
    /// </summary>
    public sealed class PrintJobQueue : IDisposable
    {
        private readonly HtmlPrintService _printer;
        private readonly BlockingCollection<QueuedPrintJob> _jobs =
            new BlockingCollection<QueuedPrintJob>();
        private Thread _worker;

        public PrintJobQueue(HtmlPrintService printer)
        {
            _printer = printer;
        }

        public void Start()
        {
            if (_worker != null)
            {
                return;
            }

            _worker = new Thread(ProcessLoop);
            _worker.IsBackground = true;
            _worker.Name = "Centrix Print Agent queue";
            _worker.Start();
        }

        public string Enqueue(string html, string printerName, int copies, string documentId, string jobType)
        {
            var stamp = DateTime.UtcNow.Ticks;
            var jobId = String.Format("{0}-{1}", Sanitize(documentId), stamp);
            var job = new QueuedPrintJob(jobId, html, printerName, Math.Max(1, copies), documentId, jobType);
            _jobs.Add(job);
            return jobId;
        }

        public void Stop()
        {
            if (!_jobs.IsAddingCompleted)
            {
                _jobs.CompleteAdding();
            }

            if (_worker != null && !_worker.Join(TimeSpan.FromSeconds(10)))
            {
                _worker.Interrupt();
            }
            _worker = null;
        }

        public void Dispose()
        {
            Stop();
            _jobs.Dispose();
        }

        private void ProcessLoop()
        {
            foreach (var job in _jobs.GetConsumingEnumerable())
            {
                try
                {
                    _printer.PrintHtml(job.Html, job.PrinterName, job.Copies, job.DocumentId, job.JobType);
                }
                catch (Exception ex)
                {
                    try
                    {
                        EventLog.WriteEntry(
                            "CentrixPrintAgent",
                            String.Format("Background print failed for job {0}: {1}", job.JobId, ex),
                            EventLogEntryType.Error);
                    }
                    catch
                    {
                        // The service may run before its event source is registered.
                    }
                }
            }
        }

        private static string Sanitize(string value)
        {
            var invalid = System.IO.Path.GetInvalidFileNameChars();
            var chars = (value ?? String.Empty).ToCharArray();
            for (var i = 0; i < chars.Length; i++)
            {
                if (Array.IndexOf(invalid, chars[i]) >= 0)
                {
                    chars[i] = '_';
                }
            }

            var cleaned = new String(chars).Trim();
            return String.IsNullOrWhiteSpace(cleaned) ? "job" : cleaned;
        }

        private sealed class QueuedPrintJob
        {
            public QueuedPrintJob(
                string jobId,
                string html,
                string printerName,
                int copies,
                string documentId,
                string jobType)
            {
                JobId = jobId;
                Html = html;
                PrinterName = printerName;
                Copies = copies;
                DocumentId = documentId;
                JobType = jobType;
            }

            public string JobId { get; private set; }
            public string Html { get; private set; }
            public string PrinterName { get; private set; }
            public int Copies { get; private set; }
            public string DocumentId { get; private set; }
            public string JobType { get; private set; }
        }
    }
}
