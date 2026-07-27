using System.Text.Json;
using Centrix.PrintAgent.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

const string DefaultHost = "127.0.0.1";
const int DefaultPort = 9247;
const string Version = "0.2.4";

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
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();
app.UseCors();

app.MapGet("/v1/health", async (PrinterDiscovery printers) =>
{
    var list = printers.ListPrinters();
    var defaultPrinter = printers.DefaultPrinter();
    return Results.Json(new
    {
        ok = true,
        version = Version,
        platform = "win32",
        running_as_service = !Environment.UserInteractive,
        wkhtmltopdf_available = WkhtmlPdfRenderer.FindExecutable() is not null,
        default_printer = defaultPrinter,
        printers = list,
    });
});

app.MapPost("/v1/print", async (PrintRequest request, HtmlPrintService printer, CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(request.Html))
    {
        return Results.Json(new { ok = false, message = "html is required" }, statusCode: StatusCodes.Status400BadRequest);
    }

    var copies = Math.Max(1, request.Copies <= 0 ? 1 : request.Copies);
    var documentId = string.IsNullOrWhiteSpace(request.DocumentId) ? "job" : request.DocumentId.Trim();

    try
    {
        var jobId = await printer.PrintHtmlAsync(
            request.Html,
            request.Printer,
            copies,
            documentId,
            ct);

        return Results.Json(new { ok = true, job_id = jobId });
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
    string? JobType = null);
