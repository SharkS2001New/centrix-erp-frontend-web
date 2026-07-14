"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  CatalogPageShell,
  Field,
  FilterToolbar,
  PrimaryButton,
  SearchInput,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-shared";
import { printPickingList } from "@/components/fulfillment/picking-list-print";
import { notifyError, notifySuccess } from "@/lib/notify";
import { isDistributionOpsEnabled, isProductShelfLocationEnabled } from "@/lib/distribution-settings";
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import { mergeGeneralSettings } from "@/lib/general-settings";
import { formatTripRoutesLabel } from "@/lib/trip-routes";
import { tripStatusLabel } from "@/lib/trip-status";
import {
  buildUomByProductCode,
  fetchCatalogForProductCodes,
  formatFulfillmentQty,
  fulfillmentPickedBaseQty,
  fulfillmentPickedDisplayQty,
} from "@/lib/fulfillment-quantity";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("en-KE", { weekday: "short", month: "short", day: "numeric" });
}

function formatQty(value) {
  const n = Number(value) || 0;
  return n % 1 === 0 ? String(Math.trunc(n)) : n.toLocaleString("en-KE", { maximumFractionDigits: 2 });
}

function shortageQty(required, picked) {
  return Math.max(0, (Number(required) || 0) - (Number(picked) || 0));
}

export function MobilePickingScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepTripId = searchParams.get("trip_id");
  const { organization, generalSettings, capabilities, user } = useAuth();
  const allowed = isDistributionOpsEnabled(capabilities);
  const includeShelfLocation = isProductShelfLocationEnabled(capabilities);

  const [fromDate, setFromDate] = useState(daysAgoIso(5));
  const [toDate, setToDate] = useState(todayIso());
  const [search, setSearch] = useState("");
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTripId, setSelectedTripId] = useState(deepTripId ? String(deepTripId) : null);
  const [trip, setTrip] = useState(null);
  const [pickingList, setPickingList] = useState(null);
  const [pickerName, setPickerName] = useState("");
  const [pickedDraft, setPickedDraft] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [uoms, setUoms] = useState([]);

  const uomByProductCode = useMemo(
    () => buildUomByProductCode(catalogProducts, uoms),
    [catalogProducts, uoms],
  );

  const loadTrips = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("/dispatch-trips", {
        searchParams: { from_date: fromDate, to_date: toDate, per_page: 100 },
      });
      const rows = (res.data ?? []).filter(
        (row) =>
          !["completed", "cancelled"].includes(String(row.status ?? "")) &&
          (row.sales_count ?? row.sales?.length ?? 0) > 0,
      );
      setTrips(rows);
    } catch (e) {
      setTrips([]);
      setError(e instanceof ApiError ? e.message : "Failed to load trips");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  const loadPickingDetail = useCallback(
    async (tripId) => {
      if (!tripId) return;
      setDetailLoading(true);
      setDetailError(null);
      try {
        const [tripRes, pickRes] = await Promise.all([
          apiRequest(`/dispatch-trips/${tripId}`),
          apiRequest(`/dispatch-trips/${tripId}/picking-list`),
        ]);
        const nextPick = pickRes.picking_list ?? pickRes;
        const productCodes = (nextPick?.lines ?? []).map((line) => line.product_code);
        const { products, uoms: uomRows } = await fetchCatalogForProductCodes(
          apiRequest,
          productCodes,
          user?.organization_id,
        );
        const uomMap = buildUomByProductCode(products, uomRows);
        setTrip(tripRes);
        setPickingList(nextPick);
        setCatalogProducts(products);
        setUoms(uomRows);
        setPickerName(nextPick?.picker_name ?? user?.full_name ?? user?.username ?? "");
        setPickedDraft(
          Object.fromEntries(
            (nextPick?.lines ?? []).map((line) => [
              line.id,
              String(
                fulfillmentPickedDisplayQty(line.picked_qty ?? line.required_qty, line, uomMap),
              ),
            ]),
          ),
        );
      } catch (e) {
        setDetailError(e instanceof ApiError ? e.message : "Failed to load picking list");
        setTrip(null);
        setPickingList(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [user?.full_name, user?.username, user?.organization_id],
  );

  useEffect(() => {
    if (!allowed) return;
    void loadTrips();
  }, [allowed, loadTrips]);

  useEffect(() => {
    if (!allowed || !selectedTripId) return;
    void loadPickingDetail(selectedTripId);
  }, [allowed, selectedTripId, loadPickingDetail]);

  useEffect(() => {
    if (deepTripId) {
      setSelectedTripId(String(deepTripId));
    }
  }, [deepTripId]);

  const filteredTrips = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trips;
    return trips.filter((row) => {
      const route = formatTripRoutesLabel(row).toLowerCase();
      return (
        String(row.trip_code ?? "").toLowerCase().includes(q) ||
        route.includes(q) ||
        String(row.driver?.full_name ?? "").toLowerCase().includes(q) ||
        String(row.vehicle?.plate_number ?? "").toLowerCase().includes(q)
      );
    });
  }, [trips, search]);

  const pickLines = pickingList?.lines ?? [];
  const pickingEditable = pickingList?.status === "open" || pickingList?.status === "completed";
  const totalShortage = pickLines.reduce((sum, line) => {
    const required = Number(line.required_qty) || 0;
    const picked = fulfillmentPickedBaseQty(
      pickedDraft[line.id] ?? line.picked_qty,
      line,
      uomByProductCode,
    );
    return sum + shortageQty(required, picked);
  }, 0);

  function adjustPicked(lineId, delta) {
    setPickedDraft((prev) => {
      const current = Number(prev[lineId] ?? 0) || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [lineId]: String(next) };
    });
  }

  async function savePickedQuantities() {
    if (!selectedTripId || !pickLines.length) return false;
    setSaving(true);
    setDetailError(null);
    try {
      const lines = pickLines.map((line) => ({
        id: line.id,
        picked_qty:
          fulfillmentPickedBaseQty(
            pickedDraft[line.id] ?? line.picked_qty ?? line.required_qty,
            line,
            uomByProductCode,
          ) || 0,
      }));
      const res = await apiRequest(`/dispatch-trips/${selectedTripId}/picking-list/lines`, {
        method: "PATCH",
        body: { lines },
      });
      const updated = res.picking_list ?? res;
      setPickingList(updated);
      setPickedDraft(
        Object.fromEntries(
          (updated?.lines ?? []).map((line) => [
            line.id,
            String(fulfillmentPickedDisplayQty(line.picked_qty, line, uomByProductCode)),
          ]),
        ),
      );
      notifySuccess("Picked quantities saved.");
      return true;
    } catch (e) {
      setDetailError(e instanceof ApiError ? e.message : "Could not save picked quantities");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function completePicking() {
    if (!selectedTripId) return;
    setSaving(true);
    setDetailError(null);
    try {
      const saved = await savePickedQuantities();
      if (!saved) return;

      setSaving(true);
      const res = await apiRequest(`/dispatch-trips/${selectedTripId}/picking-list/complete`, {
        method: "POST",
        body: { picker_name: pickerName.trim() || null },
      });
      const updated = res.picking_list ?? res;
      setPickingList(updated);
      notifySuccess("Picking marked complete.");
    } catch (e) {
      setDetailError(e instanceof ApiError ? e.message : "Could not complete picking");
    } finally {
      setSaving(false);
    }
  }

  async function handlePrint() {
    if (!pickingList || !trip) return;
    setSaving(true);
    try {
      const pickRes = await apiRequest(`/dispatch-trips/${selectedTripId}/picking-list`);
      const freshPick = pickRes.picking_list ?? pickRes;
      setPickingList(freshPick);
      printPickingList({
        organization,
        generalSettings: generalSettings(),
        organizationName: organization?.organization_name ?? organization?.company_name ?? "Picking List",
        pickingList: freshPick,
        trip,
        uomByProductCode,
        documentFooterText: resolvePrintFooter(
          mergeGeneralSettings(capabilities?.module_settings),
          "loading_sheet",
        ),
        printedBy: user?.full_name ?? user?.username ?? null,
        includeShelfLocation,
      });
    } catch (e) {
      setDetailError(e instanceof ApiError ? e.message : "Could not print picking list");
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) {
    return (
      <CatalogPageShell title="Warehouse picking" subtitle="Pick stock from shelves before loading">
        <div className="theme-panel rounded-xl border p-6 text-sm">
          <p>Enable distribution operations in Organization settings → Distribution to use warehouse picking.</p>
        </div>
      </CatalogPageShell>
    );
  }

  if (selectedTripId && (trip || detailLoading)) {
    return (
      <CatalogPageShell
        title={pickingList?.list_number ? `Picking ${pickingList.list_number}` : "Warehouse picking"}
        subtitle={
          trip
            ? `${trip.trip_code ?? "Trip"} · ${formatTripRoutesLabel(trip)} · ${formatDisplayDate(trip.scheduled_date)}`
            : "Loading trip…"
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="theme-secondary-btn rounded-lg px-3 py-1.5 text-sm"
            onClick={() => {
              setSelectedTripId(null);
              setTrip(null);
              setPickingList(null);
              router.replace("/fulfillment/picking");
            }}
          >
            ← All trips
          </button>
          {trip?.id ? (
            <Link
              href={`/fulfillment/trips/${trip.id}`}
              className="theme-link text-sm hover:underline"
            >
              Open trip detail
            </Link>
          ) : null}
        </div>

        {detailError ? <DashboardErrorBanner message={detailError} className="mb-4" /> : null}

        {detailLoading ? (
          <p className="text-sm text-slate-500">Loading picking list…</p>
        ) : (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div className="theme-panel rounded-xl border p-4">
                <p className="text-xs uppercase text-slate-500">Lines</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{pickLines.length}</p>
              </div>
              <div className="theme-panel rounded-xl border p-4">
                <p className="text-xs uppercase text-slate-500">Shortage</p>
                <p className={`mt-1 text-2xl font-semibold ${totalShortage > 0 ? "text-amber-700" : "text-slate-900"}`}>
                  {formatQty(totalShortage)}
                </p>
              </div>
              <div className="theme-panel rounded-xl border p-4">
                <p className="text-xs uppercase text-slate-500">Status</p>
                <p className="mt-1 text-lg font-semibold capitalize text-slate-900">
                  {pickingList?.status ?? "—"}
                </p>
              </div>
            </div>

            {pickingEditable ? (
              <div className="mb-4">
                <Field label="Picker name">
                  <input
                    className={inputClassName()}
                    value={pickerName}
                    onChange={(e) => setPickerName(e.target.value)}
                  />
                </Field>
              </div>
            ) : null}

            <div className="space-y-3 pb-28">
              {pickLines.map((line) => {
                const required = Number(line.required_qty) || 0;
                const pickedBase = fulfillmentPickedBaseQty(
                  pickedDraft[line.id] ?? line.picked_qty,
                  line,
                  uomByProductCode,
                );
                const shortage = shortageQty(required, pickedBase);

                return (
                  <article
                    key={line.id}
                    className={`theme-panel rounded-xl border p-4 shadow-sm ${shortage > 0 ? "border-amber-200 bg-amber-50/40" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        {includeShelfLocation ? (
                          <p className="font-mono text-xs font-semibold uppercase tracking-wide text-[#185FA5]">
                            Shelf {line.shelf_location?.trim() || "—"}
                          </p>
                        ) : null}
                        <h3 className={`${includeShelfLocation ? "mt-1" : ""} text-base font-semibold text-slate-900`}>
                          {line.product_name}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          Requested: {formatFulfillmentQty(required, line, uomByProductCode)}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        #{line.line_no}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase text-slate-500">Picked</p>
                        {pickingEditable ? (
                          <div className="mt-1 flex flex-col items-start gap-1">
                            <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-xl font-medium text-slate-700"
                              onClick={() => adjustPicked(line.id, -1)}
                              aria-label="Decrease picked quantity"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              inputMode="decimal"
                              className={`${inputClassName()} h-11 w-24 text-center text-lg font-semibold`}
                              value={
                                pickedDraft[line.id] ??
                                String(
                                  fulfillmentPickedDisplayQty(
                                    line.picked_qty ?? required,
                                    line,
                                    uomByProductCode,
                                  ),
                                )
                              }
                              onChange={(e) =>
                                setPickedDraft((prev) => ({ ...prev, [line.id]: e.target.value }))
                              }
                            />
                            <button
                              type="button"
                              className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-xl font-medium text-slate-700"
                              onClick={() => adjustPicked(line.id, 1)}
                              aria-label="Increase picked quantity"
                            >
                              +
                            </button>
                            </div>
                            <span className="text-[11px] text-slate-500">
                              {formatFulfillmentQty(pickedBase, line, uomByProductCode)}
                            </span>
                          </div>
                        ) : (
                          <p className="mt-1 text-2xl font-semibold text-slate-900">
                            {formatFulfillmentQty(pickedBase, line, uomByProductCode)}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs uppercase text-slate-500">Shortage</p>
                        <p className={`mt-1 text-2xl font-semibold ${shortage > 0 ? "text-amber-700" : "text-slate-900"}`}>
                          {shortage > 0 ? formatFulfillmentQty(shortage, line, uomByProductCode) : "—"}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-4 backdrop-blur md:static md:mt-6 md:border-0 md:bg-transparent md:p-0">
              <div className="mx-auto flex max-w-3xl flex-wrap gap-2">
                {pickingEditable ? (
                  <>
                    <PrimaryButton type="button" showIcon={false} disabled={saving} onClick={savePickedQuantities}>
                      {saving ? "Saving…" : "Save picks"}
                    </PrimaryButton>
                    <button
                      type="button"
                      className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium shadow-sm"
                      disabled={saving}
                      onClick={completePicking}
                    >
                      Mark complete
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium shadow-sm"
                  disabled={saving}
                  onClick={handlePrint}
                >
                  Print
                </button>
              </div>
            </div>
          </>
        )}
      </CatalogPageShell>
    );
  }

  return (
    <CatalogPageShell
      title="Warehouse picking"
      subtitle="Select a trip and pick stock by shelf — optimized for tablets and phones"
    >
      {error ? <DashboardErrorBanner message={error} className="mb-4" /> : null}

      <FilterToolbar>
        <Field label="From">
          <input
            type="date"
            className={inputClassName()}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            className={inputClassName()}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </Field>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search trip, route, driver, vehicle…"
          className="min-w-[14rem] flex-1"
        />
      </FilterToolbar>

      {loading ? (
        <p className="text-sm text-slate-500">Loading trips…</p>
      ) : filteredTrips.length === 0 ? (
        <p className="theme-panel rounded-xl border p-6 text-sm text-slate-600">
          No open trips with orders for {formatDisplayDate(listDate)}.
        </p>
      ) : (
        <ul className="space-y-2">
          {filteredTrips.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="theme-panel flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left shadow-sm transition hover:border-[#185FA5]/30 hover:bg-slate-50"
                onClick={() => setSelectedTripId(String(row.id))}
              >
                <div>
                  <p className="font-mono text-sm font-semibold text-[#185FA5]">{row.trip_code}</p>
                  <p className="mt-0.5 text-sm text-slate-800">{formatTripRoutesLabel(row)}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {row.driver?.full_name ?? "No driver"} · {row.vehicle?.plate_number ?? "No vehicle"} ·{" "}
                    {row.sales_count ?? row.sales?.length ?? 0} orders · {tripStatusLabel(row.status)}
                  </p>
                </div>
                <span className="text-sm font-medium text-[#185FA5]">Pick →</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </CatalogPageShell>
  );
}
