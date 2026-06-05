"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { LpoPrintDocument } from "@/components/lpo/lpo-print-document";

export default function LpoPrintPage() {
  const params = useParams();
  const lpoNo = params.lpoNo;
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [buyer, setBuyer] = useState({});
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest(`/lpo-mst/${lpoNo}/summary`);
      setData(res);
      const branchId = user?.branch_id;
      if (branchId) {
        const branch = await apiRequest(`/branches/${branchId}`).catch(() => null);
        if (branch) {
          setBuyer({
            address: branch.branch_address,
            phone: branch.branch_phone ?? branch.phone,
            email: branch.branch_email ?? branch.email,
            tax_pin: branch.tax_pin ?? branch.kra_pin,
            po_box: branch.po_box,
          });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load LPO");
    }
  }, [lpoNo, user?.branch_id]);

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

  return <LpoPrintDocument lpo={data.lpo} lines={data.lines ?? []} buyer={buyer} />;
}
