"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  CatalogPageShell,
  Field,
  FormDrawer,
  PrimaryButton,
  SearchInput,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SHELL_CLASS,
  TABLE_BODY_ROW_CLASS,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { HrSearchableSelect } from "@/components/hr/hr-searchable-select";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { exportColumnsFromHrCrud } from "@/lib/catalog-list-exports";

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
  loadExtra,
  listSearchParams,
  onSaved,
  drawerWide = false,
  addButtonLabel = "Add new",
  drawerCreateTitle,
  renderRowActions,
  exportEnabled = true,
  exportFilename,
}) {
  const { user, capabilities } = useAuth();
  const organizationId = user?.organization_id ?? capabilities?.organization_id;

  const [rows, setRows] = useState([]);
  const [extra, setExtra] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const extraPromise = loadExtra
        ? loadExtra().catch(() => ({}))
        : Promise.resolve({});
      const [res, extraData] = await Promise.all([
        apiRequest(apiPath, {
          searchParams: { per_page: 200, ...(listSearchParams ?? {}) },
        }),
        extraPromise,
      ]);
      setRows(res.data ?? []);
      setExtra(extraData ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [apiPath, listSearchParams, loadExtra]);

  const tableExtra = useMemo(
    () => ({ employees: [], ...extra }),
    [extra],
  );

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!searchFilter || !search.trim()) return rows;
    return rows.filter((r) => searchFilter(r, search.trim().toLowerCase()));
  }, [rows, search, searchFilter]);

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
        await apiRequest(apiPath, { method: "POST", body });
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
    if (!confirm("Delete this record?")) return;
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
  const exportColumns = useMemo(() => exportColumnsFromHrCrud(columns), [columns]);

  const content = (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {embedded && title ? (
          <div>
            <h2 className="text-[15px] font-medium text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
          </div>
        ) : !embedded && title ? (
          <h2 className="text-[15px] font-medium text-slate-900">{title}</h2>
        ) : (
          <span />
        )}
        {searchFilter ? (
          <SearchInput value={search} onChange={setSearch} placeholder="Search…" className="max-w-xs" />
        ) : embedded ? null : (
          <span />
        )}
        <PrimaryButton type="button" onClick={openCreate}>
          {addButtonLabel}
        </PrimaryButton>
        {embedded && exportEnabled && exportColumns.length > 0 ? (
          <CatalogListExport
            title={title ?? "Records"}
            filename={exportFilename ?? title}
            apiPath={apiPath}
            columns={exportColumns}
            totalCount={rows.length}
            getSearchParams={() => ({ per_page: 200, ...(listSearchParams ?? {}) })}
            disabled={loading}
          />
        ) : null}
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
                  <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-slate-500">
                    {emptyLabel}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={getRowKey(row)} className={TABLE_BODY_ROW_CLASS}>
                    {columns.map((c) => (
                      <td key={c.key} className="px-4 py-3 text-slate-800">
                        {c.render ? c.render(row, tableExtra) : row[c.key] ?? "—"}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right">
                      {renderRowActions ? renderRowActions(row, { reload: load }) : null}
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
          {renderFormFields(form, setForm, { ...tableExtra, editingRow: editing })}
        </FormDrawer>
      )}
    </>
  );

  if (embedded) {
    return <div className="space-y-4">{content}</div>;
  }

  return (
    <CatalogPageShell
      title={title}
      subtitle={subtitle}
      action={
        exportEnabled && exportColumns.length > 0 ? (
          <CatalogListExport
            title={title ?? "Records"}
            filename={exportFilename ?? title}
            apiPath={apiPath}
            columns={exportColumns}
            totalCount={rows.length}
            getSearchParams={() => ({ per_page: 200, ...(listSearchParams ?? {}) })}
            disabled={loading}
          />
        ) : null
      }
    >
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
}) {
  const useSearchable = searchable && options.length > 0;

  return (
    <Field label={label}>
      {useSearchable ? (
        <HrSearchableSelect
          value={value}
          onChange={onChange}
          options={options}
          required={required}
          placeholder={placeholder ?? `Search ${label.toLowerCase()}…`}
        />
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className={inputClassName()}
        >
          <option value="">Select…</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
