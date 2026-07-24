"use client";

import { Field, formatShortDate, inputClassName } from "@/components/catalog/catalog-shared";
import { HrCrudPage } from "@/components/hr/hr-crud-page";
import { useAuth } from "@/contexts/auth-context";
import { mergeHrPayrollSettings } from "@/lib/hr-settings";

function formatTime(t) {
  if (!t) return "—";
  return String(t).slice(0, 5);
}

function padTime(t) {
  if (!t) return t;
  return t.length === 5 ? `${t}:00` : t;
}

export function HrShiftsScreen() {
  const { capabilities } = useAuth();
  const hrDefaults = mergeHrPayrollSettings(capabilities?.module_settings);

  return (
    <>
    <HrCrudPage
      title="Work shifts"
      subtitle="Weekday and weekend/holiday hours, plus separate lunch settings when needed"
      addButtonLabel="Add shift"
      drawerWide
      apiPath="/work-shifts"
      columns={[
        { key: "shift_code", label: "Code" },
        { key: "shift_name", label: "Name" },
        {
          key: "start_time",
          label: "Hours",
          render: (r) => `${formatTime(r.start_time)} – ${formatTime(r.end_time)}`,
        },
        {
          key: "works_saturday",
          label: "Sat",
          render: (r) => (r.works_saturday ? "Yes" : "—"),
        },
        {
          key: "works_sunday",
          label: "Sun",
          render: (r) => (r.works_sunday ? "Yes" : "—"),
        },
        {
          key: "works_public_holidays",
          label: "Holidays",
          render: (r) => (r.works_public_holidays ? "Yes" : "—"),
        },
        {
          key: "use_alternate_hours",
          label: "Alt hours",
          render: (r) =>
            r.use_alternate_hours
              ? `${formatTime(r.alternate_start_time)}–${formatTime(r.alternate_end_time)}`
              : "—",
        },
        {
          key: "lunch_minutes",
          label: "Lunch",
          render: (r) => {
            const weekday =
              r.lunch_required === false
                ? "—"
                : `${r.lunch_minutes ?? hrDefaults.default_lunch_minutes ?? 60}m`;
            const hasAlt =
              r.alternate_lunch_minutes != null || r.alternate_lunch_required != null;
            if (!hasAlt) return weekday;
            const alt =
              r.alternate_lunch_required === false || Number(r.alternate_lunch_minutes) === 0
                ? "—"
                : `${r.alternate_lunch_minutes ?? r.lunch_minutes ?? 60}m`;
            return `${weekday} / ${alt}`;
          },
        },
      ]}
      searchFilter={(r, q) =>
        `${r.shift_code} ${r.shift_name}`.toLowerCase().includes(q)
      }
      buildEmptyForm={(_, row) => ({
        shift_code: row?.shift_code ?? "",
        shift_name: row?.shift_name ?? "",
        start_time: row?.start_time?.slice?.(0, 5) ?? "08:00",
        end_time: row?.end_time?.slice?.(0, 5) ?? "17:00",
        lunch_minutes:
          row?.lunch_minutes != null
            ? String(row.lunch_minutes)
            : String(hrDefaults.default_lunch_minutes ?? 60),
        lunch_required:
          row != null ? row.lunch_required !== false : hrDefaults.default_lunch_required !== false,
        crosses_midnight: !!row?.crosses_midnight,
        works_saturday: !!row?.works_saturday,
        works_sunday: !!row?.works_sunday,
        works_public_holidays: !!row?.works_public_holidays,
        use_alternate_hours: !!row?.use_alternate_hours,
        alternate_start_time: row?.alternate_start_time?.slice?.(0, 5) ?? "08:00",
        alternate_end_time: row?.alternate_end_time?.slice?.(0, 5) ?? "12:00",
        alternate_lunch_minutes:
          row?.alternate_lunch_minutes != null ? String(row.alternate_lunch_minutes) : "",
        alternate_lunch_required:
          row?.alternate_lunch_required != null
            ? row.alternate_lunch_required !== false
            : row != null
              ? row.lunch_required !== false
              : true,
        use_alternate_lunch:
          row?.alternate_lunch_minutes != null || row?.alternate_lunch_required != null,
        alternate_crosses_midnight: !!row?.alternate_crosses_midnight,
        is_active: row?.is_active !== false,
      })}
      buildBody={(form, orgId) => ({
        organization_id: orgId,
        shift_code: form.shift_code.trim(),
        shift_name: form.shift_name.trim(),
        start_time: padTime(form.start_time),
        end_time: padTime(form.end_time),
        lunch_minutes: form.lunch_required ? Number(form.lunch_minutes) || 60 : 0,
        lunch_required: form.lunch_required,
        crosses_midnight: form.crosses_midnight,
        works_saturday: form.works_saturday,
        works_sunday: form.works_sunday,
        works_public_holidays: form.works_public_holidays,
        use_alternate_hours: form.use_alternate_hours,
        alternate_start_time: form.use_alternate_hours ? padTime(form.alternate_start_time) : null,
        alternate_end_time: form.use_alternate_hours ? padTime(form.alternate_end_time) : null,
        alternate_lunch_minutes:
          (form.works_saturday || form.works_sunday || form.works_public_holidays) &&
          form.use_alternate_lunch
            ? form.alternate_lunch_required
              ? Number(form.alternate_lunch_minutes) || 0
              : 0
            : null,
        alternate_lunch_required:
          (form.works_saturday || form.works_sunday || form.works_public_holidays) &&
          form.use_alternate_lunch
            ? !!form.alternate_lunch_required
            : null,
        alternate_crosses_midnight: form.use_alternate_hours
          ? form.alternate_crosses_midnight
          : false,
        is_active: form.is_active,
      })}
      validateForm={(form) => {
        if (!form.shift_name?.trim()) return "Shift name is required.";
        if (
          form.lunch_required &&
          (form.lunch_minutes === "" || Number(form.lunch_minutes) < 0)
        ) {
          return "Set weekday lunch break minutes (or turn off lunch required).";
        }
        if (
          form.use_alternate_lunch &&
          form.alternate_lunch_required &&
          (form.alternate_lunch_minutes === "" || Number(form.alternate_lunch_minutes) < 0)
        ) {
          return "Set weekend / holiday lunch minutes (or turn off that lunch).";
        }
        if (
          form.use_alternate_hours &&
          (!form.alternate_start_time || !form.alternate_end_time)
        ) {
          return "Set alternate start and end times for Saturday / Sunday / public holidays.";
        }
        if (
          form.use_alternate_hours &&
          !form.works_saturday &&
          !form.works_sunday &&
          !form.works_public_holidays
        ) {
          return "Enable Saturday, Sunday, and/or public holidays to use alternate hours.";
        }
        return null;
      }}
      renderFormFields={(form, setForm) => (
        <>
          <Field label="Shift name">
            <input
              type="text"
              value={form.shift_name}
              onChange={(e) => setForm((p) => ({ ...p, shift_name: e.target.value }))}
              required
              className={inputClassName()}
            />
          </Field>
          <Field label="Code">
            <input
              type="text"
              value={form.shift_code}
              onChange={(e) => setForm((p) => ({ ...p, shift_code: e.target.value }))}
              className={`${inputClassName()} font-mono`}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start time">
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))}
                className={inputClassName()}
              />
            </Field>
            <Field label="End time">
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))}
                className={inputClassName()}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.lunch_required}
              onChange={(e) => setForm((p) => ({ ...p, lunch_required: e.target.checked }))}
            />
            Lunch break required
          </label>
          <p className="text-xs text-slate-500">
            Uncheck for shifts with no lunch (e.g. half-day). Attendance and payroll will not expect
            or credit a lunch break for this shift.
          </p>
          {form.lunch_required ? (
            <Field label="Weekday lunch minutes">
              <input
                type="number"
                min={0}
                max={240}
                value={form.lunch_minutes}
                onChange={(e) => setForm((p) => ({ ...p, lunch_minutes: e.target.value }))}
                className={inputClassName()}
              />
              <p className="mt-1 text-xs text-slate-500">
                Paid break by default on Mon–Fri. Staff clock out for lunch and back in; that time is
                credited, not treated as lost time.
              </p>
            </Field>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.crosses_midnight}
              onChange={(e) => setForm((p) => ({ ...p, crosses_midnight: e.target.checked }))}
            />
            Shift crosses midnight
          </label>
          <p className="text-xs font-medium text-slate-500">Works on</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.works_saturday}
              onChange={(e) => setForm((p) => ({ ...p, works_saturday: e.target.checked }))}
            />
            Saturday
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.works_sunday}
              onChange={(e) => setForm((p) => ({ ...p, works_sunday: e.target.checked }))}
            />
            Sunday
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.works_public_holidays}
              onChange={(e) =>
                setForm((p) => ({ ...p, works_public_holidays: e.target.checked }))
              }
            />
            Public holidays
          </label>
          {(form.works_saturday || form.works_sunday || form.works_public_holidays) && (
            <div className="mt-2 space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.use_alternate_lunch}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      use_alternate_lunch: e.target.checked,
                      alternate_lunch_required: e.target.checked
                        ? p.alternate_lunch_required
                        : p.lunch_required,
                      alternate_lunch_minutes: e.target.checked
                        ? p.alternate_lunch_minutes || p.lunch_minutes
                        : "",
                    }))
                  }
                />
                <span>
                  Different lunch on Saturday / Sunday / public holidays
                  <span className="mt-0.5 block text-xs text-slate-500">
                    e.g. weekdays 60 minutes, Saturday/holiday 30 minutes or no lunch
                  </span>
                </span>
              </label>
              {form.use_alternate_lunch ? (
                <>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.alternate_lunch_required}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          alternate_lunch_required: e.target.checked,
                        }))
                      }
                    />
                    Lunch break required on weekend / holiday
                  </label>
                  {form.alternate_lunch_required ? (
                    <Field label="Weekend / holiday lunch minutes">
                      <input
                        type="number"
                        min={0}
                        max={240}
                        value={form.alternate_lunch_minutes}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, alternate_lunch_minutes: e.target.value }))
                        }
                        className={inputClassName()}
                      />
                    </Field>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-slate-500">
                  Weekend and holiday days use the same lunch settings as weekdays.
                </p>
              )}
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.use_alternate_hours}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, use_alternate_hours: e.target.checked }))
                  }
                />
                <span>
                  Different clock-in / clock-out on Saturday / Sunday / public holidays
                  <span className="mt-0.5 block text-xs text-slate-500">
                    e.g. weekdays 08:00–17:00, Saturday and holidays 08:00–13:00
                  </span>
                </span>
              </label>
              {form.use_alternate_hours ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Alternate start">
                      <input
                        type="time"
                        value={form.alternate_start_time}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, alternate_start_time: e.target.value }))
                        }
                        className={inputClassName()}
                      />
                    </Field>
                    <Field label="Alternate end">
                      <input
                        type="time"
                        value={form.alternate_end_time}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, alternate_end_time: e.target.value }))
                        }
                        className={inputClassName()}
                      />
                    </Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.alternate_crosses_midnight}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          alternate_crosses_midnight: e.target.checked,
                        }))
                      }
                    />
                    Alternate shift crosses midnight
                  </label>
                </>
              ) : null}
            </div>
          )}
        </>
      )}
    />

    <div className="mt-10">
      <HrCrudPage
        embedded
        title="Public holidays"
        subtitle="Organization-wide holidays; attendance respects each shift’s “works on public holidays” setting"
        addButtonLabel="Add holiday"
        apiPath="/organization-holidays"
        columns={[
          {
            key: "holiday_date",
            label: "Date",
            render: (r) => formatShortDate(r.holiday_date),
          },
          { key: "name", label: "Name" },
          {
            key: "is_active",
            label: "Active",
            render: (r) => (r.is_active !== false ? "Yes" : "No"),
          },
        ]}
        searchFilter={(r, q) =>
          `${r.name} ${r.holiday_date}`.toLowerCase().includes(q)
        }
        buildEmptyForm={(_, row) => ({
          holiday_date: row?.holiday_date?.slice?.(0, 10) ?? "",
          name: row?.name ?? "",
          is_active: row?.is_active !== false,
        })}
        buildBody={(form, orgId) => ({
          organization_id: orgId,
          holiday_date: form.holiday_date,
          name: form.name.trim(),
          is_active: form.is_active,
        })}
        validateForm={(form) => {
          if (!form.holiday_date) return "Holiday date is required.";
          if (!form.name?.trim()) return "Holiday name is required.";
          return null;
        }}
        renderFormFields={(form, setForm) => (
          <>
            <Field label="Date">
              <input
                type="date"
                value={form.holiday_date}
                onChange={(e) => setForm((p) => ({ ...p, holiday_date: e.target.value }))}
                required
                className={inputClassName()}
              />
            </Field>
            <Field label="Name">
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                required
                className={inputClassName()}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
              />
              Active
            </label>
          </>
        )}
      />
    </div>
    </>
  );
}
