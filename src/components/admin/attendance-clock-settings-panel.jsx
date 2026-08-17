"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { hrPayrollFormFromApi, hrPayrollPayloadFromForm } from "@/lib/hr-settings";
import { AttendanceClockDevicesSettings } from "@/components/hr/attendance-clock-devices-settings";
import { AttendanceMobileDevicesPanel } from "@/components/hr/attendance-mobile-devices-panel";
import { CompanyPremisesPanel } from "@/components/hr/company-premises-panel";
import { Field, PrimaryButton, inputClassName, SearchableSelect } from "@/components/catalog/catalog-shared";
import { useSettingsApi, useSettingsAfterSave } from "@/contexts/settings-api-context";
import { notifyError, notifySuccess } from "@/lib/notify";

const TABS = [
  { id: "devices", label: "Clock device" },
  { id: "mobile", label: "Company mobile" },
];

/**
 * Admin module: choose how staff clock in, register devices, download attendance agent.
 */
export function AttendanceClockSettingsPanel() {
  const { settingsPath } = useSettingsApi();
  const afterSave = useSettingsAfterSave();
  const [form, setForm] = useState(hrPayrollFormFromApi({}));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageTab, setPageTab] = useState("devices");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiRequest(settingsPath("hr"), { loading: false })
      .then((res) => {
        if (!cancelled) setForm(hrPayrollFormFromApi(res));
      })
      .catch((e) => {
        if (!cancelled) {
          notifyError(e instanceof ApiError ? e.message : "Failed to load attendance settings");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [settingsPath]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiRequest(settingsPath("hr"), {
        method: "PATCH",
        body: hrPayrollPayloadFromForm(form),
      });
      setForm(hrPayrollFormFromApi(res));
      await afterSave();
      notifySuccess("Attendance clock-in settings saved.");
      if (form.attendance_capture_mode === "company_mobile") {
        setPageTab("mobile");
      }
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  const isClockDevice = form.attendance_capture_mode !== "company_mobile";

  return (
    <div className="space-y-6">
      <div
        className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
        role="tablist"
        aria-label="Attendance clock-in sections"
      >
        {TABS.map((tab) => {
          const active = pageTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPageTab(tab.id)}
              className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition ${
                active
                  ? "bg-[#185FA5] text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {pageTab === "devices" ? (
        <div className="space-y-6">
          <section className="theme-panel rounded-xl border p-6 shadow-sm">
            <h2 className="text-lg font-medium text-slate-900">Attendance method</h2>
            <p className="mt-1 text-sm text-slate-500">
              Organization-wide method for premises attendance. Field / mobile sales reps use a separate
              flow and are not affected.
            </p>

            {loading ? (
              <p className="mt-4 text-sm text-slate-500">Loading…</p>
            ) : (
              <form onSubmit={handleSave} className="mt-5 space-y-4">
                <Field label="Attendance method">
                  <SearchableSelect
                    className={inputClassName()}
                    value={form.attendance_capture_mode}
                    nativeEvent
                    onChange={(e) =>
                      setForm((f) => ({ ...f, attendance_capture_mode: e.target.value }))
                    }
                    options={[
                      { value: "clock_device", label: "Clock device (fingerprint / Hikvision terminals)" },
                      { value: "company_mobile", label: "Company mobile (shared phone + geofence)" },
                    ]}
                  />
                </Field>

                {form.attendance_capture_mode === "company_mobile" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Phone verification">
                      <SearchableSelect
                        className={inputClassName()}
                        value={form.company_mobile_verification_method}
                        nativeEvent
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            company_mobile_verification_method: e.target.value,
                          }))
                        }
                        options={[
                          { value: "face_or_fingerprint", label: "Face scan or fingerprint" },
                          { value: "face", label: "Face scan only" },
                          { value: "fingerprint", label: "Fingerprint only" },
                        ]}
                      />
                    </Field>
                    <Field label="Geofence radius (metres)">
                      <input
                        type="number"
                        min="1"
                        max="500"
                        className={inputClassName()}
                        value={form.company_premises_radius_metres}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            company_premises_radius_metres: e.target.value,
                          }))
                        }
                      />
                    </Field>
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">
                    Centrix runs in the cloud and cannot reach a LAN terminal IP. Register each device
                    below, then download the <strong>attendance agent</strong> for an office PC on the
                    same network (same idea as Local printing / Centrix Print Agent).
                  </p>
                )}

                {form.attendance_capture_mode === "company_mobile" ? (
                  <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                    Save, then open the <strong>Company mobile</strong> tab to set premises and phones.
                  </p>
                ) : null}

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-sm font-medium text-slate-900">Punch time windows (Africa/Nairobi)</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Fingerprint scans are classified from each employee’s <strong>work shift</strong>
                    (start, lunch midpoint, end). These hours are the fallback when someone has no shift.
                    The first punch of the day is always clock-in. Extra scans in the same hour, or outside
                    lunch/evening windows while already clocked in, are ignored. Late is shift start plus
                    the late-after grace (08:15 means 15 minutes after shift start).
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field label="Morning clock-in from">
                      <input
                        type="time"
                        className={inputClassName()}
                        value={form.morning_clock_in_from || "08:00"}
                        onChange={(e) => setForm((f) => ({ ...f, morning_clock_in_from: e.target.value }))}
                      />
                    </Field>
                    <Field label="Morning clock-in to">
                      <input
                        type="time"
                        className={inputClassName()}
                        value={form.morning_clock_in_to || "10:00"}
                        onChange={(e) => setForm((f) => ({ ...f, morning_clock_in_to: e.target.value }))}
                      />
                    </Field>
                    <Field label="Lunch clock-out from">
                      <input
                        type="time"
                        className={inputClassName()}
                        value={form.lunch_clock_out_from || "12:30"}
                        onChange={(e) => setForm((f) => ({ ...f, lunch_clock_out_from: e.target.value }))}
                      />
                    </Field>
                    <Field label="Lunch clock-out to">
                      <input
                        type="time"
                        className={inputClassName()}
                        value={form.lunch_clock_out_to || "14:00"}
                        onChange={(e) => setForm((f) => ({ ...f, lunch_clock_out_to: e.target.value }))}
                      />
                    </Field>
                    <Field label="Lunch clock-in from">
                      <input
                        type="time"
                        className={inputClassName()}
                        value={form.lunch_clock_in_from || "13:00"}
                        onChange={(e) => setForm((f) => ({ ...f, lunch_clock_in_from: e.target.value }))}
                      />
                    </Field>
                    <Field label="Lunch clock-in to">
                      <input
                        type="time"
                        className={inputClassName()}
                        value={form.lunch_clock_in_to || "16:00"}
                        onChange={(e) => setForm((f) => ({ ...f, lunch_clock_in_to: e.target.value }))}
                      />
                    </Field>
                    <Field label="Evening clock-out from">
                      <input
                        type="time"
                        className={inputClassName()}
                        value={form.evening_clock_out_from || "16:00"}
                        onChange={(e) => setForm((f) => ({ ...f, evening_clock_out_from: e.target.value }))}
                      />
                    </Field>
                    <Field label="Evening clock-out to">
                      <input
                        type="time"
                        className={inputClassName()}
                        value={form.evening_clock_out_to || "22:00"}
                        onChange={(e) => setForm((f) => ({ ...f, evening_clock_out_to: e.target.value }))}
                      />
                    </Field>
                    <Field label="Late after (first clock-in)">
                      <input
                        type="time"
                        className={inputClassName()}
                        value={form.clock_in_late_after || "08:15"}
                        onChange={(e) => setForm((f) => ({ ...f, clock_in_late_after: e.target.value }))}
                      />
                    </Field>
                    <Field label="Agent poll interval (minutes)">
                      <input
                        type="number"
                        min={1}
                        max={60}
                        className={inputClassName()}
                        value={form.hikvision_agent_poll_minutes || "5"}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, hikvision_agent_poll_minutes: e.target.value }))
                        }
                      />
                    </Field>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Centrix auto-pulls new punches every hour at :20 (Africa/Nairobi), from 7:20 AM through
                    2:00 AM. Overnight 2:00–7:20 is skipped. Keep CentrixAttendanceAgent running on the LAN
                    PC — it uploads punches to HR and answers Centrix pull commands. Use 5 minutes (or less)
                    for the agent poll so hourly sync can reach the terminal reliably.
                  </p>
                </div>

                <PrimaryButton type="submit" disabled={saving} showIcon={false}>
                  {saving ? "Saving…" : "Save attendance method"}
                </PrimaryButton>
              </form>
            )}
          </section>

          {isClockDevice ? <AttendanceClockDevicesSettings /> : (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Clock terminals are unused while attendance method is Company mobile. Switch back to Clock
              device and save to register Hikvision devices here.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {isClockDevice ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Attendance method is currently <strong>Clock device</strong>. Switch it on the Clock device
              tab and save if staff should clock in on company phones.
            </p>
          ) : null}
          <CompanyPremisesPanel embedded />
          <AttendanceMobileDevicesPanel embedded />
        </div>
      )}
    </div>
  );
}
