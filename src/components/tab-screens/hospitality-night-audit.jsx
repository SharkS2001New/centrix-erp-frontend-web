"use client";

import { useCallback, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { isHospitalityServiceEnabled } from "@/lib/hospitality-services";
import {
  CatalogPageShell,
  Field,
  inputClassName,
  PrimaryButton,
  SecondaryButton,
  TABLE_BODY_ROW_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SHELL_CLASS,
} from "@/components/catalog/catalog-shared";
import { HospitalityPlaceholderScreen } from "@/components/hospitality/hospitality-screens";

export function HospitalityNightAuditScreen() {
  const { capabilities } = useAuth();
  if (!isHospitalityServiceEnabled(capabilities, "night_audit")) {
    return (
      <HospitalityPlaceholderScreen title="Night audit" description="Post room nights." serviceKey="night_audit" />
    );
  }
  return <NightAuditManager />;
}

function NightAuditManager() {
  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [businessDate, setBusinessDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([
        apiRequest("/hospitality/night-audit/preview", {
          searchParams: { business_date: businessDate },
        }),
        apiRequest("/hospitality/night-audit/history"),
      ]);
      setPreview(p);
      setHistory(h?.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load night audit");
    } finally {
      setLoading(false);
    }
  }, [businessDate]);

  useTabAwareDataLoad(load);

  async function run() {
    if (!window.confirm(`Post room nights for ${businessDate}?`)) return;
    setRunning(true);
    try {
      const res = await apiRequest("/hospitality/night-audit/run", {
        method: "POST",
        body: { business_date: businessDate },
      });
      notifySuccess(`Posted ${res?.rooms_posted ?? 0} rooms · ${Number(res?.amount_posted ?? 0).toFixed(2)}`);
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Night audit failed");
    } finally {
      setRunning(false);
    }
  }

  const candidates = preview?.candidates ?? [];

  return (
    <CatalogPageShell
      title="Night audit"
      subtitle="Post one room-night charge to each open in-house folio for the business date."
    >
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Business date">
          <input
            type="date"
            className={inputClassName()}
            value={businessDate}
            onChange={(e) => setBusinessDate(e.target.value)}
          />
        </Field>
        <SecondaryButton onClick={() => void load()}>Preview</SecondaryButton>
        <PrimaryButton
          showIcon={false}
          disabled={running || preview?.already_run || !candidates.length}
          onClick={() => void run()}
        >
          {running ? "Running…" : "Run night audit"}
        </PrimaryButton>
      </div>

      {loading ? <p className="theme-subtext text-sm">Loading…</p> : null}

      {preview?.already_run ? (
        <p className="mb-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Already ran for this date ({preview.last_run?.rooms_posted} rooms,{" "}
          {Number(preview.last_run?.amount_posted ?? 0).toFixed(2)}).
        </p>
      ) : null}

      <p className="theme-subtext mb-2 text-sm">
        {preview?.rooms_count ?? 0} rooms · total {Number(preview?.total_amount ?? 0).toFixed(2)}
      </p>

      <div className={`${TABLE_SHELL_CLASS} mb-8`}>
        <table className="min-w-full text-sm">
          <thead>
            <tr className={TABLE_HEAD_ROW_CLASS}>
              <th className="px-3 py-2 text-left">Folio</th>
              <th className="px-3 py-2 text-left">Guest</th>
              <th className="px-3 py-2 text-left">Room</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <tr key={c.folio_id} className={TABLE_BODY_ROW_CLASS}>
                <td className="px-3 py-2">{c.folio_number}</td>
                <td className="px-3 py-2">{c.guest_name}</td>
                <td className="px-3 py-2">{c.room_number}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(c.amount).toFixed(2)}</td>
              </tr>
            ))}
            {!candidates.length ? (
              <tr>
                <td colSpan={4} className="theme-subtext px-3 py-8 text-center">
                  Nothing to post.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <h3 className="theme-heading mb-2 text-sm font-semibold">Recent runs</h3>
      <div className={TABLE_SHELL_CLASS}>
        <table className="min-w-full text-sm">
          <thead>
            <tr className={TABLE_HEAD_ROW_CLASS}>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-right">Rooms</th>
              <th className="px-3 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id} className={TABLE_BODY_ROW_CLASS}>
                <td className="px-3 py-2">{h.business_date}</td>
                <td className="px-3 py-2 text-right">{h.rooms_posted}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(h.amount_posted).toFixed(2)}</td>
              </tr>
            ))}
            {!history.length ? (
              <tr>
                <td colSpan={3} className="theme-subtext px-3 py-6 text-center">
                  No history yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </CatalogPageShell>
  );
}
