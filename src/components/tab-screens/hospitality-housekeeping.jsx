"use client";

import { useCallback, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { isHospitalityServiceEnabled } from "@/lib/hospitality-services";
import { CatalogPageShell, SecondaryButton } from "@/components/catalog/catalog-shared";
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
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest("/hospitality/housekeeping");
      setRooms(res?.rooms ?? []);
      setCounts(res?.counts ?? {});
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load housekeeping");
    } finally {
      setLoading(false);
    }
  }, []);

  useTabAwareDataLoad(load);

  async function setStatus(roomId, status) {
    setBusyId(roomId);
    try {
      await apiRequest(`/hospitality/housekeeping/rooms/${roomId}`, {
        method: "PATCH",
        body: { status },
      });
      notifySuccess(`Room marked ${status}`);
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <CatalogPageShell title="Housekeeping" subtitle="Update room cleanliness and availability after checkout.">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        {Object.entries(counts).map(([k, v]) => (
          <span key={k} className="rounded-full border border-[var(--theme-border)] px-2 py-1 capitalize">
            {k}: <strong>{v}</strong>
          </span>
        ))}
        <SecondaryButton onClick={() => void load()}>Refresh</SecondaryButton>
      </div>
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
                </div>
                <span className="rounded-full bg-[var(--theme-page-bg)] px-2 py-0.5 text-[10px] font-bold uppercase">
                  {room.status}
                </span>
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
          {!rooms.length ? <p className="theme-subtext text-sm">No active rooms.</p> : null}
        </div>
      )}
    </CatalogPageShell>
  );
}
