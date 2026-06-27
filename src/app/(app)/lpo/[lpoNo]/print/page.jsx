"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { mergeProcurementSettings } from "@/lib/procurement-settings";
import { LpoPrintDocument } from "@/components/lpo/lpo-print-document";

export default function LpoPrintPage() {
  const params = useParams();
  const lpoNo = params.lpoNo;
  const { user, capabilities, generalSettings } = useAuth();
  const [data, setData] = useState(null);
  const [buyer, setBuyer] = useState({});
  const [organization, setOrganization] = useState(null);
  const [supplier, setSupplier] = useState(null);
  const [printSettings, setPrintSettings] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest(`/lpo-mst/${lpoNo}/summary`);
      setData(res);

      const orgId = capabilities?.organization_id;
      const branchId = user?.branch_id;
      const supplierId = res?.lpo?.supplier_id;

      const [org, branch, supplierRes, procurementRes] = await Promise.all([
        orgId ? apiRequest(`/organizations/${orgId}`).catch(() => null) : Promise.resolve(null),
        branchId ? apiRequest(`/branches/${branchId}`).catch(() => null) : Promise.resolve(null),
        supplierId ? apiRequest(`/suppliers/${supplierId}`).catch(() => null) : Promise.resolve(null),
        apiRequest("/erp/settings/procurement").catch(() => null),
      ]);

      if (org) setOrganization(org);
      if (supplierRes) setSupplier(supplierRes);
      if (procurementRes?.procurement) {
        setPrintSettings(mergeProcurementSettings({ procurement: procurementRes.procurement }));
      } else {
        setPrintSettings(mergeProcurementSettings(capabilities?.module_settings));
      }

      if (branch) {
        setBuyer({
          name: org?.org_name,
          address: branch.branch_address,
          phone: branch.branch_phone ?? branch.phone,
          email: branch.branch_email ?? branch.email,
          tax_pin: branch.tax_pin ?? branch.kra_pin ?? org?.org_pin,
          po_box: branch.po_box,
        });
      } else if (org) {
        setBuyer({
          name: org.org_name,
          address: org.org_address,
          phone: org.primary_tel,
          email: org.org_email,
          tax_pin: org.org_pin,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load LPO");
    }
  }, [lpoNo, user?.branch_id, capabilities?.organization_id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (data && typeof window !== "undefined") {
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
  }, [data]);

  if (error) {
    return <p className="p-8 text-red-600">{error}</p>;
  }

  if (!data?.lpo) {
    return <p className="p-8 text-slate-500">Loading…</p>;
  }

  return (
    <LpoPrintDocument
      lpo={data.lpo}
      lines={data.lines ?? []}
      buyer={buyer}
      organization={organization}
      supplier={supplier}
      printedBy={user?.full_name ?? user?.username}
      printSettings={printSettings}
      generalSettings={generalSettings()}
    />
  );
}
