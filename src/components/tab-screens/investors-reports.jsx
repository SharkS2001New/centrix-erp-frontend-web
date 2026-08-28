"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { useTabTitle } from "@/contexts/tab-workspace-context";
import { tabSectionTitle } from "@/hooks/use-tab-form-exit";
import { isPlatformInvestorsEnabled } from "@/lib/platform-org-features";
import { P } from "@/lib/permission-codes";
import { notifyError } from "@/lib/notify";
import {
  CatalogPageShell,
  Field,
  FilterSelect,
  SECONDARY_BTN_CLASS,
} from "@/components/catalog/catalog-shared";
import {
  INVESTOR_REPORT_KINDS,
  InvestorReportsView,
  isValidInvestorRouteId,
} from "@/components/investors/investor-reports-view";

function normalizeInvestorQuery(raw) {
  const text = String(raw ?? "").trim();
  if (!text || text === "undefined" || text === "null") return "";
  return isValidInvestorRouteId(text) ? text : "";
}

function normalizeKind(kind) {
  const id = String(kind || "sales");
  return INVESTOR_REPORT_KINDS.some((k) => k.id === id) ? id : "sales";
}

export function InvestorsReportsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { capabilities, hasPermission } = useAuth();
  const enabled = isPlatformInvestorsEnabled(capabilities);
  const canView =
    enabled &&
    (hasPermission?.(P.investors.reports.view) || hasPermission?.(P.investors.investors.view));

  const investorFromUrl = normalizeInvestorQuery(searchParams.get("investor"));
  const kindFromUrl = normalizeKind(searchParams.get("kind"));

  const [investors, setInvestors] = useState([]);
  const [listLoading, setListLoading] = useState(true);

  const replaceQuery = useCallback(
    (patch) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(patch).forEach(([key, value]) => {
        if (value == null || value === "") params.delete(key);
        else params.set(key, String(value));
      });
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const loadInvestors = useCallback(async () => {
    if (!canView) {
      setInvestors([]);
      setListLoading(false);
      return;
    }
    setListLoading(true);
    try {
      const res = await apiRequest("/investors", {
        searchParams: buildPageParams({ page: 1, perPage: 200, q: "" }),
      });
      setInvestors(parsePaginator(res).items);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load investors");
      setInvestors([]);
    } finally {
      setListLoading(false);
    }
  }, [canView]);

  useTabAwareDataLoad(loadInvestors);
  useTabTitle(tabSectionTitle("Reports", "Investors"));

  useEffect(() => {
    if (!canView || listLoading || investors.length === 0) return;
    const validInvestors = investors.filter((row) => isValidInvestorRouteId(row.id));
    if (validInvestors.length === 0) return;
    const ids = new Set(validInvestors.map((row) => String(row.id)));
    if (investorFromUrl && ids.has(String(investorFromUrl))) return;
    replaceQuery({ investor: String(validInvestors[0].id), kind: kindFromUrl });
  }, [
    canView,
    listLoading,
    investors,
    investorFromUrl,
    kindFromUrl,
    replaceQuery,
  ]);

  const selectedInvestor = useMemo(() => {
    if (!isValidInvestorRouteId(investorFromUrl)) return null;
    return (
      investors.find(
        (row) => isValidInvestorRouteId(row.id) && String(row.id) === String(investorFromUrl),
      ) ?? null
    );
  }, [investors, investorFromUrl]);

  const investorOptions = useMemo(
    () =>
      investors
        .filter((row) => isValidInvestorRouteId(row.id))
        .map((row) => ({
        value: String(row.id),
        label: `${row.investor_name || "Investor"}${
          row.investor_code ? ` (${row.investor_code})` : ""
        }`,
      })),
    [investors],
  );

  return (
    <CatalogPageShell
      title="Reports-Investors"
      subtitle="Sales, stock balance, and money-flow — filter by investor"
      action={
        <button
          type="button"
          className={SECONDARY_BTN_CLASS}
          onClick={() => void loadInvestors()}
          disabled={listLoading || !canView}
        >
          {listLoading ? "Refreshing…" : "Refresh"}
        </button>
      }
    >
      {!enabled ? (
        <p className="mb-4 text-sm text-amber-800">Investors are disabled for this organization.</p>
      ) : !canView ? (
        <p className="mb-4 text-sm text-slate-600">You do not have permission to view investor reports.</p>
      ) : listLoading && investors.length === 0 ? (
        <p className="text-sm text-slate-500">Loading investors…</p>
      ) : investors.length === 0 ? (
        <p className="text-sm text-slate-500">No investors yet. Add an investor first.</p>
      ) : (
        <div className="space-y-4">
          <div className="max-w-md">
            <Field label="Investor">
              <FilterSelect
                value={String(investorFromUrl || "")}
                onChange={(e) =>
                  replaceQuery({ investor: e.target.value, kind: kindFromUrl })
                }
                options={investorOptions}
                placeholder="Select investor"
                searchPlaceholder="Search investors…"
                disabled={listLoading}
                className="w-full min-w-0"
              />
            </Field>
          </div>

          {selectedInvestor ? (
            <InvestorReportsView
              key={String(selectedInvestor.id)}
              investorId={selectedInvestor.id}
              investor={selectedInvestor}
              canView={canView}
              initialKind={kindFromUrl}
              onReportKindChange={(kind) =>
                replaceQuery({
                  investor: String(selectedInvestor.id),
                  kind: normalizeKind(kind),
                })
              }
            />
          ) : (
            <p className="text-sm text-slate-500">Select an investor to view the report.</p>
          )}
        </div>
      )}
    </CatalogPageShell>
  );
}
