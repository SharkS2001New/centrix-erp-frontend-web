"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useSettingsApi } from "@/contexts/settings-api-context";
import { Field, PrimaryButton, FormModal, inputClassName } from "@/components/catalog/catalog-shared";

export function AttendanceClockDevicesSettings() {
  const { organizationApiPath } = useSettingsApi();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deviceNo, setDeviceNo] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest(organizationApiPath("/attendance-clock-devices"), {
        searchParams: { per_page: 100 },
      });
      setDevices(res.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load clock devices");
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, [organizationApiPath]);

  useEffect(() => {
    load();
  }, [load]);

  async function register() {
    if (!deviceNo.trim()) {
      setError("Device number is required.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(organizationApiPath("/attendance-clock-devices"), {
        method: "POST",
        body: {
          device_no: deviceNo.trim(),
          location: location.trim() || null,
          is_active: true,
        },
      });
      setDeviceNo("");
      setLocation("");
      setMessage("Clock device registered.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not register device");
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
            Register fingerprint terminals used for clock-in/out. Use the same device number on the
            terminal and in Centrix.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="text-xs font-medium text-[#185FA5] hover:underline"
        >
          Terminal setup guide
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-[#27500A]/20 bg-[#EAF3DE] px-3 py-2 text-sm text-[#27500A]">
          {message}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading devices…</p>
      ) : activeDevices.length === 0 ? (
        <p className="text-sm text-slate-500">No clock devices registered yet.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {activeDevices.map((device) => (
            <li key={device.id} className="px-3 py-2.5 text-sm">
              <p className="font-medium text-slate-900">{device.device_no}</p>
              <p className="text-xs text-slate-500">{device.location || "Location not set"}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Device number">
          <input
            type="text"
            value={deviceNo}
            onChange={(e) => setDeviceNo(e.target.value)}
            placeholder="TERMINAL-01"
            className={inputClassName()}
          />
        </Field>
        <Field label="Location (optional)">
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Main branch — reception"
            className={inputClassName()}
          />
        </Field>
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
      title="Clock terminal setup"
      open={open}
      onClose={onClose}
      onSubmit={onClose}
      submitLabel="Got it"
    >
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
        <li>Choose a unique device number for each terminal (e.g. <strong>TERMINAL-01</strong>).</li>
        <li>Register that number here with a location label for your team.</li>
        <li>
          Configure the fingerprint terminal or integration to send clock events using the same
          device number in the API payload.
        </li>
        <li>Employees clock in/out on the terminal; live sessions appear on the Attendance page.</li>
      </ol>
    </FormModal>
  );
}
