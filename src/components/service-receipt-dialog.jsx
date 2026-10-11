"use client";

import { useMemo, useState } from "react";
import { buildServiceReceiptHtml, printServiceReceipt } from "@/lib/service-receipt";
import { notifyError } from "@/lib/notify";

export function ServiceReceiptDialog({ receipt, paper, onPaper, onClose }) {
  const [printing, setPrinting] = useState(false);
  const html = useMemo(() => buildServiceReceiptHtml(receipt, paper), [receipt, paper]);

  async function print() {
    setPrinting(true);
    try {
      await printServiceReceipt(receipt, paper);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not print the receipt.");
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/45 p-4">
      <div className="mx-auto flex min-h-full max-w-4xl items-start justify-center">
        <div className="theme-panel my-6 w-full rounded-2xl border p-4 shadow-xl" role="dialog" aria-label="Receipt preview">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="theme-heading text-lg font-semibold">Receipt {receipt?.receiptNo}</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={paper === "thermal" ? "theme-primary-btn rounded-lg px-3 py-2 text-sm" : "theme-secondary-btn rounded-lg px-3 py-2 text-sm"} onClick={() => onPaper("thermal")}>Thermal</button>
              <button type="button" className={paper === "a4" ? "theme-primary-btn rounded-lg px-3 py-2 text-sm" : "theme-secondary-btn rounded-lg px-3 py-2 text-sm"} onClick={() => onPaper("a4")}>A4</button>
              <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm" onClick={() => void print()} disabled={printing}>{printing ? "Printing…" : "Print"}</button>
              <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm" onClick={onClose}>Close</button>
            </div>
          </div>
          <iframe
            title="Receipt preview"
            srcDoc={html}
            className="mx-auto block w-full rounded-lg border border-slate-200 bg-white"
            style={{ height: paper === "thermal" ? "720px" : "860px", maxWidth: paper === "thermal" ? "420px" : "100%" }}
          />
        </div>
      </div>
    </div>
  );
}
