"use client";

import { useEffect } from "react";
import { canSeeServerErrorDetail } from "@/lib/auth-storage";
import { ApiError, isAbortError, isNetworkFetchError, isPermissionDeniedError } from "@/lib/api";
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
    apiBody: {
      technical_detail: String(message ?? "Unexpected error"),
      exception_class: "ClientError",
    },
    context: {
      ...context,
      technical_detail: String(message ?? "Unexpected error"),
    },
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

function rejectionMessage(reason) {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  return "Unhandled promise rejection";
}

function isBenignClientFailure(reason) {
  if (isNetworkFetchError(reason) || isPermissionDeniedError(reason)) {
    return true;
  }
  // ApiError is control-flow from apiRequest — already toasted / system-issued / in-panel.
  // Treating only 4xx as benign left AI 5xx as "Runtime ApiError" overlays in Next.js.
  if (reason instanceof ApiError) {
    return true;
  }
  const message = reason instanceof Error ? reason.message : String(reason ?? "");
  return /failed to fetch|networkerror|load failed|network request failed|internet connection|product not found or is not available|an error occurred in (ai|ai assistant)/i.test(
    message,
  );
}

export function GlobalErrorCapture() {
  useEffect(() => {
    function onError(event) {
      if (isAbortError(event.error) || isAbortError({ name: "AbortError", message: event.message })) {
        return;
      }
      const message = event.error instanceof Error ? event.error.message : event.message;
      if (isBenignClientFailure(event.error ?? message)) {
        event.preventDefault?.();
        return;
      }
      void reportUnhandledError(message, {
        pageUrl: window.location.pathname,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    }

    function onRejection(event) {
      const reason = event.reason;
      if (isAbortError(reason)) {
        event.preventDefault?.();
        return;
      }
      // Transient connectivity / expected 4xx — already toasted; do not page admins.
      if (isBenignClientFailure(reason)) {
        event.preventDefault?.();
        return;
      }
      void reportUnhandledError(rejectionMessage(reason), {
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
