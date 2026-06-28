/**
 * Opens HTML in a new window and triggers print without embedding <script> tags
 * (React warns when script tags appear in component source, even inside strings).
 */

export const PRINT_BLOCKED_MESSAGE =
  "Printing was blocked by your browser. Allow pop-ups for this site and try again.";

export function printWindowFeatures(documentType = "receipt") {
  return documentType === "invoice" ? "width=860,height=960" : "width=420,height=720";
}

/** Open a blank tab synchronously while the user click is still active. */
export function openBlankPrintWindow(windowFeatures = printWindowFeatures("receipt")) {
  if (typeof window === "undefined") return null;
  try {
    return window.open("", "_blank", windowFeatures);
  } catch {
    return null;
  }
}

export function fillPrintWindow(win, htmlContent) {
  if (!win || win.closed) return false;

  const htmlWithoutScript = String(htmlContent).replace(/<script[\s\S]*?<\/script>/gi, "");

  win.document.open();
  win.document.write(htmlWithoutScript);
  win.document.close();

  const triggerPrint = () => {
    if (win.closed) return;
    win.focus();
    win.print();
    win.onafterprint = () => {
      if (!win.closed) win.close();
    };
  };

  win.onload = triggerPrint;
  if (win.document.readyState === "complete") {
    triggerPrint();
  }

  return true;
}

export function showPrintPreparing(win, message = "Preparing document…") {
  if (!win || win.closed) return;
  fillPrintWindow(
    win,
    `<!DOCTYPE html><html><head><title>Print</title></head><body style="font-family:system-ui,sans-serif;padding:24px;color:#334155;">${message}</body></html>`,
  );
}

export function openPrintWindow(htmlContent, windowFeatures = printWindowFeatures("receipt")) {
  const win = openBlankPrintWindow(windowFeatures);
  if (!win) return null;
  fillPrintWindow(win, htmlContent);
  return win;
}
