"use client";

import { Field, formatShortDate, inputClassName } from "@/components/catalog/catalog-shared";
import { HrCrudPage } from "@/components/hr/hr-crud-page";

function formatTime(t) {
  if (!t) return "—";
  return String(t).slice(0, 5);
}

export function HrShiftsScreen() {
  return (
    <>
    <HrCrudPage
      title="Work shifts"
      subtitle="Shift times, weekends, and public holidays per schedule"
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
      ]}
      searchFilter={(r, q) =>
        `${r.shift_code} ${r.shift_name}`.toLowerCase().includes(q)
      }
      buildEmptyForm={(_, row) => ({
        shift_code: row?.shift_code ?? "",
        shift_name: row?.shift_name ?? "",
        start_time: row?.start_time?.slice?.(0, 5) ?? "08:00",
        end_time: row?.end_time?.slice?.(0, 5) ?? "17:00",
        crosses_midnight: !!row?.crosses_midnight,
        works_saturday: !!row?.works_saturday,
        works_sunday: !!row?.works_sunday,
        works_public_holidays: !!row?.works_public_holidays,
        is_active: row?.is_active !== false,
      })}
      buildBody={(form, orgId) => ({
        organization_id: orgId,
        shift_code: form.shift_code.trim(),
        shift_name: form.shift_name.trim(),
        start_time: form.start_time.length === 5 ? `${form.start_time}:00` : form.start_time,
        end_time: form.end_time.length === 5 ? `${form.end_time}:00` : form.end_time,
        crosses_midnight: form.crosses_midnight,
        works_saturday: form.works_saturday,
        works_sunday: form.works_sunday,
        works_public_holidays: form.works_public_holidays,
        is_active: form.is_active,
      })}
      validateForm={(form) => (!form.shift_name?.trim() ? "Shift name is required." : null)}
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
