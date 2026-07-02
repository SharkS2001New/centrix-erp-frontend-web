"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { notifyError } from "@/lib/notify";

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function CreateDispatchTripDialog({ open, onClose, routes = [], defaultDate = null, defaultRouteId = "" }) {
  const router = useRouter();
  const [scheduledDate, setScheduledDate] = useState(() => defaultDate ?? isoDate());
  const [routeId, setRouteId] = useState(defaultRouteId ? String(defaultRouteId) : "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScheduledDate(defaultDate ?? isoDate());
    setRouteId(defaultRouteId ? String(defaultRouteId) : "");
    setNotes("");
  }, [open, defaultDate, defaultRouteId]);

  const submit = useCallback(async () => {
    setSaving(true);
    try {
      const trip = await apiRequest("/dispatch-trips", {
        method: "POST",
        body: {
          scheduled_date: scheduledDate,
          route_id: routeId ? Number(routeId) : null,
          notes: notes.trim() || null,
        },
      });
      onClose?.();
      router.push(`/fulfillment/trips/${trip.id}`);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to create trip");
    } finally {
      setSaving(false);
    }
  }, [scheduledDate, routeId, notes, onClose, router]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/30"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-slate-900">Create dispatch trip</h2>
        <p className="mt-1 text-sm text-slate-500">
          Start an empty trip, then assign route orders from the dispatch board or trip detail page.
        </p>
        <div className="mt-4 space-y-3">
          <Field label="Scheduled date">
            <input
              type="date"
              className={inputClassName()}
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </Field>
          <Field label="Route">
            <select
              className={inputClassName()}
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
            >
              <option value="">Select route (optional)</option>
              {routes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.route_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <textarea
              className={inputClassName()}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional trip notes"
            />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <PrimaryButton type="button" showIcon={false} disabled={saving} onClick={() => void submit()}>
            {saving ? "Creating…" : "Create trip"}
          </PrimaryButton>
        </div>
      </div>
    </>
  );
}
