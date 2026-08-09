"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { isHospitalityServiceEnabled } from "@/lib/hospitality-services";
import { resolveHotelPosPaymentConfig } from "@/lib/hotel-pos-settings";
import { postFolioPaymentsFromPanel } from "@/lib/hospitality-folio-payments";
import {
  CatalogPageShell,
  Field,
  inputClassName,
  PrimaryButton,
  SearchableSelect,
  SecondaryButton,
  TABLE_BODY_ROW_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SHELL_CLASS,
} from "@/components/catalog/catalog-shared";
import { HospitalityPlaceholderScreen } from "@/components/hospitality/hospitality-screens";
import { HotelPosPaymentPanel } from "@/components/hospitality/hotel-pos-payment-panel";
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
  const { capabilities } = useAuth();
  const foliosEnabled = isHospitalityServiceEnabled(capabilities, "folios");
  const confirm = useConfirm();
  const [tab, setTab] = useState("arrivals");
  const [arrivals, setArrivals] = useState([]);
  const [departures, setDepartures] = useState([]);
  const [inHouse, setInHouse] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [walkIn, setWalkIn] = useState({
    guest_name: "",
    guest_phone: "",
    room_id: "",
    departure_date: "",
  });
  /** reservationId → room_id chosen at the desk for check-in */
  const [arrivalRoomById, setArrivalRoomById] = useState({});
  /** stay row id → room_id for reassignment while in house */
  const [inHouseRoomById, setInHouseRoomById] = useState({});
  const [checkoutPayRow, setCheckoutPayRow] = useState(null);
  const [paymentError, setPaymentError] = useState(null);
  const [activePaymentMethods, setActivePaymentMethods] = useState([]);

  const paymentConfig = useMemo(
    () =>
      resolveHotelPosPaymentConfig(capabilities?.module_settings, {
        capabilities,
        activePaymentMethods,
      }),
    [capabilities, activePaymentMethods],
  );

  useEffect(() => {
    if (!foliosEnabled) return undefined;
    let cancelled = false;
    apiRequest("/payment-methods", {
      searchParams: { per_page: 50, "filter[is_active]": 1 },
      loading: false,
      reportIssues: false,
    })
      .then((res) => {
        if (!cancelled) setActivePaymentMethods(res?.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setActivePaymentMethods([]);
      });
    return () => {
      cancelled = true;
    };
  }, [foliosEnabled]);

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

  function stayRoomId(row) {
    return Number(row.room_id || row.id || 0);
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
      notifySuccess(
        foliosEnabled
          ? `Checked in ${row.guest_name} — folio opened`
          : `Checked in ${row.guest_name} — room assigned`,
      );
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
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      await apiRequest("/hospitality/front-desk/check-in", {
        method: "POST",
        body: {
          guest_name: walkIn.guest_name,
          guest_phone: walkIn.guest_phone || null,
          room_id: Number(walkIn.room_id),
          departure_date: walkIn.departure_date || tomorrow,
        },
      });
      notifySuccess(
        foliosEnabled
          ? "Walk-in checked in — guest folio opened"
          : "Walk-in checked in — room occupied (collect payment at the desk)",
      );
      setWalkIn({ guest_name: "", guest_phone: "", room_id: "", departure_date: "" });
      setTab("departures");
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
      if (foliosEnabled) {
        await apiRequest(`/hospitality/front-desk/folios/${row.id}/assign-room`, {
          method: "POST",
          body: { room_id: roomId },
        });
        notifySuccess(`Room assigned on folio ${row.folio_number}`);
      } else {
        const fromId = stayRoomId(row);
        await apiRequest(`/hospitality/front-desk/rooms/${fromId}/assign-room`, {
          method: "POST",
          body: { room_id: roomId },
        });
        notifySuccess("Guest moved to new room");
      }
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not assign room");
    } finally {
      setBusy(false);
    }
  }

  async function finishCheckOut(row, { allowBalance = false } = {}) {
    setBusy(true);
    try {
      if (foliosEnabled) {
        await apiRequest(`/hospitality/front-desk/folios/${row.id}/check-out`, {
          method: "POST",
          body: { allow_balance: allowBalance },
        });
      } else {
        await apiRequest(`/hospitality/front-desk/rooms/${stayRoomId(row)}/check-out`, {
          method: "POST",
          body: {},
        });
      }
      notifySuccess("Checked out");
      setCheckoutPayRow(null);
      setPaymentError(null);
      await load();
    } catch (e) {
      notifyError(
        e instanceof ApiError
          ? e.message
          : foliosEnabled
            ? "Check-out failed — clear folio balance first"
            : "Check-out failed",
      );
    } finally {
      setBusy(false);
    }
  }

  async function checkOut(row) {
    const bal = Number(row.balance ?? 0);
    if (foliosEnabled && Math.abs(bal) > 0.009) {
      setPaymentError(null);
      setCheckoutPayRow(row);
      return;
    }
    await finishCheckOut(row);
  }

  async function handleCheckoutPaymentComplete(payload) {
    if (!checkoutPayRow?.id) return;
    setBusy(true);
    setPaymentError(null);
    try {
      const folio = await postFolioPaymentsFromPanel(checkoutPayRow.id, payload);
      const nextBal = Number(folio?.balance ?? 0);
      if (Math.abs(nextBal) > 0.009) {
        setCheckoutPayRow({ ...checkoutPayRow, balance: nextBal });
        notifySuccess(`Payment recorded — balance ${nextBal.toFixed(2)} remaining`);
        await load();
        return;
      }
      await finishCheckOut({ ...checkoutPayRow, balance: 0 });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err?.message || "Payment failed";
      setPaymentError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setBusy(false);
    }
  }

  async function checkOutWithBalanceAnyway() {
    if (!checkoutPayRow) return;
    const bal = Number(checkoutPayRow.balance ?? 0);
    const ok = await confirm({
      title: "Check out with balance",
      message: `Balance is ${bal.toFixed(2)}. Check out without collecting the rest?`,
      confirmLabel: "Check out with balance",
      destructive: true,
    });
    if (!ok) return;
    await finishCheckOut(checkoutPayRow, { allowBalance: true });
  }

  return (
    <CatalogPageShell
      title="Front desk"
      subtitle={
        foliosEnabled
          ? "Assign rooms, check guests in (opens a folio for pay-later / room charge), and check out when settled."
          : "Assign rooms and check guests in. Collect payment at the desk — no running folio. Enable Guest folios in platform settings only if you need pay-later or charge-to-room."
      }
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
                      <SearchableSelect
                        className={inputClassName()}
                        value={roomValue}
                        disabled={busy}
                        onChange={(v) =>
                          setArrivalRoomById((prev) => ({
                            ...prev,
                            [row.id]: v,
                          }))
                        }
                        placeholder="Select vacant/clean room…"
                        options={[
                          { value: "", label: "Select vacant/clean room…" },
                          ...options.map((r) => ({
                            value: String(r.id),
                            label: `${r.room_number}${r.status ? ` (${r.status})` : ""}${row.room_id && Number(row.room_id) === Number(r.id) ? " · reserved" : ""}`,
                          })),
                        ]}
                      />
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
                <th className="px-3 py-2 text-left">{foliosEnabled ? "Folio" : "Guest"}</th>
                {foliosEnabled ? <th className="px-3 py-2 text-left">Guest</th> : null}
                <th className="px-3 py-2 text-left">Room</th>
                {foliosEnabled ? <th className="px-3 py-2 text-right">Balance</th> : null}
                <th className="px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {departures.map((row) => (
                <tr key={row.id} className={TABLE_BODY_ROW_CLASS}>
                  <td className="px-3 py-2">
                    {foliosEnabled ? row.folio_number : row.guest_name}
                  </td>
                  {foliosEnabled ? <td className="px-3 py-2">{row.guest_name}</td> : null}
                  <td className="px-3 py-2">{row.room_number || "—"}</td>
                  {foliosEnabled ? (
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(row.balance ?? 0).toFixed(2)}
                    </td>
                  ) : null}
                  <td className="px-3 py-2">
                    <SecondaryButton disabled={busy} onClick={() => void checkOut(row)}>
                      Check out
                    </SecondaryButton>
                  </td>
                </tr>
              ))}
              {!departures.length ? (
                <tr>
                  <td colSpan={foliosEnabled ? 5 : 3} className="theme-subtext px-3 py-8 text-center">
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
                <th className="px-3 py-2 text-left">{foliosEnabled ? "Folio" : "Guest"}</th>
                {foliosEnabled ? <th className="px-3 py-2 text-left">Guest</th> : null}
                <th className="px-3 py-2 text-left">Room</th>
                {foliosEnabled ? <th className="px-3 py-2 text-right">Balance</th> : null}
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
                    <td className="px-3 py-2">
                      {foliosEnabled ? row.folio_number : row.guest_name}
                    </td>
                    {foliosEnabled ? <td className="px-3 py-2">{row.guest_name}</td> : null}
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <SearchableSelect
                          className={`${inputClassName()} min-w-[8rem]`}
                          value={pick}
                          disabled={busy}
                          onChange={(v) =>
                            setInHouseRoomById((prev) => ({
                              ...prev,
                              [row.id]: v,
                            }))
                          }
                          placeholder="Select room…"
                          options={[
                            { value: "", label: "Select room…" },
                            ...roomsForInHouse(row).map((r) => ({
                              value: String(r.id),
                              label: `${r.room_number}${r.status ? ` (${r.status})` : ""}`,
                            })),
                          ]}
                        />
                        <SecondaryButton
                          disabled={busy || !pick || (row.room_id && Number(row.room_id) === Number(pick))}
                          onClick={() => void assignInHouseRoom(row)}
                        >
                          Assign
                        </SecondaryButton>
                      </div>
                    </td>
                    {foliosEnabled ? (
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(row.balance).toFixed(2)}
                      </td>
                    ) : null}
                    <td className="px-3 py-2">
                      <SecondaryButton disabled={busy} onClick={() => void checkOut(row)}>
                        Check out
                      </SecondaryButton>
                    </td>
                  </tr>
                );
              })}
              {!inHouse.length ? (
                <tr>
                  <td colSpan={foliosEnabled ? 5 : 3} className="theme-subtext px-3 py-8 text-center">
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
            {foliosEnabled ? (
              <>
                Check-in opens a <strong>guest folio</strong> — the running bill for room charges and F&amp;B
                (including Hotel POS “Charge to room”).
              </>
            ) : (
              <>
                Check-in assigns the room for the stay. Collect lodging payment at the desk before handing
                keys. Food &amp; drink is paid at the till — no charge-to-room.
              </>
            )}
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
            <SearchableSelect
              required
              className={inputClassName()}
              value={walkIn.room_id}
              onChange={(v) => setWalkIn((w) => ({ ...w, room_id: v }))}
              placeholder="Select vacant/clean room…"
              options={[
                { value: "", label: "Select vacant/clean room…" },
                ...availableRooms.map((r) => ({
                  value: String(r.id),
                  label: `${r.room_number} (${r.status})`,
                })),
              ]}
            />
          </Field>
          <Field label="Expected departure">
            <input
              type="date"
              required
              className={inputClassName()}
              value={
                walkIn.departure_date ||
                new Date(Date.now() + 86400000).toISOString().slice(0, 10)
              }
              onChange={(e) => setWalkIn((w) => ({ ...w, departure_date: e.target.value }))}
            />
          </Field>
          <PrimaryButton showIcon={false} type="submit" disabled={busy}>
            Check in walk-in
          </PrimaryButton>
        </form>
      ) : null}

      <HotelPosPaymentPanel
        open={Boolean(checkoutPayRow)}
        onClose={() => {
          if (!busy) {
            setCheckoutPayRow(null);
            setPaymentError(null);
          }
        }}
        title="Checkout payment"
        footerHint="Tap Full for the folio balance, or Amount → Keypad. Methods are from Admin → Payment methods."
        billTotal={Math.max(0, Number(checkoutPayRow?.balance ?? 0))}
        paymentConfig={paymentConfig}
        saving={busy}
        error={paymentError}
        allowPartial={false}
        roomChargeEnabled={false}
        secondaryAction={{
          label: "Check out with balance (no payment)",
          onClick: () => void checkOutWithBalanceAnyway(),
        }}
        onComplete={handleCheckoutPaymentComplete}
      />
    </CatalogPageShell>
  );
}
