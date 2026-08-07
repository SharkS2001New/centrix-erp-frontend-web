import { injectPrintDocumentBaseline } from "@/lib/print-document-baseline";

export const PRINT_BLOCKED_MESSAGE =
  "Printing was blocked by your browser. Allow pop-ups for this site and try again.";

const printFrameByWindow = new WeakMap();

export function printWindowFeatures(documentType = "receipt") {
  return documentType === "invoice" || documentType === "proforma"
    ? "width=860,height=960"
    : "width=420,height=720";
}

function parseWindowFeatures(features) {
  const str = String(features ?? "");
  const width = Number(str.match(/width=(\d+)/)?.[1] ?? 420);
  const height = Number(str.match(/height=(\d+)/)?.[1] ?? 720);
  return { width, height, features: str };
}

function createHiddenPrintFrame(width = 420, height = 1200) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.title = "Print";
  // Off-screen but sized — zero-size iframes print blank tables/reports.
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;min-height:${height}px;border:0;visibility:hidden;overflow:hidden;`;
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
export function openBlankPrintWindow(windowFeatures = printWindowFeatures("receipt")) {
  if (typeof document === "undefined") return null;

  const { width, height } = parseWindowFeatures(windowFeatures);

  try {
    const frame = createHiddenPrintFrame(width, height);
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

function attachPrintCloseHandlers(win, onClosed) {
  if (!win) return;

  const close = () => {
    window.setTimeout(() => {
      disposePrintWindow(win);
      onClosed?.();
    }, 300);
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
    // Defer past React commit / microtask boundaries (avoids Chrome "callback no longer runnable").
    window.setTimeout(onReady, 0);
    return;
  }

  writeHtmlToDocument(win.document, htmlContent);

  if (win.document.readyState === "complete") {
    window.setTimeout(onReady, 0);
  } else {
    win.onload = () => window.setTimeout(onReady, 0);
  }
}

/**
 * Open the browser print dialog for a prepared window/iframe.
 * Resolves when printing finishes (afterprint) or the settle timeout fires.
 * Thermal / POS receipts use a short settle so Z print cannot hang the till UI.
 *
 * @param {Window} win
 * @param {{ settleTimeoutMs?: number }} [options]
 */
function scheduleBrowserPrint(win, options = {}) {
  const settleTimeoutMs = Number(options.settleTimeoutMs ?? 8_000);
  return new Promise((resolve) => {
    if (!win || win.closed) {
      resolve(false);
      return;
    }

    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      resolve(Boolean(ok));
    };

    attachPrintCloseHandlers(win, () => finish(true));
    // Headless / cancelled dialogs / iframe paths may never fire afterprint.
    window.setTimeout(() => finish(true), Math.max(1_500, settleTimeoutMs));

    window.setTimeout(() => {
      if (win.closed) {
        finish(false);
        return;
      }
      try {
        if (!isIframePrintWindow(win)) {
          win.focus();
        }
        win.print();
      } catch (err) {
        console.warn("Print failed", err);
        disposePrintWindow(win);
        finish(false);
      }
    }, 0);
  });
}

/**
 * @returns {Promise<boolean>}
 */
export function fillPrintWindow(
  win,
  htmlContent,
  { autoPrint = true, skipBaseline = false, settleTimeoutMs } = {},
) {
  if (!win || win.closed) return Promise.resolve(false);

  const preparedHtml = skipBaseline
    ? String(htmlContent ?? "")
    : injectPrintDocumentBaseline(htmlContent);
  const htmlWithoutScript = String(preparedHtml).replace(/<script[\s\S]*?<\/script>/gi, "");

  return new Promise((resolve) => {
    let started = false;
    const triggerPrint = () => {
      if (started) return;
      started = true;
      if (!autoPrint) {
        resolve(true);
        return;
      }
      if (win.closed) {
        resolve(false);
        return;
      }
      void scheduleBrowserPrint(win, { settleTimeoutMs }).then(resolve);
    };

    loadHtmlIntoPrintTarget(win, htmlWithoutScript, triggerPrint);
  });
}

export function showPrintPreparing(win, message = "Preparing document…") {
  if (!win || win.closed) return Promise.resolve(false);
  return fillPrintWindow(
    win,
    `<!DOCTYPE html><html><head><title>Print</title></head><body style="font-family:system-ui,sans-serif;padding:24px;color:#334155;">${message}</body></html>`,
    { autoPrint: false },
  );
}

/** Print HTML via a hidden iframe (no visible new tab). Avoids browser URL/date headers on popups. */
export function openPrintWindow(htmlContent, windowFeatures = printWindowFeatures("receipt"), options = {}) {
  const win = openBlankPrintWindow(windowFeatures);
  if (!win) return null;
  void fillPrintWindow(win, htmlContent, options);
  return win;
}
