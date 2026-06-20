"use client";

import { useParams } from "next/navigation";
import { REPORT_DEFINITIONS } from "@/lib/reports/definitions";
import { hrReportSubtitle } from "@/lib/reports/hr-reports";
import { distributionReportSubtitle } from "@/lib/reports/distribution-reports";
import { StructuredReportScreen } from "@/components/reports/structured-report-screen";
import { GenericReportScreen } from "@/components/reports/generic-report-screen";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

export default function ReportViewerPage() {
  const params = useParams();
  const reportKey = params.key;
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  const structured = REPORT_DEFINITIONS[reportKey];

  useEffect(() => {
    if (structured) return;
    apiRequest("/reports/")
      .then((catalog) => {
        for (const section of Object.values(catalog ?? {})) {
          if (!Array.isArray(section)) continue;
          const hit = section.find((r) => r.key === reportKey);
          if (hit) {
            setMeta(hit);
            return;
          }
        }
        setError("Report not found in catalog.");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load catalog"));
  }, [reportKey, structured]);

  if (structured) {
    return <StructuredReportScreen definition={{ ...structured, key: reportKey }} />;
  }

  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  if (!meta) {
    return <div className="p-6 text-sm text-slate-500">Loading report…</div>;
  }

  return (
    <GenericReportScreen
      reportKey={reportKey}
      label={meta.label}
      apiPath={meta.path}
      subtitle={hrReportSubtitle(reportKey) ?? distributionReportSubtitle(reportKey) ?? undefined}
    />
  );
}
