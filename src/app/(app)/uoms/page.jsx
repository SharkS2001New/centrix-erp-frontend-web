"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { isSinglePieceUom, uomConversionFactor } from "@/lib/stock-uom";
import {
  ActiveBadge,
  CatalogPageShell,
  Field,
  FilterSelect,
  FormDrawer,
  IconButton,
  inputClassName,
  PencilIcon,
  PrimaryButton,
  SearchInput,
  TrashIcon,
} from "@/components/catalog/catalog-shared";

const UOM_TYPE_OPTIONS = [
  { value: "piece", label: "piece — count" },
  { value: "carton", label: "carton — count" },
  { value: "bag", label: "bag — count" },
  { value: "kg", label: "kg — weight" },
  { value: "g", label: "g — weight" },
  { value: "l", label: "l — volume" },
  { value: "ml", label: "ml — volume" },
  { value: "m", label: "m — length" },
  { value: "cm", label: "cm — length" },
];

const TYPE_CATEGORY_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "count", label: "Count" },
  { value: "weight", label: "Weight" },
  { value: "volume", label: "Volume" },
  { value: "length", label: "Length" },
];

const PACK_FILTER_OPTIONS = [
  { value: "all", label: "All units" },
  { value: "single", label: "Single (×1)" },
  { value: "pack", label: "Packs (×>1)" },
];

const EMPTY_FORM = {
  full_name: "",
  uom_type: "piece",
  conversion_factor: "1",
  is_active: true,
};

function uomCategory(uomType) {
  const t = String(uomType ?? "").toLowerCase();
  if (["piece", "pcs", "carton", "bag", "box", "unit", "count", "dozen"].includes(t)) {
    return "count";
  }
  if (["kg", "g", "gram", "kilogram", "tonne", "lb"].includes(t)) return "weight";
  if (["l", "litre", "liter", "ml", "millilitre", "milliliter"].includes(t)) return "volume";
  if (["m", "cm", "mm", "meter", "metre", "length"].includes(t)) return "length";
  return "other";
}

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

function ConversionPill({ value }) {
  const n = Number(value ?? 1);
  const text = Number.isInteger(n) ? String(n) : n.toLocaleString("en-KE", { maximumFractionDigits: 4 });
  return (
    <span className="inline-flex min-w-[40px] items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 font-mono text-sm font-medium text-slate-800">
      {text}
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

function ConversionFactorGuide({ conversionFactor, unitName }) {
  const name = unitName?.trim() || "this unit";
  const factor = uomConversionFactor(conversionFactor);
  const isSingle = factor === 1;

  return (
    <div className="rounded-lg border border-[#B6D4F0] bg-[#F5FAFF] p-4 text-xs leading-relaxed text-slate-700">
      <p className="font-medium text-slate-900">How units work in stock</p>
      <p className="mt-2">
        Stock is stored as individual pieces. The conversion factor tells the system how many pieces
        are in one {name.toLowerCase()} when you receive, sell, or count stock.
      </p>
      {isSingle ? (
        <p className="mt-2 text-slate-600">
          <strong>Factor 1</strong> — one {name.toLowerCase()} is one piece. Use this for pieces,
          each, kg, litres, and other units you count one at a time.
        </p>
      ) : (
        <p className="mt-2 text-slate-600">
          <strong>Factor {factor}</strong> — one {name.toLowerCase()} contains{" "}
          <span className="font-mono">{factor}</span> pieces. Receiving 2 {name.toLowerCase()}s adds{" "}
          <span className="font-mono">{2 * factor}</span> pieces to stock.
        </p>
      )}
    </div>
  );
}

export default function UomsPage() {
  const [uoms, setUoms] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [packFilter, setPackFilter] = useState("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [uomRes, prodRes] = await Promise.all([
        apiRequest("/uoms", { searchParams: { per_page: 200 } }),
        apiRequest("/products", { searchParams: { per_page: 200 } }),
      ]);
      setUoms(uomRes.data ?? []);
      setProducts(prodRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load units of measure");
    } finally {
      setLoading(false);
    }
  }, []);

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
      if (q && !u.full_name?.toLowerCase().includes(q) && !u.uom_type?.toLowerCase().includes(q)) {
        return false;
      }
      if (typeFilter !== "all" && uomCategory(u.uom_type) !== typeFilter) return false;
      if (packFilter === "single" && !isSinglePieceUom(u)) return false;
      if (packFilter === "pack" && isSinglePieceUom(u)) return false;
      return true;
    });
  }, [uoms, search, typeFilter, packFilter]);

  const formTitle = drawerMode === "create" ? "Add UOM" : "Edit UOM";
  const formFactor = uomConversionFactor(form.conversion_factor);

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
      full_name: uom.full_name ?? "",
      uom_type: uom.uom_type ?? "piece",
      conversion_factor: String(uom.conversion_factor ?? 1),
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
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveForm(e) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    const conversionFactor = parseFloat(form.conversion_factor);
    const body = {
      full_name: form.full_name.trim(),
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
    if (!window.confirm(msg)) return;
    try {
      await apiRequest(`/uoms/${uom.id}`, { method: "DELETE" });
      if (editingId === uom.id) closeDrawer();
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  return (
    <CatalogPageShell
      title="Units of measure"
      subtitle="Set how many pieces are in each unit — use 1 for single items, higher numbers for packs"
      action={<PrimaryButton onClick={openCreateDrawer}>Add UOM</PrimaryButton>}
      toolbar={
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search units…"
            className="max-w-sm"
          />
          <FilterSelect
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={TYPE_CATEGORY_OPTIONS}
          />
          <FilterSelect
            value={packFilter}
            onChange={(e) => setPackFilter(e.target.value)}
            options={PACK_FILTER_OPTIONS}
          />
        </div>
      }
    >
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading units…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <th className="px-4 py-2.5">Full name</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Conversion factor</th>
                  <th className="px-4 py-2.5">Products</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="w-[90px] px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                      No units match your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((uom) => {
                    const count = productCountByUom.get(uom.id) ?? 0;
                    return (
                      <tr
                        key={uom.id}
                        className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">{uom.full_name}</td>
                        <td className="px-4 py-3">
                          <UomTypeBadge uomType={uom.uom_type} />
                        </td>
                        <td className="px-4 py-3">
                          <ConversionPill value={uom.conversion_factor} />
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
        <Field label="Full name">
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => updateField("full_name", e.target.value)}
            required
            className={inputClassName()}
            placeholder="e.g. Piece, Carton (12s)"
          />
        </Field>
        <Field label="Type">
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
        <ConversionFactorGuide
          conversionFactor={form.conversion_factor}
          unitName={form.full_name}
        />
        <Field label="Conversion factor">
          <input
            type="number"
            value={form.conversion_factor}
            onChange={(e) => updateField("conversion_factor", e.target.value)}
            required
            min="0.001"
            step="any"
            className={`${inputClassName()} font-mono`}
          />
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            {formFactor === 1
              ? "Use 1 when one unit equals one piece (e.g. piece, each, 1 kg)."
              : `Pieces inside one ${form.full_name?.trim() || "pack"}. Receiving 1 unit multiplies stock by ${formFactor}.`}
          </p>
        </Field>
        <Toggle label="Active" checked={form.is_active} onChange={(v) => updateField("is_active", v)} />
      </FormDrawer>
    </CatalogPageShell>
  );
}
