"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { accountOptionLabel } from "@/lib/accounting-shared";
import { CatalogPageShell, PrimaryButton, SearchInput } from "@/components/catalog/catalog-shared";

export default function AccountMappingsPage() {
  const [localAccounts, setLocalAccounts] = useState([]);
  const [externalAccounts, setExternalAccounts] = useState([]);
  const [mappings, setMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [search, setSearch] = useState("");
  const [qboConnected, setQboConnected] = useState(false);

  const [provider, setProvider] = useState("quickbooks");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const statusRes = await apiRequest("/accounting/integration/status");
      const activeProvider = statusRes?.accounting_provider || "quickbooks";
      setProvider(activeProvider);
      setQboConnected(statusRes?.connection?.status === "connected");

      const [coaRes, mapRes] = await Promise.all([
        apiRequest("/chart-of-accounts", { searchParams: { per_page: 500 } }),
        apiRequest("/accounting/account-mappings", { searchParams: { provider: activeProvider } }),
      ]);

      setLocalAccounts(coaRes.data ?? []);
      const mapByCode = {};
      for (const row of mapRes.data ?? []) {
        mapByCode[row.local_account_code] = row;
      }
      setMappings(mapByCode);

      if (statusRes?.connection?.status === "connected" && activeProvider === "quickbooks") {
        try {
          const qboRes = await apiRequest("/accounting/quickbooks/accounts");
          setExternalAccounts(qboRes.data ?? []);
        } catch {
          setExternalAccounts([]);
        }
      } else {
        setExternalAccounts([]);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load account mappings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return localAccounts;
    return localAccounts.filter((row) =>
      `${row.account_code} ${row.account_name} ${row.account_type ?? ""}`.toLowerCase().includes(q),
    );
  }, [localAccounts, search]);

  function setMapping(code, externalId) {
    const account = externalAccounts.find((row) => row.id === externalId);
    setMappings((prev) => {
      const next = { ...prev };
      if (!externalId) {
        delete next[code];
        return next;
      }
      next[code] = {
        local_account_code: code,
        external_account_id: externalId,
        external_account_name: account?.name ?? prev[code]?.external_account_name ?? "",
      };
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload = Object.values(mappings).filter(Boolean);
      await apiRequest("/accounting/account-mappings", {
        method: "PUT",
        body: { provider, mappings: payload },
      });
      setMessage(`Saved ${payload.length} account mapping(s).`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save mappings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CatalogPageShell
      title="Account Mappings"
      subtitle="Accounting > Map local GL to QuickBooks"
      actions={
        <PrimaryButton type="button" showIcon={false} disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save mappings"}
        </PrimaryButton>
      }
    >
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}
      {message ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      {!qboConnected ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Connect QuickBooks under{" "}
          <Link href="/admin/settings" className="font-medium underline">
            Admin → Settings → Finance
          </Link>{" "}
          to load external accounts for mapping.
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search local accounts…"
          className="max-w-md"
        />
        <Link href="/accounting/export-queue" className="text-sm font-medium text-[#185FA5] hover:underline">
          Export queue
        </Link>
      </div>

      <div className={`overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm ${loading ? "opacity-60" : ""}`}>
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Local account</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">QuickBooks account</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredAccounts.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                  No chart of accounts found.
                </td>
              </tr>
            ) : (
              filteredAccounts.map((account) => {
                const code = account.account_code;
                const selected = mappings[code]?.external_account_id ?? "";

                return (
                  <tr key={account.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-900">{accountOptionLabel(account)}</td>
                    <td className="px-4 py-3 capitalize text-slate-600">{account.account_type}</td>
                    <td className="px-4 py-3">
                      {externalAccounts.length > 0 ? (
                        <select
                          className="theme-input w-full max-w-md rounded-lg border px-3 py-2 text-sm"
                          value={selected}
                          onChange={(e) => setMapping(code, e.target.value)}
                        >
                          <option value="">— Not mapped —</option>
                          {externalAccounts.map((ext) => (
                            <option key={ext.id} value={ext.id}>
                              {ext.name}
                              {ext.account_type ? ` (${ext.account_type})` : ""}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="theme-input w-full max-w-md rounded-lg border px-3 py-2 text-sm"
                          placeholder="External account ID"
                          value={selected}
                          onChange={(e) => setMapping(code, e.target.value)}
                        />
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </CatalogPageShell>
  );
}
