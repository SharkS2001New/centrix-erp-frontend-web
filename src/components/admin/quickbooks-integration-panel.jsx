"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { PrimaryButton } from "@/components/catalog/catalog-shared";

export function QuickBooksIntegrationPanel({ saving, setMessage, setError }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/accounting/integration/status");
      setStatus(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load QuickBooks status");
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    load();
  }, [load]);

  async function connect() {
    setWorking(true);
    setError(null);
    try {
      const res = await apiRequest("/accounting/quickbooks/connect-url");
      if (res.authorization_url) {
        window.location.href = res.authorization_url;
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to start QuickBooks connection");
    } finally {
      setWorking(false);
    }
  }

  async function disconnect() {
    setWorking(true);
    setError(null);
    try {
      await apiRequest("/accounting/quickbooks/disconnect", { method: "POST" });
      setMessage("QuickBooks disconnected.");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to disconnect QuickBooks");
    } finally {
      setWorking(false);
    }
  }

  async function processQueue() {
    setWorking(true);
    setError(null);
    try {
      const res = await apiRequest("/accounting/export-queue/process", { method: "POST" });
      setMessage(`Export queue processed: ${res.exported ?? 0} exported, ${res.failed ?? 0} failed.`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to process export queue");
    } finally {
      setWorking(false);
    }
  }

  const connected = status?.connection?.status === "connected";

  return (
    <div className="theme-subtext space-y-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-3 text-sm">
      {loading ? (
        <p>Loading QuickBooks status…</p>
      ) : (
        <>
          <p>
            Status:{" "}
            <strong className="text-slate-900">{connected ? "Connected" : "Not connected"}</strong>
            {status?.pending_exports ? (
              <span> · {status.pending_exports} journal(s) waiting to export</span>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-2">
            {connected ? (
              <button
                type="button"
                disabled={working || saving}
                onClick={disconnect}
                className="rounded-lg border border-[var(--theme-border)] px-3 py-1.5 text-xs font-medium"
              >
                Disconnect QuickBooks
              </button>
            ) : (
              <PrimaryButton type="button" showIcon={false} disabled={working || saving} onClick={connect}>
                Connect QuickBooks
              </PrimaryButton>
            )}
            <button
              type="button"
              disabled={working || saving}
              onClick={processQueue}
              className="rounded-lg border border-[var(--theme-border)] px-3 py-1.5 text-xs font-medium"
            >
              Process export queue
            </button>
            <a
              href="/accounting/export-queue"
              className="rounded-lg border border-[var(--theme-border)] px-3 py-1.5 text-xs font-medium"
            >
              View queue
            </a>
            <a
              href="/accounting/account-mappings"
              className="rounded-lg border border-[var(--theme-border)] px-3 py-1.5 text-xs font-medium"
            >
              Map accounts
            </a>
          </div>
          <p className="text-xs">
            When external accounting is enabled, sales and till journals are queued for export instead of posting to
            the built-in ledger. Map your chart of accounts to QuickBooks accounts before exporting.
          </p>
        </>
      )}
    </div>
  );
}
