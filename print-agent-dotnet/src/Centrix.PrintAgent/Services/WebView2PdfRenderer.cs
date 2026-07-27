using System.Drawing;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Centrix.PrintAgent.Services;

/// <summary>
/// Renders receipt HTML to PDF using the WebView2 runtime (Edge). Works when Edge CLI headless printing is broken.
/// </summary>
internal static class WebView2PdfRenderer
{
    public static Task RenderAsync(string html, string pdfPath, string userDataDir, CancellationToken cancellationToken)
    {
        var tcs = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        var thread = new Thread(() =>
        {
            try
            {
                ApplicationConfiguration.Initialize();
                using var form = new Form
                {
                    Width = 1,
                    Height = 1,
                    ShowInTaskbar = false,
                    Opacity = 0,
                    FormBorderStyle = FormBorderStyle.None,
                    StartPosition = FormStartPosition.Manual,
                    Location = new Point(-32000, -32000),
                };

                using var webView = new WebView2 { Dock = DockStyle.Fill };
                form.Controls.Add(webView);

                form.Shown += async (_, _) =>
                {
                    try
                    {
                        Directory.CreateDirectory(userDataDir);
                        var environment = await CoreWebView2Environment.CreateAsync(
                            browserExecutableFolder: null,
                            userDataFolder: userDataDir).ConfigureAwait(true);

                        await webView.EnsureCoreWebView2Async(environment).ConfigureAwait(true);
                        webView.NavigateToString(html);
                        await Task.Delay(750, cancellationToken).ConfigureAwait(true);

                        var pdfSettings = environment.CreatePrintSettings();
                        pdfSettings.ShouldPrintBackgrounds = true;
                        pdfSettings.MarginTop = 0.15;
                        pdfSettings.MarginBottom = 0.15;
                        pdfSettings.MarginLeft = 0.1;
                        pdfSettings.MarginRight = 0.1;

                        var ok = await webView.CoreWebView2.PrintToPdfAsync(pdfPath, pdfSettings)
                            .ConfigureAwait(true);
                        if (!ok || !File.Exists(pdfPath))
                        {
                            throw new InvalidOperationException("WebView2 did not create a PDF file.");
                        }

                        tcs.TrySetResult();
                    }
                    catch (Exception ex)
                    {
                        tcs.TrySetException(ex);
                    }
                    finally
                    {
                        form.Close();
                    }
                };

                Application.Run(form);
            }
            catch (Exception ex)
            {
                tcs.TrySetException(ex);
            }
        })
        {
            IsBackground = true,
        };

        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();

        return tcs.Task.WaitAsync(cancellationToken);
    }
}
