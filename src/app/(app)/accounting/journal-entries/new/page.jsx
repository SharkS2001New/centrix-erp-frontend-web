"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { JournalEntryForm } from "@/components/accounting/journal-entry-form";
import { nextJournalEntryNumber } from "@/lib/accounting-shared";

export default function NewJournalEntryPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [entryNumber, setEntryNumber] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [accountRes, entryRes] = await Promise.all([
        apiRequest("/chart-of-accounts", { searchParams: { per_page: 200 } }),
        apiRequest("/journal-entries", { searchParams: { per_page: 200 } }),
      ]);
      setAccounts(accountRes.data ?? []);
      setEntries(entryRes.data ?? []);
      setEntryNumber(nextJournalEntryNumber(entryRes.data ?? []));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createEntry(payload) {
    const res = await apiRequest("/accounting/journal-entries", {
      method: "POST",
      body: payload,
    });
    return res;
  }

  async function handleDraft(payload) {
    setBusy(true);
    setError(null);
    try {
      const entry = await createEntry(payload);
      router.push(`/accounting/journal-entries/${entry.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save draft");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function handlePost(payload) {
    setBusy(true);
    setError(null);
    try {
      const entry = await createEntry(payload);
      await apiRequest(`/accounting/journal-entries/${entry.id}/post`, { method: "POST" });
      router.push(`/accounting/journal-entries/${entry.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not post entry");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  return (
    <CatalogPageShell
      title="New Journal Entry"
      subtitle="Accounting > Journal Entries > New"
      actions={
        <Link href="/accounting/journal-entries" className="text-sm font-medium text-[#185FA5] hover:underline">
          Back to list
        </Link>
      }
    >
      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <JournalEntryForm
          initial={{ entry_number: entryNumber }}
          accounts={accounts}
          onSubmitDraft={handleDraft}
          onSubmitPost={handlePost}
          busy={busy}
          error={error}
        />
      )}
    </CatalogPageShell>
  );
}
