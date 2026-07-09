"use client";

import { useEffect } from "react";
import { canSeeServerErrorDetail } from "@/lib/auth-storage";
import { emitSystemIssue } from "@/lib/system-issue-dispatcher";
import { logApiErrorIssue } from "@/lib/system-issue-reports";

export default function AppRouteError({ error, reset }) {
  useEffect(() => {
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
        context: { digest: error?.digest ?? null },
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
  }, [error]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="max-w-md text-sm text-slate-500">
        Something went wrong. Check the dialog to report the issue, or try loading this page again.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
      >
        Try again
      </button>
    </div>
  );
}
