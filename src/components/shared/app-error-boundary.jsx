"use client";

import { Component } from "react";
import { canSeeServerErrorDetail } from "@/lib/api";
import { emitSystemIssue } from "@/lib/system-issue-dispatcher";
import { logApiErrorIssue } from "@/lib/system-issue-reports";

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
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    void reportClientError(error, {
      pageUrl: typeof window !== "undefined" ? window.location.pathname : null,
      componentStack: info?.componentStack ?? null,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[40vh] items-center justify-center p-8 text-center">
          <p className="max-w-md text-sm text-slate-500">
            Something went wrong loading this page. Use the dialog to report the issue or dismiss and try again.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
