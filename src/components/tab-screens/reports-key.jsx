"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { REPORT_DEFINITIONS } from "@/lib/reports/definitions";
import { REPORT_UI_ROUTES } from "@/lib/reports/catalog-ui";
import { hrReportSubtitle } from "@/lib/reports/hr-reports";
import { distributionReportSubtitle } from "@/lib/reports/distribution-reports";
import { StructuredReportScreen } from "@/components/reports/structured-report-screen";
import { GenericReportScreen } from "@/components/reports/generic-report-screen";
import { apiRequest } from "@/lib/api";
import { AppRouteLoading } from "@/components/shared/app-route-loading";

export function ReportsKeyScreen() {
  return (
    <Suspense fallback={<AppRouteLoading pathname="/reports" />}>
      <ReportViewerPageContent />
    </Suspense>
  );
}

function ReportViewerPageContent() {
  const params = useParams();
  const router = useRouter();
  const reportKeyRaw = params?.key;
  const reportKey =
    reportKeyRaw != null && String(reportKeyRaw) !== "" && String(reportKeyRaw) !== "undefined"
      ? String(reportKeyRaw)
      : null;
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  const externalRoute = REPORT_UI_ROUTES[reportKey];
  const redirectsOutsideReports =
    externalRoute && !String(externalRoute).startsWith("/reports");

  useEffect(() => {
    if (redirectsOutsideReports) {
      router.replace(externalRoute);
    }
  }, [redirectsOutsideReports, externalRoute, router]);

  const structured = reportKey ? REPORT_DEFINITIONS[reportKey] : null;

  useEffect(() => {
    if (!reportKey || structured || redirectsOutsideReports) return;
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
  }, [reportKey, structured, redirectsOutsideReports]);

  if (!reportKey) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <p className="text-sm text-slate-500">Loading report…</p>
      </div>
    );
  }

  if (redirectsOutsideReports) {
    return <AppRouteLoading pathname={externalRoute} />;
  }

  if (structured) {
    return <StructuredReportScreen definition={{ ...structured, key: reportKey }} />;
  }

  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  if (!meta) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <p className="text-sm text-slate-500">Loading report…</p>
      </div>
    );
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
