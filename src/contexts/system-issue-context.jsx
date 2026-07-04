"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { canSeeServerErrorDetail } from "@/lib/api";
import { subscribeSystemIssues } from "@/lib/system-issue-dispatcher";
import { submitSystemIssueReport } from "@/lib/system-issue-reports";
import { SystemIssuePrompt } from "@/components/shared/system-issue-prompt";

const SystemIssueContext = createContext(null);

export function SystemIssueProvider({ children }) {
  const [prompt, setPrompt] = useState(null);
  const [notes, setNotes] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    return subscribeSystemIssues((event) => {
      setPrompt({
        kind: event.type,
        message: event.message,
        reportId: event.reportId ?? null,
        apiPath: event.apiPath ?? null,
        httpMethod: event.httpMethod ?? null,
        httpStatus: event.httpStatus ?? null,
        durationMs: event.durationMs ?? null,
      });
      setNotes("");
      setReporting(false);
      setReported(false);
    });
  }, []);

  const dismiss = useCallback(() => {
    setPrompt(null);
    setNotes("");
    setReporting(false);
    setReported(false);
  }, []);

  const report = useCallback(async () => {
    if (!prompt) return;
    setReporting(true);
    try {
      const res = await submitSystemIssueReport(
        {
          kind: prompt.kind === "slow" ? "slow" : "error",
          message: prompt.message,
          user_notes: notes.trim() || undefined,
          api_path: prompt.apiPath ?? undefined,
          http_method: prompt.httpMethod ?? undefined,
          http_status: prompt.httpStatus ?? undefined,
          duration_ms: prompt.durationMs ?? undefined,
          reported_by_user: true,
          report_id: prompt.reportId ?? undefined,
        },
        { force: true },
      );
      if (res?.id) {
        setPrompt((current) => (current ? { ...current, reportId: res.id } : current));
      }
      setReported(true);
    } finally {
      setReporting(false);
    }
  }, [notes, prompt]);

  return (
    <SystemIssueContext.Provider value={{ dismiss }}>
      {children}
      <SystemIssuePrompt
        open={Boolean(prompt)}
        kind={prompt?.kind ?? "error"}
        message={prompt?.message ?? ""}
        reportId={prompt?.reportId}
        notes={notes}
        onNotesChange={setNotes}
        onDismiss={dismiss}
        onReport={report}
        reporting={reporting}
        reported={reported}
        technicalViewer={canSeeServerErrorDetail()}
      />
    </SystemIssueContext.Provider>
  );
}

export function useSystemIssueOptional() {
  return useContext(SystemIssueContext);
}
