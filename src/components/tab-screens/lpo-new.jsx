"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { tabAddTitle, useTabFormExit } from "@/hooks/use-tab-form-exit";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useGlobalBranchId } from "@/hooks/use-global-branch-id";
import {
  fetchBranchesCached,
  fetchSuppliersCached,
  fetchUomsCached,
  fetchVatsCached,
} from "@/lib/reference-data-cache";
import { LpoFormFields, LpoFormShell } from "@/components/lpo/lpo-form";
import { buildLpoFullBody, EMPTY_LPO_FORM, isLpoHeaderComplete } from "@/components/lpo/lpo-shared";
import { formDraftKey } from "@/stores/form-drafts";
import { useFormDraft } from "@/hooks/use-form-draft";

export function LpoNewScreen() {
  const { exitTo } = useTabFormExit(tabAddTitle("purchase order"));
  const searchParams = useSearchParams();
  const { user, isOrgWide } = useAuth();
  const globalBranchId = useGlobalBranchId();
  const presetSupplier = searchParams.get("supplier_id");

  const [form, setForm] = useState(() => ({
    ...EMPTY_LPO_FORM,
    supplier_id: presetSupplier ? String(presetSupplier) : "",
  }));
  const [suppliers, setSuppliers] = useState([]);
  const [branches, setBranches] = useState([]);
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
    const orgId = user?.organization_id;
    Promise.all([
      fetchSuppliersCached(orgId),
      fetchUomsCached(orgId),
      fetchVatsCached(orgId),
      fetchBranchesCached(orgId),
    ])
      .then(([suppliersData, uomsData, vatsData, branchList]) => {
        setSuppliers(suppliersData ?? []);
        setUoms(uomsData ?? []);
        setVats(vatsData ?? []);
        const list = Array.isArray(branchList) ? branchList : [];
        setBranches(list);
        const defaultBranchId = isOrgWide()
          ? globalBranchId || (list.length === 1 ? list[0].id : "")
          : user?.branch_id ?? (list.length === 1 ? list[0].id : "");
        setForm((f) => ({ ...f, branch_id: defaultBranchId ? String(defaultBranchId) : "" }));
      })
      .catch(() => setFormError("Failed to load form data."));
  }, [globalBranchId, isOrgWide, user?.branch_id, user?.organization_id]);

  useEffect(() => {
    const selected = branches.find((b) => String(b.id) === String(form.branch_id));
    setBranchAddress(String(selected?.branch_address ?? "").trim());
  }, [branches, form.branch_id]);

  async function save() {
    if (!isLpoHeaderComplete(form)) {
      setFormError("Complete the LPO header before saving.");
      setActiveTab("header");
      return;
    }
    if (branches.length > 0 && !form.branch_id) {
      setFormError("Select the branch this purchase order is for.");
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
      exitTo(lpoNo ? `/lpo/${lpoNo}` : "/lpo");
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
        branches={branches}
        canSelectBranch={isOrgWide()}
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
