"use client";

import { useCallback, useRef, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { isHospitalityServiceEnabled } from "@/lib/hospitality-services";
import {
  CatalogPageShell,
  FilterSelect,
  FilterToolbar,
  inputClassName,
  SearchableSelect,
  SecondaryButton,
} from "@/components/catalog/catalog-shared";
import { HospitalityPlaceholderScreen } from "@/components/hospitality/hospitality-screens";

const NEXT = {
  dirty: ["clean"],
  clean: ["vacant", "dirty"],
  vacant: ["dirty", "ooo", "clean"],
  ooo: ["vacant", "dirty"],
  occupied: ["dirty"],
};

export function HospitalityHousekeepingScreen() {
  const { capabilities } = useAuth();
  if (!isHospitalityServiceEnabled(capabilities, "housekeeping")) {
    return (
      <HospitalityPlaceholderScreen title="Housekeeping" description="Room status board." serviceKey="housekeeping" />
    );
  }
  return <HousekeepingBoard />;
}

function HousekeepingBoard() {
  const [rooms, setRooms] = useState([]);
  const [counts, setCounts] = useState({});
  const [floors, setFloors] = useState([]);
  const [staff, setStaff] = useState([]);
  const staffLoadedRef = useRef(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [floorFilter, setFloorFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const includeStaff = !staffLoadedRef.current;
    try {
      const res = await apiRequest("/hospitality/housekeeping", {
        searchParams: {
          status: statusFilter !== "all" ? statusFilter : undefined,
          floor: floorFilter !== "all" ? floorFilter : undefined,
          include_staff: includeStaff ? 1 : 0,
        },
        loading: false,
      });
      setRooms(res?.rooms ?? []);
      setCounts(res?.counts ?? {});
      setFloors(res?.floors ?? []);
      if (includeStaff) {
        setStaff(res?.staff ?? []);
        staffLoadedRef.current = true;
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load housekeeping");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, floorFilter]);

  useTabAwareDataLoad(load, {
    depsKey: `${statusFilter}|${floorFilter}`,
    hasData: rooms.length > 0 || !loading,
  });

  async function setStatus(roomId, status) {
    setBusyId(roomId);
    try {
      const res = await apiRequest(`/hospitality/housekeeping/rooms/${roomId}`, {
        method: "PATCH",
        body: { status },
        loading: false,
      });
      const updated = res?.room;
      const to = updated?.status ?? status;
      const from = rooms.find((r) => Number(r.id) === Number(roomId))?.status;
      notifySuccess(`Room marked ${to}`);
      if (from && from !== to) {
        setCounts((c) => {
          const next = { ...c };
          if (next[from] != null) next[from] = Math.max(0, Number(next[from]) - 1);
          next[to] = Number(next[to] ?? 0) + 1;
          return next;
        });
      }
      setRooms((prev) => {
        if (statusFilter !== "all" && to !== statusFilter) {
          return prev.filter((r) => Number(r.id) !== Number(roomId));
        }
        return prev.map((r) =>
          Number(r.id) === Number(roomId)
            ? {
                ...r,
                status: to,
                housekeeping_assigned_to:
                  updated?.housekeeping_assigned_to ?? r.housekeeping_assigned_to,
                housekeeping_notes: updated?.housekeeping_notes ?? r.housekeeping_notes,
              }
            : r,
        );
      });
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  async function assign(roomId, userId) {
    const room = rooms.find((r) => Number(r.id) === Number(roomId));
    if (!room) return;
    setBusyId(roomId);
    try {
      const res = await apiRequest(`/hospitality/housekeeping/rooms/${roomId}`, {
        method: "PATCH",
        body: {
          status: room.status,
          housekeeping_assigned_to: userId ? Number(userId) : null,
        },
        loading: false,
      });
      const assignee = staff.find((u) => String(u.id) === String(userId));
      notifySuccess(userId ? "Assignee updated" : "Assignee cleared");
      setRooms((prev) =>
        prev.map((r) =>
          Number(r.id) === Number(roomId)
            ? {
                ...r,
                housekeeping_assigned_to:
                  res?.room?.housekeeping_assigned_to ?? (userId ? Number(userId) : null),
                housekeeping_assignee_name: userId
                  ? assignee?.name ?? r.housekeeping_assignee_name
                  : null,
              }
            : r,
        ),
      );
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Assign failed");
    } finally {
      setBusyId(null);
    }
  }

  const floorOptions = useMemo(
    () => [
      { value: "all", label: "All floors" },
      ...floors.map((f) => ({ value: String(f), label: `Floor ${f}` })),
    ],
    [floors],
  );

  return (
    <CatalogPageShell title="Housekeeping" subtitle="Update room cleanliness, assign cleaners, and free rooms after checkout.">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        {Object.entries(counts).map(([k, v]) => (
          <span key={k} className="rounded-full border border-[var(--theme-border)] px-2 py-1 capitalize">
            {k}: <strong>{v}</strong>
          </span>
        ))}
        <SecondaryButton onClick={() => void load()}>Refresh</SecondaryButton>
      </div>

      <FilterToolbar className="mb-4">
        <FilterSelect
          value={statusFilter}
          onChange={(e) => {
            setLoading(true);
            setStatusFilter(e.target.value);
          }}
          options={[
            { value: "all", label: "All statuses" },
            { value: "dirty", label: "Dirty" },
            { value: "clean", label: "Clean" },
            { value: "vacant", label: "Vacant" },
            { value: "occupied", label: "Occupied" },
            { value: "ooo", label: "Out of order" },
          ]}
        />
        <FilterSelect
          value={floorFilter}
          onChange={(e) => {
            setLoading(true);
            setFloorFilter(e.target.value);
          }}
          options={floorOptions}
        />
      </FilterToolbar>

      {loading ? (
        <p className="theme-subtext text-sm">Loading…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rooms.map((room) => (
            <div
              key={room.id}
              className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="theme-heading font-semibold">{room.room_number}</p>
                  <p className="theme-subtext text-xs">
                    {room.room_type_name || "Room"}
                    {room.floor ? ` · Floor ${room.floor}` : ""}
                  </p>
                  {room.occupancy_source ? (
                    <p className="theme-subtext mt-0.5 text-[10px] uppercase tracking-wide">
                      {room.occupancy_source === "pos_room_sale" ? "POS prepaid stay" : "PMS folio stay"}
                    </p>
                  ) : null}
                </div>
                <span className="rounded-full bg-[var(--theme-page-bg)] px-2 py-0.5 text-[10px] font-bold uppercase">
                  {room.status}
                </span>
              </div>
              <div className="mt-2">
                <SearchableSelect
                  className={`${inputClassName()} text-xs`}
                  value={room.housekeeping_assigned_to ? String(room.housekeeping_assigned_to) : ""}
                  disabled={busyId === room.id}
                  onChange={(v) => void assign(room.id, v)}
                  options={[
                    { value: "", label: "Unassigned" },
                    ...staff.map((u) => ({ value: String(u.id), label: u.name })),
                  ]}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {(NEXT[room.status] || []).map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busyId === room.id}
                    onClick={() => void setStatus(room.id, s)}
                    className="theme-secondary-btn rounded-md border px-2 py-1 text-[11px] font-semibold capitalize disabled:opacity-50"
                  >
                    → {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!rooms.length ? <p className="theme-subtext text-sm">No rooms match these filters.</p> : null}
        </div>
      )}
    </CatalogPageShell>
  );
}
