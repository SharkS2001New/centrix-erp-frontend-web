"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { CreditNoteForm } from "@/components/sales/credit-note-form";
import { isReturnPending } from "@/components/sales/customer-returns-shared";

export function SalesCreditNotesIdEditScreen() {
  const params = useParams();
  const id = params.id;
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiRequest(`/credit-notes/${id}`)
      .then(setRow)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load credit note"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="-m-6 p-6 md:-m-8 md:p-8">
        <p className="text-sm text-slate-500">Loading credit note…</p>
      </div>
    );
  }

  if (error || !row) {
    return (
      <div className="-m-6 p-6 md:-m-8 md:p-8">
        <p className="text-sm text-red-600">{error ?? "Credit note not found."}</p>
        <Link
          href="/sales/credit-notes"
          className="mt-3 inline-block text-sm text-[#185FA5] hover:underline"
        >
          ← Back to credit notes
        </Link>
      </div>
    );
  }

  if (!isReturnPending(row.status)) {
    return (
      <div className="-m-6 p-6 md:-m-8 md:p-8">
        <p className="text-sm text-slate-600">Only pending credit notes can be edited.</p>
        <Link
          href="/sales/credit-notes"
          className="mt-3 inline-block text-sm text-[#185FA5] hover:underline"
        >
          ← Back to credit notes
        </Link>
      </div>
    );
  }

  return (
    <div className="theme-workspace min-h-full">
      <CreditNoteForm
        editing={row}
        backHref="/sales/credit-notes"
        backLabel="← Back to credit notes"
      />
    </div>
  );
}
