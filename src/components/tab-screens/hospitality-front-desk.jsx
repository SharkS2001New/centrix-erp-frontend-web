"use client";

import { useCallback, useMemo, useState } from "react";
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

export function HospitalityFrontDeskScreen() {
  const { capabilities } = useAuth();
  if (!isHospitalityServiceEnabled(capabilities, "front_desk")) {
    return (
      <HospitalityPlaceholderScreen title="Front desk" description="Check-in / check-out." serviceKey="front_desk" />
    );
  }
  return <FrontDeskManager />;
}

function FrontDeskManager() {
  const [tab, setTab] = useState("arrivals");
  const [arrivals, setArrivals] = useState([]);
  const [departures, setDepartures] = useState([]);
  const [inHouse, setInHouse] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [walkIn, setWalkIn] = useState({ guest_name: "", guest_phone: "", room_id: "" });

  const load = useCallback(async () => {
    try {
      const [a, d, h, r] = await Promise.all([
        apiRequest("/hospitality/front-desk/arrivals"),
        apiRequest("/hospitality/front-desk/departures"),
        apiRequest("/hospitality/front-desk/in-house"),
        apiRequest("/hospitality/rooms", { searchParams: { per_page: 200 } }),
      ]);
      setArrivals(a?.data ?? []);
      setDepartures(d?.data ?? []);
      setInHouse(h?.data ?? []);
      setRooms(r?.data ?? r ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load front desk");
    } finally {
      setLoading(false);
    }
  }, []);

  useTabAwareDataLoad(load);

  const availableRooms = useMemo(
    () => rooms.filter((r) => ["vacant", "clean"].includes(r.status) && r.is_active !== false),
    [rooms],
  );

  async function checkInReservation(row) {
    setBusy(true);
    try {
      await apiRequest("/hospitality/front-desk/check-in", {
        method: "POST",
        body: {
          reservation_id: row.id,
          room_id: row.room_id || undefined,
        },
      });
      notifySuccess(`Checked in ${row.guest_name}`);
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function checkInWalkIn(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiRequest("/hospitality/front-desk/check-in", {
        method: "POST",
        body: {
          guest_name: walkIn.guest_name,
          guest_phone: walkIn.guest_phone || null,
          room_id: Number(walkIn.room_id),
        },
      });
      notifySuccess("Walk-in checked in");
      setWalkIn({ guest_name: "", guest_phone: "", room_id: "" });
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function checkOut(folioId) {
    setBusy(true);
    try {
      await apiRequest(`/hospitality/front-desk/folios/${folioId}/check-out`, { method: "POST", body: {} });
      notifySuccess("Checked out");
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Check-out failed — clear folio balance first");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CatalogPageShell title="Front desk" subtitle="Arrivals, in-house guests, walk-in check-in, and check-out.">
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ["arrivals", "Arrivals"],
          ["departures", "Departures"],
          ["inhouse", "In house"],
          ["walkin", "Walk-in"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === id ? "theme-primary-btn" : "theme-secondary-btn border"
            }`}
          >
            {label}
          </button>
        ))}
        <SecondaryButton disabled={busy} onClick={() => void load()}>
          Refresh
        </SecondaryButton>
      </div>

      {loading ? <p className="theme-subtext text-sm">Loading…</p> : null}

      {!loading && tab === "arrivals" ? (
        <div className={TABLE_SHELL_CLASS}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW_CLASS}>
                <th className="px-3 py-2 text-left">Code</th>
                <th className="px-3 py-2 text-left">Guest</th>
                <th className="px-3 py-2 text-left">Room</th>
                <th className="px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {arrivals.map((row) => (
                <tr key={row.id} className={TABLE_BODY_ROW_CLASS}>
                  <td className="px-3 py-2">{row.confirmation_code}</td>
                  <td className="px-3 py-2">{row.guest_name}</td>
                  <td className="px-3 py-2">
                    {row.room_number || row.room_type_name || "Assign at check-in"}
                  </td>
                  <td className="px-3 py-2">
                    <PrimaryButton
                      showIcon={false}
                      disabled={busy || !row.room_id}
                      onClick={() => void checkInReservation(row)}
                    >
                      Check in
                    </PrimaryButton>
                    {!row.room_id ? (
                      <span className="theme-subtext ml-2 text-xs">Assign room on reservation first</span>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!arrivals.length ? (
                <tr>
                  <td colSpan={4} className="theme-subtext px-3 py-8 text-center">
                    No arrivals today.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && tab === "departures" ? (
        <div className={TABLE_SHELL_CLASS}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW_CLASS}>
                <th className="px-3 py-2 text-left">Folio</th>
                <th className="px-3 py-2 text-left">Guest</th>
                <th className="px-3 py-2 text-left">Room</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {departures.map((row) => (
                <tr key={row.id} className={TABLE_BODY_ROW_CLASS}>
                  <td className="px-3 py-2">{row.folio_number}</td>
                  <td className="px-3 py-2">{row.guest_name}</td>
                  <td className="px-3 py-2">{row.room_number || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {Number(row.balance ?? 0).toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    <SecondaryButton disabled={busy} onClick={() => void checkOut(row.id)}>
                      Check out
                    </SecondaryButton>
                  </td>
                </tr>
              ))}
              {!departures.length ? (
                <tr>
                  <td colSpan={5} className="theme-subtext px-3 py-8 text-center">
                    No departures due today.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && tab === "inhouse" ? (
        <div className={TABLE_SHELL_CLASS}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW_CLASS}>
                <th className="px-3 py-2 text-left">Folio</th>
                <th className="px-3 py-2 text-left">Guest</th>
                <th className="px-3 py-2 text-left">Room</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {inHouse.map((row) => (
                <tr key={row.id} className={TABLE_BODY_ROW_CLASS}>
                  <td className="px-3 py-2">{row.folio_number}</td>
                  <td className="px-3 py-2">{row.guest_name}</td>
                  <td className="px-3 py-2">{row.room_number || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(row.balance).toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <SecondaryButton disabled={busy} onClick={() => void checkOut(row.id)}>
                      Check out
                    </SecondaryButton>
                  </td>
                </tr>
              ))}
              {!inHouse.length ? (
                <tr>
                  <td colSpan={5} className="theme-subtext px-3 py-8 text-center">
                    No guests in house.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && tab === "walkin" ? (
        <form className="max-w-md space-y-3 rounded-xl border border-[var(--theme-border)] p-4" onSubmit={checkInWalkIn}>
          <Field label="Guest name">
            <input
              required
              className={inputClassName()}
              value={walkIn.guest_name}
              onChange={(e) => setWalkIn((w) => ({ ...w, guest_name: e.target.value }))}
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputClassName()}
              value={walkIn.guest_phone}
              onChange={(e) => setWalkIn((w) => ({ ...w, guest_phone: e.target.value }))}
            />
          </Field>
          <Field label="Room">
            <select
              required
              className={inputClassName()}
              value={walkIn.room_id}
              onChange={(e) => setWalkIn((w) => ({ ...w, room_id: e.target.value }))}
            >
              <option value="">Select vacant/clean room…</option>
              {availableRooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.room_number} ({r.status})
                </option>
              ))}
            </select>
          </Field>
          <PrimaryButton showIcon={false} type="submit" disabled={busy}>
            Check in walk-in
          </PrimaryButton>
        </form>
      ) : null}
    </CatalogPageShell>
  );
}
