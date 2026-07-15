"use client";

import { resolveRouteSkeleton } from "@/lib/resolve-route-skeleton";
import {
  DashboardRouteSkeleton,
  DetailRouteSkeleton,
  FormRouteSkeleton,
  ListRouteSkeleton,
  LoadingRouteSkeleton,
  PosRouteSkeleton,
  ReportRouteSkeleton,
  WorkspaceRouteSkeleton,
} from "@/components/shared/route-loading-skeletons";

/**
 * Page-driven route skeleton — layout follows the destination URL.
 * @param {{ pathname?: string | null }} props
 */
export function AppRouteLoading({ pathname = null }) {
  const { variant, title, subtitle } = resolveRouteSkeleton(pathname);

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      role="status"
      data-tab-cache-placeholder="1"
    >
      {variant === "dashboard" ? <DashboardRouteSkeleton /> : null}
      {variant === "detail" ? <DetailRouteSkeleton title={title} subtitle={subtitle} /> : null}
      {variant === "form" ? <FormRouteSkeleton title={title} subtitle={subtitle} /> : null}
      {variant === "report" ? <ReportRouteSkeleton title={title} subtitle={subtitle} /> : null}
      {variant === "workspace" ? <WorkspaceRouteSkeleton title={title} subtitle={subtitle} /> : null}
      {variant === "pos" ? <PosRouteSkeleton /> : null}
      {variant === "list" ? <ListRouteSkeleton title={title} subtitle={subtitle} /> : null}
      {variant === "loading" ? <LoadingRouteSkeleton title={title} subtitle={subtitle} /> : null}
    </div>
  );
}
