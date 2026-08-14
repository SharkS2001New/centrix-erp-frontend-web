"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
import { LiveFingerprintTestModal } from "@/components/hr/live-fingerprint-test-modal";
import { notifyError, notifySuccess } from "@/lib/notify";

const TABS = [
  "Overview",
  "Employees",
  "Fingerprints",
  "Cards",
  "Attendance",
  "Synchronization",
  "Capabilities",
];

function featureEnabled(capabilities, key) {
  return Boolean(capabilities?.features?.[key]);
}

export function HikvisionDeviceScreen() {
  const params = useParams();
  const deviceId = routeParamValue(params?.id);
  const { organizationApiPath } = useSettingsApi();
  const base = organizationApiPath(`/attendance-clock-devices/${deviceId}/hikvision`);

  const [tab, setTab] = useState("Overview");
  const [device, setDevice] = useState(null);
  const [overview, setOverview] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [users, setUsers] = useState([]);
  const [cards, setCards] = useState([]);
  const [fingerprints, setFingerprints] = useState([]);
  const [fingerprintMeta, setFingerprintMeta] = useState(null);
  const [cardForm, setCardForm] = useState({ employeeNo: "", cardNo: "", cardType: "normalCard" });
  const [showCardForm, setShowCardForm] = useState(false);
  const [fpEmployeeFilter, setFpEmployeeFilter] = useState("");
  const [unmappedUsers, setUnmappedUsers] = useState([]);
  const [centrixEmployees, setCentrixEmployees] = useState([]);
  const [mapSelections, setMapSelections] = useState({});
  const [storedEvents, setStoredEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  const [fingerprintTestOpen, setFingerprintTestOpen] = useState(false);

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

  const testConnection = useCallback(async () => {
    setBusy(true);
    setConnectionError(null);
    try {
      const result = await apiRequest(`${base}/test-connection`, { method: "POST" });
      if (!result.online) {
        setConnectionError(result.error ?? "CentrixAttendanceAgent is not reachable.");
        notifyError(result.error ?? "CentrixAttendanceAgent is not reachable.");
      } else {
        notifySuccess(result.message ?? "CentrixAttendanceAgent is connected.");
        await loadOverview();
        await loadDevice();
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Connection test failed";
      setConnectionError(msg);
      notifyError(msg);
    } finally {
      setBusy(false);
    }
  }, [base, loadDevice, loadOverview]);

  const loadUsers = useCallback(async () => {
    const data = await apiRequest(`${base}/users/search`, {
      method: "POST",
      body: { maxResults: 30 },
    });
    setUsers(data.users ?? []);
  }, [base]);

  const loadCards = useCallback(async () => {
    const data = await apiRequest(`${base}/cards/search`, {
      method: "POST",
      body: { maxResults: 30 },
    });
    setCards(data.cards ?? []);
  }, [base]);

  const loadFingerprints = useCallback(async (employeeNo = "") => {
    const body = { maxResults: 30 };
    if (employeeNo.trim()) {
      body.employee_no = employeeNo.trim();
    }
    const data = await apiRequest(`${base}/fingerprints/search`, {
      method: "POST",
      body,
    });
    setFingerprints(data.fingerprints ?? []);
  }, [base]);

  const loadFingerprintMeta = useCallback(async () => {
    const data = await apiRequest(`${base}/fingerprints/capabilities`);
    setFingerprintMeta(data);
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
  }, [deviceId, loadDevice, loadOverview]);

  useEffect(() => {
    if (tab === "Employees" && featureEnabled(capabilities, "users")) {
      void loadUsers().catch(() => {});
    }
    if (tab === "Cards" && featureEnabled(capabilities, "cards")) {
      void loadCards().catch(() => {});
    }
    if (tab === "Fingerprints" && featureEnabled(capabilities, "fingerprints")) {
      void loadFingerprintMeta().catch(() => {});
      void loadFingerprints(fpEmployeeFilter).catch(() => {});
    }
    if (tab === "Attendance") {
      void loadStoredEvents().catch(() => {});
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
    loadCards,
    loadFingerprints,
    loadFingerprintMeta,
    fpEmployeeFilter,
    loadStoredEvents,
    loadCentrixEmployees,
    refreshCapabilities,
  ]);

  const caps = capabilities ?? device?.capabilities_json ?? overview?.device?.capabilities_json;

  async function syncEmployeesToDevice() {
    setBusy(true);
    try {
      const result = await apiRequest(`${base}/sync/employees-to-device`, { method: "POST" });
      notifySuccess(
        `Sync complete — created ${result.created ?? 0}, updated ${result.updated ?? 0}.`,
      );
      await loadUsers();
      await loadOverview();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Employee sync failed");
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

  async function saveCard() {
    if (!cardForm.employeeNo.trim() || !cardForm.cardNo.trim()) {
      notifyError("Employee No and Card No are required.");
      return;
    }
    setBusy(true);
    try {
      await apiRequest(`${base}/cards`, {
        method: "POST",
        body: {
          employeeNo: cardForm.employeeNo.trim(),
          cardNo: cardForm.cardNo.trim(),
          cardType: cardForm.cardType || "normalCard",
        },
      });
      notifySuccess("Card added on device.");
      setCardForm({ employeeNo: "", cardNo: "", cardType: "normalCard" });
      setShowCardForm(false);
      await loadCards();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not add card");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCardRow(row) {
    const employeeNo = row.employeeNo ?? row.EmployeeNo ?? "";
    const cardNo = row.cardNo ?? row.CardNo ?? "";
    if (!employeeNo || !cardNo) return;
    if (!window.confirm(`Delete card ${cardNo} for ${employeeNo}?`)) return;
    setBusy(true);
    try {
      await apiRequest(`${base}/cards`, {
        method: "DELETE",
        body: { employeeNo, cardNo },
      });
      notifySuccess("Card deleted.");
      await loadCards();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not delete card");
    } finally {
      setBusy(false);
    }
  }

  async function deleteFingerprintRow(row) {
    const employeeNo = row.employeeNo ?? row.EmployeeNo ?? "";
    const fingerPrintID = row.fingerPrintID ?? row.FingerPrintID;
    if (!employeeNo || fingerPrintID == null) return;
    if (!window.confirm(`Delete fingerprint ${fingerPrintID} for ${employeeNo}?`)) return;
    setBusy(true);
    try {
      await apiRequest(`${base}/fingerprints`, {
        method: "DELETE",
        body: { employeeNo, fingerPrintID: Number(fingerPrintID) },
      });
      notifySuccess("Fingerprint deleted.");
      await loadFingerprints(fpEmployeeFilter);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not delete fingerprint");
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
              { label: "Administration", href: "/admin" },
              { label: "Attendance clock-in", href: "/admin/attendance-clock" },
              { label: "Device" },
            ]}
          />
        }
      >
        <p className="text-sm text-slate-500">
          Select a clock device from Attendance clock-in. This tab is missing a valid device id.
        </p>
        <Link href="/admin/attendance-clock" className={`${SECONDARY_BTN_CLASS} mt-3 inline-flex`}>
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
            { label: "Administration", href: "/admin" },
            { label: "Attendance clock-in", href: "/admin/attendance-clock" },
            { label: device?.device_no ?? "Device" },
          ]}
        />
      }
      action={
        <div className="flex flex-wrap gap-2">
          <PrimaryButton type="button" showIcon={false} disabled={busy} onClick={() => void testConnection()}>
            {busy ? "Testing…" : "Test connection"}
          </PrimaryButton>
          <PrimaryButton
            type="button"
            showIcon={false}
            disabled={busy}
            onClick={() => setFingerprintTestOpen(true)}
          >
            Test fingerprint
          </PrimaryButton>
          <Link href="/admin/attendance-clock" className={SECONDARY_BTN_CLASS}>
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
          office PC. Download the agent for this device, install it on the same LAN as the Hikvision,
          then try Test connection again.
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
                <button type="button" className={SECONDARY_BTN_CLASS} onClick={() => void loadUsers()}>
                  Refresh
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Uses Centrix employee number as Hikvision <code className="rounded bg-slate-100 px-1">employeeNo</code>{" "}
                like <strong>0003</strong> (not EMP#0003). Enroll fingerprints on the terminal with that ID.
              </p>
              <UserTable users={users} />
            </>
          )}
        </section>
      ) : null}

      {tab === "Fingerprints" ? (
        <section className="space-y-3">
          {!featureEnabled(caps, "fingerprints") ? (
            <UnsupportedNotice feature="Fingerprint management" />
          ) : (
            <>
              {fingerprintMeta?.remote_enrollment_supported ? (
                <p className="text-sm text-slate-600">
                  Remote enrollment is supported on this firmware. Sync the employee to the device
                  first, then capture on the terminal.
                </p>
              ) : (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {fingerprintMeta?.enrollment_message ??
                    "Fingerprint enrollment must be completed on the terminal."}
                </p>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Filter by employeeNo">
                  <input
                    className={inputClassName}
                    value={fpEmployeeFilter}
                    onChange={(e) => setFpEmployeeFilter(e.target.value)}
                    placeholder="Optional employee code"
                  />
                </Field>
                <button
                  type="button"
                  className={SECONDARY_BTN_CLASS}
                  onClick={() => void loadFingerprints(fpEmployeeFilter)}
                >
                  Search
                </button>
              </div>
              <FingerprintTable
                fingerprints={fingerprints}
                onDelete={(row) => void deleteFingerprintRow(row)}
                busy={busy}
              />
            </>
          )}
        </section>
      ) : null}

      {tab === "Cards" ? (
        <section className="space-y-3">
          {!featureEnabled(caps, "cards") ? (
            <UnsupportedNotice feature="Card management" />
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <PrimaryButton
                  type="button"
                  showIcon={false}
                  disabled={busy}
                  onClick={() => setShowCardForm((v) => !v)}
                >
                  {showCardForm ? "Cancel" : "Add card"}
                </PrimaryButton>
                <button type="button" className={SECONDARY_BTN_CLASS} onClick={() => void loadCards()}>
                  Refresh
                </button>
              </div>
              {showCardForm ? (
                <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
                  <Field label="Employee No">
                    <input
                      className={inputClassName}
                      value={cardForm.employeeNo}
                      onChange={(e) => setCardForm((f) => ({ ...f, employeeNo: e.target.value }))}
                    />
                  </Field>
                  <Field label="Card No">
                    <input
                      className={inputClassName}
                      value={cardForm.cardNo}
                      onChange={(e) => setCardForm((f) => ({ ...f, cardNo: e.target.value }))}
                    />
                  </Field>
                  <Field label="Type">
                    <input
                      className={inputClassName}
                      value={cardForm.cardType}
                      onChange={(e) => setCardForm((f) => ({ ...f, cardType: e.target.value }))}
                    />
                  </Field>
                  <div className="sm:col-span-3">
                    <PrimaryButton type="button" showIcon={false} disabled={busy} onClick={() => void saveCard()}>
                      Save card on device
                    </PrimaryButton>
                  </div>
                </div>
              ) : null}
              <p className="text-xs text-slate-500">
                Cards are linked to Hikvision <code className="rounded bg-slate-100 px-1">employeeNo</code>{" "}
                like 0003, matching the Centrix employee number.
              </p>
              <CardTable cards={cards} onDelete={(row) => void deleteCardRow(row)} busy={busy} />
            </>
          )}
        </section>
      ) : null}

      {tab === "Attendance" ? (
        <section className="space-y-3">
          {!featureEnabled(caps, "events") ? (
            <UnsupportedNotice feature="Access / attendance events" />
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <PrimaryButton
                  type="button"
                  showIcon={false}
                  disabled={busy}
                  onClick={() => void syncAttendance()}
                >
                  Sync now
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
                Sync pulls events through <strong>CentrixAttendanceAgent</strong> on the office LAN.
                Raw events are stored first; Centrix then applies clock in/out. Use Retry after mapping
                an employee if punches were stuck as Pending.
              </p>
              <EventTable events={storedEvents} />
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

      <LiveFingerprintTestModal
        open={fingerprintTestOpen}
        device={device}
        organizationApiPath={organizationApiPath}
        onClose={() => setFingerprintTestOpen(false)}
      />
    </CatalogPageShell>
  );
}

function AgentStatusBanner({ device, overview }) {
  const agent = overview?.agent;
  const lastSeenAt = device?.agent_last_seen_at;
  const [seenRecently, setSeenRecently] = useState(false);

  useEffect(() => {
    if (!lastSeenAt) {
      setSeenRecently(false);
      return undefined;
    }
    const check = () => {
      setSeenRecently(Date.now() - new Date(lastSeenAt).getTime() < 90_000);
    };
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, [lastSeenAt]);

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
          Windows PC on the same LAN as the terminal. Test connection checks that Centrix can reach the
          agent. Manage Hikvision (users, cards, fingerprints) also goes through the agent.
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

function UserTable({ users }) {
  if (!users?.length) {
    return <p className="text-sm text-slate-500">No persons on device (or not loaded yet).</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Employee No</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Type</th>
          </tr>
        </thead>
        <tbody>
          {users.map((row, idx) => (
            <tr key={idx} className="border-t border-slate-100">
              <td className="px-3 py-2 font-mono text-xs">
                {row.employeeNo ?? row.EmployeeNo ?? "—"}
              </td>
              <td className="px-3 py-2">{row.name ?? row.Name ?? "—"}</td>
              <td className="px-3 py-2 text-xs text-slate-500">{row.userType ?? "—"}</td>
            </tr>
          ))}
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
            <th className="px-3 py-2">Fingerprint ID</th>
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
              <td className="px-3 py-2 font-mono text-xs">
                {row.fingerPrintID ?? row.FingerPrintID ?? "—"}
              </td>
              <td className="px-3 py-2 text-xs text-slate-500">
                {row.fingerType ?? row.FingerType ?? "—"}
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
