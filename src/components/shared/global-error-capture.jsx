"use client";

import { useEffect } from "react";
import { canSeeServerErrorDetail } from "@/lib/api";
import { emitSystemIssue } from "@/lib/system-issue-dispatcher";
import { logApiErrorIssue } from "@/lib/system-issue-reports";

async function reportUnhandledError(message, context = {}) {
  const technical = canSeeServerErrorDetail();
  const issueMessage = technical
    ? String(message ?? "Unexpected error")
    : "An error occurred in this page. Please report this to your system administrator.";

  const report = await logApiErrorIssue({
    path: context.pageUrl ?? (typeof window !== "undefined" ? window.location.pathname : "/"),
    method: "CLIENT",
    status: 0,
    message: issueMessage,
    context,
  });

  if (report?.id) {
    emitSystemIssue({
      type: "error",
      message: issueMessage,
      reportId: report.id,
      apiPath: context.pageUrl ?? null,
      httpMethod: "CLIENT",
      httpStatus: 0,
    });
  }
}

export function GlobalErrorCapture() {
  useEffect(() => {
    function onError(event) {
      const message = event.error instanceof Error ? event.error.message : event.message;
      void reportUnhandledError(message, {
        pageUrl: window.location.pathname,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    }

    function onRejection(event) {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Unhandled promise rejection";
      void reportUnhandledError(message, {
        pageUrl: window.location.pathname,
        kind: "unhandledrejection",
      });
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
