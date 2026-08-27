"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { useListRefreshUi } from "@/lib/list-refresh-ui";
import { useListUrlSearch } from "@/lib/use-list-url-search";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { useConfirm } from "@/lib/use-confirm";
import { notifyError, notifySuccess } from "@/lib/notify";
import { P } from "@/lib/permission-codes";
import { isPlatformInvestorsEnabled } from "@/lib/platform-org-features";
import { OrgSettingsPlatformHint } from "@/components/admin/org-settings-platform-hint";
import {
  CatalogPageShell,
  Field,
  FormDrawer,
  IconButton,
  inputClassName,
  PaginationBar,
  PencilIcon,
  EyeIcon,
  PrimaryButton,
  SearchInput,
  SECONDARY_BTN_CLASS,
  StatCard,
  TrashIcon,
  formatKesCompact,
} from "@/components/catalog/catalog-shared";
import { useTabTitle } from "@/contexts/tab-workspace-context";
import { tabSectionTitle } from "@/hooks/use-tab-form-exit";

const EMPTY_FORM = {
  investor_code: "",
  investor_name: "",
  contact_person: "",
  phone: "",
  email: "",
  notes: "",
  is_active: true,
};

function StatusBadge({ active }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

/** Capital form from contribution totals (cash deposit vs goods paid for). */
function CapitalFormBadges({ summary }) {
  const cash = Number(summary?.cash_contributed ?? 0);
  const stock = Number(summary?.stock_contributed ?? 0);
  if (cash <= 0 && stock <= 0) {
    return <span className="text-xs text-slate-400">No capital yet</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {cash > 0 ? (
        <span className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-900">
          Cash
        </span>
      ) : null}
      {stock > 0 ? (
        <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
          Stock
        </span>
      ) : null}
    </div>
  );
}

export function InvestorsScreen() {
  const router = useRouter();
  const confirm = useConfirm();
  const { capabilities, hasPermission } = useAuth();
  const enabled = isPlatformInvestorsEnabled(capabilities);
  const canCreate = enabled && hasPermission?.(P.investors.investors.create);
  const canEdit = enabled && hasPermission?.(P.investors.investors.edit);
  const canDelete = enabled && hasPermission?.(P.investors.investors.delete);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const { search, setSearch, debouncedSearch } = useListUrlSearch();
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(10);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadData = useCallback(async () => {
    if (!enabled) {
      setRows([]);
      setTotal(0);
      setTotalPages(1);
      setLoading(false);
      setListLoading(false);
      return;
    }
    setListLoading(true);
    try {
      const res = await apiRequest("/investors", {
        searchParams: buildPageParams({
          page,
          perPage: pageSize,
          q: debouncedSearch,
        }),
      });
      const parsed = parsePaginator(res);
      setRows(parsed.items);
      setTotal(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load investors");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [enabled, page, pageSize, debouncedSearch]);

  useTabAwareDataLoad(loadData);
  useTabTitle(tabSectionTitle("Investors"));

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const safePage = Math.min(page, totalPages);
  const listRefresh = useListRefreshUi({
    loading,
    listLoading,
    hasRows: rows.length > 0,
  });
  const tableLoading = listRefresh.showInitialLoading;

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function openCreateDrawer() {
    if (!canCreate && !canEdit) return;
    setDrawerMode("create");
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(row) {
    if (!canEdit) return;
    setDrawerMode("edit");
    setEditingId(row.id);
    setForm({
      investor_code: row.investor_code ?? "",
      investor_name: row.investor_name ?? "",
      contact_person: row.contact_person ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      notes: row.notes ?? "",
      is_active: row.is_active !== false,
    });
    setFormError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setFormError(null);
  }

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveForm(e) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    const body = {
      investor_code: form.investor_code.trim() || null,
      investor_name: form.investor_name.trim(),
      contact_person: form.contact_person.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
    };
    try {
      if (drawerMode === "create") {
        const created = await apiRequest("/investors", { method: "POST", body });
        closeDrawer();
        notifySuccess("Investor created");
        router.push(`/investors/${created.id}`);
        return;
      }
      await apiRequest(`/investors/${editingId}`, { method: "PATCH", body });
      await loadData();
      closeDrawer();
      notifySuccess("Investor updated");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteInvestor(row) {
    if (!canDelete && !canEdit) return;
    const label = row.investor_name || row.investor_code || "this investor";
    const ok = await confirm({
      title: "Delete investor",
      message: `Delete ${label}? Contributions and batches will be soft-deleted with the account.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/investors/${row.id}`, { method: "DELETE" });
      await loadData();
      notifySuccess(`Deleted ${label}`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  return (
    <CatalogPageShell
      title="Investors"
      subtitle="Track cash and stock capital, link supplier payments / LPOs, and report sales, stock, and money flow"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading || listLoading || !enabled}
            className={SECONDARY_BTN_CLASS}
          >
            {loading || listLoading ? "Refreshing…" : "Refresh"}
          </button>
          {canCreate || canEdit ? (
            <PrimaryButton onClick={openCreateDrawer}>Add investor</PrimaryButton>
          ) : null}
        </div>
      }
    >
      {!enabled ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Investors are disabled for this organization. Ask a platform admin to enable them under{" "}
          <OrgSettingsPlatformHint area="Platform → Organization → Sales behaviour" />.
        </div>
      ) : (
        <p className="mb-4 text-sm text-slate-600">
          {total.toLocaleString()} investor{total === 1 ? "" : "s"} matching filters
        </p>
      )}

      {enabled && rows.length > 0 ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Open batches (page)"
            value={rows.reduce((n, r) => n + Number(r.summary?.open_batches ?? 0), 0)}
          />
          <StatCard
            label="Stock value (page)"
            value={formatKesCompact(
              rows.reduce((n, r) => n + Number(r.summary?.stock_value ?? 0), 0),
            )}
          />
          <StatCard
            label="Cash pools (page)"
            value={formatKesCompact(
              rows.reduce((n, r) => n + Number(r.summary?.cash_pool_balance ?? 0), 0),
            )}
          />
        </div>
      ) : null}

      <div className="mb-4 max-w-md">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, code, or phone…"
          disabled={!enabled}
        />
      </div>

      <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        {tableLoading ? (
          <p className="p-8 text-sm text-slate-500">Loading investors…</p>
        ) : (
          <div className={listRefresh.contentClassName}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs font-medium">
                    <th className="px-4 py-2.5">Code</th>
                    <th className="px-4 py-2.5">Name</th>
                    <th className="px-4 py-2.5">Contact</th>
                    <th className="px-4 py-2.5">Form</th>
                    <th className="px-4 py-2.5 text-right">Cash in</th>
                    <th className="px-4 py-2.5 text-right">Stock in</th>
                    <th className="px-4 py-2.5 text-right">Stock value</th>
                    <th className="px-4 py-2.5 text-right">Cash pool</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="w-[100px] px-4 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-12 text-center text-slate-500">
                        {enabled
                          ? "No investors yet. Add one, then record cash or stock contributions on their page."
                          : "Enable Investors to manage capital accounts."}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => {
                      const summary = row.summary ?? {};
                      return (
                        <tr key={row.id} className="theme-table-row border-t border-slate-100">
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                            <Link
                              href={`/investors/${row.id}`}
                              className="text-[var(--brand-primary)] hover:underline"
                            >
                              {row.investor_code}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5">
                            <Link
                              href={`/investors/${row.id}`}
                              className="font-medium text-slate-900 hover:underline"
                            >
                              {row.investor_name}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">
                            {row.contact_person || row.phone || "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <CapitalFormBadges summary={summary} />
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {formatKesCompact(summary.cash_contributed ?? 0)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {formatKesCompact(summary.stock_contributed ?? 0)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {formatKesCompact(summary.stock_value ?? 0)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {formatKesCompact(summary.cash_pool_balance ?? 0)}
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusBadge active={row.is_active !== false} />
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1">
                              <IconButton
                                label="View"
                                onClick={() => router.push(`/investors/${row.id}`)}
                              >
                                <EyeIcon />
                              </IconButton>
                              {canEdit ? (
                                <IconButton
                                  label="Edit"
                                  onClick={() => openEditDrawer(row)}
                                >
                                  <PencilIcon />
                                </IconButton>
                              ) : null}
                              {canDelete || canEdit ? (
                                <IconButton
                                  label="Delete"
                                  onClick={() => void deleteInvestor(row)}
                                >
                                  <TrashIcon />
                                </IconButton>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={safePage}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </div>
        )}
      </div>

      <FormDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={drawerMode === "create" ? "Add investor" : "Edit investor"}
        onSubmit={(e) => void saveForm(e)}
        saving={saving}
        error={formError}
        submitLabel="Save"
      >
        <p className="mb-1 text-xs text-slate-500">
          Create the investor account first. Choose <strong>Cash</strong> or{" "}
          <strong>Stock</strong> when you add a contribution on their page — that is how capital
          form is tracked.
        </p>
        <Field label="Investor code">
          <input
            className={inputClassName()}
            value={form.investor_code}
            onChange={(e) => updateField("investor_code", e.target.value)}
            placeholder="Auto if blank (INV-001…)"
          />
        </Field>
        <Field label="Name" required>
          <input
            className={inputClassName()}
            value={form.investor_name}
            onChange={(e) => updateField("investor_name", e.target.value)}
            required
          />
        </Field>
        <Field label="Contact person">
          <input
            className={inputClassName()}
            value={form.contact_person}
            onChange={(e) => updateField("contact_person", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <input
              className={inputClassName()}
              value={form.phone}
              onChange={(e) => updateField("phone", e.target.value)}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className={inputClassName()}
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
            />
          </Field>
        </div>
        <Field label="Notes">
          <textarea
            className={inputClassName()}
            rows={3}
            value={form.notes}
            onChange={(e) => updateField("notes", e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => updateField("is_active", e.target.checked)}
          />
          Active
        </label>
      </FormDrawer>
    </CatalogPageShell>
  );
}
