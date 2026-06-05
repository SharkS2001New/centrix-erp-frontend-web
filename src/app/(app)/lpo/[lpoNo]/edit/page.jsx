"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { LpoFormFields, LpoFormShell } from "@/components/lpo/lpo-form";
import {
  buildLpoFullBody,
  isLpoHeaderComplete,
  lpoCanEdit,
  lpoHeaderToForm,
} from "@/components/lpo/lpo-shared";

export default function EditLpoPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const lpoNo = params.lpoNo;

  const [form, setForm] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [branchAddress, setBranchAddress] = useState("");
  const [uoms, setUoms] = useState([]);
  const [vats, setVats] = useState([]);
  const [activeTab, setActiveTab] = useState("header");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [loading, setLoading] = useState(true);

  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);
  const vatById = useMemo(() => new Map(vats.map((v) => [v.id, v])), [vats]);

  useEffect(() => {
    const branchId = user?.branch_id;
    Promise.all([
      apiRequest(`/lpo-mst/${lpoNo}/summary`),
      apiRequest("/suppliers", { searchParams: { per_page: 200 } }),
      apiRequest("/uoms", { searchParams: { per_page: 200 } }),
      apiRequest("/vats", { searchParams: { per_page: 50 } }),
      branchId
        ? apiRequest(`/branches/${branchId}`).catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([detail, supRes, uomRes, vatRes, branch]) => {
        if (!lpoCanEdit(detail.lpo)) {
          setFormError("This LPO cannot be edited after it has been sent to the supplier.");
          setForm(null);
          return;
        }
        const uomList = uomRes.data ?? uomRes ?? [];
        const uomMap = new Map(uomList.map((u) => [u.id, u]));
        setForm(lpoHeaderToForm(detail.lpo, detail.lines, uomMap));
        setSuppliers(supRes.data ?? []);
        setUoms(uomList);
        setVats(vatRes.data ?? vatRes ?? []);
        const addr = branch?.branch_address?.trim();
        if (addr) setBranchAddress(addr);
      })
      .catch(() => setFormError("Failed to load purchase order."))
      .finally(() => setLoading(false));
  }, [lpoNo, user?.branch_id]);

  async function save() {
    if (!form) return;
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
      await apiRequest(`/lpo-mst/${lpoNo}/full`, { method: "PUT", body });
      router.push(`/lpo/${lpoNo}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <LpoFormShell
      backHref={`/lpo/${lpoNo}`}
      backLabel="← Back to PO"
      title={`Edit PO-${lpoNo}`}
      subtitle="Updates lines and recalculates supplier amount owing"
    >
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : form ? (
        <LpoFormFields
          form={form}
          onChange={setForm}
          suppliers={suppliers}
          uomById={uomById}
          vatById={vatById}
          branchAddress={branchAddress}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          cancelHref={`/lpo/${lpoNo}`}
          saving={saving}
          headerError={formError}
          onHeaderError={setFormError}
          onSaveLpo={save}
        />
      ) : (
        <p className="text-sm text-red-600">{formError}</p>
      )}
    </LpoFormShell>
  );
}
