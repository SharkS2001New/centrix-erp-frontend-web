"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { apiRequest, ApiError, apiV1BaseUrl } from "@/lib/api";
import { useSettingsApi } from "@/contexts/settings-api-context";
import { Field, PrimaryButton, FormModal, inputClassName, SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  downloadAttendanceAgentPackage,
} from "@/lib/attendance-agent-download";
import { attendanceClockDeviceHref } from "@/lib/attendance-clock-paths";

const EMPTY_FORM = {
  device_no: "",
  location: "",
  provider: "hikvision",
  host: "",
  port: "80",
  username: "admin",
  password: "",
  use_https: false,
};

export function AttendanceClockDevicesSettings() {
  const { organizationApiPath } = useSettingsApi();
  const pathname = usePathname();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [downloadDevice, setDownloadDevice] = useState(null);
  const [downloadForm, setDownloadForm] = useState({
    host: "",
    port: "80",
    username: "admin",
    password: "",
    use_https: false,
  });
  const [downloading, setDownloading] = useState(false);
  const [connectionTestingId, setConnectionTestingId] = useState(null);
  const [probeById, setProbeById] = useState({});
  const probedKeyRef = useRef("");
  const devicesRef = useRef([]);
  const [editDevice, setEditDevice] = useState(null);
  const [editForm, setEditForm] = useState({
    location: "",
    host: "",
    port: "80",
    username: "admin",
    password: "",
    use_https: false,
  });
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(organizationApiPath("/attendance-clock-devices"), {
        searchParams: { per_page: 100 },
      });
      setDevices(res.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load clock devices");
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, [organizationApiPath]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  const testDeviceConnection = useCallback(async (device, { silent = false } = {}) => {
    setConnectionTestingId(device.id);
    setProbeById((prev) => ({
      ...prev,
      [device.id]: { ...(prev[device.id] || {}), testing: true },
    }));
    try {
      const result = await apiRequest(
        organizationApiPath(`/attendance-clock-devices/${device.id}/hikvision/test-connection`),
        { method: "POST", loading: false },
      );
      setProbeById((prev) => ({
        ...prev,
        [device.id]: {
          testing: false,
          online: Boolean(result.online),
          agent: result.agent || null,
          error: result.error || null,
          message: result.message || null,
          checkedAt: Date.now(),
        },
      }));
      if (!silent) {
        if (result.online) {
          notifySuccess(result.message ?? `CentrixAttendanceAgent is connected for ${device.device_no}.`);
        } else {
          notifyError(result.error ?? "CentrixAttendanceAgent is not reachable.");
        }
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Connection test failed";
      setProbeById((prev) => ({
        ...prev,
        [device.id]: { testing: false, online: false, error: msg, checkedAt: Date.now() },
      }));
      if (!silent) notifyError(msg);
    } finally {
      setConnectionTestingId(null);
    }
  }, [organizationApiPath]);

  function openEdit(device) {
    setEditDevice(device);
    setEditForm({
      location: device.location || "",
      host: device.host || "",
      port: device.port != null ? String(device.port) : "80",
      username: device.username || "admin",
      password: "",
      use_https: Boolean(device.use_https),
    });
  }

  async function saveEdit() {
    if (!editDevice?.id || editSaving) return;
    if (!editForm.host.trim()) {
      notifyError("Device LAN IP is required.");
      return;
    }
    setEditSaving(true);
    try {
      const body = {
        location: editForm.location.trim() || null,
        host: editForm.host.trim(),
        port: editForm.port ? Number(editForm.port) : 80,
        username: editForm.username.trim() || "admin",
        use_https: Boolean(editForm.use_https),
      };
      if (editForm.password.trim()) {
        body.password = editForm.password.trim();
      }
      await apiRequest(organizationApiPath(`/attendance-clock-devices/${editDevice.id}`), {
        method: "PATCH",
        body,
      });
      notifySuccess(`${editDevice.device_no} updated.`);
      setEditDevice(null);
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not update device");
    } finally {
      setEditSaving(false);
    }
  }

  async function register() {
    if (!form.device_no.trim()) {
      notifyError("Device number is required.");
      return;
    }
    setSaving(true);
    try {
      const body = {
        device_no: form.device_no.trim(),
        location: form.location.trim() || null,
        is_active: true,
        provider: form.provider || "hikvision",
        host: form.host.trim() || null,
        port: form.port ? Number(form.port) : null,
        username: form.username.trim() || null,
        use_https: Boolean(form.use_https),
      };
      if (form.password.trim()) {
        body.password = form.password.trim();
      }
      await apiRequest(organizationApiPath("/attendance-clock-devices"), {
        method: "POST",
        body,
      });
      setForm(EMPTY_FORM);
      notifySuccess("Clock device registered.");
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not register device");
    } finally {
      setSaving(false);
    }
  }

  function openDownload(device) {
    setDownloadDevice(device);
    setDownloadForm({
      host: device.host || "",
      port: device.port != null ? String(device.port) : "80",
      username: device.username || "admin",
      password: "",
      use_https: Boolean(device.use_https),
    });
  }

  async function confirmDownload() {
    if (!downloadDevice?.id || downloading) return;
    if (!downloadForm.host.trim()) {
      notifyError("Enter the Hikvision LAN IP for this office network.");
      return;
    }
    if (!downloadDevice.has_password && !downloadForm.password.trim()) {
      notifyError("Enter the device password (or save it on the device record first).");
      return;
    }

    setDownloading(true);
    try {
      const body = {
        host: downloadForm.host.trim(),
        port: downloadForm.port ? Number(downloadForm.port) : 80,
        username: downloadForm.username.trim() || "admin",
        use_https: Boolean(downloadForm.use_https),
        centrix_api_url: apiV1BaseUrl(),
        persist_device: true,
      };
      if (downloadForm.password.trim()) {
        body.password = downloadForm.password.trim();
      }

      const issued = await apiRequest(
        organizationApiPath(`/attendance-clock-devices/${downloadDevice.id}/agent-package`),
        { method: "POST", body },
      );

      const issuedConfig = issued?.config && typeof issued.config === "object" ? issued.config : {};
      if (!issuedConfig.centrixToken) {
        throw new Error("Server did not return an agent token.");
      }

      const deviceId = Number(issuedConfig.deviceId ?? downloadDevice.id);
      if (!Number.isFinite(deviceId) || deviceId <= 0) {
        throw new Error("Server did not return a device id. Save the clock device, then download again.");
      }

      const config = {
        ...issuedConfig,
        deviceId,
        deviceNo: String(issuedConfig.deviceNo || downloadDevice.device_no || "").trim(),
        centrixApiUrl: apiV1BaseUrl().replace(/\/$/, ""),
      };

      const { filename } = await downloadAttendanceAgentPackage(config);
      notifySuccess(`Downloaded ${filename}. Unzip on a LAN PC and run install-windows.bat as Administrator.`);
      setDownloadDevice(null);
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : err?.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  const activeDevices = devices.filter((d) => d.is_active !== false);
  const deviceIdsKey = activeDevices.map((d) => d.id).join(",");

  useEffect(() => {
    if (loading || !deviceIdsKey) return undefined;
    if (probedKeyRef.current === deviceIdsKey) return undefined;
    probedKeyRef.current = deviceIdsKey;
    let cancelled = false;
    const list = devicesRef.current.filter((d) => d.is_active !== false);
    (async () => {
      for (const device of list) {
        if (cancelled) return;
        await testDeviceConnection(device, { silent: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, deviceIdsKey, testDeviceConnection]);

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium text-slate-900">Clock devices</h4>
          <p className="mt-1 text-xs text-slate-500">
            Centrix is cloud-hosted and cannot reach a LAN device IP directly. Register the terminal
            below, then download <strong>CentrixAttendanceAgent</strong> for that device. Install it on
            an office PC on the same network as the Hikvision. Agent status is checked automatically
            when you open this page.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="text-xs font-medium text-[#185FA5] hover:underline"
        >
          Cloud + LAN setup guide
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading devices…</p>
      ) : activeDevices.length === 0 ? (
        <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
          No clock devices yet. Add one below (device number + LAN IP), then download{" "}
          <strong>CentrixAttendanceAgent</strong> for that device.
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {activeDevices.map((device) => (
            <li key={device.id} className="px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-slate-900">{device.device_no}</p>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">
                      {device.provider || "generic"}
                    </p>
                  </div>
                  <p className="text-xs text-slate-500">{device.location || "Location not set"}</p>
                  {device.host ? (
                    <p className="mt-0.5 font-mono text-xs text-slate-500">
                      LAN {device.use_https ? "https" : "http"}://{device.host}
                      {device.port ? `:${device.port}` : ""}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-amber-700">LAN IP not set — required for agent</p>
                  )}
                  <AgentStatusLine device={device} probe={probeById[device.id]} />
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <button
                  type="button"
                  className={SECONDARY_BTN_CLASS}
                  onClick={() => openEdit(device)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={SECONDARY_BTN_CLASS}
                  disabled={connectionTestingId === device.id || probeById[device.id]?.testing}
                  onClick={() => void testDeviceConnection(device)}
                >
                  {connectionTestingId === device.id || probeById[device.id]?.testing
                    ? "Checking…"
                    : "Recheck"}
                </button>
                <Link
                  href={attendanceClockDeviceHref(pathname, device.id)}
                  className={`${SECONDARY_BTN_CLASS} text-center`}
                >
                  Manage Hikvision
                </Link>
                <PrimaryButton
                  type="button"
                  showIcon={false}
                  className="shrink-0"
                  onClick={() => openDownload(device)}
                >
                  Download CentrixAttendanceAgent
                </PrimaryButton>
              </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Device number">
          <input
            type="text"
            value={form.device_no}
            onChange={(e) => setForm((p) => ({ ...p, device_no: e.target.value }))}
            placeholder="TERMINAL-01"
            className={inputClassName()}
          />
        </Field>
        <Field label="Location (optional)">
          <input
            type="text"
            value={form.location}
            onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
            placeholder="Main branch — reception"
            className={inputClassName()}
          />
        </Field>
        <Field label="Device LAN IP (for local agent)">
          <input
            type="text"
            value={form.host}
            onChange={(e) => setForm((p) => ({ ...p, host: e.target.value }))}
            placeholder="192.168.1.50"
            className={inputClassName()}
          />
        </Field>
        <Field label="Port">
          <input
            type="number"
            value={form.port}
            onChange={(e) => setForm((p) => ({ ...p, port: e.target.value }))}
            placeholder="80"
            className={inputClassName()}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Hikvision ISAPI HTTP uses port <strong>80</strong> — not 8000 (Centrix dev server).
          </p>
        </Field>
        <Field label="Device username">
          <input
            type="text"
            value={form.username}
            onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
            placeholder="admin"
            className={inputClassName()}
            autoComplete="off"
          />
        </Field>
        <Field label="Device password">
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            placeholder="Stored encrypted for agent download"
            className={inputClassName()}
            autoComplete="new-password"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={form.use_https}
            onChange={(e) => setForm((p) => ({ ...p, use_https: e.target.checked }))}
          />
          Device uses HTTPS on LAN
        </label>
        <div className="sm:col-span-2">
          <PrimaryButton
            type="button"
            disabled={saving}
            showIcon={false}
            onClick={() => void register()}
          >
            {saving ? "Saving…" : "Add clock device"}
          </PrimaryButton>
        </div>
      </div>

      <AttendanceClockDeviceHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      <FormModal
        title={editDevice ? `Edit clock device — ${editDevice.device_no}` : ""}
        open={Boolean(editDevice)}
        onClose={() => !editSaving && setEditDevice(null)}
        onSubmit={() => void saveEdit()}
        submitLabel={editSaving ? "Saving…" : "Save changes"}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Location (optional)">
              <input
                type="text"
                value={editForm.location}
                onChange={(e) => setEditForm((p) => ({ ...p, location: e.target.value }))}
                className={inputClassName()}
              />
            </Field>
          </div>
          <Field label="Device LAN IP">
            <input
              type="text"
              value={editForm.host}
              onChange={(e) => setEditForm((p) => ({ ...p, host: e.target.value }))}
              placeholder="192.168.100.215"
              className={inputClassName()}
              autoFocus
            />
          </Field>
          <Field label="Port">
            <input
              type="number"
              value={editForm.port}
              onChange={(e) => setEditForm((p) => ({ ...p, port: e.target.value }))}
              className={inputClassName()}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Use <strong>80</strong> for Hikvision HTTP ISAPI. Port 8000 is the Centrix API, not the
              terminal.
            </p>
          </Field>
          <Field label="Username">
            <input
              type="text"
              value={editForm.username}
              onChange={(e) => setEditForm((p) => ({ ...p, username: e.target.value }))}
              className={inputClassName()}
              autoComplete="off"
            />
          </Field>
          <Field
            label={editDevice?.has_password ? "Password (leave blank to keep)" : "Device password"}
          >
            <input
              type="password"
              value={editForm.password}
              onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))}
              className={inputClassName()}
              autoComplete="new-password"
              placeholder={editDevice?.has_password ? "••••••••" : "Required"}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
            <input
              type="checkbox"
              checked={editForm.use_https}
              onChange={(e) => setEditForm((p) => ({ ...p, use_https: e.target.checked }))}
            />
            Device uses HTTPS on LAN
          </label>
        </div>
      </FormModal>

      <FormModal
        title={
          downloadDevice
            ? `Download CentrixAttendanceAgent — ${downloadDevice.device_no}`
            : "Download CentrixAttendanceAgent"
        }
        open={Boolean(downloadDevice)}
        onClose={() => !downloading && setDownloadDevice(null)}
        onSubmit={() => void confirmDownload()}
        submitLabel={downloading ? "Preparing…" : "Download CentrixAttendanceAgent"}
      >
        <p className="mb-3 text-sm text-slate-600">
          Centrix API URL, device number, and a dedicated agent token are filled in automatically.
          Confirm the Hikvision LAN settings for the office PC that will run the agent.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Hikvision LAN IP">
            <input
              type="text"
              value={downloadForm.host}
              onChange={(e) => setDownloadForm((p) => ({ ...p, host: e.target.value }))}
              placeholder="192.168.1.50"
              className={inputClassName()}
              autoFocus
            />
          </Field>
          <Field label="Port">
            <input
              type="number"
              value={downloadForm.port}
              onChange={(e) => setDownloadForm((p) => ({ ...p, port: e.target.value }))}
              className={inputClassName()}
            />
            <p className="mt-1 text-[11px] text-slate-500">Hikvision HTTP ISAPI: port 80.</p>
          </Field>
          <Field label="Username">
            <input
              type="text"
              value={downloadForm.username}
              onChange={(e) => setDownloadForm((p) => ({ ...p, username: e.target.value }))}
              className={inputClassName()}
              autoComplete="off"
            />
          </Field>
          <Field
            label={
              downloadDevice?.has_password
                ? "Password (leave blank to keep saved)"
                : "Device password"
            }
          >
            <input
              type="password"
              value={downloadForm.password}
              onChange={(e) => setDownloadForm((p) => ({ ...p, password: e.target.value }))}
              className={inputClassName()}
              autoComplete="new-password"
              placeholder={downloadDevice?.has_password ? "••••••••" : "Required"}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
            <input
              type="checkbox"
              checked={downloadForm.use_https}
              onChange={(e) => setDownloadForm((p) => ({ ...p, use_https: e.target.checked }))}
            />
            Device uses HTTPS on LAN
          </label>
        </div>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-slate-500">
          <li>Unzip on a Windows PC on the same LAN as the terminal.</li>
          <li>Install Node.js 20+ if needed, then run <code>install-windows.bat</code> as Administrator.</li>
          <li>
            Windows installs the service using the Centrix download (no local settings form). Agent
            status is shown automatically in Centrix when you open Attendance clock-in.
          </li>
        </ol>
      </FormModal>
    </div>
  );
}

function agentOnlineTtlMs(device, probe = null) {
  const seconds = Number(probe?.agent?.online_ttl_seconds ?? device?.agent_online_ttl_seconds ?? 120);
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : 120) * 1000;
}

function isAgentOnline(device, probe = null) {
  if (!device?.agent_last_seen_at) return false;
  const seen = new Date(device.agent_last_seen_at).getTime();
  return Date.now() - seen < agentOnlineTtlMs(device, probe);
}

function AgentStatusLine({ device, probe }) {
  const testing = Boolean(probe?.testing);
  const probed = probe && !probe.testing && probe.checkedAt;
  const online = probed ? Boolean(probe.online) : isAgentOnline(device, probe);
  const detail = probed
    ? probe.online
      ? probe.message || "Centrix can reach the office agent."
      : probe.error || "CentrixAttendanceAgent is not reachable."
    : device.agent_last_seen_at
      ? `last seen ${new Date(device.agent_last_seen_at).toLocaleString()}`
      : "download and install on a LAN PC";

  return (
    <div
      className={`mt-2 rounded-md border px-2.5 py-1.5 text-xs ${
        testing
          ? "border-slate-200 bg-slate-50 text-slate-600"
          : online
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <p className="font-semibold">
        {testing
          ? "Checking CentrixAttendanceAgent…"
          : online
            ? "CentrixAttendanceAgent online"
            : "CentrixAttendanceAgent offline"}
      </p>
      <p className="mt-0.5">{detail}</p>
    </div>
  );
}

function AttendanceClockDeviceHelpModal({ open, onClose }) {
  return (
    <FormModal
      title="Cloud Centrix + LAN Hikvision"
      open={open}
      onClose={onClose}
      onSubmit={onClose}
      submitLabel="Got it"
    >
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
        <li>
          Centrix runs in the <strong>cloud</strong>. Your Hikvision has a <strong>local LAN IP</strong>{" "}
          — the cloud cannot poll that IP. A small <strong>attendance agent</strong> on an office PC
          bridges them (same idea as the Centrix Print Agent).
        </li>
        <li>
          On the terminal: static LAN IP, enable <strong>ISAPI</strong>, enroll staff with the same ID
          as Centrix <strong>employee code</strong> (<code>EMP#0001</code> or <code>0001</code>).
        </li>
        <li>
          Register the device here with a unique <strong>device number</strong>, LAN IP, and password
          (HR → Attendance clock-in).
        </li>
        <li>
          Click <strong>Download CentrixAttendanceAgent</strong> on the device — the zip is preconfigured
          with Centrix URL, token, and device settings. On a LAN PC: unzip →{" "}
          <code>install-windows.bat</code> as Administrator (Node 20+). The installer uses that config
          and installs the Windows service. Agent status is checked automatically in Centrix when you
          open Attendance clock-in.
        </li>
        <li>
          The agent talks to the Hikvision on the LAN and to Centrix online — attendance punches and
          Manage Hikvision (users, cards, fingerprints, test connection) all go through it.
        </li>
      </ol>
    </FormModal>
  );
}
