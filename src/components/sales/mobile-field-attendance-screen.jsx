"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { OrgSettingsPlatformHint } from "@/components/admin/org-settings-platform-hint";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  CatalogPageShell,
  Field,
  PrimaryButton,
  SearchInput,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-shared";
import { FieldRepHrLinkageBanner } from "@/components/hr/field-rep-hr-linkage-banner";
import { CustomerLocationMapEmbed } from "@/components/customers/customer-location-map-embed";
import { EntityPhotoDisplay } from "@/components/media/entity-photo-display";
import { GpsLocationLabel } from "@/components/shared/gps-location-label";
import { hasValidCustomerLocation } from "@/lib/customer-location";
import { formatAppDateTime, calendarDateInTimezone, todayCalendarDate } from "@/lib/datetime";
import { P } from "@/lib/permission-codes";
import { formatAttendanceSource, attendanceSourceBadgeClass } from "@/lib/hr-settings";
import { shouldShowMobileFieldAttendance } from "@/lib/sales-settings";

function daysAgoCalendarDate(days) {
  const today = todayCalendarDate();
  const ms = Date.parse(`${today}T12:00:00+03:00`) - days * 86_400_000;
  return calendarDateInTimezone(new Date(ms)) ?? today;
}

function formatDateTime(value) {
  return formatAppDateTime(value);
}

function toLocalInputValue(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function AttendanceLocationBlock({ latitude, longitude, address, photoFileUrl, label }) {
  const hasCoords = hasValidCustomerLocation(latitude, longitude);

  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <div className="mt-1">
        <GpsLocationLabel
          latitude={latitude}
          longitude={longitude}
          address={address}
          showCoordinates
          showMapLink={hasCoords}
        />
      </div>
      {hasCoords ? (
        <CustomerLocationMapEmbed latitude={latitude} longitude={longitude} heightClass="h-40 mt-3" />
      ) : null}
      {photoFileUrl ? (
        <div className="mt-2 max-h-48 overflow-hidden rounded-lg border bg-slate-900/40">
          <EntityPhotoDisplay
            fileUrl={photoFileUrl}
            alt={label}
            className="max-h-48 w-full object-cover"
            placeholderClassName="flex h-24 items-center justify-center px-2 text-center text-xs text-slate-400"
          />
        </div>
      ) : null}
    </div>
  );
}

export default function MobileFieldAttendanceScreen({ variant = "sales" }) {
  const isHr = variant === "hr";
  const apiBase = isHr ? "/attendance/field-sessions" : "/sales/mobile-field-attendance";
  const { capabilities, hasPermission } = useAuth();
  const allowed = shouldShowMobileFieldAttendance(capabilities);
  const canEdit = isHr
    ? hasPermission?.(P.hr.manage)
    : hasPermission?.("sales.manage");

  const [fromDate, setFromDate] = useState(daysAgoCalendarDate(7));
  const [toDate, setToDate] = useState(todayCalendarDate());
  const [search, setSearch] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [rows, setRows] = useState([]);
  const [hrLinkage, setHrLinkage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [editForm, setEditForm] = useState({ sign_in_at: "", sign_out_at: "" });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        from_date: fromDate,
        to_date: toDate,
        per_page: "100",
      });
      if (search.trim()) params.set("q", search.trim());
      if (openOnly) params.set("open_only", "1");

      const res = await apiRequest(`${apiBase}?${params.toString()}`);
      setRows(Array.isArray(res?.data) ? res.data : []);
      if (isHr && res?.hr_linkage) {
        setHrLinkage(res.hr_linkage);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load field attendance");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, fromDate, toDate, search, openOnly, isHr]);

  useEffect(() => {
    if (!allowed) return;
    loadRows();
  }, [allowed, loadRows]);

  const totals = useMemo(() => {
    const totalSeconds = rows.reduce((sum, row) => sum + Number(row.work_seconds ?? 0), 0);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return {
      sessions: rows.length,
      open: rows.filter((row) => row.is_open).length,
      hoursLabel: `${hours}:${String(minutes).padStart(2, "0")}`,
    };
  }, [rows]);

  function openEdit(row) {
    setSelected(row);
    setEditForm({
      sign_in_at: toLocalInputValue(row.sign_in_at),
      sign_out_at: toLocalInputValue(row.sign_out_at),
    });
    setSaveMessage(null);
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!selected || !canEdit) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const body = {
        sign_in_at: fromLocalInputValue(editForm.sign_in_at),
        sign_out_at: fromLocalInputValue(editForm.sign_out_at),
      };
      const updated = await apiRequest(`${apiBase}/${selected.id}`, {
        method: "PATCH",
        body,
      });
      setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setSelected(updated);
      setSaveMessage("Attendance times updated.");
    } catch (err) {
      setSaveMessage(err instanceof ApiError ? err.message : "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) {
    return (
      <CatalogPageShell
        title="Field attendance"
        subtitle={
          isHr
            ? "Mobile sales rep sign-in records (part of HR attendance)"
            : "Mobile sales rep sign-in records"
        }
      >
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          <p className="font-medium">Field attendance is not enabled</p>
          <p className="mt-1">
            Enable <strong>Require sign-in photo and location</strong> under{" "}
            <OrgSettingsPlatformHint area="Organization settings → Mobile app" />.
          </p>
        </div>
      </CatalogPageShell>
    );
  }

  return (
    <CatalogPageShell
      title="Field attendance"
      subtitle={
        isHr
          ? "Mobile rep sessions with photos, GPS, and worked hours — part of HR attendance"
          : "Sign-in and sign-out sessions from the mobile app with photos, GPS, and worked hours"
      }
    >
      {isHr ? (
        <p className="mb-4 text-sm text-slate-600">
          Also available under{" "}
          <Link href="/sales/field-attendance" className="font-medium text-[#185FA5] hover:underline">
            Sales → Field attendance
          </Link>{" "}
          for field sales teams.
        </p>
      ) : (
        <p className="mb-4 text-sm text-slate-600">
          HR view:{" "}
          <Link href="/hr/field-attendance" className="font-medium text-[#185FA5] hover:underline">
            Time &amp; attendance → Field attendance
          </Link>
          .
        </p>
      )}
      {error ? <DashboardErrorBanner message={error} /> : null}
      {isHr ? <FieldRepHrLinkageBanner linkage={hrLinkage} canManage={canEdit} /> : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="theme-panel rounded-xl border px-4 py-3 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Sessions</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totals.sessions}</p>
        </div>
        <div className="theme-panel rounded-xl border px-4 py-3 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Active now</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">{totals.open}</p>
        </div>
        <div className="theme-panel rounded-xl border px-4 py-3 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Hours in range</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totals.hoursLabel}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 theme-panel rounded-xl border p-4 shadow-sm">
        <Field label="From">
          <input type="date" className={inputClassName()} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" className={inputClassName()} value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </Field>
        <Field label="Search rep">
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or username" />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          Active sessions only
        </label>
        <PrimaryButton type="button" showIcon={false} onClick={loadRows} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </PrimaryButton>
      </div>

      <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Rep</th>
              <th className="px-4 py-3">Sign in</th>
              <th className="px-4 py-3">Sign out</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Loading sessions…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No attendance sessions in this date range.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.user_name || row.username || "—"}</div>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${attendanceSourceBadgeClass(row.source || "field_rep")}`}
                    >
                      {formatAttendanceSource(row.source || "field_rep", row.source_label)}
                    </span>
                    {row.hr_link && !row.hr_link.counts_toward_payroll ? (
                      <p className="mt-1 text-[11px] font-medium text-amber-700">
                        Not in HR / payroll — link employee profile
                      </p>
                    ) : null}
                    <GpsLocationLabel
                      latitude={row.sign_in_latitude}
                      longitude={row.sign_in_longitude}
                      address={row.sign_in_address}
                      showCoordinates={false}
                      className="text-xs text-slate-500"
                      loadingClassName="text-xs text-slate-400"
                    />
                  </td>
                  <td className="px-4 py-3">{formatDateTime(row.sign_in_at)}</td>
                  <td className="px-4 py-3">{formatDateTime(row.sign_out_at)}</td>
                  <td className="px-4 py-3 font-medium">{row.work_label || "0:00"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.is_open ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {row.is_open ? "Active" : "Completed"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="text-sm font-medium text-orange-600 hover:text-orange-700"
                      onClick={() => openEdit(row)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {selected.user_name || selected.username}
                </h3>
                <p className="text-sm text-slate-500">
                  Worked {selected.work_label} ({selected.work_hours ?? 0} h)
                </p>
                {isHr && selected.hr_link && !selected.hr_link.counts_toward_payroll ? (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {selected.hr_link.hint}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-700"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <AttendanceLocationBlock
                label="Sign-in location"
                latitude={selected.sign_in_latitude}
                longitude={selected.sign_in_longitude}
                address={selected.sign_in_address}
                photoFileUrl={selected.sign_in_photo_url}
              />
              <AttendanceLocationBlock
                label="Sign-out location"
                latitude={selected.sign_out_latitude}
                longitude={selected.sign_out_longitude}
                address={selected.sign_out_address}
                photoFileUrl={selected.sign_out_photo_url}
              />
            </div>

            {canEdit ? (
              <form onSubmit={saveEdit} className="mt-6 space-y-3 border-t border-slate-200 pt-4">
                <p className="text-sm font-medium text-slate-900">Adjust times</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Sign in">
                    <input
                      type="datetime-local"
                      className={inputClassName()}
                      value={editForm.sign_in_at}
                      onChange={(e) => setEditForm((f) => ({ ...f, sign_in_at: e.target.value }))}
                      required
                    />
                  </Field>
                  <Field label="Sign out">
                    <input
                      type="datetime-local"
                      className={inputClassName()}
                      value={editForm.sign_out_at}
                      onChange={(e) => setEditForm((f) => ({ ...f, sign_out_at: e.target.value }))}
                    />
                  </Field>
                </div>
                {saveMessage ? <p className="text-sm text-slate-600">{saveMessage}</p> : null}
                <PrimaryButton type="submit" showIcon={false} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </PrimaryButton>
              </form>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                You need {isHr ? "HR manage" : "sales manage"} permission to edit attendance times.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </CatalogPageShell>
  );
}
