"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useSettingsApi } from "@/contexts/settings-api-context";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { AttendanceMobileDeviceIdHelpModal } from "@/components/hr/attendance-mobile-device-id-help-modal";

export function AttendanceMobileDevicesPanel({ embedded = false }) {
  const { organizationApiPath } = useSettingsApi();
  const [devices, setDevices] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    device_identifier: "",
    device_label: "",
    platform: "",
    branch_id: "",
  });
  const [saving, setSaving] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const multiBranch = branches.length > 1;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [deviceRes, branchRes, premisesRes] = await Promise.all([
        apiRequest(organizationApiPath("/attendance-mobile-devices"), {
          searchParams: { per_page: 100 },
        }),
        apiRequest(organizationApiPath("/branches"), { searchParams: { per_page: 200 } }),
        apiRequest(organizationApiPath("/attendance/company-premises")).catch(() => ({ branches: [] })),
      ]);
      setDevices(deviceRes.data ?? []);
      const branchList = branchRes.data ?? premisesRes.branches ?? [];
      setBranches(branchList);
      setForm((prev) => {
        const branchId = prev.branch_id || (branchList[0]?.branch_id ?? branchList[0]?.id ?? "");
        return { ...prev, branch_id: branchId ? String(branchId) : "" };
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load attendance phones");
    } finally {
      setLoading(false);
    }
  }, [organizationApiPath]);

  useEffect(() => {
    load();
  }, [load]);

  const branchLabel = useMemo(() => {
    const map = new Map(
      branches.map((b) => [String(b.branch_id ?? b.id), b.branch_name ?? b.name ?? "Branch"]),
    );
    return (branchId) => map.get(String(branchId)) ?? "—";
  }, [branches]);

  async function registerDevice() {
    if (!form.device_identifier.trim()) {
      setError("Device identifier is required.");
      return;
    }
    if (!form.branch_id) {
      setError("Select the branch this phone will serve.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiRequest(organizationApiPath("/attendance-mobile-devices"), {
        method: "POST",
        body: {
          device_identifier: form.device_identifier.trim(),
          branch_id: Number(form.branch_id),
          device_label: form.device_label.trim() || null,
          platform: form.platform.trim() || null,
        },
      });
      setForm((prev) => ({
        device_identifier: "",
        device_label: "",
        platform: "",
        branch_id: prev.branch_id,
      }));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to register phone");
    } finally {
      setSaving(false);
    }
  }

  async function toggleDevice(device) {
    setError(null);
    try {
      await apiRequest(organizationApiPath(`/attendance-mobile-devices/${device.id}`), {
        method: "PUT",
        body: { is_active: !device.is_active },
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to update phone");
    }
  }

  async function removeDevice(device) {
    if (!confirm(`Remove attendance phone "${device.device_label || device.device_identifier}"?`)) return;
    setError(null);
    try {
      await apiRequest(organizationApiPath(`/attendance-mobile-devices/${device.id}`), {
        method: "DELETE",
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to remove phone");
    }
  }

  const shellClass = embedded
    ? "mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4"
    : "mb-8 theme-panel rounded-xl border p-5 shadow-sm";

  return (
    <section className={shellClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={embedded ? "text-sm font-medium text-slate-900" : "text-[15px] font-medium text-slate-900"}>
            Registered attendance phones
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Only phones listed here can mark attendance. Each phone is tied to one branch.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="text-xs font-medium text-[#185FA5] hover:underline"
        >
          How to get Device ID
        </button>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Field label="Device ID">
          <input
            className={inputClassName()}
            value={form.device_identifier}
            onChange={(e) => setForm((f) => ({ ...f, device_identifier: e.target.value }))}
            placeholder="android:… or ios:…"
          />
        </Field>
        {multiBranch || branches.length > 0 ? (
          <Field label="Branch">
            <select
              className={inputClassName()}
              value={form.branch_id}
              onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value }))}
            >
              {branches.map((branch) => {
                const id = branch.branch_id ?? branch.id;
                return (
                  <option key={id} value={String(id)}>
                    {branch.branch_name ?? branch.name}
                  </option>
                );
              })}
            </select>
          </Field>
        ) : (
          <Field label="Branch">
            <p className="text-sm text-amber-700">Add an active branch before registering a phone.</p>
          </Field>
        )}
        <Field label="Label">
          <input
            className={inputClassName()}
            value={form.device_label}
            onChange={(e) => setForm((f) => ({ ...f, device_label: e.target.value }))}
            placeholder="Reception phone"
          />
        </Field>
        <Field label="Platform">
          <input
            className={inputClassName()}
            value={form.platform}
            onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
            placeholder="android"
          />
        </Field>
        <div className="flex items-end">
          <PrimaryButton
            type="button"
            disabled={saving || !branches.length}
            showIcon={false}
            onClick={() => void registerDevice()}
          >
            {saving ? "Saving…" : "Register phone"}
          </PrimaryButton>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading phones…</p>
      ) : devices.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No attendance phones registered yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {devices.map((device) => (
            <li key={device.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium text-slate-900">
                  {device.device_label || "Attendance phone"}
                  {!device.is_active ? (
                    <span className="ml-2 text-xs font-normal text-amber-700">Inactive</span>
                  ) : null}
                </p>
                <p className="font-mono text-xs text-slate-500">{device.device_identifier}</p>
                <p className="text-xs text-slate-500">
                  Branch: {device.branch?.branch_name ?? branchLabel(device.branch_id)}
                </p>
                {device.platform ? (
                  <p className="text-xs text-slate-400">{device.platform}</p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => toggleDevice(device)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {device.is_active ? "Deactivate" : "Activate"}
                </button>
                <button
                  type="button"
                  onClick={() => removeDevice(device)}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <AttendanceMobileDeviceIdHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </section>
  );
}
