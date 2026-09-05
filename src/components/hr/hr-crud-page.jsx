"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import {
  CatalogPageShell,
  Field,
  FormDrawer,
  PrimaryButton,
  SearchInput,
  PaginationBar,
  FilterToolbar,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SHELL_CLASS,
  TABLE_BODY_ROW_CLASS,
  inputClassName,
  SearchableSelect,
} from "@/components/catalog/catalog-shared";
import { HrSearchableSelect } from "@/components/hr/hr-searchable-select";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { exportColumnsFromHrCrud } from "@/lib/catalog-list-exports";
import { HrPageActions } from "@/components/hr/hr-list-toolbar";
import { confirmDeleteOptions, useConfirm } from "@/lib/use-confirm";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  BatchActionBar,
  TableRowSelectCell,
  TableSelectAllHeader,
  batchDeleteWithConfirm,
  usePageRowSelection,
} from "@/components/catalog/table-row-selection";

/**
 * Lightweight HR list + create/edit sidebar drawer (Retail Package Manager pattern).
 */
export function HrCrudPage({
  title,
  subtitle,
  embedded = false,
  apiPath,
  columns,
  emptyLabel = "No records yet.",
  buildEmptyForm,
  buildBody,
  validateForm,
  renderFormFields,
  getRowKey = (row) => row.id,
  searchFilter,
  /** Show search box in the filter toolbar (server `q` + optional client refine). */
  showSearch = true,
  searchPlaceholder = "Search…",
  loadExtra,
  listSearchParams,
  onSaved,
  drawerWide = false,
  addButtonLabel = "Add new",
  drawerCreateTitle,
  renderRowActions,
  /** Optional controls rendered inside the list FilterToolbar (before search).
   *  Pass a node, or a function `({ reload, loading }) => node` for Apply/Filter buttons. */
  filterSlot = null,
  exportEnabled = true,
  exportFilename,
  /** Report title for PDF/CSV (defaults to page title). */
  exportTitle,
  /** Override auto-derived export columns (needed when table columns use render). */
  exportColumns: exportColumnsProp,
  /**
   * Map loaded rows into export-ready objects keyed by exportColumns.
   * When set, export uses these rows instead of re-fetching the API (keeps display values).
   * @type {((ctx: { rows: object[], filtered: object[], extra: object, search: string, listSearchParams?: object }) => object[] | Promise<object[]>) | undefined}
   */
  getExportRows,
  /** Called after a successful create with the API response body (if any). */
  onCreated,
  /** Open this row's edit drawer when the list loads (notification deep link). */
  highlightRowId = null,
  /** Row checkboxes + batch action bar (e.g. bulk delete). */
  enableRowSelection = false,
  /** Label used in bulk-delete confirm copy (singular). */
  selectionEntityName = "record",
  /** Extra batch buttons beside Delete selected. */
  renderBatchActions = null,
}) {
  const { user, capabilities } = useAuth();
  const confirm = useConfirm();
  const organizationId = user?.organization_id ?? capabilities?.organization_id;

  const [rows, setRows] = useState([]);
  const [extra, setExtra] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const {
    selectedIds,
    selectedCount,
    toggleOne,
    toggleAllOnPage,
    clearSelection,
    isAllOnPageSelected,
    isSomeOnPageSelected,
  } = usePageRowSelection();

  // Keep loadExtra out of `load` identity — inline loadExtra from parents was
  // recreating load on every draft filter keystroke and refetching the list.
  // Ref is synced in an effect (not during render). Extra (e.g. employees for
  // the form picker) loads once per mount/apiPath — not on every list page/
  // search/filter change (that was making Overtime and similar pages slow).
  const loadExtraRef = useRef(loadExtra);
  useEffect(() => {
    loadExtraRef.current = loadExtra;
  }, [loadExtra]);

  const listParamsKey = useMemo(
    () => JSON.stringify(listSearchParams ?? null),
    [listSearchParams],
  );

  useEffect(() => {
    setPage(1);
    clearSelection();
  }, [debouncedSearch, apiPath, listParamsKey, clearSelection]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest(apiPath, {
        searchParams: {
          per_page: pageSize,
          page,
          ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
          ...(listSearchParams ?? {}),
        },
      });
      setRows(res.data ?? []);
      setTotal(Number(res.meta?.total ?? res.total ?? res.data?.length ?? 0));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
    // listParamsKey tracks listSearchParams content without object-identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listSearchParams via listParamsKey
  }, [apiPath, listParamsKey, listSearchParams, page, pageSize, debouncedSearch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const extraFn = loadExtraRef.current;
      if (!extraFn) {
        if (!cancelled) setExtra({});
        return;
      }
      try {
        const extraData = await extraFn();
        if (!cancelled) setExtra(extraData ?? {});
      } catch {
        if (!cancelled) setExtra({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiPath]);

  const tableExtra = useMemo(
    () => ({ employees: [], ...extra }),
    [extra],
  );

  useTabAwareDataLoad(load, {
    depsKey: `${apiPath}|${page}|${pageSize}|${debouncedSearch}|${listParamsKey}`,
    hasData: true,
  });

  // Prefer server `q`; keep optional client refine for endpoints that ignore q.
  const filtered = useMemo(() => {
    if (!searchFilter || !debouncedSearch.trim()) return rows;
    return rows.filter((r) => searchFilter(r, debouncedSearch.trim().toLowerCase()));
  }, [rows, debouncedSearch, searchFilter]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const pageRowIds = useMemo(() => filtered.map((r) => getRowKey(r)), [filtered, getRowKey]);
  const allOnPageSelected = enableRowSelection && isAllOnPageSelected(pageRowIds);
  const someOnPageSelected = enableRowSelection && isSomeOnPageSelected(pageRowIds);

  async function deleteSelected() {
    if (!enableRowSelection || selectedCount === 0 || batchBusy) return;
    setBatchBusy(true);
    try {
      await batchDeleteWithConfirm({
        confirm,
        selectedIds,
        entityName: selectionEntityName,
        deleteItem: (id) => apiRequest(`${apiPath}/${id}`, { method: "DELETE" }),
        clearSelection,
        reload: load,
        notifySuccess,
        notifyError,
      });
    } finally {
      setBatchBusy(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(buildEmptyForm(tableExtra));
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm(buildEmptyForm(tableExtra, row));
    setFormError(null);
    setDrawerOpen(true);
  }

  const highlightOpenedRef = useRef(null);
  useEffect(() => {
    if (highlightRowId == null || String(highlightRowId).trim() === "" || loading) return;
    const key = String(highlightRowId);
    if (highlightOpenedRef.current === key) return;

    const fromList = rows.find((r) => String(getRowKey(r)) === key);
    if (fromList) {
      highlightOpenedRef.current = key;
      openEdit(fromList);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const row = await apiRequest(`${apiPath}/${encodeURIComponent(key)}`);
        if (cancelled || !row?.id) return;
        highlightOpenedRef.current = key;
        openEdit(row);
      } catch {
        /* row missing or no access — leave list as-is */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [highlightRowId, loading, rows, apiPath]);

  async function save(e) {
    e.preventDefault();
    const err = validateForm?.(form, tableExtra);
    if (err) {
      setFormError(err);
      return;
    }
    if (!organizationId) {
      setFormError("Your user account has no organization. Contact an administrator.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = buildBody(form, organizationId, tableExtra);
      if (editing) {
        await apiRequest(`${apiPath}/${editing.id}`, { method: "PUT", body });
      } else {
        const created = await apiRequest(apiPath, { method: "POST", body });
        onCreated?.(created);
      }
      setDrawerOpen(false);
      await load();
      onSaved?.();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row) {
    const entityLabel = title ? `${title.toLowerCase()} record` : "this record";
    const ok = await confirm(confirmDeleteOptions(entityLabel));
    if (!ok) return;
    try {
      await apiRequest(`${apiPath}/${row.id}`, { method: "DELETE" });
      await load();
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const drawerTitle = editing
    ? `Edit ${title ?? "record"}`
    : (drawerCreateTitle ?? `Add ${title ?? "record"}`);
  const submitLabel = editing ? "Save changes" : addButtonLabel;
  const exportColumns = useMemo(
    () => (exportColumnsProp?.length ? exportColumnsProp : exportColumnsFromHrCrud(columns)),
    [columns, exportColumnsProp],
  );
  const resolvedExportTitle = exportTitle ?? title ?? "Records";
  const getInlineExportRows = useMemo(() => {
    if (!getExportRows) return undefined;
    return () =>
      Promise.resolve(
        getExportRows({
          rows,
          filtered,
          extra,
          search: debouncedSearch.trim(),
          listSearchParams,
        }),
      );
  }, [getExportRows, rows, filtered, extra, debouncedSearch, listSearchParams]);

  const headerActions = (
    <HrPageActions>
      {exportEnabled && exportColumns.length > 0 ? (
        <CatalogListExport
          title={resolvedExportTitle}
          filename={exportFilename ?? resolvedExportTitle}
          apiPath={apiPath}
          columns={exportColumns}
          totalCount={total || filtered.length}
          getSearchParams={() => ({
            per_page: 200,
            ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
            ...(listSearchParams ?? {}),
          })}
          getInlineRows={getInlineExportRows}
          disabled={loading}
        />
      ) : null}
      <PrimaryButton type="button" onClick={openCreate}>
        {addButtonLabel}
      </PrimaryButton>
    </HrPageActions>
  );

  const content = (
    <>
      <div className="mb-4 space-y-3">
        {embedded && title ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-medium text-slate-900">{title}</h2>
              {subtitle ? (
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">{subtitle}</p>
              ) : null}
            </div>
            <div className="ml-auto shrink-0">{headerActions}</div>
          </div>
        ) : null}
        <FilterToolbar>
          {typeof filterSlot === "function" ? filterSlot({ reload: load, loading }) : filterSlot}
          {showSearch ? (
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
            />
          ) : null}
        </FilterToolbar>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading && rows.length === 0 ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className={`${TABLE_SHELL_CLASS} overflow-x-auto ${loading ? "opacity-60" : ""}`}>
          <table className="min-w-full text-sm">
            <thead className={TABLE_HEAD_ROW_CLASS}>
              <tr>
                {enableRowSelection ? (
                  <TableSelectAllHeader
                    checked={allOnPageSelected}
                    indeterminate={someOnPageSelected}
                    onChange={(checked) => toggleAllOnPage(checked, pageRowIds)}
                  />
                ) : null}
                {columns.map((c) => (
                  <th key={c.key} className="px-4 py-3">
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1 + (enableRowSelection ? 1 : 0)}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    {emptyLabel}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={getRowKey(row)} className={TABLE_BODY_ROW_CLASS}>
                    {enableRowSelection ? (
                      <TableRowSelectCell
                        checked={selectedIds.has(String(getRowKey(row)))}
                        onChange={() => toggleOne(getRowKey(row))}
                        label={`Select ${selectionEntityName}`}
                      />
                    ) : null}
                    {columns.map((c) => (
                      <td key={c.key} className="px-4 py-3 text-slate-800">
                        {c.render ? c.render(row, tableExtra) : row[c.key] ?? "—"}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right">
                      {renderRowActions ? renderRowActions(row, { reload: load, ...tableExtra }) : null}
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="text-[#185FA5] hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(row)}
                        className="ml-3 text-red-600 hover:underline"
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
      )}

      <PaginationBar
        page={Math.min(page, totalPages)}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onChange={(next) => {
          if (enableRowSelection) clearSelection();
          setPage(next);
        }}
        onPageSizeChange={(size) => {
          if (enableRowSelection) clearSelection();
          setPageSize(size);
          setPage(1);
        }}
        pageSizeOptions={[10, 25, 50, 100]}
      />

      {enableRowSelection ? (
        <BatchActionBar count={selectedCount} onClear={clearSelection}>
          {typeof renderBatchActions === "function"
            ? renderBatchActions({
                selectedIds,
                selectedCount,
                clearSelection,
                reload: load,
                batchBusy,
                setBatchBusy,
              })
            : null}
          <button
            type="button"
            disabled={batchBusy || selectedCount === 0}
            onClick={() => void deleteSelected()}
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {batchBusy ? "Working…" : `Delete (${selectedCount})`}
          </button>
        </BatchActionBar>
      ) : null}

      {form && (
        <FormDrawer
          title={drawerTitle}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onSubmit={save}
          saving={saving}
          error={formError}
          submitLabel={submitLabel}
          wide={drawerWide}
        >
          {renderFormFields(form, setForm, {
            ...tableExtra,
            editingRow: editing,
            setExtra,
            reload: load,
            organizationId,
          })}
        </FormDrawer>
      )}
    </>
  );

  if (embedded) {
    return <div className="space-y-4">{content}</div>;
  }

  return (
    <CatalogPageShell title={title} subtitle={subtitle} action={headerActions}>
      {content}
    </CatalogPageShell>
  );
}

export function HrSelectField({
  label,
  value,
  onChange,
  options,
  required,
  searchable = true,
  placeholder,
  onAdd,
  addLabel = "Add",
}) {
  const useSearchable = searchable && options.length > 0;
  const control = useSearchable ? (
    <HrSearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      required={required}
      placeholder={placeholder ?? `Search ${String(label).toLowerCase()}…`}
    />
  ) : (
    <SearchableSelect
      value={value}
      onChange={onChange}
      required={required}
      className={inputClassName()}
      options={options}
      placeholder={options.length === 0 ? "No options — use + to create" : "Select…"}
    />
  );

  if (!onAdd) {
    return (
      <Field label={label} required={required}>
        {control}
      </Field>
    );
  }

  return (
    <div className="block">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="theme-subtext text-xs font-medium">
          {label}
          {required ? <span className="text-red-600"> *</span> : null}
        </span>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-medium text-[#185FA5] hover:bg-slate-50"
          title={addLabel}
        >
          <span aria-hidden className="text-sm leading-none">
            +
          </span>
          <span>{addLabel}</span>
        </button>
      </div>
      {control}
    </div>
  );
}
