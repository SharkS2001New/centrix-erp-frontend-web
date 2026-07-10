"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { fetchProductCatalogCached } from "@/lib/catalog-cache";
import { useAuth } from "@/contexts/auth-context";
import {
  defaultSmallLabelForType,
  uomCategory,
  uomConversionSummary,
  uomFromForm,
  uomHierarchyChain,
  uomHasMiddlePack,
  uomIsFullPackageOnly,
  uomStockReportExamples,
  uomUsesSmallPackaging,
  UOM_TYPE_FILTER_OPTIONS,
  UOM_TYPE_OPTIONS,
} from "@/lib/uom-packaging";
import { formatMixedStockDisplay, isSinglePieceUom, uomConversionFactor } from "@/lib/stock-uom";
import {
  ActiveBadge,
  CatalogPageShell,
  Field,
  FilterSelect,
  FormDrawer,
  IconButton,
  inputClassName,
  PaginationBar,
  PencilIcon,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
  SearchInput,
  TABLE_BODY_ROW_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SHELL_CLASS,
  TrashIcon,
} from "@/components/catalog/catalog-shared";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { CatalogDataImportButton, filterNonEmptyImportRows } from "@/components/catalog/catalog-data-import";
import { UOM_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";
import {
  BatchActionBar,
  BatchDeleteButton,
  TableRowSelectCell,
  TableSelectAllHeader,
  runSequentialDeletes,
  usePageRowSelection,
} from "@/components/catalog/table-row-selection";

const PACK_FILTER_OPTIONS = [
  { value: "all", label: "All units" },
  { value: "single", label: "Single (×1)" },
  { value: "pack", label: "Packs (×>1)" },
];

const EMPTY_FORM = {
  measure_name: "",
  uses_small_packaging: true,
  small_packaging_label: "piece",
  has_middle_pack: false,
  middle_packaging_label: "",
  middle_factor: "",
  full_name: "",
  conversion_factor: "1",
  uom_type: "piece",
  is_active: true,
};

function UomTypeBadge({ uomType }) {
  const category = uomCategory(uomType);
  const styles = {
    count: "bg-[#E6F1FB] text-[#0C447C]",
    weight: "bg-[#EEEDFE] text-[#3C3489]",
    volume: "bg-[#E1F5EE] text-[#085041]",
    length: "bg-slate-100 text-slate-700",
    other: "bg-slate-100 text-slate-600",
  };
  const labels = {
    count: "Count",
    weight: "Weight",
    volume: "Volume",
    length: "Length",
    other: uomType || "—",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${styles[category]}`}
    >
      {labels[category]}
    </span>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <div className="flex items-center justify-between border-t border-slate-200 py-3 first:border-t-0 first:pt-0">
      <span className="text-sm text-slate-900">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition ${
          checked ? "bg-[#185FA5]" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </button>
    </div>
  );
}

function StockReportPreview({ form }) {
  const uom = uomFromForm(form);
  const examples = uomStockReportExamples(uom);
  const conversion = uomConversionSummary(uom);

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 text-xs leading-relaxed text-slate-700">
      <p className="font-medium text-emerald-900">Stock will report as</p>
      <p className="mt-1 text-slate-600">Hierarchy: {uomHierarchyChain(uom)}</p>
      {conversion ? (
        <p className="mt-1 font-medium text-emerald-800">{conversion}</p>
      ) : null}
      <ul className="mt-2 space-y-1">
        {examples.map((ex) => (
          <li key={`${ex.base}-${ex.note}`} className="font-mono text-sm text-slate-800">
            {formatMixedStockDisplay(ex.base, uom).text}
            <span className="ml-2 font-sans text-[11px] text-slate-500">({ex.note})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function UomsPage() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [uoms, setUoms] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [packFilter, setPackFilter] = useState("all");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(15);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const {
    selectedIds,
    selectedCount,
    toggleOne,
    toggleAllOnPage,
    clearSelection,
    isAllOnPageSelected,
    isSomeOnPageSelected,
  } = usePageRowSelection();

  const loadData = useCallback(async () => {
    try {
      const [uomRes, catalogProducts] = await Promise.all([
        apiRequest("/uoms", { searchParams: { per_page: 200 } }),
        fetchProductCatalogCached(user?.organization_id, { status: "all" }),
      ]);
      setUoms(uomRes.data ?? []);
      setProducts(catalogProducts ?? []);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load units of measure");
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const productCountByUom = useMemo(() => {
    const map = new Map();
    for (const p of products) {
      if (p.unit_id != null) {
        map.set(p.unit_id, (map.get(p.unit_id) ?? 0) + 1);
      }
    }
    return map;
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return uoms.filter((u) => {
      if (
        q &&
        !u.full_name?.toLowerCase().includes(q) &&
        !u.measure_name?.toLowerCase().includes(q) &&
        !u.uom_type?.toLowerCase().includes(q)
      ) {
        return false;
      }
      if (typeFilter !== "all" && uomCategory(u.uom_type) !== typeFilter) return false;
      if (packFilter === "single" && !isSinglePieceUom(u)) return false;
      if (packFilter === "pack" && isSinglePieceUom(u)) return false;
      return true;
    });
  }, [uoms, search, typeFilter, packFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, packFilter, pageSize]);

  const pageRowIds = useMemo(() => pageSlice.map((u) => u.id), [pageSlice]);
  const allOnPageSelected = isAllOnPageSelected(pageRowIds);
  const someOnPageSelected = isSomeOnPageSelected(pageRowIds);
  const uomById = useMemo(() => new Map(uoms.map((u) => [String(u.id), u])), [uoms]);

  const formTitle = drawerMode === "create" ? "Add UOM" : "Edit UOM";
  const fullPackageOnly = form.uses_small_packaging === false;
  const formFactor = fullPackageOnly ? 1 : uomConversionFactor(form.conversion_factor);
  const fullSectionNum = form.has_middle_pack ? 3 : 2;

  function openCreateDrawer() {
    setDrawerMode("create");
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(uom) {
    setDrawerMode("edit");
    setEditingId(uom.id);
    setForm({
      measure_name: uom.measure_name ?? "",
      uses_small_packaging: uomUsesSmallPackaging(uom),
      small_packaging_label: uom.small_packaging_label ?? defaultSmallLabelForType(uom.uom_type),
      has_middle_pack: uomHasMiddlePack(uom),
      middle_packaging_label: uom.middle_packaging_label ?? "",
      middle_factor: uom.middle_factor != null ? String(uom.middle_factor) : "",
      full_name: uom.full_name ?? "",
      conversion_factor: String(uom.conversion_factor ?? 1),
      uom_type: uom.uom_type ?? "piece",
      is_active: uom.is_active !== false,
    });
    setFormError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setFormError(null);
  }

  function updateField(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "uom_type" && !prev.small_packaging_label) {
        next.small_packaging_label = defaultSmallLabelForType(value);
      }
      if (key === "uses_small_packaging" && value === false) {
        next.conversion_factor = "1";
        next.has_middle_pack = false;
        next.middle_packaging_label = "";
        next.middle_factor = "";
      }
      if (key === "has_middle_pack" && !value) {
        next.middle_packaging_label = "";
        next.middle_factor = "";
      }
      return next;
    });
  }

  async function saveForm(e) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    const fullPackageOnlySave = form.uses_small_packaging === false;
    const conversionFactor = fullPackageOnlySave ? 1 : parseFloat(form.conversion_factor);
    const useMiddle =
      !fullPackageOnlySave && form.has_middle_pack && form.middle_packaging_label.trim();
    const body = {
      full_name: form.full_name.trim(),
      measure_name: form.measure_name.trim() || null,
      uses_small_packaging: !fullPackageOnlySave,
      small_packaging_label: form.small_packaging_label.trim() || defaultSmallLabelForType(form.uom_type),
      middle_packaging_label: useMiddle ? form.middle_packaging_label.trim() : null,
      middle_factor:
        useMiddle && form.middle_factor !== "" ? parseFloat(form.middle_factor) : null,
      uom_type: form.uom_type.trim(),
      conversion_factor: conversionFactor,
      is_base_unit: conversionFactor === 1,
      is_active: form.is_active,
    };
    try {
      if (drawerMode === "create") {
        await apiRequest("/uoms", { method: "POST", body });
      } else {
        await apiRequest(`/uoms/${editingId}`, { method: "PUT", body });
      }
      await loadData();
      closeDrawer();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteUom(uom) {
    const count = productCountByUom.get(uom.id) ?? 0;
    const msg =
      count > 0
        ? `"${uom.full_name}" is used by ${count} product(s). Delete anyway?`
        : `Delete unit "${uom.full_name}"?`;
    const ok = await confirm({
      title: "Delete unit of measure",
      message: msg,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/uoms/${uom.id}`, { method: "DELETE" });
      if (editingId === uom.id) closeDrawer();
      await loadData();
      notifySuccess(`"${uom.full_name}" deleted`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  async function deleteSelectedUoms() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    const blocked = ids
      .map((id) => {
        const uom = uomById.get(String(id));
        const count = uom ? (productCountByUom.get(uom.id) ?? 0) : 0;
        return count > 0 ? { id, name: uom?.full_name ?? id, count } : null;
      })
      .filter(Boolean);

    if (blocked.length === ids.length) {
      notifyError(
        blocked.length === 1
          ? `"${blocked[0].name}" is used by ${blocked[0].count} product(s) and cannot be deleted.`
          : "All selected units are linked to products and cannot be deleted.",
      );
      return;
    }

    const deletableIds = ids.filter(
      (id) => !blocked.some((row) => String(row.id) === String(id)),
    );

    const confirmMessage =
      blocked.length > 0
        ? `Delete ${deletableIds.length} unit${deletableIds.length === 1 ? "" : "s"}? ` +
          `${blocked.length} linked to products will be skipped. This cannot be undone.`
        : `Delete ${deletableIds.length} unit${deletableIds.length === 1 ? "" : "s"}? This cannot be undone.`;

    const ok = await confirm({
      title: "Delete selected units",
      message: confirmMessage,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    setBatchDeleting(true);
    try {
      const { succeeded, failed } = await runSequentialDeletes({
        ids: deletableIds,
        deleteItem: async (id) => {
          await apiRequest(`/uoms/${id}`, { method: "DELETE" });
        },
      });
      clearSelection();
      await loadData();

      if (failed.length === 0) {
        const skippedNote =
          blocked.length > 0 ? ` (${blocked.length} skipped — linked to products)` : "";
        notifySuccess(`Deleted ${succeeded.length} unit${succeeded.length === 1 ? "" : "s"}${skippedNote}`);
        return;
      }
      if (succeeded.length === 0) {
        notifyError(failed[0]?.message ?? "Delete failed");
        return;
      }
      const names = failed
        .slice(0, 3)
        .map((f) => uomById.get(String(f.id))?.full_name ?? f.id)
        .join(", ");
      notifyError(`Deleted ${succeeded.length}; ${failed.length} failed${names ? ` (${names})` : ""}`);
    } finally {
      setBatchDeleting(false);
    }
  }

  function handlePageSizeChange(nextSize) {
    setPageSize(nextSize);
    setPage(1);
  }

  return (
    <CatalogPageShell
      title="Units of measure"
      subtitle="Define how stock is counted — small units with optional packs, or full package only for wholesale items"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className={SECONDARY_BTN_CLASS}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <CatalogDataImportButton
            title="Import units of measure"
            description="Upload CSV or Excel with measure_name, full_name, conversion_factor, uom_type, and optional packaging labels."
            sampleHeaders={[
              "measure_name",
              "full_name",
              "uses_small_packaging",
              "small_packaging_label",
              "middle_packaging_label",
              "middle_factor",
              "conversion_factor",
              "uom_type",
              "is_active",
            ]}
            sampleRow={["Piece", "Piece", "true", "piece", "", "", "1", "piece", "true"]}
            apiPath="/uoms/import-batch"
            normalizeRows={(rows) => filterNonEmptyImportRows(rows, ["measure_name"])}
            onImported={loadData}
            importPage="uoms"
          />
          <CatalogListExport
            title="Units of measure"
            apiPath="/uoms"
            columns={UOM_EXPORT_COLUMNS}
            totalCount={uoms.length}
            getSearchParams={() => ({ per_page: 200 })}
            disabled={loading}
          />
          <PrimaryButton onClick={openCreateDrawer}>Add UOM</PrimaryButton>
        </div>
      }
      toolbar={
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search units…"
          />
          <FilterSelect
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={UOM_TYPE_FILTER_OPTIONS}
          />
          <FilterSelect
            value={packFilter}
            onChange={(e) => setPackFilter(e.target.value)}
            options={PACK_FILTER_OPTIONS}
          />
        </div>
      }
    >
      <div className={TABLE_SHELL_CLASS}>
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading units…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className={TABLE_HEAD_ROW_CLASS}>
                  <TableSelectAllHeader
                    checked={allOnPageSelected}
                    indeterminate={someOnPageSelected}
                    onChange={(checked) => toggleAllOnPage(checked, pageRowIds)}
                  />
                  <th className="px-4 py-2.5">Hierarchy</th>
                  <th className="px-4 py-2.5">Example stock</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Products</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="w-[90px] px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageSlice.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                      No units match your filters.
                    </td>
                  </tr>
                ) : (
                  pageSlice.map((uom) => {
                    const count = productCountByUom.get(uom.id) ?? 0;
                    return (
                      <tr
                        key={uom.id}
                        className={TABLE_BODY_ROW_CLASS}
                      >
                        <TableRowSelectCell
                          checked={selectedIds.has(String(uom.id))}
                          onChange={() => toggleOne(uom.id)}
                          label={`Select ${uom.full_name}`}
                        />
                        <td className="px-4 py-3 text-slate-700">
                          <span className="font-medium text-slate-900">{uomHierarchyChain(uom)}</span>
                          {uomIsFullPackageOnly(uom) ? (
                            <span className="mt-0.5 block text-xs text-amber-700">
                              Full package only — wholesale, no small unit breakdown
                            </span>
                          ) : Number(uom.conversion_factor ?? 1) > 1 ? (
                            <span className="mt-0.5 block text-xs text-slate-500">
                              1 {uom.full_name} = {uom.conversion_factor}{" "}
                              {uom.small_packaging_label ?? uom.uom_type}
                              {uomHasMiddlePack(uom)
                                ? ` · 1 ${uom.middle_packaging_label} = ${uom.middle_factor} ${uom.small_packaging_label ?? "units"}`
                                : ""}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {formatMixedStockDisplay(
                            uomStockReportExamples(uom)[0]?.base ?? 0,
                            uom,
                          ).text}
                        </td>
                        <td className="px-4 py-3">
                          <UomTypeBadge uomType={uom.uom_type} />
                        </td>
                        <td className="px-4 py-3 text-slate-700">{count}</td>
                        <td className="px-4 py-3">
                          <ActiveBadge active={uom.is_active !== false} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <IconButton label="Edit" onClick={() => openEditDrawer(uom)}>
                              <PencilIcon />
                            </IconButton>
                            <IconButton label="Delete" danger onClick={() => deleteUom(uom)}>
                              <TrashIcon />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtered.length > 0 ? (
          <PaginationBar
            page={safePage}
            totalPages={totalPages}
            total={filtered.length}
            pageSize={pageSize}
            onChange={setPage}
            onPageSizeChange={handlePageSizeChange}
          />
        ) : null}
      </div>

      <FormDrawer
        title={formTitle}
        open={drawerOpen}
        onClose={closeDrawer}
        onSubmit={saveForm}
        saving={saving}
        error={formError}
        submitLabel={drawerMode === "create" ? "Save UOM" : "Save changes"}
      >
        <Field label="Measure name (optional)">
          <input
            type="text"
            value={form.measure_name}
            onChange={(e) => updateField("measure_name", e.target.value)}
            className={inputClassName()}
            placeholder="e.g. Sugars — distinguishes same hierarchy, different packages"
          />
        </Field>

        <Toggle
          label="Use small unit breakdown (pieces, kg, litres, etc.)"
          checked={form.uses_small_packaging !== false}
          onChange={(v) => updateField("uses_small_packaging", v)}
        />
        <p className="-mt-2 text-[11px] leading-relaxed text-slate-500">
          Turn off for wholesale-only products sold in full packages only — e.g. 20L jericans with no
          retail piece count.
        </p>

        {fullPackageOnly ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Full package (stock unit)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full package name">
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => updateField("full_name", e.target.value)}
                  required
                  className={inputClassName()}
                  placeholder="e.g. Jerican, Drum, Bale"
                />
              </Field>
              <Field label="Category">
                <select
                  value={form.uom_type}
                  onChange={(e) => updateField("uom_type", e.target.value)}
                  required
                  className={inputClassName()}
                >
                  {UOM_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Stock is counted and sold in {form.full_name || "full packages"} only — each unit is 1{" "}
              {form.full_name || "package"}.
            </p>
          </>
        ) : (
          <>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          1. {form.small_packaging_label?.trim() || "Base"} unit (always 1 = this unit)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Small unit name">
            <input
              type="text"
              value={form.small_packaging_label}
              onChange={(e) => updateField("small_packaging_label", e.target.value)}
              required
              className={inputClassName()}
              placeholder="e.g. piece, kg, litres"
            />
          </Field>
          <Field label="Category">
            <select
              value={form.uom_type}
              onChange={(e) => updateField("uom_type", e.target.value)}
              required
              className={inputClassName()}
            >
              {UOM_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Toggle
          label="Use middle packs (e.g. outers, dozens between full bale and pieces)"
          checked={form.has_middle_pack}
          onChange={(v) => updateField("has_middle_pack", v)}
        />

        {form.has_middle_pack ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              2. Middle pack
            </p>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <Field label="Middle pack name">
              <input
                type="text"
                value={form.middle_packaging_label}
                onChange={(e) => updateField("middle_packaging_label", e.target.value)}
                className={inputClassName()}
                placeholder="e.g. outer, dozen"
              />
            </Field>
            <Field label={`${form.small_packaging_label || "units"} per middle pack`}>
              <input
                type="number"
                min="2"
                step="any"
                value={form.middle_factor}
                onChange={(e) => updateField("middle_factor", e.target.value)}
                className={inputClassName()}
                placeholder="e.g. 12 pieces per outer"
              />
            </Field>
          </div>
          </>
        ) : null}

        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {fullSectionNum}. Full package (optional — set factor to 1 to skip)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full package name">
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => updateField("full_name", e.target.value)}
              required
              className={inputClassName()}
              placeholder="e.g. Bag, Bale, Carton"
            />
          </Field>
          <Field label={`${form.small_packaging_label || "units"} per full package`}>
            <input
              type="number"
              value={form.conversion_factor}
              onChange={(e) => updateField("conversion_factor", e.target.value)}
              required
              min="1"
              step="any"
              className={`${inputClassName()} font-mono`}
            />
          </Field>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-500">
          {formFactor === 1
            ? `Stock counted only in ${form.small_packaging_label || "small units"} (no full package split).`
            : `1 ${form.full_name || "pack"} = ${formFactor} ${form.small_packaging_label || "units"}. e.g. 60 ${form.small_packaging_label} → 1 ${form.full_name}, 10 ${form.small_packaging_label}.`}
        </p>
          </>
        )}

        <StockReportPreview form={form} />

        <Toggle label="Active" checked={form.is_active} onChange={(v) => updateField("is_active", v)} />
      </FormDrawer>

      <BatchActionBar count={selectedCount} onClear={clearSelection}>
        <BatchDeleteButton
          count={selectedCount}
          busy={batchDeleting}
          onClick={() => void deleteSelectedUoms()}
        />
      </BatchActionBar>
    </CatalogPageShell>
  );
}
