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
import { useConfirm } from "@/lib/use-confirm";

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
  const confirm = useConfirm();
  const [tab, setTab] = useState("arrivals");
  const [arrivals, setArrivals] = useState([]);
  const [departures, setDepartures] = useState([]);
  const [inHouse, setInHouse] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [walkIn, setWalkIn] = useState({ guest_name: "", guest_phone: "", room_id: "" });
  /** reservationId → room_id chosen at the desk for check-in */
  const [arrivalRoomById, setArrivalRoomById] = useState({});
  /** folioId → room_id for reassignment while in house */
  const [inHouseRoomById, setInHouseRoomById] = useState({});

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
      setArrivalRoomById({});
      setInHouseRoomById({});
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

  function roomsForArrival(row) {
    const reservedId = row.room_id ? Number(row.room_id) : null;
    const reserved = reservedId
      ? rooms.find((r) => Number(r.id) === reservedId)
      : null;
    const options = [...availableRooms];
    if (reserved && !options.some((r) => Number(r.id) === reservedId)) {
      options.unshift(reserved);
    }
    return options;
  }

  function roomsForInHouse(row) {
    const currentId = row.room_id ? Number(row.room_id) : null;
    const current = currentId ? rooms.find((r) => Number(r.id) === currentId) : null;
    const options = [...availableRooms];
    if (current && !options.some((r) => Number(r.id) === currentId)) {
      options.unshift(current);
    }
    return options;
  }

  function selectedArrivalRoomId(row) {
    if (arrivalRoomById[row.id] != null && arrivalRoomById[row.id] !== "") {
      return String(arrivalRoomById[row.id]);
    }
    return row.room_id ? String(row.room_id) : "";
  }

  async function checkInReservation(row) {
    const roomId = Number(selectedArrivalRoomId(row) || 0);
    if (!roomId) {
      notifyError("Select a room before check-in.");
      return;
    }
    setBusy(true);
    try {
      await apiRequest("/hospitality/front-desk/check-in", {
        method: "POST",
        body: {
          reservation_id: row.id,
          room_id: roomId,
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
      notifySuccess("Walk-in checked in — guest folio opened");
      setWalkIn({ guest_name: "", guest_phone: "", room_id: "" });
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Check-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function assignInHouseRoom(row) {
    const roomId = Number(inHouseRoomById[row.id] || row.room_id || 0);
    if (!roomId) {
      notifyError("Select a room to assign.");
      return;
    }
    if (row.room_id && Number(row.room_id) === roomId) {
      notifyError("Guest is already in that room.");
      return;
    }
    setBusy(true);
    try {
      await apiRequest(`/hospitality/front-desk/folios/${row.id}/assign-room`, {
        method: "POST",
        body: { room_id: roomId },
      });
      notifySuccess(`Room assigned on folio ${row.folio_number}`);
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not assign room");
    } finally {
      setBusy(false);
    }
  }

  async function checkOut(folioId, balance = 0) {
    const bal = Number(balance ?? 0);
    if (Math.abs(bal) > 0.009) {
      const ok = await confirm({
        title: "Folio still has a balance",
        message: `Balance is ${bal.toFixed(2)}. Check out anyway? Prefer collecting payment on the Folios screen first.`,
        confirmLabel: "Check out with balance",
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await apiRequest(`/hospitality/front-desk/folios/${folioId}/check-out`, {
        method: "POST",
        body: { allow_balance: Math.abs(bal) > 0.009 },
      });
      notifySuccess("Checked out");
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Check-out failed — clear folio balance first");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CatalogPageShell
      title="Front desk"
      subtitle="Assign rooms, check guests in (opens a folio), and check out when the folio is settled."
    >
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
                <th className="px-3 py-2 text-left">Assign room</th>
                <th className="px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {arrivals.map((row) => {
                const roomValue = selectedArrivalRoomId(row);
                const options = roomsForArrival(row);
                return (
                  <tr key={row.id} className={TABLE_BODY_ROW_CLASS}>
                    <td className="px-3 py-2">{row.confirmation_code}</td>
                    <td className="px-3 py-2">{row.guest_name}</td>
                    <td className="px-3 py-2">
                      <select
                        className={inputClassName()}
                        value={roomValue}
                        disabled={busy}
                        onChange={(e) =>
                          setArrivalRoomById((prev) => ({
                            ...prev,
                            [row.id]: e.target.value,
                          }))
                        }
                      >
                        <option value="">Select vacant/clean room…</option>
                        {options.map((r) => (
                          <option key={r.id} value={String(r.id)}>
                            {r.room_number}
                            {r.status ? ` (${r.status})` : ""}
                            {row.room_id && Number(row.room_id) === Number(r.id) ? " · reserved" : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <PrimaryButton
                        showIcon={false}
                        disabled={busy || !roomValue}
                        onClick={() => void checkInReservation(row)}
                      >
                        Check in
                      </PrimaryButton>
                    </td>
                  </tr>
                );
              })}
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
                    <SecondaryButton
                      disabled={busy}
                      onClick={() => void checkOut(row.id, row.balance)}
                    >
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
              {inHouse.map((row) => {
                const pick =
                  inHouseRoomById[row.id] != null && inHouseRoomById[row.id] !== ""
                    ? String(inHouseRoomById[row.id])
                    : row.room_id
                      ? String(row.room_id)
                      : "";
                return (
                  <tr key={row.id} className={TABLE_BODY_ROW_CLASS}>
                    <td className="px-3 py-2">{row.folio_number}</td>
                    <td className="px-3 py-2">{row.guest_name}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          className={`${inputClassName()} min-w-[8rem]`}
                          value={pick}
                          disabled={busy}
                          onChange={(e) =>
                            setInHouseRoomById((prev) => ({
                              ...prev,
                              [row.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Select room…</option>
                          {roomsForInHouse(row).map((r) => (
                            <option key={r.id} value={String(r.id)}>
                              {r.room_number}
                              {r.status ? ` (${r.status})` : ""}
                            </option>
                          ))}
                        </select>
                        <SecondaryButton
                          disabled={busy || !pick || (row.room_id && Number(row.room_id) === Number(pick))}
                          onClick={() => void assignInHouseRoom(row)}
                        >
                          Assign
                        </SecondaryButton>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(row.balance).toFixed(2)}
                    </td>
                    <td className="px-3 py-2">
                      <SecondaryButton
                        disabled={busy}
                        onClick={() => void checkOut(row.id, row.balance)}
                      >
                        Check out
                      </SecondaryButton>
                    </td>
                  </tr>
                );
              })}
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
          <p className="theme-subtext text-xs">
            Check-in opens a <strong>guest folio</strong> — the running bill for room charges and F&amp;B
            (including Hotel POS “Charge to room”).
          </p>
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
