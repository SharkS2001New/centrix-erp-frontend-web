"use client";

import { createPortal } from "react-dom";

/**
 * @param {object} props
 * @param {{ type: 'success' | 'error', title: string, message: string, taskLabel?: string, downloadTaskId?: string, downloadFilename?: string }} [props.notice]
 * @param {() => void} props.onDismiss
 * @param {(taskId: string, filename: string) => void} [props.onDownloadAgain]
 */
export function BackgroundTaskNoticeDialog({ notice, onDismiss, onDownloadAgain }) {
  if (!notice || typeof document === "undefined") return null;

  const isSuccess = notice.type === "success";
  const canDownloadAgain = isSuccess && notice.downloadTaskId && onDownloadAgain;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="background-notice-title"
    >
      <div className="theme-panel w-full max-w-md rounded-xl border p-5 shadow-2xl">
        <h2
          id="background-notice-title"
          className={`text-base font-semibold ${isSuccess ? "text-slate-900" : "text-red-700"}`}
        >
          {notice.title}
        </h2>
        {notice.taskLabel ? (
          <p className="mt-1 text-sm font-medium text-slate-800">{notice.taskLabel}</p>
        ) : null}
        <p className={`mt-2 text-sm whitespace-pre-wrap ${isSuccess ? "text-slate-600" : "text-red-600"}`}>{notice.message}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {canDownloadAgain ? (
            <button
              type="button"
              onClick={() => onDownloadAgain(notice.downloadTaskId, notice.downloadFilename ?? "export")}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Download again
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDismiss}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
              isSuccess ? "bg-[#185FA5] hover:bg-[#134d88]" : "bg-slate-800 hover:bg-slate-900"
            }`}
          >
            {isSuccess ? "Done" : "Close"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
