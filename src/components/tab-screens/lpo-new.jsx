"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  fetchSuppliersCached,
  fetchUomsCached,
  fetchVatsCached,
} from "@/lib/reference-data-cache";
import { LpoFormFields, LpoFormShell } from "@/components/lpo/lpo-form";
import { buildLpoFullBody, EMPTY_LPO_FORM, isLpoHeaderComplete } from "@/components/lpo/lpo-shared";
import { formDraftKey } from "@/stores/form-drafts";
import { useFormDraft } from "@/hooks/use-form-draft";

export function LpoNewScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const presetSupplier = searchParams.get("supplier_id");

  const [form, setForm] = useState(() => ({
    ...EMPTY_LPO_FORM,
    supplier_id: presetSupplier ? String(presetSupplier) : "",
  }));
  const [suppliers, setSuppliers] = useState([]);
  const [branchAddress, setBranchAddress] = useState("");
  const [uoms, setUoms] = useState([]);
  const [vats, setVats] = useState([]);
  const [activeTab, setActiveTab] = useState("header");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);
  const vatById = useMemo(() => new Map(vats.map((v) => [v.id, v])), [vats]);

  const isBaseline = useCallback(
    (value) => {
      const baseline = {
        ...EMPTY_LPO_FORM,
        supplier_id: presetSupplier ? String(presetSupplier) : "",
      };
      const normalize = (v) => ({
        ...v,
        delivery_address: v?.delivery_address || "",
      });
      return JSON.stringify(normalize(value)) === JSON.stringify(normalize(baseline));
    },
    [presetSupplier],
  );

  const { clearDraft } = useFormDraft({
    draftKey: formDraftKey("lpo", "new"),
    value: form,
    setValue: setForm,
    isBaseline,
  });

  useEffect(() => {
    if (!branchAddress) return;
    setForm((f) => {
      if (String(f.delivery_address ?? "").trim()) return f;
      return { ...f, delivery_address: branchAddress };
    });
  }, [branchAddress]);

  useEffect(() => {
    const branchId = user?.branch_id;
    const orgId = user?.organization_id;
    Promise.all([
      fetchSuppliersCached(orgId),
      fetchUomsCached(orgId),
      fetchVatsCached(orgId),
      branchId
        ? apiRequest(`/branches/${branchId}`).catch(() => null)
        : apiRequest("/branches", { searchParams: { per_page: 1 } }).then((r) => r.data?.[0]),
    ])
      .then(([suppliersData, uomsData, vatsData, branch]) => {
        setSuppliers(suppliersData ?? []);
        setUoms(uomsData ?? []);
        setVats(vatsData ?? []);
        const addr = String(branch?.branch_address ?? "").trim();
        if (addr) {
          setBranchAddress(addr);
          setForm((f) =>
            String(f.delivery_address ?? "").trim() ? f : { ...f, delivery_address: addr },
          );
        }
      })
      .catch(() => setFormError("Failed to load form data."));
  }, [user?.branch_id, user?.organization_id]);

  async function save() {
    if (!isLpoHeaderComplete(form)) {
      setFormError("Complete the LPO header before saving.");
      setActiveTab("header");
      return;
    }
    const body = buildLpoFullBody(form);
    if (body.lines.length === 0) {
      setFormError("Add at least one product on the Order items tab.");
      setActiveTab("items");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const created = await apiRequest("/lpo-mst/full", { method: "POST", body });
      const lpoNo = created?.lpo?.lpo_no ?? created?.lpo_no;
      clearDraft();
      router.push(lpoNo ? `/lpo/${lpoNo}` : "/lpo");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <LpoFormShell
      backHref="/lpo"
      backLabel="← Back to purchase orders"
      title="New purchase order"
      subtitle="Complete the LPO header, then add items by searching products"
    >
      <LpoFormFields
        form={form}
        onChange={setForm}
        suppliers={suppliers}
        uomById={uomById}
        vatById={vatById}
        branchAddress={branchAddress}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        cancelHref="/lpo"
        saving={saving}
        headerError={formError}
        onHeaderError={setFormError}
        onSaveLpo={save}
      />
    </LpoFormShell>
  );
}
