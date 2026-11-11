using System.Text.Json;
using Centrix.PrintAgent.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

const string DefaultHost = "127.0.0.1";
const int DefaultPort = 9247;
const string Version = "0.3.3";

var host = Environment.GetEnvironmentVariable("PRINT_AGENT_HOST") ?? DefaultHost;
var port = int.TryParse(Environment.GetEnvironmentVariable("PRINT_AGENT_PORT"), out var parsedPort)
    ? parsedPort
    : DefaultPort;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory,
});

builder.Host.UseWindowsService(options =>
{
    options.ServiceName = "CentrixPrintAgent";
});

builder.WebHost.UseUrls($"http://{host}:{port}");
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
    options.SerializerOptions.PropertyNameCaseInsensitive = true;
});
builder.Services.AddSingleton<PrinterDiscovery>();
builder.Services.AddSingleton<HtmlPrintService>();
builder.Services.AddSingleton<PrintJobQueue>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<PrintJobQueue>());
builder.Services.AddCors(options =>
{
    // Browser ERP is HTTPS; agent is http://127.0.0.1 — Chrome Private Network Access
    // requires Allow-Private-Network on the preflight (see middleware below).
    options.AddDefaultPolicy(policy => policy
        .SetIsOriginAllowed(_ => true)
        .AllowAnyHeader()
        .AllowAnyMethod());
});

var app = builder.Build();

// Chrome / Edge: public HTTPS page → loopback agent needs this header on OPTIONS + response.
app.Use(async (context, next) =>
{
    context.Response.OnStarting(static (state) =>
    {
        var ctx = (HttpContext)state!;
        ctx.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
        return Task.CompletedTask;
    }, context);

    if (HttpMethods.IsOptions(context.Request.Method)
        && context.Request.Headers.ContainsKey("Access-Control-Request-Private-Network"))
    {
        var origin = context.Request.Headers.Origin.ToString();
        context.Response.Headers.AccessControlAllowOrigin = string.IsNullOrWhiteSpace(origin) ? "*" : origin;
        context.Response.Headers.AccessControlAllowMethods = "GET, POST, OPTIONS";
        context.Response.Headers.AccessControlAllowHeaders =
            context.Request.Headers.AccessControlRequestHeaders.ToString() is { Length: > 0 } requested
                ? requested
                : "Content-Type";
        context.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
        context.Response.StatusCode = StatusCodes.Status204NoContent;
        return;
    }

    await next();
});

app.UseCors();

app.MapGet("/v1/health", (PrinterDiscovery printers) =>
{
    var list = printers.ListPrinters();
    var defaultPrinter = printers.DefaultPrinter();
    return Results.Json(new
    {
        ok = true,
        version = Version,
        platform = "win32",
        running_as_service = !Environment.UserInteractive,
        async_print = true,
        wkhtmltopdf_available = WkhtmlPdfRenderer.FindExecutable() is not null,
        sumatra_available = HtmlPrintService.IsSumatraAvailable(),
        sumatra_path = HtmlPrintService.SumatraExecutablePath(),
        default_printer = defaultPrinter,
        printers = list,
    });
});

app.MapPost("/v1/print", async (PrintRequest request, HtmlPrintService printer, PrintJobQueue queue, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Html))
    {
        return Results.Json(new { ok = false, message = "html is required" }, statusCode: StatusCodes.Status400BadRequest);
    }

    var copies = Math.Max(1, request.Copies <= 0 ? 1 : request.Copies);
    var documentId = string.IsNullOrWhiteSpace(request.DocumentId) ? "job" : request.DocumentId.Trim();
    // wait=true keeps sync behaviour for Admin → Test print.
    var wait = request.Wait == true;

    try
    {
        if (!wait)
        {
            var queuedJobId = queue.Enqueue(request.Html, request.Printer, copies, documentId, request.JobType);
            return Results.Json(new
            {
                ok = true,
                queued = true,
                job_id = queuedJobId,
                printer = request.Printer,
            });
        }

        var (jobId, printerUsed) = await printer.PrintHtmlAsync(
            request.Html,
            request.Printer,
            copies,
            documentId,
            request.JobType,
            ct);

        return Results.Json(new { ok = true, queued = false, job_id = jobId, printer = printerUsed });
    }
    catch (Exception ex)
    {
        return Results.Json(
            new { ok = false, message = ex.Message },
            statusCode: StatusCodes.Status500InternalServerError);
    }
});

app.MapGet("/", () => Results.Json(new
{
    service = "Centrix Print Agent",
    version = Version,
    endpoints = new[] { "GET /v1/health", "POST /v1/print" },
}));

await app.RunAsync();

internal sealed record PrintRequest(
    string? Html,
    int Copies = 1,
    string? Printer = null,
    string? DocumentId = null,
    string? JobType = null,
    bool? Wait = null);
