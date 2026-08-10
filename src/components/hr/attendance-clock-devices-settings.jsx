"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useSettingsApi } from "@/contexts/settings-api-context";
import { Field, PrimaryButton, FormModal, inputClassName } from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";

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

  const activeDevices = devices.filter((d) => d.is_active !== false);

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium text-slate-900">Clock devices</h4>
          <p className="mt-1 text-xs text-slate-500">
            Centrix is cloud-hosted and cannot reach a LAN device IP directly. Register the terminal
            here, then run the local <strong>attendance agent</strong> on an office PC (same network
            as the Hikvision) to push punches to Centrix.
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
        <p className="text-sm text-slate-500">No clock devices registered yet.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {activeDevices.map((device) => (
            <li key={device.id} className="px-3 py-2.5 text-sm">
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
                  {device.port ? `:${device.port}` : ""} (for local agent)
                </p>
              ) : null}
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
        <Field label="Device LAN IP (for local agent notes)">
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
            placeholder="Stored for admin reference / agent setup"
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
          with internet — the cloud cannot poll that IP. A small{" "}
          <strong>attendance agent</strong> on an office PC bridges them.
        </li>
        <li>
          On the terminal: static LAN IP, enable <strong>ISAPI</strong>, enroll staff with the same
          ID as Centrix <strong>employee code</strong> (<code>EMP#0001</code> or <code>0001</code>).
        </li>
        <li>
          Register the device here with a unique <strong>device number</strong> (e.g.{" "}
          <code>TERMINAL-01</code>). Note the LAN IP for the agent config.
        </li>
        <li>
          On a PC on the same LAN, run <code>attendance-agent/</code>: copy{" "}
          <code>config.example.json</code> → <code>config.json</code>, set Centrix API URL + token,
          device number, and Hikvision LAN IP, then <code>npm start</code> (or Task Scheduler every
          5 minutes with <code>npm run once</code>).
        </li>
        <li>
          The agent polls the device locally and POSTs punches to{" "}
          <code>/api/v1/attendance/clock-punch</code>. Sessions appear on HR → Attendance.
        </li>
      </ol>
    </FormModal>
  );
}
