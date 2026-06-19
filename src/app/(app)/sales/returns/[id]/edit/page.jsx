"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { CustomerReturnForm } from "@/components/sales/customer-return-form";
import { isReturnPending } from "@/components/sales/customer-returns-shared";

export default function EditCustomerReturnPage() {
  const params = useParams();
  const id = params.id;
  const [row, setRow] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiRequest(`/customer-returns/${id}`)
      .then(setRow)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load return"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="-m-6 p-6 md:-m-8 md:p-8">
        <p className="text-sm text-slate-500">Loading return…</p>
      </div>
    );
  }

  if (error || !row) {
    return (
      <div className="-m-6 p-6 md:-m-8 md:p-8">
        <p className="text-sm text-red-600">{error ?? "Return not found."}</p>
        <Link href="/sales/returns" className="mt-3 inline-block text-sm text-[#185FA5] hover:underline">
          ← Back to returns
        </Link>
      </div>
    );
  }

  if (!isReturnPending(row.status)) {
    return (
      <div className="-m-6 p-6 md:-m-8 md:p-8">
        <p className="text-sm text-slate-600">Only pending returns can be edited.</p>
        <Link href="/sales/returns" className="mt-3 inline-block text-sm text-[#185FA5] hover:underline">
          ← Back to returns
        </Link>
      </div>
    );
  }

  return (
    <div className="theme-workspace min-h-full">
      <CustomerReturnForm
        editing={row}
        backHref="/sales/returns"
        backLabel="← Back to returns"
      />
    </div>
  );
}
