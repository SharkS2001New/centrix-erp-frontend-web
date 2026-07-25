"use client";

import { Component } from "react";
import { canSeeServerErrorDetail } from "@/lib/auth-storage";
import { emitSystemIssue } from "@/lib/system-issue-dispatcher";
import { logApiErrorIssue } from "@/lib/system-issue-reports";
import {
  isChunkLoadError,
  reloadForChunkLoad,
} from "@/components/chunk-load-recovery";

async function reportClientError(error, context = {}) {
  const technical = canSeeServerErrorDetail();
  const raw = error instanceof Error ? error.message : String(error ?? "Application error");
  const message = technical
    ? raw
    : "An error occurred in this page. Please report this to your system administrator.";

  const report = await logApiErrorIssue({
    path: context.pageUrl ?? (typeof window !== "undefined" ? window.location.pathname : "/"),
    method: "CLIENT",
    status: 0,
    message,
    context,
  });

  if (report?.id) {
    emitSystemIssue({
      type: "error",
      message,
      reportId: report.id,
      apiPath: context.pageUrl ?? null,
      httpMethod: "CLIENT",
      httpStatus: 0,
    });
  }
}

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, chunkError: false };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      chunkError: isChunkLoadError(error),
    };
  }

  componentDidCatch(error, info) {
    if (isChunkLoadError(error)) {
      try {
        const n = Number(sessionStorage.getItem("centrix_chunk_reload") || "0");
        if (n < 2) {
          sessionStorage.setItem("centrix_chunk_reload", String(n + 1));
          reloadForChunkLoad();
          return;
        }
      } catch {
        /* fall through to UI */
      }
    }

    void reportClientError(error, {
      pageUrl: typeof window !== "undefined" ? window.location.pathname : null,
      componentStack: info?.componentStack ?? null,
      chunkLoad: isChunkLoadError(error),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="max-w-md text-sm text-slate-500">
            {this.state.chunkError
              ? "This page failed to load after an update. Reload to fetch the latest version."
              : "Something went wrong loading this page. Use the dialog to report the issue or dismiss and try again."}
          </p>
          <button
            type="button"
            onClick={() => {
              if (this.state.chunkError) {
                reloadForChunkLoad({ resetCounter: true });
                return;
              }
              this.setState({ hasError: false, chunkError: false });
            }}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {this.state.chunkError ? "Reload page" : "Try again"}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
