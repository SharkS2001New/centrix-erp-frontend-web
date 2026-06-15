"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { GenericReportScreen } from "@/components/reports/generic-report-screen";

export default function ReportViewerPage() {
  const params = useParams();
  const reportKey = params.key;
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
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
  }, [reportKey]);

  if (error) {
    return (
      <div className="p-6 text-sm text-red-600">{error}</div>
    );
  }

  if (!meta) {
    return <div className="p-6 text-sm text-slate-500">Loading report…</div>;
  }

  return (
    <GenericReportScreen
      reportKey={reportKey}
      label={meta.label}
      apiPath={meta.path}
    />
  );
}
