"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { dataUrlToFile, SignaturePad } from "@/components/fulfillment/signature-pad";

export function FulfillmentAssignmentDialog({
  open,
  sale,
  targetStatus,
  drivers = [],
  vehicles = [],
  routes = [],
  onClose,
  onConfirm,
  busy = false,
}) {
  const routeId = sale?.route_id;
  const routeDrivers = useMemo(() => {
    if (!routeId) return drivers.filter((d) => d.is_active !== false);
    const matched = drivers.filter(
      (d) => d.is_active !== false && Number(d.default_route_id) === Number(routeId),
    );
    return matched.length ? matched : drivers.filter((d) => d.is_active !== false);
  }, [drivers, routeId]);

  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  useEffect(() => {
    if (!open) return;
    const preferred = routeDrivers[0];
    setDriverId(preferred?.id != null ? String(preferred.id) : "");
    setVehicleId(
      preferred?.default_vehicle_id != null ? String(preferred.default_vehicle_id) : "",
    );
  }, [open, routeDrivers]);

  useEffect(() => {
    if (!driverId) return;
    const driver = drivers.find((d) => String(d.id) === driverId);
    if (driver?.default_vehicle_id && !vehicleId) {
      setVehicleId(String(driver.default_vehicle_id));
    }
  }, [driverId, drivers, vehicleId]);

  if (!open) return null;

  const routeName = routes.find((r) => r.id === routeId)?.route_name;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="theme-panel w-full max-w-md rounded-xl border p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fulfillment-assign-title"
      >
        <h2 id="fulfillment-assign-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Assign delivery
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Order #{sale?.order_num ?? sale?.id} → {targetStatus}
          {routeName ? ` · Route: ${routeName}` : null}
        </p>

        <div className="mt-5 space-y-4">
          <Field label="Driver">
            <select
              className={inputClassName()}
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
            >
              <option value="">Select driver…</option>
              {routeDrivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name ?? d.driver_code}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vehicle">
            <select
              className={inputClassName()}
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
            >
              <option value="">Select vehicle…</option>
              {vehicles
                .filter((v) => v.is_active !== false)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plate_number ?? v.vehicle_name ?? v.vehicle_code}
                  </option>
                ))}
            </select>
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <PrimaryButton
            type="button"
            showIcon={false}
            disabled={busy || !driverId}
            onClick={() =>
              onConfirm({
                driver_id: Number(driverId),
                vehicle_id: vehicleId ? Number(vehicleId) : undefined,
              })
            }
          >
            {busy ? "Saving…" : "Confirm assignment"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

/**
 * Assign or change driver + vehicle on a trip chart before dispatch.
 */
export function TripAssignmentDialog({
  open,
  trip = null,
  drivers = [],
  vehicles = [],
  onClose,
  onConfirm,
  busy = false,
  title = "Assign driver & vehicle",
  description = "Select who will drive this trip chart and which vehicle to use before dispatch.",
  confirmLabel = "Save assignment",
}) {
  const activeDrivers = useMemo(
    () => drivers.filter((d) => d.is_active !== false),
    [drivers],
  );
  const activeVehicles = useMemo(
    () => vehicles.filter((v) => v.is_active !== false),
    [vehicles],
  );

  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  useEffect(() => {
    if (!open) return;
    const currentDriverId = trip?.driver_id ?? trip?.driver?.id;
    const currentVehicleId = trip?.vehicle_id ?? trip?.vehicle?.id;
    const preferredDriver =
      (currentDriverId != null && activeDrivers.find((d) => Number(d.id) === Number(currentDriverId))) ||
      activeDrivers[0];
    setDriverId(preferredDriver?.id != null ? String(preferredDriver.id) : "");
    const preferredVehicleId =
      currentVehicleId ?? preferredDriver?.default_vehicle_id ?? "";
    setVehicleId(preferredVehicleId != null && preferredVehicleId !== "" ? String(preferredVehicleId) : "");
  }, [open, trip, activeDrivers]);

  useEffect(() => {
    if (!open || !driverId || vehicleId) return;
    const driver = activeDrivers.find((d) => String(d.id) === driverId);
    if (driver?.default_vehicle_id) {
      setVehicleId(String(driver.default_vehicle_id));
    }
  }, [open, driverId, activeDrivers, vehicleId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="theme-panel w-full max-w-md rounded-xl border p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-assign-title"
      >
        <h2 id="trip-assign-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {description}
          {trip?.trip_code ? ` · ${trip.trip_code}` : null}
        </p>

        <div className="mt-5 space-y-4">
          <Field label="Driver">
            <select
              className={inputClassName()}
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
            >
              <option value="">Select driver…</option>
              {activeDrivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name ?? d.driver_code}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vehicle">
            <select
              className={inputClassName()}
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
            >
              <option value="">Select vehicle…</option>
              {activeVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate_number ?? v.vehicle_name ?? v.vehicle_code}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <PrimaryButton
            type="button"
            showIcon={false}
            disabled={busy || !driverId || !vehicleId}
            onClick={() =>
              onConfirm({
                driver_id: Number(driverId),
                vehicle_id: Number(vehicleId),
              })
            }
          >
            {busy ? "Saving…" : confirmLabel}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function emptyLineRows(items) {
  return (items ?? []).map((item) => ({
    sale_item_id: item.id,
    product_name: item.product?.product_name ?? item.product_code,
    qty_ordered: Number(item.quantity) || 0,
    qty_delivered: Number(item.quantity) || 0,
    qty_refused: 0,
    reason: "",
  }));
}

export function PodCaptureDialog({ open, sale, onClose, onConfirm, busy = false }) {
  const [signerName, setSignerName] = useState("");
  const [notes, setNotes] = useState("");
  const [lineRows, setLineRows] = useState([]);
  const [photoFile, setPhotoFile] = useState(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const [captureGps, setCaptureGps] = useState(false);
  const [gps, setGps] = useState(null);

  useEffect(() => {
    if (!open || !sale?.id) return;
    setSignerName("");
    setNotes("");
    setPhotoFile(null);
    setSignatureDataUrl(null);
    setCaptureGps(false);
    setGps(null);
    setLoadingItems(true);
    apiRequest(`/sales/${sale.id}`, { searchParams: { with_items: 1 } })
      .then((res) => setLineRows(emptyLineRows(res.items ?? res.sale?.items ?? [])))
      .catch(() => setLineRows([]))
      .finally(() => setLoadingItems(false));
  }, [open, sale?.id]);

  useEffect(() => {
    if (!open || !captureGps || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGps(null),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [open, captureGps]);

  if (!open) return null;

  function updateLine(index, patch) {
    setLineRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function handleConfirm() {
    const lines = lineRows.map((row) => ({
      sale_item_id: row.sale_item_id,
      qty_delivered: Number(row.qty_delivered) || 0,
      qty_refused: Number(row.qty_refused) || 0,
      reason: row.reason?.trim() || undefined,
    }));

    onConfirm({
      pod_captured: true,
      pod_signer_name: signerName.trim(),
      pod_notes: notes.trim() || undefined,
      trip_id: sale?.fulfillment_meta?.trip_id,
      lines,
      photo: photoFile,
      signature: dataUrlToFile(signatureDataUrl, "signature.png"),
      gps_lat: gps?.lat,
      gps_lng: gps?.lng,
      pod_captured_at: new Date().toISOString(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="theme-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
      >
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Proof of delivery</h2>
        <p className="mt-1 text-sm text-slate-500">
          Order #{sale?.order_num ?? sale?.id} — confirm delivery at customer site.
        </p>

        <div className="mt-5 space-y-4">
          <Field label="Received by">
            <input
              className={inputClassName()}
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Customer name or representative"
            />
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-900">Line items delivered</p>
            {loadingItems ? (
              <p className="text-sm text-slate-500">Loading order lines…</p>
            ) : lineRows.length === 0 ? (
              <p className="text-sm text-slate-500">No line items on this order.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Ordered</th>
                      <th className="px-3 py-2">Delivered</th>
                      <th className="px-3 py-2">Refused</th>
                      <th className="px-3 py-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineRows.map((row, index) => (
                      <tr key={row.sale_item_id} className="border-t border-slate-100">
                        <td className="px-3 py-2">{row.product_name}</td>
                        <td className="px-3 py-2">{row.qty_ordered}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            className={`${inputClassName()} w-24`}
                            value={row.qty_delivered}
                            onChange={(e) => updateLine(index, { qty_delivered: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            className={`${inputClassName()} w-24`}
                            value={row.qty_refused}
                            onChange={(e) => updateLine(index, { qty_refused: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            className={inputClassName()}
                            value={row.reason}
                            onChange={(e) => updateLine(index, { reason: e.target.value })}
                            placeholder="If partial/refused"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <Field label="Delivery photo">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className={inputClassName()}
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            />
          </Field>

          <Field label="Customer signature">
            <SignaturePad onChange={setSignatureDataUrl} />
          </Field>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={captureGps} onChange={(e) => setCaptureGps(e.target.checked)} />
            Capture GPS location
            {gps ? (
              <span className="text-xs text-slate-500">
                ({gps.lat.toFixed(5)}, {gps.lng.toFixed(5)})
              </span>
            ) : null}
          </label>

          <Field label="Notes">
            <textarea
              className={`${inputClassName()} min-h-[80px]`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional delivery notes"
            />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <PrimaryButton
            type="button"
            showIcon={false}
            disabled={busy || !signerName.trim()}
            onClick={handleConfirm}
          >
            {busy ? "Saving…" : "Confirm delivery"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
