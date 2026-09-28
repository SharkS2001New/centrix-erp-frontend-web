"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  FilterSelect,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
} from "@/components/catalog/catalog-shared";
import {
  deleteMarketingPortfolio,
  fetchMarketingMeta,
  listMarketingPortfolios,
  PORTFOLIO_STATUS_STYLES,
  portfolioStatusLabel,
} from "@/lib/platform-marketing";

export default function PlatformMarketingPortfoliosPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [verticalFilter, setVerticalFilter] = useState("all");
  const [q, setQ] = useState("");
  const [actingId, setActingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, m] = await Promise.all([
        listMarketingPortfolios({ status: statusFilter, vertical: verticalFilter, q }),
        meta ? Promise.resolve(meta) : fetchMarketingMeta(),
      ]);
      setRows(list);
      if (!meta) setMeta(m);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load portfolios.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [meta, q, statusFilter, verticalFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(row) {
    const ok = await confirm({
      title: "Delete portfolio?",
      message: `Delete “${row.title}”? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setActingId(row.id);
    try {
      await deleteMarketingPortfolio(row.id);
      notifySuccess("Portfolio deleted.");
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Delete failed.");
    } finally {
      setActingId(null);
    }
  }

  const verticalLabel = (id) =>
    meta?.verticals?.find((v) => v.id === id)?.label || id;

  return (
    <CatalogPageShell
      breadcrumb={
        <AdminBreadcrumb
          items={[
            { label: "Platform", href: "/platform" },
            { label: "Marketing portfolios" },
          ]}
        />
      }
      title="Marketing portfolios"
      description="Create prospect-ready Centrix portfolios with AI — shop, supermarket, hotel, spa, and more."
      actions={
        <PrimaryButton onClick={() => router.push("/platform/marketing/new")}>
          New portfolio
        </PrimaryButton>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">Search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Prospect or business"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">Status</span>
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "all", label: "All" },
              { value: "draft", label: "Draft" },
              { value: "ready", label: "Ready" },
              { value: "shared", label: "Shared" },
            ]}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">Vertical</span>
          <FilterSelect
            value={verticalFilter}
            onChange={(e) => setVerticalFilter(e.target.value)}
            options={[
              { value: "all", label: "All" },
              ...(meta?.verticals || []).map((v) => ({ value: v.id, label: v.label })),
            ]}
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Portfolio</th>
              <th className="px-4 py-3">Vertical</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No portfolios yet. Create one for a prospect in under a minute.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link
                      href={`/platform/marketing/${row.id}`}
                      className="font-medium text-indigo-700 hover:underline"
                    >
                      {row.title}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {row.prospect_name}
                      {row.business_name ? ` · ${row.business_name}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">{verticalLabel(row.vertical)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        PORTFOLIO_STATUS_STYLES[row.status] || PORTFOLIO_STATUS_STYLES.draft
                      }`}
                    >
                      {portfolioStatusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {row.updated_at ? new Date(row.updated_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className={SECONDARY_BTN_CLASS}
                      onClick={() => router.push(`/platform/marketing/${row.id}`)}
                    >
                      Open
                    </button>{" "}
                    <button
                      type="button"
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                      disabled={actingId === row.id}
                      onClick={() => void handleDelete(row)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </CatalogPageShell>
  );
}
