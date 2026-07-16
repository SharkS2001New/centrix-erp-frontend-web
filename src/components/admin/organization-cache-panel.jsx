"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { PlatformFormSection } from "@/components/admin/platform-form-section";
import { notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";

export function OrganizationCachePanel({ organizationId }) {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest(`/admin/organizations/${organizationId}/cache`);
      setStatus(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load cache status.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleClear() {
    const ok = await confirm({
      title: "Clear organization cache",
      message:
        "Clear cached data for this organization? Users may need to refresh their browser to pick up module or permission changes.",
      confirmLabel: "Clear cache",
      destructive: true,
    });
    if (!ok) return;

    setClearing(true);
    setError(null);
    try {
      const res = await apiRequest(`/admin/organizations/${organizationId}/cache/clear`, {
        method: "POST",
      });
      notifySuccess(res.message ?? "Organization cache cleared.");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not clear organization cache.");
    } finally {
      setClearing(false);
    }
  }

  const cacheableEntries = status?.cacheable
    ? Object.entries(status.cacheable)
    : [];

  return (
    <PlatformFormSection
      title="Organization cache"
      description="Redis caches per-organization data such as user capabilities. Clear it if users still see old modules or permissions after you save changes."
    >
      {loading ? (
        <p className="text-sm text-slate-500">Loading cache status…</p>
      ) : (
        <div className="space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Cache store</dt>
              <dd className="mt-1 font-mono text-slate-800">{status?.cache_store ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Tagged flush</dt>
              <dd className="mt-1 text-slate-800">
                {status?.redis_tags_supported ? "Supported (Redis)" : "Not available — requires Redis"}
              </dd>
            </div>
          </dl>

          {cacheableEntries.length > 0 ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Cached data</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-700">
                {cacheableEntries.map(([key, label]) => (
                  <li key={key} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="font-mono text-xs text-slate-600">{key}</span>
                    <span className="mt-0.5 block text-slate-700">{label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          ) : null}

          <button
            type="button"
            disabled={clearing || !status?.redis_tags_supported}
            onClick={handleClear}
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {clearing ? "Clearing cache…" : "Clear organization cache"}
          </button>

          {!status?.redis_tags_supported ? (
            <p className="text-xs text-amber-800">
              Set <span className="font-mono">CACHE_STORE=redis</span> on the API server to enable per-organization cache
              flush.
            </p>
          ) : null}
        </div>
      )}
    </PlatformFormSection>
  );
}
