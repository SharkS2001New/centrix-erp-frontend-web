"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { REPORT_DEFINITIONS } from "@/lib/reports/definitions";
import { REPORT_UI_ROUTES } from "@/lib/reports/catalog-ui";
import { HR_REPORT_DEFS, hrReportSubtitle } from "@/lib/reports/hr-reports";
import {
  DISTRIBUTION_REPORT_DEFS,
  distributionReportSubtitle,
} from "@/lib/reports/distribution-reports";
import { StructuredReportScreen } from "@/components/reports/structured-report-screen";
import { GenericReportScreen } from "@/components/reports/generic-report-screen";
import { apiRequest } from "@/lib/api";
import { AppRouteLoading } from "@/components/shared/app-route-loading";

/** Known generic reports that must not depend on GET /reports (reports.view-only catalog). */
const KNOWN_GENERIC_REPORT_META = Object.fromEntries(
  [...HR_REPORT_DEFS, ...DISTRIBUTION_REPORT_DEFS].map((r) => [
    r.key,
    { key: r.key, path: `/reports/${r.key}`, label: r.label },
  ]),
);

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
  const reportKeyFromParams =
    reportKeyRaw != null && String(reportKeyRaw) !== "" && String(reportKeyRaw) !== "undefined"
      ? String(reportKeyRaw)
      : null;
  // Keep last valid key so brief param flicker during tab switches does not unmount the report.
  const [stableReportKey, setStableReportKey] = useState(reportKeyFromParams);
  useEffect(() => {
    if (reportKeyFromParams) setStableReportKey(reportKeyFromParams);
  }, [reportKeyFromParams]);
  const reportKey = reportKeyFromParams ?? stableReportKey;
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  const externalRoute = reportKey ? REPORT_UI_ROUTES[reportKey] : undefined;
  const redirectsOutsideReports =
    externalRoute && !String(externalRoute).startsWith("/reports");
  const knownMeta = reportKey ? KNOWN_GENERIC_REPORT_META[reportKey] : null;

  useEffect(() => {
    if (redirectsOutsideReports) {
      router.replace(externalRoute);
    }
  }, [redirectsOutsideReports, externalRoute, router]);

  const structuredBase = reportKey ? REPORT_DEFINITIONS[reportKey] : null;
  // Keep a stable definition identity so keep-alive report tabs do not refetch on every parent render.
  const structuredDefinition = useMemo(
    () => (structuredBase && reportKey ? { ...structuredBase, key: reportKey } : null),
    [structuredBase, reportKey],
  );

  useEffect(() => {
    if (!reportKey || structuredDefinition || redirectsOutsideReports || knownMeta) return;
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
  }, [reportKey, structuredDefinition, redirectsOutsideReports, knownMeta]);

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

  if (structuredDefinition) {
    return <StructuredReportScreen definition={structuredDefinition} />;
  }

  const resolvedMeta = knownMeta ?? meta;

  if (error && !resolvedMeta) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }

  if (!resolvedMeta) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <p className="text-sm text-slate-500">Loading report…</p>
      </div>
    );
  }

  return (
    <GenericReportScreen
      reportKey={reportKey}
      label={resolvedMeta.label}
      apiPath={resolvedMeta.path}
      subtitle={hrReportSubtitle(reportKey) ?? distributionReportSubtitle(reportKey) ?? undefined}
    />
  );
}
