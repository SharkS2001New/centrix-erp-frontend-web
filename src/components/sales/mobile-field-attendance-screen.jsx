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
import { CustomerLocationMapEmbed } from "@/components/customers/customer-location-map-embed";
import { GpsLocationLabel } from "@/components/shared/gps-location-label";
import { hasValidCustomerLocation } from "@/lib/customer-location";
import { shouldShowMobileFieldAttendance } from "@/lib/sales-settings";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-KE", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function AttendanceLocationBlock({ latitude, longitude, address, photoUrl, label }) {
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
      {photoUrl ? (
        <img src={photoUrl} alt={label} className="mt-2 max-h-48 rounded-lg border object-cover" />
      ) : null}
    </div>
  );
}

export default function MobileFieldAttendanceScreen() {
  const { capabilities, hasPermission } = useAuth();
  const allowed = shouldShowMobileFieldAttendance(capabilities);
  const canEdit = hasPermission?.("sales.manage");

  const [fromDate, setFromDate] = useState(daysAgoIso(7));
  const [toDate, setToDate] = useState(todayIso());
  const [search, setSearch] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [rows, setRows] = useState([]);
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

      const res = await apiRequest(`/sales/mobile-field-attendance?${params.toString()}`);
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load field attendance");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, search, openOnly]);

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
      const updated = await apiRequest(`/sales/mobile-field-attendance/${selected.id}`, {
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
      <CatalogPageShell title="Field attendance" subtitle="Mobile sales rep sign-in records">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
          <p className="font-medium">Field attendance is not enabled</p>
          <p className="mt-1">
            Enable <strong>Require sign-in photo and location</strong> under{" "}
            <OrgSettingsPlatformHint area="Organization settings → Mobile app" />.
            .
          </p>
        </div>
      </CatalogPageShell>
    );
  }

  return (
    <CatalogPageShell
      title="Field attendance"
      subtitle="Sign-in and sign-out sessions from the mobile app with photos, GPS, and worked hours"
    >
      {error ? <DashboardErrorBanner message={error} /> : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Sessions</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totals.sessions}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Active now</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-700">{totals.open}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Hours in range</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{totals.hoursLabel}</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Field label="From">
          <input type="date" className={inputClassName()} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" className={inputClassName()} value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </Field>
        <Field label="Search rep">
          <SearchInput value={search} onChange={setSearch} placeholder="Name or username" />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          Active sessions only
        </label>
        <PrimaryButton type="button" showIcon={false} onClick={loadRows} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </PrimaryButton>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
                photoUrl={selected.sign_in_photo_url}
              />
              <AttendanceLocationBlock
                label="Sign-out location"
                latitude={selected.sign_out_latitude}
                longitude={selected.sign_out_longitude}
                address={selected.sign_out_address}
                photoUrl={selected.sign_out_photo_url}
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
                You need sales manage permission to edit attendance times.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </CatalogPageShell>
  );
}
