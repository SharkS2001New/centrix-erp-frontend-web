"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError, apiV1BaseUrl } from "@/lib/api";
import { useSettingsApi } from "@/contexts/settings-api-context";
import { Field, PrimaryButton, FormModal, inputClassName, SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  downloadAttendanceAgentPackage,
  downloadAttendanceAgentSource,
} from "@/lib/attendance-agent-download";

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
  const [downloadingSource, setDownloadingSource] = useState(false);

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

      const config = issued?.config;
      if (!config?.centrixToken) {
        throw new Error("Server did not return an agent token.");
      }

      // Prefer browser-known API URL so the agent hits the same origin as this session.
      config.centrixApiUrl = apiV1BaseUrl().replace(/\/$/, "");

      const { filename } = await downloadAttendanceAgentPackage(config);
      notifySuccess(`Downloaded ${filename}. Unzip on a LAN PC and run install-windows.bat.`);
      setDownloadDevice(null);
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : err?.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  async function handleDownloadSourceZip() {
    if (downloadingSource) return;
    setDownloadingSource(true);
    try {
      const { filename } = await downloadAttendanceAgentSource();
      notifySuccess(
        `Downloaded ${filename}. For a preconfigured zip (API URL + token), register a clock device first, then use Download agent zip.`,
      );
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Could not download attendance agent zip");
    } finally {
      setDownloadingSource(false);
    }
  }

  const activeDevices = devices.filter((d) => d.is_active !== false);

  function startConfiguredDownload() {
    if (!activeDevices.length) {
      notifyError("Add a clock device below first, then download a preconfigured agent zip.");
      return;
    }
    openDownload(activeDevices[0]);
  }

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium text-slate-900">Clock devices</h4>
          <p className="mt-1 text-xs text-slate-500">
            Centrix is cloud-hosted and cannot reach a LAN device IP directly. Register the terminal
            here, then download the preconfigured <strong>attendance agent</strong> for an office PC
            on the same network as the Hikvision.
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

      <section className="rounded-lg border border-[#185FA5]/30 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h5 className="text-sm font-semibold text-slate-900">Centrix Attendance Agent</h5>
            <p className="mt-1 text-xs text-slate-600">
              Same idea as Local printing / Print Agent: download a zip, unzip on a Windows PC on the
              same LAN as the fingerprint terminal, then install.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton
              type="button"
              showIcon={false}
              disabled={loading || downloading}
              onClick={() => startConfiguredDownload()}
            >
              {downloading ? "Preparing…" : "Download agent zip"}
            </PrimaryButton>
            <button
              type="button"
              className={SECONDARY_BTN_CLASS}
              disabled={downloadingSource}
              onClick={() => void handleDownloadSourceZip()}
            >
              {downloadingSource ? "Downloading…" : "Download blank package"}
            </button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          <strong>Download agent zip</strong> issues a Centrix token and prefills{" "}
          <code className="rounded bg-slate-100 px-1">config.json</code> for a registered device.
          Use <strong>blank package</strong> only if you will enter settings manually on the PC.
        </p>
      </section>

      {loading ? (
        <p className="text-sm text-slate-500">Loading devices…</p>
      ) : activeDevices.length === 0 ? (
        <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
          No clock devices yet. Add one below (device number + LAN IP), then click{" "}
          <strong>Download agent zip</strong>.
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
                </div>
                <PrimaryButton
                  type="button"
                  showIcon={false}
                  className="shrink-0"
                  onClick={() => openDownload(device)}
                >
                  Download agent zip
                </PrimaryButton>
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
        title={
          downloadDevice
            ? `Download agent zip — ${downloadDevice.device_no}`
            : "Download attendance agent zip"
        }
        open={Boolean(downloadDevice)}
        onClose={() => !downloading && setDownloadDevice(null)}
        onSubmit={() => void confirmDownload()}
        submitLabel={downloading ? "Preparing…" : "Download agent zip"}
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
          <li>
            Run <code>open-settings.bat</code> — first-run settings UI (confirm LAN IP / password).
          </li>
          <li>
            Install Node.js 20+ if needed, then run <code>install-windows.bat</code>.
          </li>
        </ol>
      </FormModal>
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
          (Administration → Attendance clock-in).
        </li>
        <li>
          Click <strong>Download agent zip</strong> — the zip is preconfigured with Centrix URL, token,
          and device settings. On a LAN PC: unzip → <code>open-settings.bat</code> (settings UI) →{" "}
          <code>install-windows.bat</code> (Node 20+).
        </li>
        <li>
          The agent polls the device locally and POSTs punches to{" "}
          <code>/api/v1/attendance/clock-punch</code>. Sessions appear on HR → Attendance.
        </li>
      </ol>
    </FormModal>
  );
}
