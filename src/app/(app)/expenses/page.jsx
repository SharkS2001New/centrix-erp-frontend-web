"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useListUrlSearch } from "@/lib/use-list-url-search";
import { useAuth } from "@/contexts/auth-context";
import {
  CatalogPageShell,
  ActiveSortChip,
  Field,
  FilterSelect,
  FormModal,
  IconButton,
  inputClassName,
  PaginationBar,
  PencilIcon,
  SearchInput,
  SortableColumnHeader,
  TrashIcon,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { useListPageSize, useTableSort } from "@/lib/use-list-page-controls";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { EXPENSE_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";

const SORT_STORAGE_KEY = "centrix-erp-expenses-sort";

const EXPENSE_SORT_COLUMNS = {
  expense_date: "Date",
  description: "Expense",
  expense_amount: "Amount",
};

const EMPTY_EXPENSE_FORM = {
  description: "",
  notes: "",
  expense_group_id: "",
  expense_amount: "",
  expense_date: new Date().toISOString().slice(0, 10),
  payment_method_id: "",
  invoice_no: "",
};

function formatKes(value) {
  if (value == null || value === "") return "—";
  return `KES ${Number(value).toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatKesCompact(value) {
  const n = Number(value ?? 0);
  if (n >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `KES ${(n / 1_000).toFixed(0)}K`;
  return formatKes(n);
}

function expenseDisplayName(expense) {
  const text = expense.description ?? "";
  return text.split(" — ")[0] || text || "—";
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function isSameYear(a, b) {
  return a.getFullYear() === b.getFullYear();
}

function sumAmounts(expenses) {
  return expenses.reduce((sum, e) => sum + Number(e.expense_amount ?? 0), 0);
}

function expenseDateRange(dateFilter) {
  const now = new Date();
  const pad = (d) => d.toISOString().slice(0, 10);
  if (dateFilter === "today") {
    const today = pad(now);
    return { from_date: today, to_date: today };
  }
  if (dateFilter === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from_date: pad(start), to_date: pad(now) };
  }
  if (dateFilter === "year") {
    const start = new Date(now.getFullYear(), 0, 1);
    return { from_date: pad(start), to_date: pad(now) };
  }
  return {};
}

export default function ExpensesPage() {
  const confirm = useConfirm();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const urlFromDate = searchParams.get("from_date") ?? "";
  const urlToDate = searchParams.get("to_date") ?? "";
  const hasUrlDateRange = Boolean(urlFromDate && urlToDate);

  const [expenses, setExpenses] = useState([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [expenseStats, setExpenseStats] = useState(null);
  const [groups, setGroups] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const { search, setSearch, debouncedSearch } = useListUrlSearch();
  const [groupFilter, setGroupFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(10);
  const { sort, sortDir, sortActive, toggleSort, clearSort } = useTableSort(SORT_STORAGE_KEY);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState("create");
  const [viewExpense, setViewExpense] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_EXPENSE_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupError, setGroupError] = useState(null);

  const loadReferenceData = useCallback(async () => {
    try {
      const [groupRes, pmRes, userRes, statsRes] = await Promise.all([
        apiRequest("/expense-groups", { searchParams: { per_page: 200 } }),
        apiRequest("/payment-methods", { searchParams: { per_page: 50 } }),
        apiRequest("/users", { searchParams: { per_page: 200 } }),
        apiRequest("/expenses/summary").catch(() => null),
      ]);
      setGroups(groupRes.data ?? []);
      setPaymentMethods(pmRes.data ?? []);
      setUsers(userRes.data ?? []);
      if (statsRes) setExpenseStats(statsRes);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadExpenses = useCallback(async () => {
    setListLoading(true);
    try {
      const filters = {};
      if (groupFilter !== "all") filters.expense_group_id = groupFilter;

      const extra = {
        status: statusFilter,
        ...(hasUrlDateRange
          ? { from_date: urlFromDate, to_date: urlToDate }
          : expenseDateRange(dateFilter)),
      };

      const searchParams = buildPageParams({
        page,
        perPage: pageSize,
        q: debouncedSearch,
        sort,
        sortDir,
        filters,
        extra,
      });
      const expRes = await apiRequest("/expenses", { searchParams });
      const parsed = parsePaginator(expRes);
      setExpenses(parsed.items);
      setTotalExpenses(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load expenses");
    } finally {
      setListLoading(false);
    }
  }, [page, pageSize, debouncedSearch, groupFilter, dateFilter, statusFilter, hasUrlDateRange, urlFromDate, urlToDate, sort, sortDir]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  async function reloadAll() {
    const [statsRes] = await Promise.all([
      apiRequest("/expenses/summary").catch(() => null),
      loadExpenses(),
    ]);
    if (statsRes) setExpenseStats(statsRes);
  }

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const paymentById = useMemo(
    () => new Map(paymentMethods.map((p) => [p.id, p])),
    [paymentMethods],
  );

  const stats = useMemo(() => {
    if (expenseStats) {
      return {
        today: Number(expenseStats.today ?? 0),
        month: Number(expenseStats.month ?? 0),
        year: Number(expenseStats.year ?? 0),
      };
    }
    const now = new Date();
    const activeExpenses = expenses.filter((e) => !e.deleted_at);
    const today = activeExpenses.filter((e) => isSameDay(new Date(e.expense_date), now));
    const month = activeExpenses.filter((e) => isSameMonth(new Date(e.expense_date), now));
    const year = activeExpenses.filter((e) => isSameYear(new Date(e.expense_date), now));
    return {
      today: sumAmounts(today),
      month: sumAmounts(month),
      year: sumAmounts(year),
    };
  }, [expenseStats, expenses]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, groupFilter, dateFilter, statusFilter, pageSize, sort, sortDir]);

  const activeSortLabel = sort
    ? `${EXPENSE_SORT_COLUMNS[sort] ?? sort} (${sortDir === "desc" ? "high to low" : "low to high"})`
    : null;

  function handleSort(columnId) {
    toggleSort(columnId);
    setPage(1);
  }

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  function openCreateDrawer() {
    setDrawerMode("create");
    setEditingId(null);
    setViewExpense(null);
    setForm({
      ...EMPTY_EXPENSE_FORM,
      expense_date: new Date().toISOString().slice(0, 10),
      payment_method_id: String(paymentMethods[0]?.id ?? ""),
    });
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(expense) {
    const [name, notes] = (expense.description ?? "").split(" — ");
    setDrawerMode("edit");
    setEditingId(expense.id);
    setViewExpense(null);
    setForm({
      description: name ?? expense.description ?? "",
      notes: notes ?? "",
      expense_group_id: String(expense.expense_group_id ?? ""),
      expense_amount: String(expense.expense_amount ?? ""),
      expense_date: expense.expense_date?.slice?.(0, 10) ?? expense.expense_date ?? "",
      payment_method_id: String(expense.payment_method_id ?? ""),
      invoice_no: expense.invoice_no ?? "",
    });
    setFormError(null);
    setDrawerOpen(true);
  }

  function openViewDrawer(expense) {
    setDrawerMode("view");
    setViewExpense(expense);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setFormError(null);
    setViewExpense(null);
  }

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildDescription() {
    const name = form.description.trim();
    const notes = form.notes.trim();
    if (name && notes) return `${name} — ${notes}`;
    return name || notes;
  }

  async function saveExpense(e) {
    e.preventDefault();
    if (!user?.branch_id) {
      setFormError("Your user profile is missing a branch.");
      return;
    }
    if (!form.expense_group_id) {
      setFormError("Please select an expense group.");
      return;
    }
    if (!form.payment_method_id) {
      setFormError("Please select a payment method.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const body = {
      branch_id: user.branch_id,
      expense_group_id: Number(form.expense_group_id),
      description: buildDescription(),
      expense_amount: parseFloat(form.expense_amount) || 0,
      expense_date: form.expense_date,
      payment_method_id: Number(form.payment_method_id),
      invoice_no: form.invoice_no.trim() || null,
      recorded_by: user.id,
      billable_status: 1,
    };

    try {
      if (drawerMode === "edit" && editingId != null) {
        await apiRequest(`/expenses/${editingId}`, { method: "PUT", body });
      } else {
        await apiRequest("/expenses", { method: "POST", body });
      }
      await reloadAll();
      closeDrawer();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(expense) {
    const ok = await confirm({
      title: "Delete expense",
      message: `Delete expense "${expenseDisplayName(expense)}"?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/expenses/${expense.id}`, { method: "DELETE" });
      await reloadAll();
      notifySuccess("Expense deleted");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  async function createGroup(e) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setGroupSaving(true);
    setGroupError(null);
    try {
      const created = await apiRequest("/expense-groups", {
        method: "POST",
        body: { group_name: newGroupName.trim() },
      });
      setGroups((prev) => [...prev, created].sort((a, b) => a.group_name.localeCompare(b.group_name)));
      setForm((prev) => ({ ...prev, expense_group_id: String(created.id) }));
      setNewGroupName("");
      setGroupModalOpen(false);
    } catch (err) {
      setGroupError(err instanceof ApiError ? err.message : "Failed to create group");
    } finally {
      setGroupSaving(false);
    }
  }

  return (
    <CatalogPageShell
      title="Expenses"
      subtitle="Record and track business expenses"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <CatalogListExport
            title="Expenses"
            apiPath="/expenses"
            columns={EXPENSE_EXPORT_COLUMNS}
            totalCount={totalExpenses}
            getSearchParams={() =>
              buildPageParams({
                page: 1,
                perPage: 200,
                q: debouncedSearch,
                extra: groupFilter !== "all" ? { expense_group_id: groupFilter } : {},
              })
            }
            disabled={loading}
          />
          <button
          type="button"
          onClick={openCreateDrawer}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
        >
          <PlusIcon />
          Add Expense
        </button>
        </div>
      }
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Today" value={formatKesCompact(stats.today)} />
        <StatCard label="This month" value={formatKesCompact(stats.month)} />
        <StatCard label="This year" value={formatKesCompact(stats.year)} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search expense…"
        />
        <FilterSelect
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          options={[
            { value: "all", label: "All groups" },
            ...groups.map((g) => ({ value: String(g.id), label: g.group_name })),
          ]}
        />
        <FilterSelect
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          options={[
            { value: "all", label: "All dates" },
            { value: "today", label: "Today" },
            { value: "month", label: "This month" },
            { value: "year", label: "This year" },
          ]}
        />
        <FilterSelect
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "active", label: "Active" },
            { value: "deleted", label: "Deleted" },
            { value: "all", label: "All" },
          ]}
        />
      </div>

      <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading expenses…</p>
        ) : (
          <>
            {sortActive ? (
              <div className="px-4 pt-3">
                <ActiveSortChip label={activeSortLabel} onClear={() => { clearSort(); setPage(1); }} />
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs font-medium">
                    <th className="px-4 py-2.5">
                      <SortableColumnHeader
                        label="Date"
                        columnId="expense_date"
                        sort={sort}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="px-4 py-2.5">
                      <SortableColumnHeader
                        label="Expense"
                        columnId="description"
                        sort={sort}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                    </th>
                    <th className="px-4 py-2.5">Group</th>
                    <th className="px-4 py-2.5 text-right">
                      <SortableColumnHeader
                        label="Amount"
                        columnId="expense_amount"
                        sort={sort}
                        sortDir={sortDir}
                        onSort={handleSort}
                        align="right"
                      />
                    </th>
                    <th className="px-4 py-2.5">User</th>
                    <th className="w-[110px] px-4 py-2.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                        No expenses match your filters.
                      </td>
                    </tr>
                  ) : (
                    expenses.map((expense) => {
                      const group = groupById.get(expense.expense_group_id);
                      const recorder = userById.get(expense.recorded_by);
                      return (
                        <tr
                          key={expense.id}
                          className={`border-b border-slate-100 last:border-b-0 hover:bg-slate-50 ${
                            expense.deleted_at ? "opacity-60" : ""
                          }`}
                        >
                          <td className="px-4 py-3 text-slate-600">
                            {formatShortDate(expense.expense_date)}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {expenseDisplayName(expense)}
                          </td>
                          <td className="px-4 py-3">
                            <GroupBadge name={group?.group_name} />
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-800">
                            {formatKes(expense.expense_amount)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {recorder?.username ?? recorder?.full_name ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-center gap-1">
                              <IconButton label="View" onClick={() => openViewDrawer(expense)}>
                                <ViewIcon />
                              </IconButton>
                              {!expense.deleted_at && (
                                <>
                                  <IconButton label="Edit" onClick={() => openEditDrawer(expense)}>
                                    <PencilIcon />
                                  </IconButton>
                                  <IconButton
                                    label="Delete"
                                    danger
                                    onClick={() => deleteExpense(expense)}
                                  >
                                    <TrashIcon />
                                  </IconButton>
                                </>
                              )}
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
              page={page}
              totalPages={totalPages}
              total={totalExpenses}
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
          </>
        )}
      </div>

      {drawerOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/30"
            aria-label="Close drawer"
            onClick={closeDrawer}
          />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-[15px] font-medium text-slate-900">
                {drawerMode === "view"
                  ? "Expense details"
                  : drawerMode === "edit"
                    ? "Edit expense"
                    : "Record expense"}
              </h2>
              <button
                type="button"
                onClick={closeDrawer}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>

            {drawerMode === "view" && viewExpense ? (
              <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
                <dl className="space-y-3">
                  <ViewRow label="Expense" value={expenseDisplayName(viewExpense)} />
                  <ViewRow
                    label="Group"
                    value={groupById.get(viewExpense.expense_group_id)?.group_name ?? "—"}
                  />
                  <ViewRow label="Amount" value={formatKes(viewExpense.expense_amount)} />
                  <ViewRow label="Date" value={formatShortDate(viewExpense.expense_date)} />
                  <ViewRow
                    label="Payment method"
                    value={
                      paymentById.get(viewExpense.payment_method_id)?.method_name ?? "—"
                    }
                  />
                  <ViewRow label="Reference no." value={viewExpense.invoice_no || "—"} />
                  <ViewRow label="Description" value={viewExpense.description || "—"} />
                  <ViewRow
                    label="Recorded by"
                    value={
                      userById.get(viewExpense.recorded_by)?.full_name ??
                      userById.get(viewExpense.recorded_by)?.username ??
                      "—"
                    }
                  />
                </dl>
                {!viewExpense.deleted_at && (
                  <button
                    type="button"
                    onClick={() => openEditDrawer(viewExpense)}
                    className="mt-6 w-full rounded-lg bg-[#185FA5] py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
                  >
                    Edit expense
                  </button>
                )}
              </div>
            ) : (
              <form onSubmit={saveExpense} className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 space-y-3.5 overflow-y-auto px-5 py-4">
                  <Field label="Expense name">
                    <input
                      type="text"
                      value={form.description}
                      onChange={(e) => updateField("description", e.target.value)}
                      required
                      className={inputClassName()}
                      placeholder="Fuel"
                    />
                  </Field>

                  <Field label="Expense group">
                    <div className="flex gap-2">
                      <select
                        value={form.expense_group_id}
                        onChange={(e) => updateField("expense_group_id", e.target.value)}
                        required
                        className={`${inputClassName()} min-w-0 flex-1`}
                      >
                        <option value="" disabled>
                          Select group
                        </option>
                        {groups.map((g) => (
                          <option key={g.id} value={String(g.id)}>
                            {g.group_name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setGroupError(null);
                          setNewGroupName("");
                          setGroupModalOpen(true);
                        }}
                        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-lg font-medium text-[#185FA5] hover:bg-slate-50"
                        title="Create expense group"
                      >
                        +
                      </button>
                    </div>
                  </Field>

                  <Field label="Amount (KES)">
                    <input
                      type="number"
                      value={form.expense_amount}
                      onChange={(e) => updateField("expense_amount", e.target.value)}
                      required
                      min="0"
                      step="1"
                      className={inputClassName()}
                    />
                  </Field>

                  <Field label="Expense date">
                    <input
                      type="date"
                      value={form.expense_date}
                      onChange={(e) => updateField("expense_date", e.target.value)}
                      required
                      className={inputClassName()}
                    />
                  </Field>

                  <Field label="Payment method">
                    <select
                      value={form.payment_method_id}
                      onChange={(e) => updateField("payment_method_id", e.target.value)}
                      required
                      className={inputClassName()}
                    >
                      <option value="" disabled>
                        Select method
                      </option>
                      {paymentMethods.map((pm) => (
                        <option key={pm.id} value={String(pm.id)}>
                          {pm.method_name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Reference no.">
                    <input
                      type="text"
                      value={form.invoice_no}
                      onChange={(e) => updateField("invoice_no", e.target.value)}
                      className={inputClassName()}
                      placeholder="Invoice / receipt number"
                    />
                  </Field>

                  <Field label="Description">
                    <textarea
                      value={form.notes}
                      onChange={(e) => updateField("notes", e.target.value)}
                      rows={3}
                      className={inputClassName()}
                      placeholder="Additional notes…"
                    />
                  </Field>
                </div>

                {formError && (
                  <p className="mx-5 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {formError}
                  </p>
                )}

                <div className="border-t border-slate-200 px-5 py-4">
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full rounded-lg bg-[#185FA5] py-2.5 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a] disabled:opacity-50"
                  >
                    {saving ? "Saving…" : drawerMode === "edit" ? "Save changes" : "Save expense"}
                  </button>
                </div>
              </form>
            )}
          </aside>
        </>
      )}

      <FormModal
        title="Create expense group"
        open={groupModalOpen}
        onClose={() => {
          setGroupModalOpen(false);
          setGroupError(null);
        }}
        onSubmit={createGroup}
        saving={groupSaving}
        error={groupError}
        submitLabel="Create group"
      >
        <Field label="Group name">
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            required
            autoFocus
            className={inputClassName()}
            placeholder="Internet subscription"
          />
        </Field>
        <p className="text-xs text-slate-500">
          The new group will appear in the list and be selected automatically.
        </p>
      </FormModal>
    </CatalogPageShell>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="theme-panel rounded-xl border px-5 py-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function GroupBadge({ name }) {
  return (
    <span className="inline-flex rounded-full bg-[#EEEDFE] px-2.5 py-0.5 text-[11px] font-medium text-[#3C3489]">
      {name || "—"}
    </span>
  );
}

function ViewRow({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-900">{value}</dd>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ViewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
