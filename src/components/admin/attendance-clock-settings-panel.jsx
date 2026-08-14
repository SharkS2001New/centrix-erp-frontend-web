"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { hrPayrollFormFromApi, hrPayrollPayloadFromForm } from "@/lib/hr-settings";
import { AttendanceClockDevicesSettings } from "@/components/hr/attendance-clock-devices-settings";
import { AttendanceMobileDevicesPanel } from "@/components/hr/attendance-mobile-devices-panel";
import { CompanyPremisesPanel } from "@/components/hr/company-premises-panel";
import { Field, PrimaryButton, FormModal, inputClassName, SearchableSelect, SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import { SettingsSubTabBar } from "@/components/admin/settings-sub-tabs";
import { useSettingsApi, useSettingsAfterSave } from "@/contexts/settings-api-context";
import { notifyError, notifySuccess } from "@/lib/notify";

/**
 * Admin module: choose how staff clock in, register devices, download attendance agent.
 */
export function AttendanceClockSettingsPanel() {
  const { settingsPath } = useSettingsApi();
  const afterSave = useSettingsAfterSave();
  const [form, setForm] = useState(hrPayrollFormFromApi({}));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
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
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  const isClockDevice = form.attendance_capture_mode !== "company_mobile";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SettingsSubTabBar
          tabs={[
            { id: "devices", label: "Clock device" },
            { id: "method", label: "How staff clock in" },
          ]}
          activeTab={pageTab}
          onTabChange={setPageTab}
          ariaLabel="Attendance clock-in sections"
        />
        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          className={SECONDARY_BTN_CLASS}
        >
          Setup guide
        </button>
      </div>

      {pageTab === "devices" ? <AttendanceClockDevicesSettings /> : null}

      {pageTab === "method" ? (
      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">How staff clock in</h2>
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
                <Field label="Auto-sync interval (minutes)">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    className={inputClassName()}
                    value={form.hikvision_agent_poll_minutes || "60"}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, hikvision_agent_poll_minutes: e.target.value }))
                    }
                  />
                </Field>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Centrix pulls punches hourly at :20 from 7:20 AM through 2:00 AM (Africa/Nairobi).
                Overnight 2:00–7:20 is skipped because there are no punches. The office agent still
                catch-up-syncs when the PC boots. Keep CentrixAttendanceAgent running on the LAN PC.
              </p>
            </div>

            <PrimaryButton type="submit" disabled={saving} showIcon={false}>
              {saving ? "Saving…" : "Save attendance method"}
            </PrimaryButton>
          </form>
        )}
      </section>
      ) : null}

      {pageTab === "method" && !isClockDevice ? (
        <div className="space-y-4">
          <CompanyPremisesPanel embedded />
          <AttendanceMobileDevicesPanel embedded />
        </div>
      ) : null}

      <AttendanceConfigureGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}

function AttendanceConfigureGuideModal({ open, onClose }) {
  return (
    <FormModal
      title="Attendance clock-in — setup guide"
      open={open}
      onClose={onClose}
      onSubmit={onClose}
      submitLabel="Got it"
    >
      <div className="space-y-4 text-sm text-slate-700">
        <div>
          <p className="font-medium text-slate-900">Why an agent?</p>
          <p className="mt-1 text-slate-600">
            Centrix is hosted in the cloud. Hikvision terminals only have a private LAN IP. A small
            agent on an office PC polls the device and posts punches to Centrix — the same pattern as
            the Centrix Print Agent for tills.
          </p>
        </div>
        <div>
          <p className="font-medium text-slate-900">In Centrix (this page)</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-slate-600">
            <li>Choose Clock device and save.</li>
            <li>Add the terminal (device number, LAN IP, password).</li>
            <li>Download CentrixAttendanceAgent for that device.</li>
          </ol>
        </div>
        <div>
          <p className="font-medium text-slate-900">On the office PC (same LAN)</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-slate-600">
            <li>Install Node.js 20+ from nodejs.org if needed.</li>
            <li>Unzip the download.</li>
          <li>
            Run <code>install-windows.bat</code> as Administrator. The zip is already configured from
            Centrix. Windows installs the <strong>CentrixAttendanceAgent</strong> service. Use{" "}
            <code>open-settings.bat</code> only to <strong>Test connection</strong>.
          </li>
          </ol>
        </div>
        <div>
          <p className="font-medium text-slate-900">Staff enrollment</p>
          <p className="mt-1 text-slate-600">
            On the terminal, person / employee ID must match Centrix employee code (
            <code>EMP#0001</code> or <code>0001</code>). Wrong IDs are skipped.
          </p>
        </div>
      </div>
    </FormModal>
  );
}
