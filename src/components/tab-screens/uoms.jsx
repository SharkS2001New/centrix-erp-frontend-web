"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { fetchProductGroupCountsCached, fetchUomsCached, invalidateReferenceResource } from "@/lib/reference-data-cache";
import { useAuth } from "@/contexts/auth-context";
import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { isHotelCatalogueContext } from "@/lib/catalog-mode";
import {
  defaultSmallLabelForType,
  hospitalityUomTypeOptions,
  HOSPITALITY_UOM_QUICK_PRESETS,
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
  SearchableSelect,
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

const RETAIL_PACK_FILTER_OPTIONS = [
  { value: "all", label: "All units" },
  { value: "single", label: "Single (×1)" },
  { value: "pack", label: "Packs (×>1)" },
];

const HOTEL_PACK_FILTER_OPTIONS = [
  { value: "all", label: "All units" },
  { value: "single", label: "Serving units (×1)" },
  { value: "pack", label: "Cases / multi-packs" },
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
  hotel_advanced_case: false,
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

export function UomsScreen() {
  const { user, capabilities } = useAuth();
  const { workspaceId } = useTabWorkspace();
  const hotelCatalogue = isHotelCatalogueContext(capabilities, workspaceId);
  const confirm = useConfirm();
  const [uoms, setUoms] = useState([]);
  const [productCountByUom, setProductCountByUom] = useState(() => new Map());
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
      const [uomsData, counts] = await Promise.all([
        fetchUomsCached(user?.organization_id),
        fetchProductGroupCountsCached(user?.organization_id),
      ]);
      setUoms(uomsData ?? []);
      setProductCountByUom(
        new Map(
          Object.entries(counts?.by_unit_id ?? {}).map(([id, n]) => [String(id), Number(n)]),
        ),
      );
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load units of measure");
    } finally {
      setLoading(false);
    }
  }, [user?.organization_id]);

  useTabAwareDataLoad(loadData);

  const refreshData = useCallback(async () => {
    setLoading(true);
    const orgId = user?.organization_id;
    invalidateReferenceResource("uoms", orgId);
    invalidateReferenceResource("product-group-counts", orgId);
    await loadData();
  }, [loadData, user?.organization_id]);

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

  const formTitle = drawerMode === "create"
    ? hotelCatalogue
      ? "Add serving unit"
      : "Add UOM"
    : hotelCatalogue
      ? "Edit serving unit"
      : "Edit UOM";
  const typeOptions = hotelCatalogue ? hospitalityUomTypeOptions() : UOM_TYPE_OPTIONS;
  const packFilterOptions = hotelCatalogue ? HOTEL_PACK_FILTER_OPTIONS : RETAIL_PACK_FILTER_OPTIONS;
  const fullPackageOnly = form.uses_small_packaging === false;
  const hotelSimpleMode = hotelCatalogue && !form.hotel_advanced_case && !fullPackageOnly;
  const formFactor = fullPackageOnly ? 1 : uomConversionFactor(form.conversion_factor);
  const fullSectionNum = form.has_middle_pack ? 3 : 2;

  function openCreateDrawer() {
    setDrawerMode("create");
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      ...(hotelCatalogue
        ? {
            full_name: "Piece",
            small_packaging_label: "piece",
            uom_type: "piece",
            conversion_factor: "1",
            hotel_advanced_case: false,
          }
        : {}),
    });
    setFormError(null);
    setDrawerOpen(true);
  }

  function applyHotelPreset(preset) {
    setForm((prev) => ({
      ...prev,
      full_name: preset.full_name,
      small_packaging_label: preset.small,
      uom_type: preset.uom_type,
      conversion_factor: "1",
      uses_small_packaging: true,
      has_middle_pack: false,
      middle_packaging_label: "",
      middle_factor: "",
      hotel_advanced_case: false,
    }));
  }

  function openEditDrawer(uom) {
    setDrawerMode("edit");
    setEditingId(uom.id);
    const factor = Number(uom.conversion_factor ?? 1);
    const advanced = hotelCatalogue && (factor > 1 || uomHasMiddlePack(uom) || uomIsFullPackageOnly(uom));
    setForm({
      measure_name: uom.measure_name ?? "",
      uses_small_packaging: uomUsesSmallPackaging(uom),
      small_packaging_label: uom.small_packaging_label ?? defaultSmallLabelForType(uom.uom_type),
      has_middle_pack: uomHasMiddlePack(uom),
      middle_packaging_label: uom.middle_packaging_label ?? "",
      middle_factor: uom.middle_factor != null ? String(uom.middle_factor) : "",
      full_name: uom.full_name ?? "",
      conversion_factor: String(uom.conversion_factor ?? 1),
      uom_type: uom.uom_type === "pcs" ? "piece" : (uom.uom_type ?? "piece"),
      is_active: uom.is_active !== false,
      hotel_advanced_case: advanced,
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
    const hotelSimple = hotelCatalogue && !form.hotel_advanced_case && form.uses_small_packaging !== false;
    const fullPackageOnlySave = form.uses_small_packaging === false;
    const conversionFactor = hotelSimple || fullPackageOnlySave ? 1 : parseFloat(form.conversion_factor);
    const useMiddle =
      !hotelSimple &&
      !fullPackageOnlySave &&
      form.has_middle_pack &&
      form.middle_packaging_label.trim();
    const name = form.full_name.trim() || form.small_packaging_label.trim();
    const body = {
      full_name: name,
      measure_name: form.measure_name.trim() || null,
      uses_small_packaging: !fullPackageOnlySave,
      small_packaging_label:
        form.small_packaging_label.trim() ||
        defaultSmallLabelForType(form.uom_type) ||
        name.toLowerCase(),
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
    const count = productCountByUom.get(String(uom.id)) ?? 0;
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
        const count = uom ? (productCountByUom.get(String(uom.id)) ?? 0) : 0;
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
      title={hotelCatalogue ? "Serving & stock units" : "Units of measure"}
      subtitle={
        hotelCatalogue
          ? "How menu items and kitchen stock are counted — plate, glass, bottle, portion, ml, kg. Cases are optional for bar crates."
          : "Define how stock is counted — small units with optional packs, or full package only for wholesale items"
      }
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshData()}
            disabled={loading}
            className={SECONDARY_BTN_CLASS}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <CatalogDataImportButton
            title={hotelCatalogue ? "Import serving units" : "Import units of measure"}
            description={
              hotelCatalogue
                ? "Upload CSV or Excel with full_name, uom_type, and conversion_factor (usually 1 for serving units)."
                : "Upload CSV or Excel with measure_name, full_name, conversion_factor, uom_type, and optional packaging labels."
            }
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
            sampleRow={
              hotelCatalogue
                ? ["", "Plate", "true", "plate", "", "", "1", "plate", "true"]
                : ["Piece", "Piece", "true", "piece", "", "", "1", "piece", "true"]
            }
            apiPath="/uoms/import-batch"
            normalizeRows={(rows) =>
              filterNonEmptyImportRows(rows, hotelCatalogue ? ["full_name"] : ["measure_name"])
            }
            onImported={loadData}
            importPage="uoms"
          />
          <CatalogListExport
            title={hotelCatalogue ? "Serving units" : "Units of measure"}
            apiPath="/uoms"
            columns={UOM_EXPORT_COLUMNS}
            totalCount={uoms.length}
            getSearchParams={() => ({ per_page: 200 })}
            disabled={loading}
          />
          <PrimaryButton onClick={openCreateDrawer}>
            {hotelCatalogue ? "Add unit" : "Add UOM"}
          </PrimaryButton>
        </div>
      }
      toolbar={
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={hotelCatalogue ? "Search serving units…" : "Search units…"}
          />
          <FilterSelect
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={UOM_TYPE_FILTER_OPTIONS}
          />
          <FilterSelect
            value={packFilter}
            onChange={(e) => setPackFilter(e.target.value)}
            options={packFilterOptions}
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
                  <th className="px-4 py-2.5">{hotelCatalogue ? "Unit" : "Hierarchy"}</th>
                  <th className="px-4 py-2.5">{hotelCatalogue ? "Stock example" : "Example stock"}</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">{hotelCatalogue ? "Menu items" : "Products"}</th>
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
                    const count = productCountByUom.get(String(uom.id)) ?? 0;
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
                              {hotelCatalogue
                                ? "Sold as whole unit only — no breakout"
                                : "Full package only — wholesale, no small unit breakdown"}
                            </span>
                          ) : Number(uom.conversion_factor ?? 1) > 1 ? (
                            <span className="mt-0.5 block text-xs text-slate-500">
                              1 {uom.full_name} = {uom.conversion_factor}{" "}
                              {uom.small_packaging_label ?? uom.uom_type}
                              {uomHasMiddlePack(uom)
                                ? ` · 1 ${uom.middle_packaging_label} = ${uom.middle_factor} ${uom.small_packaging_label ?? "units"}`
                                : ""}
                            </span>
                          ) : hotelCatalogue ? (
                            <span className="mt-0.5 block text-xs text-slate-500">
                              Serving / sell unit
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
        submitLabel={
          drawerMode === "create"
            ? hotelCatalogue
              ? "Save unit"
              : "Save UOM"
            : "Save changes"
        }
      >
        {hotelCatalogue && drawerMode === "create" ? (
          <div className="mb-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Quick add
            </p>
            <div className="flex flex-wrap gap-2">
              {HOSPITALITY_UOM_QUICK_PRESETS.map((preset) => (
                <button
                  key={preset.uom_type}
                  type="button"
                  onClick={() => applyHotelPreset(preset)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-[#185FA5] hover:text-[#185FA5]"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {!hotelSimpleMode ? (
          <Field label="Measure name (optional)">
            <input
              type="text"
              value={form.measure_name}
              onChange={(e) => updateField("measure_name", e.target.value)}
              className={inputClassName()}
              placeholder={
                hotelCatalogue
                  ? "Optional group label — e.g. Bar glassware"
                  : "e.g. Sugars — distinguishes same hierarchy, different packages"
              }
            />
          </Field>
        ) : null}

        {hotelSimpleMode ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unit name" required>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => {
                    const value = e.target.value;
                    updateField("full_name", value);
                    updateField(
                      "small_packaging_label",
                      value.trim() ? value.trim().toLowerCase() : form.small_packaging_label,
                    );
                  }}
                  required
                  className={inputClassName()}
                  placeholder="e.g. Plate, Glass, Bottle"
                />
              </Field>
              <Field label="Category">
                <SearchableSelect
                  value={form.uom_type}
                  onChange={(value) => {
                    updateField("uom_type", value);
                    const small = defaultSmallLabelForType(value);
                    if (!form.full_name.trim()) {
                      updateField("full_name", small.charAt(0).toUpperCase() + small.slice(1));
                    }
                    updateField("small_packaging_label", small);
                  }}
                  required
                  className={inputClassName()}
                  options={typeOptions}
                />
              </Field>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Menu items sell as 1 {form.full_name || "unit"} on Hotel POS. Use this for plates,
              glasses, bottles, and portions.
            </p>
            <Toggle
              label="Advanced: case / crate (multi-pack)"
              checked={Boolean(form.hotel_advanced_case)}
              onChange={(v) => updateField("hotel_advanced_case", v)}
            />
            <p className="-mt-2 text-[11px] leading-relaxed text-slate-500">
              Turn on only when stock is bought in cases (e.g. 24 bottles) and broken into singles.
            </p>
          </>
        ) : (
          <>
        <Toggle
          label={
            hotelCatalogue
              ? "Break into smaller sell units (bottles, portions, etc.)"
              : "Use small unit breakdown (pieces, kg, litres, etc.)"
          }
          checked={form.uses_small_packaging !== false}
          onChange={(v) => updateField("uses_small_packaging", v)}
        />
        <p className="-mt-2 text-[11px] leading-relaxed text-slate-500">
          {hotelCatalogue
            ? "Turn off for items sold only as a whole case on Hotel POS — e.g. a sealed crate with no single-bottle breakout."
            : "Turn off for wholesale-only products sold in full packages only — e.g. 20L jericans with no retail piece count."}
        </p>

        {fullPackageOnly ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {hotelCatalogue ? "Case / whole unit" : "Full package (stock unit)"}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label={hotelCatalogue ? "Unit name" : "Full package name"}>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => updateField("full_name", e.target.value)}
                  required
                  className={inputClassName()}
                  placeholder={hotelCatalogue ? "e.g. Case, Crate" : "e.g. Jerican, Drum, Bale"}
                />
              </Field>
              <Field label="Category">
                <SearchableSelect
                  value={form.uom_type}
                  onChange={(v) => updateField("uom_type", v)}
                  required
                  className={inputClassName()}
                  options={typeOptions}
                />
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
          <Field label={hotelCatalogue ? "Sell unit name" : "Small unit name"}>
            <input
              type="text"
              value={form.small_packaging_label}
              onChange={(e) => updateField("small_packaging_label", e.target.value)}
              required
              className={inputClassName()}
              placeholder={hotelCatalogue ? "e.g. bottle, glass, portion" : "e.g. piece, kg, litres"}
            />
          </Field>
          <Field label="Category">
            <SearchableSelect
              value={form.uom_type}
              onChange={(v) => updateField("uom_type", v)}
              required
              className={inputClassName()}
              options={typeOptions}
            />
          </Field>
        </div>

        {!hotelCatalogue ? (
          <Toggle
            label="Use middle packs (e.g. outers, dozens between full bale and pieces)"
            checked={form.has_middle_pack}
            onChange={(v) => updateField("has_middle_pack", v)}
          />
        ) : null}

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
          {fullSectionNum}. {hotelCatalogue ? "Case / multi-pack (optional)" : "Full package (optional — set factor to 1 to skip)"}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={hotelCatalogue ? "Case name" : "Full package name"}>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => updateField("full_name", e.target.value)}
              required
              className={inputClassName()}
              placeholder={hotelCatalogue ? "e.g. Case of beer" : "e.g. Bag, Bale, Carton"}
            />
          </Field>
          <Field label={`${form.small_packaging_label || "units"} per ${hotelCatalogue ? "case" : "full package"}`}>
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
            ? `Stock counted only in ${form.small_packaging_label || "small units"} (no case split).`
            : `1 ${form.full_name || "case"} = ${formFactor} ${form.small_packaging_label || "units"}.`}
        </p>
        {hotelCatalogue ? (
          <button
            type="button"
            className="text-left text-xs font-semibold text-[#185FA5] hover:underline"
            onClick={() => {
              updateField("hotel_advanced_case", false);
              updateField("conversion_factor", "1");
              updateField("has_middle_pack", false);
              updateField("uses_small_packaging", true);
              if (!form.full_name.trim() && form.small_packaging_label.trim()) {
                const small = form.small_packaging_label.trim();
                updateField("full_name", small.charAt(0).toUpperCase() + small.slice(1));
              }
            }}
          >
            ← Back to simple serving unit
          </button>
        ) : null}
          </>
        )}
          </>
        )}

        {!hotelSimpleMode ? <StockReportPreview form={form} /> : null}

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
