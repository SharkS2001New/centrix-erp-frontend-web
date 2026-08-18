"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { isNumericRouteId, routeParamValue } from "@/lib/route-params";
import { useSettingsApi } from "@/contexts/settings-api-context";
import {
  CatalogPageShell,
  Field,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  attendanceClockListHref,
} from "@/lib/attendance-clock-paths";

const TABS = [
  "Overview",
  "Employees",
  "Synchronization",
  "Capabilities",
];

/** Hikvision ISAPI fingerPrintID 1–10 (right hand, then left). */
const HIKVISION_FINGER_NAMES = {
  1: "Right thumb",
  2: "Right index",
  3: "Right middle",
  4: "Right ring",
  5: "Right little",
  6: "Left thumb",
  7: "Left index",
  8: "Left middle",
  9: "Left ring",
  10: "Left little",
};

const HIKVISION_FINGER_TYPE_LABELS = {
  normalFP: "Normal",
  duressFP: "Duress",
  patrolFP: "Patrol",
  superFP: "Super",
  dismissFP: "Dismiss",
};

function featureEnabled(capabilities, key) {
  return Boolean(capabilities?.features?.[key]);
}

export function HikvisionDeviceScreen() {
  const params = useParams();
  const pathname = usePathname();
  const listHref = attendanceClockListHref(pathname);
  const inAdmin = String(pathname ?? "").startsWith("/admin/attendance-clock");
  const deviceId = routeParamValue(params?.id);
  const { organizationApiPath } = useSettingsApi();
  const base = organizationApiPath(`/attendance-clock-devices/${deviceId}/hikvision`);

  const [tab, setTab] = useState("Overview");
  const [device, setDevice] = useState(null);
  const [overview, setOverview] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [users, setUsers] = useState([]);
  const [fingerprints, setFingerprints] = useState([]);
  const [unmappedUsers, setUnmappedUsers] = useState([]);
  const [centrixEmployees, setCentrixEmployees] = useState([]);
  const [mapSelections, setMapSelections] = useState({});
  const [storedEvents, setStoredEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  const loadDevice = useCallback(async () => {
    if (!isNumericRouteId(deviceId)) return null;
    const row = await apiRequest(organizationApiPath(`/attendance-clock-devices/${deviceId}`));
    setDevice(row);
    return row;
  }, [organizationApiPath, deviceId]);

  const loadOverview = useCallback(async (refreshCounts = false) => {
    const data = await apiRequest(`${base}/overview`, {
      loading: false,
      searchParams: refreshCounts ? { refresh_counts: 1 } : undefined,
    });
    setOverview(data);
    setCapabilities(data?.device?.capabilities_json ?? null);
    return data;
  }, [base]);

  const testConnection = useCallback(async ({ silent = false } = {}) => {
    setBusy(true);
    setConnectionError(null);
    try {
      const result = await apiRequest(`${base}/test-connection`, { method: "POST", loading: false });
      if (!result.online) {
        setConnectionError(result.error ?? "CentrixAttendanceAgent is not reachable.");
        if (!silent) {
        notifyError(result.error ?? "CentrixAttendanceAgent is not reachable.");
        }
      } else {
        if (!silent) {
        notifySuccess(result.message ?? "CentrixAttendanceAgent is connected.");
        }
        await loadOverview();
        await loadDevice();
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Connection test failed";
      setConnectionError(msg);
      if (!silent) notifyError(msg);
    } finally {
      setBusy(false);
    }
  }, [base, loadDevice, loadOverview]);

  const loadUsers = useCallback(async () => {
    const data = await apiRequest(`${base}/users/search`, {
      method: "POST",
      body: { maxResults: 100 },
    });
    const rows = data.users ?? [];
    setUsers(rows);
    return rows;
  }, [base]);

  const loadFingerprints = useCallback(async (employeeNo = "", userRows = []) => {
    const body = { maxResults: 100 };
    if (employeeNo.trim()) {
      body.employee_no = employeeNo.trim();
    }
    let rows = [];
    let bulkOk = false;
    try {
    const data = await apiRequest(`${base}/fingerprints/search`, {
      method: "POST",
      body,
    });
      rows = data.fingerprints ?? [];
      bulkOk = true;
    } catch {
      rows = [];
    }
    if (bulkOk && rows.length === 0 && !employeeNo.trim() && userRows.length) {
      const results = await Promise.allSettled(
        userRows.slice(0, 40).map((user) => {
          const no = hikvisionEmployeeNo(user);
          if (!no) return Promise.resolve({ fingerprints: [] });
          return apiRequest(`${base}/fingerprints/search`, {
            method: "POST",
            body: { maxResults: 10, employee_no: no },
          });
        }),
      );
      for (const result of results) {
        if (result.status === "fulfilled") {
          rows.push(...(result.value.fingerprints ?? []));
        }
      }
    }
    setFingerprints(rows);
    return rows;
  }, [base]);

  const loadUnmappedFromDevice = useCallback(async () => {
    const data = await apiRequest(`${base}/sync/employees-from-device`);
    setUnmappedUsers(data.unmapped ?? []);
  }, [base]);

  const loadCentrixEmployees = useCallback(async () => {
    const res = await apiRequest("/employees", {
      searchParams: { per_page: 200, is_active: 1 },
    });
    setCentrixEmployees(res.data ?? []);
  }, []);

  const loadStoredEvents = useCallback(async () => {
    const data = await apiRequest(`${base}/events/stored`, {
      searchParams: { per_page: 50 },
    });
    setStoredEvents(data.events?.data ?? data.events ?? []);
  }, [base]);

  const refreshCapabilities = useCallback(async () => {
    const data = await apiRequest(`${base}/capabilities`);
    setCapabilities(data.capabilities ?? null);
  }, [base]);

  useEffect(() => {
    let cancelled = false;
    if (!isNumericRouteId(deviceId)) {
      setLoading(false);
      setDevice(null);
      return undefined;
    }
    (async () => {
      setLoading(true);
      try {
        await loadDevice();
        if (!cancelled) {
          try {
            await loadOverview();
          } catch {
            /* overview may fail until first connection */
          }
        }
        if (!cancelled) {
          await testConnection({ silent: true });
        }
      } catch (e) {
        if (!cancelled) {
          notifyError(e instanceof ApiError ? e.message : "Failed to load device");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceId, loadDevice, loadOverview, testConnection]);

  useEffect(() => {
    if (tab === "Employees" && featureEnabled(capabilities, "users")) {
      void (async () => {
        try {
          const rows = await loadUsers();
          await loadFingerprints("", rows);
        } catch (err) {
          notifyError(err instanceof ApiError ? err.message : "Could not load device employees");
        }
      })();
    }
    if (tab === "Synchronization") {
      void loadCentrixEmployees().catch(() => {});
    }
    if (tab === "Capabilities") {
      void refreshCapabilities().catch(() => {});
    }
  }, [
    tab,
    capabilities,
    loadUsers,
    loadFingerprints,
    loadCentrixEmployees,
    refreshCapabilities,
  ]);

  const caps = capabilities ?? device?.capabilities_json ?? overview?.device?.capabilities_json;

  async function syncEmployeesToDevice() {
    setBusy(true);
    try {
      const result = await apiRequest(`${base}/sync/employees-to-device`, { method: "POST" });
      const skipped = Number(result.skipped ?? 0);
      notifySuccess(
        `Sync complete — created ${result.created ?? 0}, updated ${result.updated ?? 0}` +
          (skipped ? `, skipped ${skipped} already on the device` : "") +
          ".",
      );
      if (Array.isArray(result.notices) && result.notices.length) {
        notifySuccess(result.notices[0]);
      }
      const leftoverErrors = (result.errors ?? []).filter(
        (message) => !/deviceUserAlreadyExist|0x60007002|already exists on the device/i.test(String(message)),
      );
      if (leftoverErrors.length) {
        notifyError(String(leftoverErrors[0]));
      }
      await loadUsers();
      await loadOverview();
    } catch (e) {
      const text = e instanceof ApiError ? e.message : "Employee sync failed";
      if (/deviceUserAlreadyExist|0x60007002|already exists on the device/i.test(text)) {
        notifySuccess("Employee already exists on the device — skipped.");
        await loadUsers();
        await loadOverview();
      } else {
        notifyError(text);
      }
    } finally {
      setBusy(false);
    }
  }

  async function syncAttendance() {
    setBusy(true);
    try {
      const result = await apiRequest(`${base}/sync/attendance`, { method: "POST" });
      const via = result.via_agent ? " via agent" : "";
      notifySuccess(
        `Attendance sync${via} — pulled ${result.pulled ?? 0}, applied ${result.applied ?? 0}` +
          (result.retried ? `, retried ${result.retried}` : "") +
          ".",
      );
      if (result.errors?.length) {
        notifyError(String(result.errors[0]));
      }
      await loadStoredEvents();
      await loadOverview();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Attendance sync failed");
    } finally {
      setBusy(false);
    }
  }

  async function reprocessPending() {
    setBusy(true);
    try {
      const result = await apiRequest(`${base}/sync/reprocess-pending`, { method: "POST" });
      notifySuccess(
        `Retry pending — applied ${result.applied ?? 0}` +
          (result.errors?.length ? `, ${result.errors.length} still failing` : "") +
          ".",
      );
      if (result.errors?.length) {
        notifyError(String(result.errors[0]));
      }
      await loadStoredEvents();
      await loadOverview();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Retry failed");
    } finally {
      setBusy(false);
    }
  }

  async function autoMapDeviceUsers() {
    setBusy(true);
    try {
      const result = await apiRequest(`${base}/sync/employees/auto-map`, { method: "POST" });
      const mapped = Number(result.mapped ?? 0);
      const applied = Number(result.applied ?? 0);
      notifySuccess(
        `Auto-mapped ${mapped} person${mapped === 1 ? "" : "s"}` +
          (applied ? `, applied ${applied} pending punch${applied === 1 ? "" : "es"}` : "") +
          ".",
      );
      await loadUnmappedFromDevice();
      await loadOverview();
      await loadStoredEvents();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Auto-map failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadUnmappedAndRefresh() {
    setBusy(true);
    try {
      await loadUnmappedFromDevice();
      await loadOverview();
      notifySuccess("Device persons loaded.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not load device persons");
    } finally {
      setBusy(false);
    }
  }

  async function mapDeviceUser(hikvisionEmployeeNo) {
    const employeeId = mapSelections[hikvisionEmployeeNo];
    if (!employeeId) {
      notifyError("Select a Centrix employee to map.");
      return;
    }
    setBusy(true);
    try {
      const result = await apiRequest(`${base}/sync/employees/map`, {
        method: "POST",
        body: {
          employee_id: Number(employeeId),
          hikvision_employee_no: hikvisionEmployeeNo,
        },
      });
      const applied = result?.reprocessed?.applied ?? 0;
      notifySuccess(
        applied > 0
          ? `Mapped ${hikvisionEmployeeNo} — applied ${applied} pending punch(es).`
          : `Mapped ${hikvisionEmployeeNo}.`,
      );
      setUnmappedUsers((rows) =>
        rows.filter(
          (row) => (row.employeeNo ?? row.EmployeeNo ?? "") !== hikvisionEmployeeNo,
        ),
      );
      await loadStoredEvents();
      await loadOverview();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Mapping failed");
    } finally {
      setBusy(false);
    }
  }

  const deviceInfo = useMemo(
    () => device?.device_info_json ?? overview?.device?.device_info_json ?? {},
    [device, overview],
  );

  if (!isNumericRouteId(deviceId)) {
    return (
      <CatalogPageShell
        title="Hikvision device"
        banner={
          <AdminBreadcrumb
            items={[
              inAdmin
                ? { label: "Administration", href: "/admin" }
                : { label: "HR", href: "/hr" },
              { label: "Attendance clock-in", href: listHref },
              { label: "Device" },
            ]}
          />
        }
      >
        <p className="text-sm text-slate-500">
          Select a clock device from Attendance clock-in. This tab is missing a valid device id.
        </p>
        <Link href={listHref} className={`${SECONDARY_BTN_CLASS} mt-3 inline-flex`}>
          Back to clock devices
        </Link>
      </CatalogPageShell>
    );
  }

  if (loading) {
    return (
      <CatalogPageShell title="Hikvision device">
        <p className="text-sm text-slate-500">Loading…</p>
      </CatalogPageShell>
    );
  }

  return (
    <CatalogPageShell
      title={device?.device_name || device?.device_no || "Hikvision device"}
      subtitle="Full ISAPI device management — persons, cards, biometrics, and attendance events"
      banner={
        <AdminBreadcrumb
            items={[
              inAdmin
                ? { label: "Administration", href: "/admin" }
                : { label: "HR", href: "/hr" },
              { label: "Attendance clock-in", href: listHref },
              { label: device?.device_no ?? "Device" },
            ]}
        />
      }
      action={
        <div className="flex flex-wrap gap-2">
          <PrimaryButton type="button" showIcon={false} disabled={busy} onClick={() => void testConnection()}>
            {busy ? "Testing…" : "Test connection"}
          </PrimaryButton>
          <Link href={listHref} className={SECONDARY_BTN_CLASS}>
            Back
          </Link>
        </div>
      }
    >
      {connectionError ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {connectionError}
          {" "}
          Cloud Centrix talks to this terminal through <strong>CentrixAttendanceAgent</strong> on an
          office PC. Download the agent for this device and install it on the same LAN as the Hikvision.
        </p>
      ) : null}

      {device ? (
        <AgentStatusBanner device={device} overview={overview} />
      ) : null}

      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 pb-2">
        {TABS.map((label) => (
          <button
            key={label}
            type="button"
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === label
                ? "bg-[#185FA5] text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
            onClick={() => setTab(label)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "Overview" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Page opens from Centrix DB + agent heartbeat (fast). Live person/card counts need the agent —
              click Refresh live counts when needed.
            </p>
            <button
              type="button"
              className={SECONDARY_BTN_CLASS}
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void loadOverview(true)
                  .catch((e) =>
                    notifyError(e instanceof ApiError ? e.message : "Could not refresh live counts"),
                  )
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? "Refreshing…" : "Refresh live counts"}
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoCard
            label="Agent"
            value={
              overview?.agent?.online
                ? `CentrixAttendanceAgent online${overview.agent.version ? ` v${overview.agent.version}` : ""}`
                : "CentrixAttendanceAgent offline"
            }
          />
          <InfoCard label="Model" value={deviceInfo.model ?? deviceInfo.deviceType ?? "—"} />
          <InfoCard label="Serial" value={deviceInfo.serialNumber ?? "—"} />
          <InfoCard label="Firmware" value={deviceInfo.firmwareVersion ?? "—"} />
          <InfoCard label="LAN" value={device?.host ? `${device.host}:${device.port ?? 80}` : "—"} />
          <InfoCard label="Persons" value={overview?.counts?.users ?? "—"} />
          <InfoCard label="Cards" value={overview?.counts?.cards ?? "—"} />
          <InfoCard label="Events today" value={overview?.counts?.events_today ?? "—"} />
          <InfoCard
            label="Last sync"
            value={overview?.sync?.last_synced_at ?? device?.last_synced_at ?? "—"}
          />
          </div>
        </div>
      ) : null}

      {tab === "Employees" ? (
        <section className="space-y-3">
          {!featureEnabled(caps, "users") ? (
            <UnsupportedNotice feature="Person / employee management" />
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <PrimaryButton
                  type="button"
                  showIcon={false}
                  disabled={busy}
                  onClick={() => void syncEmployeesToDevice()}
                >
                  Sync Centrix → device
                </PrimaryButton>
                <button
                  type="button"
                  className={SECONDARY_BTN_CLASS}
                  onClick={() => {
                    void (async () => {
                      const rows = await loadUsers();
                      await loadFingerprints("", rows);
                    })();
                  }}
                >
                  Refresh
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Uses Centrix employee number as Hikvision <code className="rounded bg-slate-100 px-1">employeeNo</code>{" "}
                like <strong>0003</strong> (not EMP#0003). Enroll fingerprints on the terminal with that ID.
                Fingerprints here mean templates stored on the device, not a live scan.
              </p>
              <UserTable users={users} fingerprints={fingerprints} />
            </>
          )}
        </section>
      ) : null}

      {tab === "Synchronization" ? (
        <section className="space-y-4 text-sm text-slate-700">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoCard label="Centrix employees" value={overview?.sync?.centrix_employees ?? "—"} />
            <InfoCard label="Device persons" value={overview?.sync?.device_users ?? "—"} />
            <InfoCard label="Mapped" value={overview?.sync?.mapped ?? "—"} />
            <InfoCard label="Unmapped on device" value={overview?.sync?.unmapped_device_users ?? "—"} />
          </div>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton
              type="button"
              showIcon={false}
              disabled={busy}
              onClick={() => void syncEmployeesToDevice()}
            >
              Sync employees → device
            </PrimaryButton>
            <PrimaryButton
              type="button"
              showIcon={false}
              disabled={busy}
              onClick={() => void autoMapDeviceUsers()}
            >
              Auto-map by number / name
            </PrimaryButton>
            <PrimaryButton
              type="button"
              showIcon={false}
              disabled={busy}
              onClick={() => void loadUnmappedAndRefresh()}
            >
              Load unmapped from device
            </PrimaryButton>
            <PrimaryButton
              type="button"
              showIcon={false}
              disabled={busy}
              onClick={() => void syncAttendance()}
            >
              Sync attendance
            </PrimaryButton>
            <PrimaryButton
              type="button"
              showIcon={false}
              disabled={busy}
              onClick={() => void reprocessPending()}
            >
              Retry pending punches
            </PrimaryButton>
          </div>
          <p className="text-xs text-slate-500">
            Mapping a device person to a Centrix employee also retries any pending punches for that
            terminal ID. Sync attendance requires the agent online.
          </p>
          {unmappedUsers.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Unmapped device persons
              </p>
              <UnmappedUserTable
                users={unmappedUsers}
                centrixEmployees={centrixEmployees}
                mapSelections={mapSelections}
                onSelect={(no, employeeId) =>
                  setMapSelections((prev) => ({ ...prev, [no]: employeeId }))
                }
                onMap={(no) => void mapDeviceUser(no)}
                busy={busy}
              />
            </div>
          ) : null}
          {overview?.sync?.last_error ? (
            <p className="text-xs text-red-700">Last error: {overview.sync.last_error}</p>
          ) : null}
        </section>
      ) : null}

      {tab === "Capabilities" ? (
        <section className="space-y-3">
          <FeatureFlags capabilities={caps} />
          <pre className="max-h-[480px] overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
            {JSON.stringify(caps ?? {}, null, 2)}
          </pre>
        </section>
      ) : null}
    </CatalogPageShell>
  );
}

function AgentStatusBanner({ device, overview }) {
  const agent = overview?.agent;
  const lastSeenAt = device?.agent_last_seen_at;
  const [seenRecently, setSeenRecently] = useState(false);
  const ttlMs = Math.max(1, Number(agent?.online_ttl_seconds ?? 120)) * 1000;

  useEffect(() => {
    if (!lastSeenAt) {
      setSeenRecently(false);
      return undefined;
    }
    const check = () => {
      setSeenRecently(Date.now() - new Date(lastSeenAt).getTime() < ttlMs);
    };
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, [lastSeenAt, ttlMs]);

  const online = Boolean(agent?.online) || seenRecently;
  const version = agent?.version || device?.agent_version;

  return (
    <div
      className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
        online
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      {online ? (
        <>
          <strong>CentrixAttendanceAgent online</strong>
          {" — Centrix can send commands to the office agent."}
          {version ? ` (v${version})` : ""}
        </>
      ) : (
        <>
          <strong>CentrixAttendanceAgent offline.</strong> Download it for this device and run it on a
          Windows PC on the same LAN as the terminal. Centrix checks the agent automatically when you
          open this page. Manage Hikvision (users, cards, fingerprints) also goes through the agent.
        </>
      )}
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-900">{String(value ?? "—")}</p>
    </div>
  );
}

function UnsupportedNotice({ feature }) {
  return (
    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
      {feature} is not reported as supported by this terminal. Check Capabilities after Test
      connection, or update firmware.
    </p>
  );
}

function hikvisionEmployeeNo(row) {
  return String(row?.employeeNo ?? row?.EmployeeNo ?? row?.employeeNoString ?? "").trim();
}

function hikvisionEmployeeNoKeys(no) {
  const raw = String(no ?? "").trim();
  if (!raw) return [];
  const keys = new Set([raw]);
  const digits = raw.replace(/^0+/, "") || "0";
  keys.add(digits);
  if (/^\d+$/.test(digits)) {
    keys.add(digits.padStart(4, "0"));
  }
  return [...keys];
}

function hikvisionFingerId(row) {
  const n = Number(row?.fingerPrintID ?? row?.FingerPrintID);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

function hikvisionFingerLabel(id) {
  if (id == null) return "Unknown finger";
  return HIKVISION_FINGER_NAMES[id] ?? `Finger ${id}`;
}

function hikvisionFingerTypeLabel(row) {
  const raw = String(row?.fingerType ?? row?.FingerType ?? "").trim();
  if (!raw) return "Normal";
  return HIKVISION_FINGER_TYPE_LABELS[raw] ?? (raw.replace(/FP$/i, "") || raw);
}

function hikvisionCount(row, ...keys) {
  for (const key of keys) {
    if (row?.[key] == null) continue;
    const n = Number(row[key]);
    if (Number.isFinite(n)) return n;
  }
  const nested = row?.fingerPrint ?? row?.FingerPrint ?? row?.FP ?? row?.fingerPrintList;
  if (Array.isArray(nested)) {
    const templates = nested.filter(
      (item) => item && typeof item === "object" && (item.fingerPrintID != null || item.FingerPrintID != null),
    );
    if (templates.length) return templates.length;
  }
  if (nested && typeof nested === "object") {
    for (const key of ["numOfFP", "count", "num", "NumOfFP"]) {
      const n = Number(nested[key]);
      if (Number.isFinite(n)) return n;
    }
    if (nested.enable === true || nested.enable === "true") return 1;
    const list = nested.FingerPrintInfo ?? nested.InfoList ?? nested.list;
    if (Array.isArray(list) && list.length) return list.length;
  }
  return 0;
}

function hikvisionVerifyModeLabel(row) {
  const raw = String(row?.userVerifyMode ?? row?.UserVerifyMode ?? "").trim();
  if (!raw) return "Device default";
  return raw.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function hikvisionValidSummary(row) {
  const valid = row?.Valid ?? row?.valid;
  if (!valid || typeof valid !== "object") return { enabled: null, label: "—" };
  const enabled = valid.enable === true || valid.enable === "true" || valid.enable === 1;
  const begin = String(valid.beginTime ?? valid.BeginTime ?? "").replace("T", " ").slice(0, 16);
  const end = String(valid.endTime ?? valid.EndTime ?? "").replace("T", " ").slice(0, 16);
  const range = [begin, end].filter(Boolean).join(" → ");
  if (!enabled) return { enabled: false, label: range ? `Disabled · ${range}` : "Disabled" };
  return { enabled: true, label: range || "Active" };
}

function groupFingerprintsByEmployee(fingerprints) {
  const map = new Map();
  for (const row of fingerprints ?? []) {
    for (const key of hikvisionEmployeeNoKeys(hikvisionEmployeeNo(row))) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
  }
  return map;
}

function fingerprintsForUser(byEmployee, user) {
  const seen = new Set();
  const rows = [];
  for (const key of hikvisionEmployeeNoKeys(hikvisionEmployeeNo(user))) {
    for (const row of byEmployee.get(key) ?? []) {
      const id = `${hikvisionEmployeeNo(row)}:${row.fingerPrintID ?? row.FingerPrintID ?? rows.length}`;
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
    }
  }
  return rows;
}

function nestedFingerprintRows(user) {
  const nested = user?.fingerPrint ?? user?.FingerPrint ?? user?.FP ?? user?.fingerPrintList;
  if (Array.isArray(nested)) {
    return nested.filter((item) => item && typeof item === "object");
  }
  if (nested && typeof nested === "object") {
    const list = nested.FingerPrintInfo ?? nested.InfoList ?? nested.list;
    if (Array.isArray(list)) return list;
    if (nested.fingerPrintID != null || nested.FingerPrintID != null) return [nested];
  }
  return [];
}

function fingerprintEnrollment(user, fps) {
  const listed = [...(fps ?? []), ...nestedFingerprintRows(user)];
  const count = Math.max(
    hikvisionCount(user, "numOfFP", "NumOfFP", "numOfFingerPrint", "NumOfFingerPrint", "fingerPrintNum"),
    listed.length,
  );
  if (count <= 0) {
    return { enrolled: false, count: 0, fingersLabel: "Not enrolled" };
  }
  const names = listed.map((fp) => {
    const name = hikvisionFingerLabel(hikvisionFingerId(fp));
    const type = hikvisionFingerTypeLabel(fp);
    return type !== "Normal" ? `${name} (${type})` : name;
  });
  const unique = [...new Set(names)];
  return {
    enrolled: true,
    count,
    fingersLabel: unique.length ? unique.join(", ") : `${count} enrolled`,
  };
}

function UserTable({ users, fingerprints }) {
  const byEmployee = useMemo(() => groupFingerprintsByEmployee(fingerprints), [fingerprints]);
  if (!users?.length) {
    return <p className="text-sm text-slate-500">No persons on device (or not loaded yet).</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Employee No</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Fingerprint</th>
            <th className="px-3 py-2">Fingers</th>
            <th className="px-3 py-2">Verify</th>
            <th className="px-3 py-2">Valid</th>
            <th className="px-3 py-2">Cards</th>
            <th className="px-3 py-2">Face</th>
          </tr>
        </thead>
        <tbody>
          {users.map((row, idx) => {
            const no = hikvisionEmployeeNo(row);
            const fp = fingerprintEnrollment(row, fingerprintsForUser(byEmployee, row));
            const valid = hikvisionValidSummary(row);
            return (
              <tr key={`${no || "row"}-${idx}`} className="border-t border-slate-100">
              <td className="px-3 py-2 font-mono text-xs">
                  {no || "—"}
                  {row.duplicateOnDevice ? (
                    <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                      Duplicate on device
                    </span>
                  ) : null}
              </td>
              <td className="px-3 py-2">{row.name ?? row.Name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{row.userType ?? row.UserType ?? "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      fp.enrolled
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-900"
                    }`}
                  >
                    {fp.enrolled ? `Enrolled (${fp.count})` : "Not enrolled"}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-700">{fp.fingersLabel}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{hikvisionVerifyModeLabel(row)}</td>
                <td className="px-3 py-2 text-xs">
                  <span className={valid.enabled === false ? "text-red-700" : "text-slate-600"}>
                    {valid.label}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {hikvisionCount(row, "numOfCard", "NumOfCard")}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {hikvisionCount(row, "numOfFace", "NumOfFace")}
                </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function displayEventField(value) {
  if (value == null) return "—";
  const text = String(value).trim();
  if (!text || text === "undefined" || text === "null") return "—";
  return text;
}

function formatEventTime(value) {
  if (value == null || value === "") return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return displayEventField(value);
  }
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(parsed);
}

function EventTable({ events }) {
  if (!events?.length) {
    return <p className="text-sm text-slate-500">No stored events yet. Run Sync now.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Time (Africa/Nairobi)</th>
            <th className="px-3 py-2">Employee</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Verify</th>
            <th className="px-3 py-2">Processed</th>
            <th className="px-3 py-2">Error</th>
          </tr>
        </thead>
        <tbody>
          {events.map((row) => (
            <tr key={row.id ?? row.event_key} className="border-t border-slate-100">
              <td className="px-3 py-2 text-xs">
                {formatEventTime(row.event_time_local || row.event_time)}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{displayEventField(row.employee_no)}</td>
              <td className="px-3 py-2 text-xs">{displayEventField(row.attendance_status)}</td>
              <td className="px-3 py-2 text-xs">{displayEventField(row.verification_method)}</td>
              <td className="px-3 py-2 text-xs">{row.processed_at ? "Yes" : "Pending"}</td>
              <td className="max-w-[220px] truncate px-3 py-2 text-xs text-red-700" title={row.process_error || ""}>
                {displayEventField(row.process_error)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardTable({ cards, onDelete, busy }) {
  if (!cards?.length) {
    return <p className="text-sm text-slate-500">No cards on device (or not loaded yet).</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Employee No</th>
            <th className="px-3 py-2">Card No</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {cards.map((row, idx) => (
            <tr key={idx} className="border-t border-slate-100">
              <td className="px-3 py-2 font-mono text-xs">
                {row.employeeNo ?? row.EmployeeNo ?? "—"}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{row.cardNo ?? row.CardNo ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-slate-500">{row.cardType ?? row.CardType ?? "—"}</td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                  disabled={busy}
                  onClick={() => onDelete?.(row)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FingerprintTable({ fingerprints, onDelete, busy }) {
  if (!fingerprints?.length) {
    return (
      <p className="text-sm text-slate-500">
        No fingerprint records returned. Enroll on the terminal, then search again.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Employee No</th>
            <th className="px-3 py-2">Finger</th>
            <th className="px-3 py-2">ID</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {fingerprints.map((row, idx) => (
            <tr key={idx} className="border-t border-slate-100">
              <td className="px-3 py-2 font-mono text-xs">
                {row.employeeNo ?? row.EmployeeNo ?? "—"}
              </td>
              <td className="px-3 py-2 text-xs text-slate-700">
                {hikvisionFingerLabel(hikvisionFingerId(row))}
              </td>
              <td className="px-3 py-2 font-mono text-xs">
                {row.fingerPrintID ?? row.FingerPrintID ?? "—"}
              </td>
              <td className="px-3 py-2 text-xs text-slate-500">
                {hikvisionFingerTypeLabel(row)}
              </td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline disabled:opacity-50"
                  disabled={busy}
                  onClick={() => onDelete?.(row)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FeatureFlags({ capabilities }) {
  const features = capabilities?.features ?? {};
  const labels = [
    ["users", "Employees"],
    ["cards", "Cards"],
    ["fingerprints", "Fingerprints"],
    ["events", "Events"],
    ["remote_fingerprint_enrollment", "Remote fingerprint enrollment"],
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {labels.map(([key, label]) => {
        const enabled = Boolean(features[key]);
        return (
          <span
            key={key}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              enabled
                ? "bg-emerald-100 text-emerald-800"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {label}: {enabled ? "Supported" : "Not supported"}
          </span>
        );
      })}
    </div>
  );
}

function UnmappedUserTable({ users, centrixEmployees, mapSelections, onSelect, onMap, busy }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Device employeeNo</th>
            <th className="px-3 py-2">Name on device</th>
            <th className="px-3 py-2">Map to Centrix employee</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {users.map((row) => {
            const no = row.employeeNo ?? row.EmployeeNo ?? "";
            return (
              <tr key={no} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">{no || "—"}</td>
                <td className="px-3 py-2">{row.name ?? row.Name ?? "—"}</td>
                <td className="px-3 py-2">
                  <select
                    className={inputClassName}
                    value={mapSelections[no] ?? ""}
                    onChange={(e) => onSelect(no, e.target.value)}
                  >
                    <option value="">Select employee…</option>
                    {centrixEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.employee_code} — {emp.full_name ?? emp.first_name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className={SECONDARY_BTN_CLASS}
                    disabled={busy || !mapSelections[no]}
                    onClick={() => onMap(no)}
                  >
                    Map
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
