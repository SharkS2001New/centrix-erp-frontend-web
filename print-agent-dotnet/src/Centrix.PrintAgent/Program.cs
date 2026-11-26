using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.ServiceProcess;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using Centrix.PrintAgent.Services;

namespace Centrix.PrintAgent
{
    internal static class Program
    {
        private const string DefaultHost = "127.0.0.1";
        private const int DefaultPort = 9247;
        private const string Version = "0.4.0";

        private static void Main(string[] args)
        {
            if (Environment.UserInteractive)
            {
                var host = new PrintAgentHost(DefaultHost, ResolvePort(), Version);
                host.Start();
                Console.WriteLine("Centrix Print Agent {0} listening on http://{1}:{2}", Version, DefaultHost, ResolvePort());
                Console.WriteLine("Press Enter to stop.");
                Console.ReadLine();
                host.Stop();
                return;
            }

            ServiceBase.Run(new PrintAgentWindowsService());
        }

        private static int ResolvePort()
        {
            int port;
            return int.TryParse(Environment.GetEnvironmentVariable("PRINT_AGENT_PORT"), out port)
                ? port
                : DefaultPort;
        }
    }

    internal sealed class PrintAgentWindowsService : ServiceBase
    {
        private PrintAgentHost _host;

        public PrintAgentWindowsService()
        {
            ServiceName = "CentrixPrintAgent";
            CanStop = true;
            AutoLog = true;
        }

        protected override void OnStart(string[] args)
        {
            var hostName = Environment.GetEnvironmentVariable("PRINT_AGENT_HOST");
            if (String.IsNullOrWhiteSpace(hostName))
            {
                hostName = "127.0.0.1";
            }

            int port;
            if (!int.TryParse(Environment.GetEnvironmentVariable("PRINT_AGENT_PORT"), out port))
            {
                port = 9247;
            }

            _host = new PrintAgentHost(hostName, port, "0.4.0");
            _host.Start();
        }

        protected override void OnStop()
        {
            if (_host != null)
            {
                _host.Stop();
                _host = null;
            }
        }
    }

    internal sealed class PrintAgentHost
    {
        private readonly string _host;
        private readonly int _port;
        private readonly string _version;
        private readonly PrinterDiscovery _printers;
        private readonly HtmlPrintService _printer;
        private readonly PrintJobQueue _queue;
        private HttpListener _listener;
        private Task _listenTask;

        public PrintAgentHost(string host, int port, string version)
        {
            _host = host;
            _port = port;
            _version = version;
            _printers = new PrinterDiscovery();
            _printer = new HtmlPrintService(_printers);
            _queue = new PrintJobQueue(_printer);
        }

        public void Start()
        {
            if (_listener != null)
            {
                return;
            }

            _listener = new HttpListener();
            _listener.Prefixes.Add(String.Format("http://{0}:{1}/", _host, _port));
            _listener.Start();
            _queue.Start();
            _listenTask = Task.Run(() => ListenLoopAsync());
        }

        public void Stop()
        {
            if (_listener == null)
            {
                return;
            }

            _listener.Close();
            _listener = null;
            _queue.Stop();

            if (_listenTask != null)
            {
                try
                {
                    _listenTask.Wait(3000);
                }
                catch (AggregateException)
                {
                    // The listener is closed during a normal service stop.
                }
                _listenTask = null;
            }
        }

        private async Task ListenLoopAsync()
        {
            while (_listener != null && _listener.IsListening)
            {
                HttpListenerContext context;
                try
                {
                    context = await _listener.GetContextAsync();
                }
                catch (HttpListenerException)
                {
                    return;
                }
                catch (ObjectDisposedException)
                {
                    return;
                }

                ThreadPool.QueueUserWorkItem(
                    delegate(object state) { HandleRequest((HttpListenerContext)state); },
                    context);
            }
        }

        private void HandleRequest(HttpListenerContext context)
        {
            try
            {
                AddCorsHeaders(context);
                if (String.Equals(context.Request.HttpMethod, "OPTIONS", StringComparison.OrdinalIgnoreCase))
                {
                    context.Response.StatusCode = 204;
                    context.Response.Close();
                    return;
                }

                var path = context.Request.Url.AbsolutePath.TrimEnd('/');
                if (String.IsNullOrEmpty(path))
                {
                    path = "/";
                }

                if (String.Equals(context.Request.HttpMethod, "GET", StringComparison.OrdinalIgnoreCase)
                    && String.Equals(path, "/v1/health", StringComparison.OrdinalIgnoreCase))
                {
                    WriteJson(context, 200, BuildHealthResponse());
                    return;
                }

                if (String.Equals(context.Request.HttpMethod, "GET", StringComparison.OrdinalIgnoreCase)
                    && String.Equals(path, "/", StringComparison.OrdinalIgnoreCase))
                {
                    WriteJson(context, 200, new Dictionary<string, object>
                    {
                        { "service", "Centrix Print Agent" },
                        { "version", _version },
                        { "endpoints", new[] { "GET /v1/health", "POST /v1/print" } }
                    });
                    return;
                }

                if (String.Equals(context.Request.HttpMethod, "POST", StringComparison.OrdinalIgnoreCase)
                    && String.Equals(path, "/v1/print", StringComparison.OrdinalIgnoreCase))
                {
                    HandlePrintRequest(context);
                    return;
                }

                WriteJson(context, 404, new Dictionary<string, object>
                {
                    { "ok", false },
                    { "message", "Not found" }
                });
            }
            catch (Exception ex)
            {
                try
                {
                    WriteJson(context, 500, new Dictionary<string, object>
                    {
                        { "ok", false },
                        { "message", ex.Message }
                    });
                }
                catch
                {
                    context.Response.Abort();
                }
            }
        }

        private Dictionary<string, object> BuildHealthResponse()
        {
            var printers = _printers.ListPrinters();
            return new Dictionary<string, object>
            {
                { "ok", true },
                { "version", _version },
                { "platform", "win32" },
                { "running_as_service", !Environment.UserInteractive },
                { "async_print", true },
                { "wkhtmltopdf_available", WkhtmlPdfRenderer.FindExecutable() != null },
                { "sumatra_available", HtmlPrintService.IsSumatraAvailable() },
                { "sumatra_path", HtmlPrintService.SumatraExecutablePath() },
                { "default_printer", _printers.DefaultPrinter() },
                { "printers", printers }
            };
        }

        private void HandlePrintRequest(HttpListenerContext context)
        {
            var serializer = new JavaScriptSerializer { MaxJsonLength = 52428800 };
            Dictionary<string, object> request;
            using (var reader = new StreamReader(context.Request.InputStream, context.Request.ContentEncoding))
            {
                request = serializer.Deserialize<Dictionary<string, object>>(reader.ReadToEnd());
            }

            if (request == null)
            {
                WriteJson(context, 400, new Dictionary<string, object>
                {
                    { "ok", false },
                    { "message", "A JSON request body is required." }
                });
                return;
            }

            var html = GetString(request, "html");
            if (String.IsNullOrWhiteSpace(html))
            {
                WriteJson(context, 400, new Dictionary<string, object>
                {
                    { "ok", false },
                    { "message", "html is required" }
                });
                return;
            }

            var copies = Math.Max(1, GetInt(request, "copies", 1));
            var printer = GetString(request, "printer");
            var documentId = GetString(request, "document_id");
            var jobType = GetString(request, "job_type");
            if (String.IsNullOrWhiteSpace(documentId))
            {
                documentId = "job";
            }

            var wait = GetBool(request, "wait");
            try
            {
                if (!wait)
                {
                    var queuedJobId = _queue.Enqueue(html, printer, copies, documentId, jobType);
                    WriteJson(context, 200, new Dictionary<string, object>
                    {
                        { "ok", true },
                        { "queued", true },
                        { "job_id", queuedJobId },
                        { "printer", printer }
                    });
                    return;
                }

                var result = _printer.PrintHtml(html, printer, copies, documentId, jobType);
                WriteJson(context, 200, new Dictionary<string, object>
                {
                    { "ok", true },
                    { "queued", false },
                    { "job_id", result.JobId },
                    { "printer", result.Printer }
                });
            }
            catch (Exception ex)
            {
                WriteJson(context, 500, new Dictionary<string, object>
                {
                    { "ok", false },
                    { "message", ex.Message }
                });
            }
        }

        private static string GetString(IDictionary<string, object> values, string key)
        {
            object value;
            return values.TryGetValue(key, out value) && value != null
                ? Convert.ToString(value)
                : null;
        }

        private static int GetInt(IDictionary<string, object> values, string key, int fallback)
        {
            object value;
            int parsed;
            return values.TryGetValue(key, out value) && Int32.TryParse(Convert.ToString(value), out parsed)
                ? parsed
                : fallback;
        }

        private static bool GetBool(IDictionary<string, object> values, string key)
        {
            object value;
            bool parsed;
            return values.TryGetValue(key, out value) && Boolean.TryParse(Convert.ToString(value), out parsed) && parsed;
        }

        private static void AddCorsHeaders(HttpListenerContext context)
        {
            var origin = context.Request.Headers["Origin"];
            context.Response.Headers["Access-Control-Allow-Origin"] = String.IsNullOrWhiteSpace(origin) ? "*" : origin;
            context.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
            context.Response.Headers["Access-Control-Allow-Headers"] =
                String.IsNullOrWhiteSpace(context.Request.Headers["Access-Control-Request-Headers"])
                    ? "Content-Type"
                    : context.Request.Headers["Access-Control-Request-Headers"];
            context.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
            context.Response.Headers["Vary"] = "Origin";
        }

        private static void WriteJson(HttpListenerContext context, int statusCode, object value)
        {
            var serializer = new JavaScriptSerializer { MaxJsonLength = 52428800 };
            var bytes = Encoding.UTF8.GetBytes(serializer.Serialize(value));
            context.Response.StatusCode = statusCode;
            context.Response.ContentType = "application/json; charset=utf-8";
            context.Response.ContentEncoding = Encoding.UTF8;
            context.Response.ContentLength64 = bytes.Length;
            context.Response.OutputStream.Write(bytes, 0, bytes.Length);
            context.Response.Close();
        }
    }
}
