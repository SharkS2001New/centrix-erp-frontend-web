"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { PrimaryButton } from "@/components/catalog/catalog-shared";

const PROVIDER_LABELS = {
  quickbooks: "QuickBooks Online",
};

export function ExternalAccountingIntegrationPanel({ provider = "quickbooks", saving, setMessage, setError }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const label = PROVIDER_LABELS[provider] ?? provider;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/accounting/integration/status");
      setStatus(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `Failed to load ${label} status`);
    } finally {
      setLoading(false);
    }
  }, [label, setError]);

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
      setError(e instanceof ApiError ? e.message : `Failed to connect ${label}`);
    } finally {
      setWorking(false);
    }
  }

  async function disconnect() {
    setWorking(true);
    setError(null);
    try {
      await apiRequest("/accounting/quickbooks/disconnect", { method: "POST" });
      setMessage(`${label} disconnected.`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `Failed to disconnect ${label}`);
    } finally {
      setWorking(false);
    }
  }

  async function processQueue() {
    setWorking(true);
    setError(null);
    try {
      const res = await apiRequest("/accounting/export-queue/process", {
        method: "POST",
        body: { provider },
      });
      setMessage(`Export queue processed: ${res.exported ?? 0} exported, ${res.failed ?? 0} failed.`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to process export queue");
    } finally {
      setWorking(false);
    }
  }

  const connected = status?.connection?.status === "connected" && status?.connection?.provider === provider;
  const quickbooksMode = status?.quickbooks_mode ?? "stub";
  const accountingMode = status?.accounting_mode ?? "internal";
  const quickbooksLive = quickbooksMode === "live";

  return (
    <div className="theme-subtext space-y-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-3 text-sm">
      {loading ? (
        <p>Loading {label} status…</p>
      ) : (
        <>
          <p>
            Ledger mode: <strong className="theme-heading">{accountingMode}</strong>
            {provider === "quickbooks" ? (
              <>
                {" "}
                · QuickBooks integration:{" "}
                <strong className="theme-heading">{quickbooksLive ? "Live" : "Stub (credentials missing)"}</strong>
              </>
            ) : null}
          </p>
          {!quickbooksLive && provider === "quickbooks" ? (
            <p className="text-xs">
              Add QuickBooks OAuth client ID and secret in server environment variables to enable live
              connection. Stub mode lets you test export queue behaviour without calling Intuit.
            </p>
          ) : null}
          <p>
            Status:{" "}
            <strong className="theme-heading">{connected ? "Connected" : "Not connected"}</strong>
            {status?.pending_exports ? (
              <span> · {status.pending_exports} journal(s) waiting to export</span>
            ) : null}
          </p>
          {provider !== "quickbooks" ? (
            <p className="text-xs">Only QuickBooks Online is supported for external accounting.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {connected ? (
              <button
                type="button"
                disabled={working || saving}
                onClick={disconnect}
                className="rounded-lg border border-[var(--theme-border)] px-3 py-1.5 text-xs font-medium"
              >
                Disconnect {label}
              </button>
            ) : (
              <PrimaryButton type="button" showIcon={false} disabled={working || saving} onClick={connect}>
                Connect {label}
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
        </>
      )}
    </div>
  );
}
