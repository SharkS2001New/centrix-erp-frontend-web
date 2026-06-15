/**
 * Opens HTML in a new window and triggers print without embedding <script> tags
 * (React warns when script tags appear in component source, even inside strings).
 */
export function openPrintWindow(htmlContent, windowFeatures = "width=820,height=720") {
  const htmlWithoutScript = String(htmlContent).replace(/<script[\s\S]*?<\/script>/gi, "");
  const win = window.open("", "_blank", windowFeatures);
  if (!win) return null;

  win.document.open();
  win.document.write(htmlWithoutScript);
  win.document.close();

  const triggerPrint = () => {
    win.focus();
    win.print();
    win.onafterprint = () => win.close();
  };

  win.onload = triggerPrint;
  if (win.document.readyState === "complete") {
    triggerPrint();
  }

  return win;
}
