"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { LpoFormFields, LpoFormShell } from "@/components/lpo/lpo-form";
import { buildLpoFullBody, EMPTY_LPO_FORM, isLpoHeaderComplete } from "@/components/lpo/lpo-shared";

export default function NewLpoPage() {
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

  useEffect(() => {
    if (branchAddress && !form.delivery_address) {
      setForm((f) => ({ ...f, delivery_address: branchAddress }));
    }
  }, [branchAddress]);

  useEffect(() => {
    const branchId = user?.branch_id;
    Promise.all([
      apiRequest("/suppliers", { searchParams: { per_page: 200 } }),
      apiRequest("/uoms", { searchParams: { per_page: 200 } }),
      apiRequest("/vats", { searchParams: { per_page: 50 } }),
      branchId
        ? apiRequest(`/branches/${branchId}`).catch(() => null)
        : apiRequest("/branches", { searchParams: { per_page: 1 } }).then((r) => r.data?.[0]),
    ])
      .then(([supRes, uomRes, vatRes, branch]) => {
        setSuppliers(supRes.data ?? []);
        setUoms(uomRes.data ?? uomRes ?? []);
        setVats(vatRes.data ?? vatRes ?? []);
        const addr = branch?.branch_address?.trim();
        if (addr) setBranchAddress(addr);
      })
      .catch(() => setFormError("Failed to load form data."));
  }, [user?.branch_id]);

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
