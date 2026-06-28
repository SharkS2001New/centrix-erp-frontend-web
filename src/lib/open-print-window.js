/**
 * Print HTML via a hidden iframe (no visible new tab) or an optional popup window.
 */

export const PRINT_BLOCKED_MESSAGE =
  "Printing was blocked by your browser. Allow pop-ups for this site and try again.";

const printFrameByWindow = new WeakMap();

export function printWindowFeatures(documentType = "receipt") {
  return documentType === "invoice" ? "width=860,height=960" : "width=420,height=720";
}

function createHiddenPrintFrame() {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.title = "Print";
  frame.style.cssText =
    "position:fixed;width:0;height:0;border:0;clip:rect(0,0,0,0);overflow:hidden;visibility:hidden;";
  document.body.appendChild(frame);
  return frame;
}

function isIframePrintWindow(win) {
  return Boolean(win && printFrameByWindow.has(win));
}

/**
 * Prepare a print target on user click. Uses a hidden iframe (no new tab).
 * Returns the iframe's contentWindow for fillPrintWindow().
 */
export function openBlankPrintWindow(_windowFeatures = printWindowFeatures("receipt")) {
  if (typeof document === "undefined") return null;

  try {
    const frame = createHiddenPrintFrame();
    const win = frame.contentWindow;
    if (!win) {
      frame.remove();
      return null;
    }
    printFrameByWindow.set(win, frame);
    return win;
  } catch {
    return null;
  }
}

/** Tear down a print iframe or popup without touching the main app page. */
export function disposePrintWindow(win) {
  if (!win) return;

  const frame = printFrameByWindow.get(win);
  if (frame) {
    printFrameByWindow.delete(win);
    frame.remove();
    return;
  }

  if (!win.closed) {
    try {
      win.close();
    } catch {
      // Popup may already be closing.
    }
  }
}

function attachPrintCloseHandlers(win) {
  if (!win) return;

  const close = () => {
    window.setTimeout(() => disposePrintWindow(win), 300);
  };

  try {
    win.onafterprint = close;
    win.addEventListener("afterprint", close, { once: true });
  } catch {
    // Blob/opaque iframe origins block parent access — fall back to timed cleanup.
    window.setTimeout(close, 60_000);
  }
}

function writeHtmlToDocument(doc, htmlContent) {
  doc.open();
  doc.write(htmlContent);
  doc.close();
}

function loadHtmlIntoPrintTarget(win, htmlContent, onReady) {
  const frame = printFrameByWindow.get(win);
  if (frame) {
    // Write into the iframe document directly so it stays same-origin with the app.
    // Blob URLs are opaque and block onafterprint / afterprint handlers from the parent.
    writeHtmlToDocument(win.document, htmlContent);
    window.requestAnimationFrame(() => {
      onReady();
    });
    return;
  }

  writeHtmlToDocument(win.document, htmlContent);

  if (win.document.readyState === "complete") {
    onReady();
  } else {
    win.onload = onReady;
  }
}

export function fillPrintWindow(win, htmlContent, { autoPrint = true } = {}) {
  if (!win || win.closed) return false;

  const htmlWithoutScript = String(htmlContent).replace(/<script[\s\S]*?<\/script>/gi, "");

  let printed = false;
  const triggerPrint = () => {
    if (!autoPrint || printed || win.closed) return;
    printed = true;
    attachPrintCloseHandlers(win);
    if (!isIframePrintWindow(win)) {
      win.focus();
    }
    win.print();
  };

  loadHtmlIntoPrintTarget(win, htmlWithoutScript, triggerPrint);
  return true;
}

export function showPrintPreparing(win, message = "Preparing document…") {
  if (!win || win.closed) return;
  fillPrintWindow(
    win,
    `<!DOCTYPE html><html><head><title>Print</title></head><body style="font-family:system-ui,sans-serif;padding:24px;color:#334155;">${message}</body></html>`,
    { autoPrint: false },
  );
}

/** Print HTML: hidden iframe + system print dialog (no visible new page). */
export function openPrintWindow(htmlContent, windowFeatures = printWindowFeatures("receipt")) {
  const win = openBlankPrintWindow(windowFeatures);
  if (!win) return null;
  fillPrintWindow(win, htmlContent);
  return win;
}
