"use client";

import { useEffect } from "react";
import { canSeeServerErrorDetail } from "@/lib/auth-storage";
import { emitSystemIssue } from "@/lib/system-issue-dispatcher";
import { logApiErrorIssue } from "@/lib/system-issue-reports";
import {
  isChunkLoadError,
  reloadForChunkLoad,
} from "@/components/chunk-load-recovery";

export default function AppRouteError({ error, reset }) {
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    if (chunkError) {
      try {
        const n = Number(sessionStorage.getItem("centrix_chunk_reload") || "0");
        if (n < 2) {
          sessionStorage.setItem("centrix_chunk_reload", String(n + 1));
          reloadForChunkLoad();
          return;
        }
      } catch {
        /* show UI */
      }
    }

    const technical = canSeeServerErrorDetail();
    const raw = error?.message ?? "Page failed to load";
    const message = technical
      ? raw
      : "An error occurred in this page. Please report this to your system administrator.";

    void (async () => {
      const report = await logApiErrorIssue({
        path: typeof window !== "undefined" ? window.location.pathname : "/",
        method: "CLIENT",
        status: 0,
        message,
        context: { digest: error?.digest ?? null, chunkLoad: chunkError },
      });
      if (report?.id) {
        emitSystemIssue({
          type: "error",
          message,
          reportId: report.id,
          apiPath: typeof window !== "undefined" ? window.location.pathname : null,
          httpMethod: "CLIENT",
          httpStatus: 0,
        });
      }
    })();
  }, [error, chunkError]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="max-w-md text-sm text-slate-500">
        {chunkError
          ? "This page failed to load after an update. Reload to fetch the latest version."
          : "Something went wrong. Check the dialog to report the issue, or try loading this page again."}
      </p>
      <button
        type="button"
        onClick={() => {
          if (chunkError) {
            reloadForChunkLoad({ resetCounter: true });
            return;
          }
          reset();
        }}
        className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
      >
        {chunkError ? "Reload page" : "Try again"}
      </button>
    </div>
  );
}
