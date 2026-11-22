"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useTabTitle } from "@/contexts/tab-workspace-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { tabDetailTitle, tabSectionTitle } from "@/hooks/use-tab-form-exit";
import { ApiError, apiFetchBlob, apiRequest, apiUploadForm, drivingStudentDocumentFilePath } from "@/lib/api";
import { buildPageContext, requestAiAssist } from "@/lib/ai-assist-bridge";
import { canAskAiFromSearch } from "@/lib/ai-settings";
import { drivingGet, drivingSend } from "@/lib/driving/api";
import { attendanceMinutes, attendanceSessions } from "@/lib/driving/attendance";
import { bookingPresetFromSearch, buildBookingHref } from "@/lib/driving/booking";
import {
  fetchDrivingBranchesCached,
  fetchDrivingCoursesCached,
  fetchDrivingInstructorsCached,
  fetchDrivingVehiclesCached,
  invalidateDrivingReference,
} from "@/lib/driving/reference-cache";
import { notifyError, notifySuccess } from "@/lib/notify";
import { downloadExcelFromRows } from "@/lib/spreadsheet";
import { AppNavLink } from "@/components/layout/app-nav-link";
import { ProtectedFileLink } from "@/components/media/protected-file-preview";
import { FilterSelect, FormDrawer, PaginationBar, SearchableSelect } from "@/components/catalog/catalog-shared";
import { HrTimePickerField } from "@/components/hr/hr-time-picker";
import { RecordFormActions, RecordFormDialog, useRecordExit } from "@/components/record-form-page";
import { ServiceReceiptDialog } from "@/components/service-receipt-dialog";
import { buildDrivingFeeReceipt } from "@/lib/service-receipt";
import { confirmDeleteOptions, useConfirm } from "@/lib/use-confirm";
import { BarChart, Card, DataTable, DayBoard, Donut, DrivingSelect, Editor, Empty, Field, FormCard, FormSection, MarkPad, MonthBoard, PageTitle, PersonName, ScreenHeader, SearchField, Stat, StatusBadge, Toolbar, WeekBoard, inputClass, lessonTime, money, primaryButtonClass } from "@/components/driving/ui";

function useDebouncedValue(value, delay = 280) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function useLoad(loader, key) {
  const loaderRef = useRef(loader);
  const requestIdRef = useRef(0);
  useEffect(() => {
    loaderRef.current = loader;
  });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const load = useMemo(
    () => async () => {
      const requestId = ++requestIdRef.current;
      setError("");
      try {
        const res = await loaderRef.current();
        if (requestId !== requestIdRef.current) return;
        setData(res);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setError(err instanceof ApiError ? err.message : "Could not load this page.");
      }
    },
    // key identity changes when filters change; loader lives in ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, tick],
  );
  useTabAwareDataLoad(load, { depsKey: `${key}|${tick}`, hasData: data != null });
  return { data, error, reload: () => setTick((n) => n + 1) };
}

function rowsOf(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

function isOrgWideUser(user) {
  return Boolean(user?.is_admin || user?.is_super_admin) || (user?.access_scope ?? "org") !== "branch";
}

function useDrivingBranches() {
  const { user } = useAuth();
  const load = useLoad(
    () => fetchDrivingBranchesCached().then((rows) => ({ data: rows })),
    "driving-branches",
  );
  const branches = rowsOf(load.data).filter((branch) => branch.is_active !== false);
  const showBranchSelect = isOrgWideUser(user) && branches.length > 1;
  const defaultBranchId = String(user?.branch_id ?? branches[0]?.id ?? "");

  return { user, branches, showBranchSelect, defaultBranchId };
}

function branchLabel(branch) {
  return `${branch.branch_name}${branch.branch_code ? ` (${branch.branch_code})` : ""}`;
}

function branchNameOf(branches, branchId) {
  if (branchId == null || branchId === "") return "—";
  const match = branches.find((branch) => String(branch.id) === String(branchId));
  return match ? match.branch_name : "—";
}

function belongsToBranch(row, branchId) {
  if (!branchId) return true;
  return row?.branch_id == null || String(row.branch_id) === String(branchId);
}

function fileSizeLabel(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const STUDENT_DOCUMENT_TYPES = [
  { value: "national_id", label: "National ID" },
  { value: "learner_permit", label: "Learner permit" },
  { value: "passport_photo", label: "Passport photo" },
  { value: "medical_report", label: "Medical report" },
  { value: "certificate", label: "Certificate" },
  { value: "other", label: "Other" },
];

function BranchFilter({ value, onChange, branches, show }) {
  if (!show) return null;
  return (
    <FilterSelect
      value={value}
      placeholder="All branches"
      onChange={(event) => onChange(event.target.value)}
      options={[{ value: "", label: "All branches" }, ...branches.map((branch) => ({ value: String(branch.id), label: branchLabel(branch) }))]}
    />
  );
}

function BranchField({ value, onChange, branches, show, allowAll = false }) {
  if (!show) return null;
  return (
    <Field label="Branch">
      <DrivingSelect
        value={value}
        placeholder={allowAll ? "All branches" : "Choose a branch"}
        onChange={(event) => onChange(event.target.value)}
        options={[
          { value: "", label: allowAll ? "All branches" : "Choose a branch" },
          ...branches.map((branch) => ({ value: String(branch.id), label: branchLabel(branch) })),
        ]}
      />
    </Field>
  );
}

function greetingName(user) {
  const name = String(user?.full_name || user?.username || "").trim();
  return name.split(" ")[0] || "there";
}

function partOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function DrivingDashboard() {
  const { user } = useAuth();
  useTabTitle(tabSectionTitle("Dashboard", "Driving"));
  const { branches, showBranchSelect } = useDrivingBranches();
  const [branchFilter, setBranchFilter] = useState("");
  const { data, error } = useLoad(() => drivingGet("/dashboard", { branch_id: branchFilter || undefined }), `dashboard|${branchFilter}`);
  const dash = data?.data;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!dash) return <p className="text-sm theme-subtext">Loading the school…</p>;
  const schedule = dash.upcoming_lessons || [];
  const attention = dash.attention || {};
  const byBranches = dash.by_branch || [];
  const scopeLabel = branchFilter ? branchNameOf(branches, branchFilter) : "All branches";
  const quickActions = [
    { href: "/driving-school/schedule", label: "Book lesson", icon: "calendar3", detail: `${dash.lessons_today || 0} on today's board` },
    { href: "/driving-school/students", label: "Add student", icon: "person-plus", detail: `${dash.active_students || 0} active students` },
    { href: "/driving-school/vehicles", label: "Fleet", icon: "car-front", detail: attention.vehicles_attention ? `${attention.vehicles_attention} need attention` : "All road-ready" },
    { href: "/driving-school/payments", label: "Take payment", icon: "wallet2", detail: `${money(dash.outstanding_balances)} outstanding` },
  ];
  return (
    <div className="space-y-4">
      <ScreenHeader
        title={`Good ${partOfDay()}, ${greetingName(user)}`}
        subtitle={showBranchSelect ? `${scopeLabel} · what is happening today. Collected money is receipts, not profit.` : "Here's what is happening at the school today. Collected money is receipts, not profit."}
      >
        <BranchFilter value={branchFilter} onChange={setBranchFilter} branches={branches} show={showBranchSelect} />
      </ScreenHeader>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active students" value={dash.active_students} hint={`${dash.enrolments_this_month || 0} enrolled this month`} icon="people" tone="indigo" />
        <Stat label="Today's lessons" value={dash.lessons_today} hint={dash.lessons_completion_rate_today === null ? "Nothing scheduled yet" : `${dash.lessons_completion_rate_today}% completed`} icon="calendar3" tone="sky" />
        <Stat label="No-shows today" value={dash.lessons_no_shows_today || 0} hint={`${dash.lessons_cancelled_today || 0} cancelled`} icon="exclamation-triangle" tone="rose" />
        <Stat label="Collected today" value={money(dash.revenue_collected_today)} hint={`${money(dash.revenue_this_month)} this month`} icon="wallet2" tone="emerald" />
        <Stat label="Outstanding fees" value={money(dash.outstanding_balances)} icon="receipt" tone="amber" />
        <Stat label="Open fee invoices" value={attention.open_invoices || 0} hint="Awaiting collection" icon="file-earmark-text" tone="violet" />
        <Stat label="Students without a lesson" value={attention.students_without_upcoming_lesson || 0} hint="Active, nothing booked" icon="person-dash" tone="sky" />
        <Stat label="Vehicles needing attention" value={attention.vehicles_attention || 0} hint="Insurance, inspection or workshop" icon="car-front" tone="rose" />
      </div>
      {byBranches.length ? (
        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="theme-heading font-semibold">Branch performance</h2>
            <span className="theme-subtext text-xs">Today</span>
          </div>
          <DataTable
            rows={byBranches}
            columns={[
              { key: "name", label: "Branch", render: (row) => <PersonName name={row.name} detail={row.code} /> },
              { key: "active_students", label: "Students" },
              { key: "lessons_today", label: "Lessons today" },
              { key: "vehicles_available", label: "Vehicles ready" },
              { key: "revenue_collected_today", label: "Collected today", render: (row) => money(row.revenue_collected_today) },
              { key: "outstanding_balances", label: "Outstanding", render: (row) => money(row.outstanding_balances) },
            ]}
          />
        </Card>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="theme-heading font-semibold">Enrolment trends</h2>
            <span className="theme-subtext text-xs">Last 30 days</span>
          </div>
          <BarChart
            points={(dash.enrolment_trend || []).map((row) => ({ label: String(row.day).slice(5), value: Number(row.total) || 0 }))}
            format={(value) => `${value}`}
          />
        </Card>
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="theme-heading font-semibold">Receipts</h2>
            <span className="theme-subtext text-xs">Last 14 days</span>
          </div>
          <BarChart
            points={(dash.revenue_trend || []).map((row) => ({ label: String(row.day).slice(5), value: Number(row.collected) || 0 }))}
            format={money}
          />
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="theme-heading font-semibold">Today&apos;s schedule</h2>
            <AppNavLink href="/driving-school/schedule" className="text-sm font-medium text-[var(--theme-primary)]">Open</AppNavLink>
          </div>
          {schedule.length === 0 ? <Empty>No lessons are booked ahead.</Empty> : (
            <ul className="divide-y divide-[var(--theme-border)]">
              {schedule.map((lesson) => (
                <li key={lesson.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span>
                    <span className="theme-heading block font-medium">{lesson.student?.full_name}</span>
                    <span className="theme-subtext capitalize">{lesson.lesson_type} · {lesson.instructor?.full_name || "Instructor"}</span>
                  </span>
                  <span className="theme-subtext shrink-0">{lessonTime(lesson.starts_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="theme-heading font-semibold">Instructor performance</h2>
            <span className="theme-subtext text-xs">Last 30 days</span>
          </div>
          {(dash.instructor_performance || []).length === 0 ? <Empty>No lessons recorded in the last 30 days.</Empty> : (
            <DataTable
              rows={dash.instructor_performance}
              columns={[
                { key: "instructor", label: "Instructor", render: (row) => <PersonName name={row.instructor || "Instructor"} detail={row.instructor_number} /> },
                { key: "lessons", label: "Lessons" },
                { key: "completed", label: "Completed" },
                { key: "no_shows", label: "No-shows" },
                {
                  key: "rating",
                  label: "Class rating",
                  render: (row) => (row.rating ? (
                    <span className="text-sm tabular-nums">{Number(row.rating).toFixed(1)} / 5 <span className="theme-subtext text-xs">({row.ratings})</span></span>
                  ) : <span className="theme-subtext">—</span>),
                },
                {
                  key: "completion_rate",
                  label: "Completion",
                  render: (row) => (
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--theme-border)]">
                        <span className="block h-full rounded-full bg-[var(--theme-primary)]" style={{ width: `${Math.min(100, Number(row.completion_rate) || 0)}%` }} />
                      </span>
                      <span className="theme-subtext text-xs tabular-nums">{row.completion_rate}%</span>
                    </span>
                  ),
                },
              ]}
            />
          )}
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="theme-heading font-semibold">Compliance alerts</h2>
            <span className="theme-subtext text-xs">Next 45 days</span>
          </div>
          {(dash.compliance_due || []).length === 0 && (dash.instructors_compliance_due || []).length === 0 && !attention.permits_expiring ? (
            <Empty>All insurance, inspection and licence dates are clear.</Empty>
          ) : (
            <ul className="divide-y divide-[var(--theme-border)]">
              {(dash.compliance_due || []).slice(0, 4).map((vehicle) => (
                <li key={`vehicle-${vehicle.id}`} className="py-2.5 text-sm">
                  <p className="theme-heading font-medium">{vehicle.registration_number} · {vehicle.make || vehicle.model || "Vehicle"}</p>
                  <p className="theme-subtext mt-0.5 text-xs">
                    Insurance {shortDate(vehicle.insurance_expires_on) || "—"} · Inspection {shortDate(vehicle.inspection_expires_on) || "—"}
                  </p>
                </li>
              ))}
              {(dash.instructors_compliance_due || []).slice(0, 3).map((instructor) => (
                <li key={`instructor-${instructor.id}`} className="py-2.5 text-sm">
                  <p className="theme-heading font-medium">{instructor.name} <span className="theme-subtext font-normal">· instructor licence</span></p>
                  <p className={`mt-0.5 text-xs ${Number(instructor.days_left) < 0 ? "text-rose-600" : "theme-subtext"}`}>
                    {Number(instructor.days_left) < 0
                      ? `Expired ${Math.abs(Number(instructor.days_left))} day(s) ago`
                      : `Expires ${shortDate(instructor.licence_expires_on)} · ${instructor.days_left} day(s) left`}
                  </p>
                </li>
              ))}
              {attention.permits_expiring ? (
                <li className="py-2.5 text-sm">
                  <p className="theme-heading font-medium">{attention.permits_expiring} learner permit{attention.permits_expiring === 1 ? "" : "s"} expiring</p>
                  <p className="theme-subtext mt-0.5 text-xs">Within 30 days · renew before theory or practical test booking.</p>
                </li>
              ) : null}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-sm font-medium">
            <AppNavLink href="/driving-school/vehicles" className="text-[var(--theme-primary)]">Vehicles</AppNavLink>
            <AppNavLink href="/driving-school/instructors" className="text-[var(--theme-primary)]">Instructors</AppNavLink>
            <AppNavLink href="/driving-school/students" className="text-[var(--theme-primary)]">Students</AppNavLink>
          </div>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="theme-heading font-semibold">Quick actions</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {quickActions.map((action) => (
              <AppNavLink key={action.href} href={action.href} className="theme-secondary-btn flex flex-col items-start gap-1.5 rounded-xl px-3 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--theme-primary)_10%,transparent)] text-[var(--theme-primary)]" aria-hidden>
                  <i className={`bi bi-${action.icon} text-base`} />
                </span>
                <span className="theme-heading text-sm font-medium">{action.label}</span>
                <span className="theme-subtext text-xs">{action.detail}</span>
              </AppNavLink>
            ))}
          </div>
        </Card>
        <Card>
          <h2 className="theme-heading font-semibold">Recent receipts</h2>
          {(dash.recent_payments || []).length === 0 ? <Empty>No receipts yet.</Empty> : (
            <ul className="mt-2 divide-y divide-[var(--theme-border)] text-sm">
              {dash.recent_payments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="capitalize">{payment.method || "Receipt"}{payment.reference ? ` · ${payment.reference}` : ""}</span>
                  <span className="font-medium">{money(payment.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

const EMPTY_STUDENT = {
  full_name: "",
  phone: "",
  email: "",
  branch_id: "",
  id_document_type: "national_id",
  id_document_number: "",
  learner_permit_number: "",
  learner_permit_expires_on: "",
  date_of_birth: "",
  address: "",
  emergency_name: "",
  emergency_phone: "",
  notes: "",
  course_id: "",
  package_id: "",
  preferred_instructor_id: "",
};

function activeEnrolment(student) {
  const rows = Array.isArray(student?.enrolments) ? student.enrolments : [];
  return rows.find((row) => row.status === "active") || rows[0] || null;
}

function reminderReasonLines(reminder) {
  const detail = reminder?.detail || {};
  const lines = [];
  if (detail.lesson_at) {
    lines.push(`a lesson today at ${lessonTime(detail.lesson_at)}`);
  }
  if (Number(detail.overdue_outstanding) > 0) {
    lines.push(`an overdue balance of ${money(detail.overdue_outstanding)}`);
  }
  if (detail.permit_days !== null && detail.permit_days !== undefined) {
    if (detail.permit_days < 0) lines.push("an expired learner permit");
    else lines.push(`a learner permit expiring in ${detail.permit_days} day(s)`);
  }
  return lines;
}

function reminderMessage(reminder) {
  const firstName = String(reminder?.full_name || "there").trim().split(/\s+/)[0];
  const reasons = reminderReasonLines(reminder);
  return `Hi ${firstName}, a reminder from the school: you have ${reasons.join(", ")}. Please contact us to arrange your next steps.`;
}

const REMINDER_GROUPS = [
  { key: "lesson_today", label: "Lesson today" },
  { key: "permit_expired", label: "Learner permit expired" },
  { key: "permit_expiring", label: "Learner permit expiring" },
  { key: "overdue_payment", label: "Overdue balance" },
];

function reminderCategory(reminder) {
  const reasons = Array.isArray(reminder?.reasons) ? reminder.reasons : [];
  return reasons[0] || "other";
}

function StudentRemindersDialog({ reminders, loading, error, canAskAi, ready, onClose, onCompose, onSent }) {
  const { organization } = useAuth();
  const [selected, setSelected] = useState(() => new Set());
  const [sending, setSending] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const selectedRows = reminders.filter((row) => selected.has(row.id));
  const activeCategory = selectedRows.length ? reminderCategory(selectedRows[0]) : null;
  const groups = [
    ...REMINDER_GROUPS.map((group) => ({
      ...group,
      rows: reminders.filter((row) => reminderCategory(row) === group.key),
    })),
    { key: "other", label: "Other reminders", rows: reminders.filter((row) => reminderCategory(row) === "other") },
  ].filter((group) => group.rows.length > 0);

  function toggle(row) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  }

  function toggleGroup(group) {
    const ids = group.rows.map((row) => row.id);
    const allIn = ids.every((id) => selected.has(id));
    setSelected(allIn ? new Set() : new Set(ids));
  }

  async function sendSelected() {
    if (!selectedRows.length) return;
    setSending(true);
    try {
      const res = await drivingSend("/notifications/bulk-send", "POST", {
        messages: selectedRows.map((row) => ({ student_id: row.id, message: reminderMessage(row) })),
      });
      const sent = Number(res.data?.sent) || 0;
      const failed = Number(res.data?.failed) || 0;
      if (failed > 0) notifyError(`${failed} of ${selectedRows.length} reminders could not be sent. Check the phone numbers and SMS settings.`);
      if (sent > 0) notifySuccess(`Sent ${sent} reminder${sent === 1 ? "" : "s"}${failed ? `; ${failed} failed` : ""}.`);
      onSent?.();
      if (failed === 0) onClose();
      else setReviewing(false);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not send the reminders.");
    } finally {
      setSending(false);
    }
  }

  function askAssistant() {
    requestAiAssist({
      message:
        "Draft one short SMS reminder per student below. Mention only the reason(s) listed, keep each message under 300 characters, and sign off with the school name.",
      autoSend: true,
      openPanel: true,
      pageContext: buildPageContext({
        screenKey: "driving-student-reminders",
        title: "Students needing a reminder",
        pathname: "/driving-school/students",
        summary: { students: reminders.length, school: organization?.name },
        rows: reminders.map((row) => ({
          student: row.full_name,
          reasons: reminderReasonLines(row).join("; "),
        })),
      }),
    });
    onClose();
  }

  return (
    <Editor open title="Send reminders" onClose={onClose} wide>
      <p className="theme-subtext mb-4 text-sm">
        Only students with something that needs attention appear here: a lesson today, an overdue
        balance, or a learner permit that has expired or expires within two weeks. Students are
        grouped by reason: one batch only ever carries the same kind of reminder.
      </p>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="theme-subtext text-sm">Checking today&apos;s students…</p> : null}
      {!loading && reminders.length === 0 ? (
        <Empty>No reminders are due right now.</Empty>
      ) : null}
      {reminders.length > 0 && reviewing ? (
        <div className="space-y-3">
          <p className="theme-subtext text-sm">
            {selectedRows.length} message{selectedRows.length === 1 ? "" : "s"} will be sent now. Check them before sending.
          </p>
          <ul className="divide-y divide-[var(--theme-border)]">
            {selectedRows.map((row) => (
              <li key={row.id} className="py-3">
                <PersonName name={row.full_name} detail={row.phone || row.student_number} />
                <p className="mt-1.5 rounded-lg border border-[var(--theme-border)] px-3 py-2 text-sm">
                  {reminderMessage(row)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {reminders.length > 0 && !reviewing ? (
        <div className="space-y-1">
          {groups.map((group) => {
            const groupIds = group.rows.map((row) => row.id);
            const groupAll = groupIds.every((id) => selected.has(id));
            const blocked = Boolean(activeCategory) && activeCategory !== group.key;
            return (
              <div key={group.key}>
                <label className={`flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm ${blocked ? "opacity-40" : ""}`}>
                  <input type="checkbox" checked={groupAll} disabled={blocked} onChange={() => toggleGroup(group)} />
                  <span className="theme-heading font-medium">{group.label}</span>
                  <span className="theme-subtext text-xs">({group.rows.length})</span>
                  {blocked ? <span className="theme-subtext ml-auto text-xs">Start a new batch for this reminder</span> : null}
                </label>
                <ul className="divide-y divide-[var(--theme-border)]">
                  {group.rows.map((row) => (
                    <li key={row.id} className={`flex flex-wrap items-center justify-between gap-3 pl-2 pr-1 py-3 ${blocked ? "opacity-40" : ""}`}>
                      <label className="flex min-w-0 items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          disabled={blocked}
                          onChange={() => toggle(row)}
                          aria-label={`Select ${row.full_name}`}
                        />
                        <span className="min-w-0">
                          <PersonName name={row.full_name} detail={row.phone || row.student_number} />
                          <span className="theme-subtext mt-0.5 block text-xs">{reminderReasonLines(row).join(" · ")}</span>
                        </span>
                      </label>
                      <button
                        type="button"
                        className="theme-secondary-btn shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium"
                        onClick={() => onCompose(row)}
                      >
                        Compose
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--theme-border)] pt-4">
        <p className="theme-subtext max-w-sm text-xs">
          {ready
            ? selectedRows.length
              ? `${selectedRows.length} selected · sent immediately, nothing is queued.`
              : "Select students in one group to send them the same kind of reminder."
            : "Connect your SMS provider under Settings → SMS & email to send reminders."}
        </p>
        <div className="flex flex-wrap gap-2">
          {reviewing ? (
            <>
              <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={() => setReviewing(false)} disabled={sending}>
                Back
              </button>
              <button type="button" className={primaryButtonClass} disabled={!ready || sending || selectedRows.length === 0} onClick={() => void sendSelected()}>
                {sending ? "Sending…" : `Send ${selectedRows.length} message${selectedRows.length === 1 ? "" : "s"}`}
              </button>
            </>
          ) : (
            <>
              {canAskAi && reminders.length > 0 ? (
                <button type="button" className="theme-secondary-btn inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium" onClick={askAssistant}>
                  <i className="bi bi-stars" aria-hidden />
                  Draft with CentrixAssistant
                </button>
              ) : null}
              <button
                type="button"
                className={primaryButtonClass}
                disabled={!ready || sending || selectedRows.length === 0}
                onClick={() => setReviewing(true)}
              >
                Send to selected ({selectedRows.length})
              </button>
            </>
          )}
        </div>
      </div>
    </Editor>
  );
}

export function StudentsScreen() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const tail = segments.slice(2);
  if (tail[0] && tail[0] !== "new") return <StudentProfileScreen studentId={tail[0]} />;
  return (
    <>
      <StudentListScreen />
      {pathname.endsWith("/students/new") ? <StudentFormScreen /> : null}
    </>
  );
}

function StudentFormScreen() {
  const { exitTo } = useRecordExit("Add student");
  const { branches, showBranchSelect, defaultBranchId } = useDrivingBranches();
  const [form, setForm] = useState(EMPTY_STUDENT);
  const courseLoad = useLoad(() => fetchDrivingCoursesCached().then((rows) => ({ data: rows })), "student-form-courses");
  const instructorLoad = useLoad(() => fetchDrivingInstructorsCached().then((rows) => ({ data: rows })), "student-form-instructors");
  const courses = rowsOf(courseLoad.data).filter((course) => course.is_active !== false && belongsToBranch(course, form.branch_id));
  const instructors = rowsOf(instructorLoad.data).filter((row) => row.status !== "inactive" && belongsToBranch(row, form.branch_id));
  const packages = courses.find((course) => String(course.id) === String(form.course_id))?.packages || [];

  useEffect(() => {
    if (!showBranchSelect) return;
    setForm((current) => (current.branch_id ? current : { ...current, branch_id: defaultBranchId }));
  }, [defaultBranchId, showBranchSelect]);

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function save(event) {
    event.preventDefault();
    if (!form.course_id || !form.package_id) {
      notifyError("Choose the course and the package this student is joining.");
      return;
    }
    const body = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      id_document_type: form.id_document_type,
      course_id: Number(form.course_id),
      package_id: Number(form.package_id),
    };
    if (form.branch_id) body.branch_id = Number(form.branch_id);
    for (const key of ["email", "id_document_number", "learner_permit_number", "learner_permit_expires_on", "date_of_birth", "address", "emergency_name", "emergency_phone", "notes"]) {
      const value = String(form[key] || "").trim();
      if (value) body[key] = value;
    }
    if (form.preferred_instructor_id) body.preferred_instructor_id = Number(form.preferred_instructor_id);
    try {
      await drivingSend("/students", "POST", body);
      notifySuccess("Student registered and enrolled.");
      invalidateDrivingReference();
      exitTo("/driving-school/students");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not register the student.");
    }
  }

  return (
    <RecordFormDialog title="Add student" backHref="/driving-school/students">
      <form onSubmit={save}>
        <p className="theme-subtext mb-4 text-sm">Name, phone, course, and package are required.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <FormSection title="Student" />
            <BranchField value={form.branch_id} onChange={(value) => setForm((current) => ({ ...current, branch_id: value, course_id: "", package_id: "", preferred_instructor_id: "" }))} branches={branches} show={showBranchSelect} />
            <Field label="Full name"><input className={inputClass} required value={form.full_name} onChange={(e) => setField("full_name", e.target.value)} /></Field>
            <Field label="Phone"><input className={inputClass} required value={form.phone} onChange={(e) => setField("phone", e.target.value)} /></Field>
            <Field label="Email"><input className={inputClass} type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} /></Field>
            <Field label="Identity document">
              <DrivingSelect value={form.id_document_type} onChange={(e) => setField("id_document_type", e.target.value)} options={[{ value: "national_id", label: "National ID" }, { value: "passport", label: "Passport" }, { value: "birth_certificate", label: "Birth certificate" }]} />
            </Field>
            <Field label="Document number"><input className={inputClass} value={form.id_document_number} onChange={(e) => setField("id_document_number", e.target.value)} /></Field>
            <Field label="Learner permit number"><input className={inputClass} value={form.learner_permit_number} onChange={(e) => setField("learner_permit_number", e.target.value)} /></Field>
            <Field label="Learner permit expires"><input className={inputClass} type="date" value={form.learner_permit_expires_on} onChange={(e) => setField("learner_permit_expires_on", e.target.value)} /></Field>
            <Field label="Date of birth"><input className={inputClass} type="date" value={form.date_of_birth} onChange={(e) => setField("date_of_birth", e.target.value)} /></Field>
            <Field label="Address"><input className={inputClass} value={form.address} onChange={(e) => setField("address", e.target.value)} /></Field>
          </div>
          <div className="flex flex-col gap-4">
            <FormSection title="Emergency contact" />
            <Field label="Name"><input className={inputClass} value={form.emergency_name} onChange={(e) => setField("emergency_name", e.target.value)} /></Field>
            <Field label="Phone"><input className={inputClass} value={form.emergency_phone} onChange={(e) => setField("emergency_phone", e.target.value)} /></Field>
            <FormSection title="Course and package" />
            <Field label="Course">
              <DrivingSelect value={form.course_id} placeholder="Choose a course" onChange={(e) => setForm((current) => ({ ...current, course_id: e.target.value, package_id: "" }))} options={[{ value: "", label: "Choose a course" }, ...courses.map((course) => ({ value: String(course.id), label: `${course.code} · ${course.name}` }))]} />
            </Field>
            <Field label="Package">
              <DrivingSelect value={form.package_id} placeholder={form.course_id ? "Choose a package" : "Choose a course first"} onChange={(e) => setField("package_id", e.target.value)} options={[{ value: "", label: form.course_id ? "Choose a package" : "Choose a course first" }, ...packages.map((item) => ({ value: String(item.id), label: `${item.name} · ${money(item.price)}` }))]} />
            </Field>
            <Field label="Preferred instructor">
              <DrivingSelect value={form.preferred_instructor_id} placeholder="No preference" onChange={(e) => setField("preferred_instructor_id", e.target.value)} options={[{ value: "", label: "No preference" }, ...instructors.map((row) => ({ value: String(row.id), label: row.full_name }))]} />
            </Field>
            <Field label="Notes"><input className={inputClass} value={form.notes} onChange={(e) => setField("notes", e.target.value)} /></Field>
          </div>
        </div>
        <RecordFormActions backHref="/driving-school/students" submitLabel="Register and enrol" />
      </form>
    </RecordFormDialog>
  );
}

function StudentListScreen() {
  const { capabilities, hasPermission } = useAuth();
  useTabTitle(tabSectionTitle("Students", "Driving"));
  const { branches, showBranchSelect } = useDrivingBranches();
  const canSend = hasPermission("driving.outreach.create");
  const canAskAi = canAskAiFromSearch({ capabilities, hasPermission });
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [reminderTarget, setReminderTarget] = useState(null);
  const messaging = useLoad(
    () => (canSend ? drivingGet("/messaging") : Promise.resolve(null)),
    "students-messaging",
  );
  const messagingReady = Boolean(messaging.data?.data?.status?.sms_ready);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query);
  const [courseFilter, setCourseFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const { data, error } = useLoad(
    () =>
      drivingGet("/students", {
        q: debouncedQuery.trim() || undefined,
        course_id: courseFilter || undefined,
        branch_id: branchFilter || undefined,
        per_page: pageSize,
        page,
      }),
    `students:${debouncedQuery}|${courseFilter}|${branchFilter}|${page}|${pageSize}`,
  );
  const reminders = useLoad(
    () =>
      canSend
        ? drivingGet("/students/reminders", { branch_id: branchFilter || undefined })
        : Promise.resolve(null),
    `student-reminders|${branchFilter}|${canSend}`,
  );
  const reminderRows = rowsOf(reminders.data);
  const courseLoad = useLoad(() => fetchDrivingCoursesCached().then((rows) => ({ data: rows })), "student-courses");
  const courses = rowsOf(courseLoad.data).filter((course) => course.is_active !== false);
  const students = rowsOf(data);
  const total = Number(data?.total ?? students.length);
  const lastPage = Math.max(1, Number(data?.last_page ?? 1));

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, courseFilter, branchFilter, pageSize]);

  return (
    <div>
      <ScreenHeader title="Students" subtitle="The register shows who is enrolled. Add a student when you are ready to set up their course and package.">
        <AppNavLink href="/driving-school/attendance" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Gate attendance</AppNavLink>
        {canSend && reminderRows.length > 0 ? (
          <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={() => setRemindersOpen(true)}>
            Send reminders ({reminderRows.length})
          </button>
        ) : null}
        <AppNavLink href="/driving-school/students/new" className={primaryButtonClass}>Add student</AppNavLink>
      </ScreenHeader>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <Toolbar>
        <SearchField value={query} onChange={setQuery} placeholder="Search students" />
        <FilterSelect value={courseFilter} placeholder="All courses" onChange={(event) => setCourseFilter(event.target.value)} options={[{ value: "", label: "All courses" }, ...courses.map((course) => ({ value: String(course.id), label: course.name }))]} />
        <BranchFilter value={branchFilter} onChange={setBranchFilter} branches={branches} show={showBranchSelect} />
      </Toolbar>
      <Card>
        <DataTable
          empty="No students yet."
          rows={students}
          columns={[
            { key: "name", label: "Student", render: (student) => (
              <AppNavLink href={`/driving-school/students/${student.id}`} className="block">
                <PersonName name={student.full_name} detail={student.student_number} />
              </AppNavLink>
            ) },
            { key: "phone", label: "Phone", render: (student) => student.phone || "—" },
            {
              key: "permit",
              label: "Learner permit",
              render: (student) => {
                if (!student.learner_permit_expires_on) return <span className="theme-subtext">—</span>;
                const days = daysFromNow(student.learner_permit_expires_on);
                return (
                  <span className={days !== null && days < 0 ? "font-medium text-rose-600" : days !== null && days <= 30 ? "font-medium text-amber-700" : ""}>
                    {shortDate(student.learner_permit_expires_on)}
                    {days !== null ? <span className="theme-subtext ml-1 text-xs">{days < 0 ? "expired" : `${days}d`}</span> : null}
                  </span>
                );
              },
            },
            ...(showBranchSelect ? [{ key: "branch", label: "Branch", render: (student) => branchNameOf(branches, student.branch_id) }] : []),
            { key: "course", label: "Course", render: (student) => activeEnrolment(student)?.course?.name || "—" },
            { key: "enrolled", label: "Enrolled", render: (student) => shortDate(student.registered_on) },
            {
              key: "progress",
              label: "Progress",
              render: (student) => {
                const enrolment = activeEnrolment(student);
                if (!enrolment) return "—";
                const done = Number(enrolment.lessons_completed || 0);
                const need = Number(enrolment.lessons_required || 0);
                const pct = need > 0 ? Math.min(100, Math.round((done / need) * 100)) : done > 0 ? 100 : 0;
                return (
                  <span className="flex min-w-[110px] items-center gap-2">
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-[var(--theme-primary)]" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="text-xs font-medium tabular-nums">{need > 0 ? `${done}/${need}` : done}</span>
                  </span>
                );
              },
            },
            { key: "status", label: "Status", render: (student) => <StatusBadge value={student.status} /> },
            { key: "outstanding", label: "Balance", render: (student) => <span className={Number(student.outstanding) > 0 ? "font-medium text-amber-700" : ""}>{money(student.outstanding)}</span> },
          ]}
        />
      </Card>
      <PaginationBar
        page={page}
        totalPages={lastPage}
        total={total}
        pageSize={pageSize}
        onChange={setPage}
        onPageSizeChange={setPageSize}
      />
      {remindersOpen ? (
        <StudentRemindersDialog
          reminders={reminderRows}
          loading={reminders.data === null && !reminders.error}
          error={reminders.error}
          canAskAi={canAskAi}
          ready={messagingReady}
          onClose={() => setRemindersOpen(false)}
          onCompose={(row) => { setRemindersOpen(false); setReminderTarget(row); }}
          onSent={() => { reminders.reload(); messaging.reload(); }}
        />
      ) : null}
      {reminderTarget ? (
        <OutreachComposeDialog
          ready={messagingReady}
          student={reminderTarget}
          initialMessage={reminderMessage(reminderTarget)}
          onClose={() => setReminderTarget(null)}
          onSaved={() => { setReminderTarget(null); reminders.reload(); messaging.reload(); }}
        />
      ) : null}
    </div>
  );
}

function daysFromNow(value) {
  if (!value) return null;
  const date = new Date(String(value).length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

function licenceLabel(value) {
  const days = daysFromNow(value);
  if (days === null) return "—";
  if (days < 0) return `${shortDate(value)} · expired`;
  if (days <= 45) return `${shortDate(value)} · ${days} day(s) left`;
  return shortDate(value);
}

function shortDate(value) {  if (!value) return "—";
  const text = String(value);
  if (!text.includes("T")) return text.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text.slice(0, 10);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shortDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function examReadiness(student, enrolment, assessments) {
  const need = Number(enrolment?.lessons_required || 0);
  const done = Number(enrolment?.lessons_completed || 0);
  const pct = need > 0 ? Math.min(100, Math.round((done / need) * 100)) : done > 0 ? 100 : 0;
  const theoryPassed = assessments.some((row) => row.kind === "theory" && row.passed);
  const practicalPassed = assessments.some((row) => row.kind === "practical" && row.passed);
  const ratings = Array.isArray(student?.skill_ratings) ? student.skill_ratings : [];
  const latestSkill = ratings[0] ? Number(ratings[0].overall) || 0 : null;
  const skillsReady = latestSkill === null || latestSkill >= 60;
  const testReady = practicalPassed && theoryPassed && skillsReady && (need === 0 || pct >= 80);
  const readiness =
    student?.status === "completed"
      ? { label: "Graduated", tone: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" }
      : testReady
        ? { label: "Test ready", tone: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" }
        : theoryPassed && practicalPassed && !skillsReady
          ? { label: "Practical skills need work", tone: "bg-amber-50 text-amber-800", dot: "bg-amber-500" }
          : theoryPassed
            ? { label: "Theory passed · practical in progress", tone: "bg-sky-50 text-sky-700", dot: "bg-sky-500" }
            : { label: "In training", tone: "bg-amber-50 text-amber-800", dot: "bg-amber-500" };
  return { ...readiness, theoryPassed, practicalPassed, testReady, skillsReady, latestSkill, pct };
}

function TrainingProgressCard({ student, enrolment, lessons, assessments }) {
  const need = Number(enrolment?.lessons_required || 0);
  const done = Number(enrolment?.lessons_completed || 0);
  const pct = need > 0 ? Math.min(100, Math.round((done / need) * 100)) : done > 0 ? 100 : 0;

  const [nowMs, setNowMs] = useState(0);
  useEffect(() => {
    setNowMs(Date.now());
  }, []);

  const nextLesson =
    lessons
      .filter((lesson) => !["cancelled", "completed", "no_show"].includes(lesson.status))
      .filter((lesson) => !nowMs || new Date(lesson.starts_at).getTime() >= nowMs)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0] || null;

  const feedback = lessons
    .filter((lesson) => String(lesson.feedback || "").trim())
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
    .slice(0, 4);

  const theoryPassed = assessments.some((row) => row.kind === "theory" && row.passed);
  const readiness = examReadiness(student, enrolment, assessments);
  const practicalPassed = readiness.practicalPassed;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="theme-heading font-semibold">Training progress</h2>
          <p className="theme-subtext text-xs">Lessons completed against the course package, plus the latest instructor notes.</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${readiness.tone}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${readiness.dot}`} aria-hidden />
          {readiness.label}
        </span>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="theme-heading font-medium">{need > 0 ? `${done} of ${need} lessons` : `${done} lessons`}</span>
              <span className="theme-subtext tabular-nums">{pct}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[var(--theme-primary)]" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium ${theoryPassed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${theoryPassed ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden />
              Theory {theoryPassed ? "passed" : "pending"}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium ${practicalPassed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${practicalPassed ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden />
              Practical {practicalPassed ? "passed" : "pending"}
            </span>
            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-600">
              {assessments.length} assessments
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium ${readiness.skillsReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${readiness.skillsReady ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden />
              {readiness.latestSkill !== null ? `Skills ${(Number(readiness.latestSkill) / 20).toFixed(1)}/5` : "No skills rated"}
            </span>
          </div>
          <div className="rounded-xl border border-[var(--theme-border)] px-3 py-2">
            <p className="theme-subtext text-xs">Next lesson</p>
            {nextLesson ? (
              <p className="theme-heading mt-1 text-sm font-medium">
                {shortDateTime(nextLesson.starts_at)} · {nextLesson.instructor?.full_name || "Instructor"}
                <span className="theme-subtext block text-xs capitalize">{nextLesson.lesson_type}{nextLesson.location ? ` · ${nextLesson.location}` : ""}</span>
              </p>
            ) : (
              <p className="theme-subtext mt-1 text-sm">Nothing booked — schedule the next lesson to keep progress moving.</p>
            )}
          </div>
        </div>
        <div>
          <p className="theme-subtext text-xs">Latest instructor feedback</p>
          {feedback.length === 0 ? (
            <p className="theme-subtext mt-2 text-sm">No feedback recorded yet. Instructors can add notes when marking a lesson complete.</p>
          ) : (
            <ul className="mt-2 divide-y divide-[var(--theme-border)]">
              {feedback.map((lesson) => (
                <li key={lesson.id} className="py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="theme-heading font-medium">{shortDate(lesson.starts_at)} · {lesson.instructor?.full_name || "Instructor"}</span>
                    {lesson.outcome ? <span className="theme-subtext text-xs capitalize">{String(lesson.outcome).replace(/_/g, " ")}</span> : null}
                  </div>
                  <p className="theme-subtext mt-1 text-xs">{String(lesson.feedback).slice(0, 220)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

function StudentProfileScreen({ studentId }) {
  const { hasPermission, organization } = useAuth();
  const { branches, showBranchSelect } = useDrivingBranches();
  const { data, error, reload } = useLoad(() => drivingGet(`/students/${studentId}`), `student:${studentId}`);
  useTabTitle(data?.data ? tabDetailTitle("Student", data.data.full_name) : null);
  const [downloadingCertificate, setDownloadingCertificate] = useState(false);
  const [tab, setTab] = useState("overview");
  const [sellingCredit, setSellingCredit] = useState(false);
  const [savingCredit, setSavingCredit] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [paper, setPaper] = useState("a4");
  const [slip, setSlip] = useState(null);
  const [enrolling, setEnrolling] = useState(false);
  const [savingEnrolment, setSavingEnrolment] = useState(false);
  const [enrolForm, setEnrolForm] = useState({ course_id: "", package_id: "", enrolled_on: "" });
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [savingDoc, setSavingDoc] = useState(false);
  const [docError, setDocError] = useState(null);
  const [docForm, setDocForm] = useState({ title: "", document_type: "other", notes: "", file: null });
  const confirm = useConfirm();
  const courseLoad = useLoad(() => fetchDrivingCoursesCached().then((rows) => ({ data: rows })), "student-profile-courses");
  const [creditForm, setCreditForm] = useState({ lesson_type: "practical", quantity: 5, unit_price: "", notes: "" });
  const canSend = hasPermission("driving.outreach.create");
  const canEnrol = hasPermission("driving.students.create");
  const canEditDocuments = hasPermission("driving.students.edit");
  const messaging = useLoad(
    () => (canSend ? drivingGet("/messaging") : Promise.resolve(null)),
    "student-profile-messaging",
  );
  const messagingReady = Boolean(messaging.data?.data?.status?.sms_ready);
  const student = data?.data;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!student) return <p className="theme-subtext text-sm">Loading the student profile…</p>;

  async function downloadCertificate() {
    setDownloadingCertificate(true);
    try {
      const blob = await apiFetchBlob(`/driving-school/students/${studentId}/certificate`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `certificate-${student.student_number || studentId}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not generate the certificate.");
    } finally {
      setDownloadingCertificate(false);
    }
  }

  const enrolments = student.enrolments || [];
  const enrolment = activeEnrolment(student);
  const lessons = student.lessons || [];
  const invoices = student.invoices || [];
  const assessments = student.assessments || [];
  const attendance = student.attendance_logs || [];
  const credits = student.credits || [];
  const documents = student.documents || [];
  const enrolCourses = rowsOf(courseLoad.data).filter((course) => course.is_active !== false && belongsToBranch(course, student.branch_id));
  const enrolPackages = enrolCourses.find((course) => String(course.id) === String(enrolForm.course_id))?.packages || [];
  const creditBalances = student.credit_balances || { theory: 0, practical: 0, total: 0 };
  const payments = invoices.flatMap((invoice) =>
    (invoice.payments || []).map((payment) => ({
      ...payment,
      invoice_number: invoice.invoice_number,
      invoice_kind: invoice.kind,
      refunded: (payment.refunds || []).reduce((sum, refund) => sum + (Number(refund.amount) || 0), 0),
    })),
  );
  const statementInvoiced = invoices.reduce((sum, invoice) => sum + (Number(invoice.amount) || 0) - (Number(invoice.discount) || 0), 0);
  const statementPaid = payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
  const statementRefunded = payments.reduce((sum, payment) => sum + (payment.refunded || 0), 0);
  const statementOutstanding = invoices.reduce((sum, invoice) => sum + (Number(invoice.outstanding) || 0), 0);
  const latestReceipts = [...payments]
    .sort((a, b) => String(b.received_on || "").localeCompare(String(a.received_on || "")))
    .slice(0, 5);
  const done = Number(enrolment?.lessons_completed || 0);
  const need = Number(enrolment?.lessons_required || 0);
  const branchDetail = showBranchSelect && student.branch_id ? ` · ${branchNameOf(branches, student.branch_id)}` : "";
  const activityEvents = [
    ...lessons.map((row) => ({ id: `lesson-${row.id}`, at: row.starts_at, label: `${row.status} ${row.lesson_type} lesson`, detail: row.instructor?.full_name || "Instructor" })),
    ...invoices.map((row) => ({ id: `invoice-${row.id}`, at: row.issued_on, label: `Invoice ${row.invoice_number} · ${row.status}`, detail: money(row.amount) })),
    ...invoices.flatMap((row) => (row.payments || []).map((payment) => ({ id: `payment-${payment.id}`, at: payment.received_on, label: "Payment received", detail: `${money(payment.amount)} · ${payment.method || "receipt"}` }))),
    ...assessments.map((row) => ({ id: `assessment-${row.id}`, at: row.assessed_on, label: `${row.kind} assessment ${row.passed ? "passed" : "failed"}`, detail: row.title })),
    ...enrolments.map((row) => ({ id: `enrolment-${row.id}`, at: row.enrolled_on, label: `Enrolled on ${row.course?.name || "course"}`, detail: `${row.lessons_completed || 0}/${row.lessons_required || 0} lessons` })),
  ].filter((event) => event.at).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 40);

  function openReceipt(payment) {
    const invoice = invoices.find((row) => String(row.id) === String(payment.invoice_id)) || {};
    setSlip(buildDrivingFeeReceipt({
      payment: { ...payment, outstanding: invoice.outstanding },
      invoice: { ...invoice, kind: invoice.kind || payment.invoice_kind },
      student,
      organization,
    }));
  }

  async function saveEnrolment(event) {
    event.preventDefault();
    if (!enrolForm.course_id) {
      notifyError("Choose the course this student is joining.");
      return;
    }
    setSavingEnrolment(true);
    try {
      const body = {
        student_id: Number(studentId),
        course_id: Number(enrolForm.course_id),
      };
      if (enrolForm.package_id) body.package_id = Number(enrolForm.package_id);
      if (enrolForm.enrolled_on) body.enrolled_on = enrolForm.enrolled_on;
      await drivingSend("/enrolments", "POST", body);
      notifySuccess("Enrolment added. Fees for the course are on the fee statement.");
      setEnrolling(false);
      setEnrolForm({ course_id: "", package_id: "", enrolled_on: "" });
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not enrol the student.");
    } finally {
      setSavingEnrolment(false);
    }
  }

  async function uploadDocument(event) {
    event.preventDefault();
    if (!docForm.title.trim() || !docForm.file) {
      setDocError("A title and a file are required.");
      return;
    }
    setSavingDoc(true);
    setDocError(null);
    try {
      await apiUploadForm(`/driving-school/students/${studentId}/documents`, {
        title: docForm.title.trim(),
        document_type: docForm.document_type,
        notes: docForm.notes.trim() || undefined,
        file: docForm.file,
      });
      notifySuccess("Document uploaded.");
      setUploadingDoc(false);
      setDocForm({ title: "", document_type: "other", notes: "", file: null });
      reload();
    } catch (err) {
      setDocError(err instanceof ApiError ? err.message : "Could not upload the document.");
    } finally {
      setSavingDoc(false);
    }
  }

  async function removeDocument(doc) {
    const ok = await confirm(confirmDeleteOptions(`"${doc.title}"`));
    if (!ok) return;
    try {
      await drivingSend(`/students/${studentId}/documents/${doc.id}`, "DELETE");
      notifySuccess("Document deleted.");
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not delete the document.");
    }
  }

  async function saveCredits(event) {
    event.preventDefault();
    setSavingCredit(true);
    try {
      await drivingSend(`/students/${studentId}/credits`, "POST", {
        lesson_type: creditForm.lesson_type,
        quantity: Number(creditForm.quantity) || 0,
        unit_price: Number(creditForm.unit_price) || 0,
        notes: creditForm.notes.trim() || null,
      });
      notifySuccess("Lesson credits recorded. Any balance due is on the credits invoice.");
      setSellingCredit(false);
      setCreditForm({ lesson_type: "practical", quantity: 5, unit_price: "", notes: "" });
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not record the credits.");
    } finally {
      setSavingCredit(false);
    }
  }

  return (
    <div className="space-y-4">
      <ScreenHeader title={student.full_name} subtitle={`${student.student_number} · ${student.phone || "No phone"} · ${activeEnrolment(student)?.course?.name || "No active course"}${branchDetail}`}>
        <AppNavLink href="/driving-school/students" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Back to students</AppNavLink>
        <AppNavLink href="/driving-school/schedule/new" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Book lesson</AppNavLink>
        <AppNavLink href="/driving-school/payments/new" className={primaryButtonClass}>Record payment</AppNavLink>
        {student.certificate_ready ? (
          <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" disabled={downloadingCertificate} onClick={() => void downloadCertificate()}>
            {downloadingCertificate ? "Preparing…" : "Certificate"}
          </button>
        ) : null}
      </ScreenHeader>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Status" value={<StatusBadge value={student.status} />} hint={student.registered_on ? `Registered ${shortDate(student.registered_on)}` : undefined} icon="person-vcard" tone="indigo" />
        <Stat label="Outstanding" value={money(student.outstanding)} hint="Invoices minus receipts and refunds" icon="wallet2" tone={Number(student.outstanding) > 0 ? "amber" : "emerald"} />
        <Stat label="Lesson progress" value={need > 0 ? `${done}/${need}` : String(done)} hint={enrolment?.package?.name || enrolment?.course?.name} icon="graph-up-arrow" tone="sky" />
        <Stat label="Records" value={`${lessons.length} lessons`} hint={`${assessments.length} assessments · ${attendance.length} gate marks`} icon="clipboard-check" tone="violet" />
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--theme-border)] p-1" role="tablist" aria-label="Student profile sections">
        {[
          ["overview", "Overview"],
          ["personal", "Personal"],
          ["courses", `Courses (${enrolments.length})`],
          ["lessons", `Lessons (${lessons.length})`],
          ["attendance", "Attendance"],
          ["payments", `Payments (${invoices.length})`],
          ["assessments", `Assessments (${assessments.length})`],
          ["documents", documents.length ? `Documents (${documents.length})` : "Documents"],
          ["activity", "Activity"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === key ? "bg-[var(--theme-primary)] text-white" : "theme-subtext hover:bg-[var(--theme-border)]/40"}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <>

      <TrainingProgressCard
        student={student}
        enrolment={enrolment}
        lessons={lessons}
        assessments={assessments}
      />

      {payments.length > 0 ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="theme-heading font-semibold">Receipts</h2>
              <p className="theme-subtext mt-1 text-xs">
                {payments.length} {payments.length === 1 ? "receipt" : "receipts"} · {money(statementPaid)} received
                {statementRefunded > 0 ? ` · ${money(statementRefunded)} refunded` : ""}
              </p>
            </div>
            <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={() => setTab("payments")}>Fee statement</button>
          </div>
          <ul className="mt-3 divide-y divide-[var(--theme-border)] text-sm">
            {latestReceipts.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="theme-heading block font-medium">RCP-{payment.id} · {payment.invoice_number}</span>
                  <span className="theme-subtext block text-xs">
                    {shortDate(payment.received_on)} · {payment.method || "receipt"}{payment.reference ? ` · ${payment.reference}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="theme-heading text-sm font-semibold tabular-nums">{money(payment.amount)}</span>
                  <button type="button" className="theme-link text-sm font-medium" onClick={() => openReceipt(payment)}>Receipt</button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="theme-heading font-semibold">Prepaid lesson credits</h2>
            <p className="theme-subtext mt-1 max-w-xl text-xs">Credits are used automatically when a matching lesson is completed, and returned if that completion is undone.</p>
          </div>
          <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={() => setSellingCredit(true)}>Sell credits</button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[var(--theme-border)] px-3 py-2">
            <p className="theme-subtext text-xs uppercase tracking-wide">Practical</p>
            <p className="theme-heading text-2xl font-semibold">{creditBalances.practical ?? 0}</p>
            <p className="theme-subtext text-xs">{creditBalances.practical === 1 ? "lesson available" : "lessons available"}</p>
          </div>
          <div className="rounded-xl border border-[var(--theme-border)] px-3 py-2">
            <p className="theme-subtext text-xs uppercase tracking-wide">Theory</p>
            <p className="theme-heading text-2xl font-semibold">{creditBalances.theory ?? 0}</p>
            <p className="theme-subtext text-xs">{creditBalances.theory === 1 ? "lesson available" : "lessons available"}</p>
          </div>
        </div>
        {credits.length === 0 ? (
          <p className="theme-subtext mt-3 text-sm">No prepaid credits sold yet. Package lessons are billed on the enrolment instead.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--theme-border)] text-sm">
            {credits.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="theme-heading">
                  {row.kind === "purchase"
                    ? `${row.quantity} ${row.lesson_type} credit${Number(row.quantity) === 1 ? "" : "s"}`
                    : `Used on lesson #${row.lesson_id}`}
                  {row.invoice?.invoice_number ? <span className="theme-subtext ml-2 text-xs">{row.invoice.invoice_number}</span> : null}
                </span>
                <span className="theme-subtext flex items-center gap-3 text-xs">
                  {row.kind === "purchase" ? <span>{money(row.amount)}</span> : <span className="text-amber-600">−1 credit</span>}
                  <span>{shortDate(row.occurred_on)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Editor open={sellingCredit} title="Sell lesson credits" onClose={() => setSellingCredit(false)}>
        <form onSubmit={saveCredits} className="space-y-4">
          <p className="theme-subtext text-sm">Each credit covers one completed lesson of the chosen type. An invoice for the total is created automatically when the unit price is above zero.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Lesson type">
              <DrivingSelect value={creditForm.lesson_type} onChange={(e) => setCreditForm({ ...creditForm, lesson_type: e.target.value })} options={[{ value: "practical", label: "Practical" }, { value: "theory", label: "Theory" }]} />
            </Field>
            <Field label="Quantity"><input className={inputClass} type="number" min="1" max="50" required value={creditForm.quantity} onChange={(e) => setCreditForm({ ...creditForm, quantity: e.target.value })} /></Field>
            <Field label="Unit price (KSh)"><input className={inputClass} type="number" min="0" step="0.01" placeholder="0.00" value={creditForm.unit_price} onChange={(e) => setCreditForm({ ...creditForm, unit_price: e.target.value })} /></Field>
            <Field label="Total"><p className="theme-heading px-1 py-2 text-sm font-semibold">{money((Number(creditForm.quantity) || 0) * (Number(creditForm.unit_price) || 0))}</p></Field>
          </div>
          <Field label="Notes"><textarea className={`${inputClass} h-20 resize-y py-2`} maxLength={2000} placeholder="e.g. Top-up bundle agreed with the student" value={creditForm.notes} onChange={(e) => setCreditForm({ ...creditForm, notes: e.target.value })} /></Field>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={() => setSellingCredit(false)}>Cancel</button>
            <button type="submit" className={primaryButtonClass} disabled={savingCredit}>{savingCredit ? "Saving…" : "Sell credits"}</button>
          </div>
        </form>
      </Editor>
        </>
      ) : null}

      {tab === "personal" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="theme-heading font-semibold">Contact</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <DetailRow label="Phone">{student.phone || "—"}</DetailRow>
              <DetailRow label="Email">{student.email || "—"}</DetailRow>
              <DetailRow label="Address">{student.address || "—"}</DetailRow>
              <DetailRow label="Branch">{showBranchSelect ? branchNameOf(branches, student.branch_id) : "—"}</DetailRow>
              <DetailRow label="Preferred instructor">{student.preferred_instructor?.full_name || "—"}</DetailRow>
            </dl>
          </Card>
          <Card>
            <h2 className="theme-heading font-semibold">Identity & emergency</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <DetailRow label="Date of birth">{shortDate(student.date_of_birth) || "—"}</DetailRow>
              <DetailRow label="ID type"><span className="capitalize">{(student.id_document_type || "—").replace(/_/g, " ")}</span></DetailRow>
              <DetailRow label="ID number">{student.id_document_number || "—"}</DetailRow>
              <DetailRow label="Learner permit">{student.learner_permit_number || "—"}</DetailRow>
              <DetailRow label="Permit expires">{shortDate(student.learner_permit_expires_on)}</DetailRow>
              <DetailRow label="Emergency contact">{student.emergency_name || "—"}</DetailRow>
              <DetailRow label="Emergency phone">{student.emergency_phone || "—"}</DetailRow>
            </dl>
          </Card>
          {student.notes ? (
            <Card className="lg:col-span-2">
              <h2 className="theme-heading font-semibold">Notes</h2>
              <p className="theme-subtext mt-2 whitespace-pre-line text-sm">{student.notes}</p>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "courses" ? (
        <Card>
          <h2 className="theme-heading font-semibold">Enrolments & course progress</h2>
          <ul className="mt-3 space-y-3">
            {enrolments.length === 0 ? <Empty>No enrolments yet. Enrol this student in a course to generate fees.</Empty> : enrolments.map((row) => {
              const rowDone = Number(row.lessons_completed || 0);
              const rowNeed = Number(row.lessons_required || 0);
              const rowPct = rowNeed > 0 ? Math.min(100, Math.round((rowDone / rowNeed) * 100)) : 0;
              return (
                <li key={row.id} className="rounded-xl border border-[var(--theme-border)] px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="theme-heading font-medium">{row.course?.name || "Course"}{row.package?.name ? ` · ${row.package.name}` : ""}</span>
                    <StatusBadge value={row.status} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="theme-subtext">{money(row.price)} · {rowDone}/{rowNeed} lessons · enrolled {shortDate(row.enrolled_on)}</span>
                    <span className="theme-subtext tabular-nums">{rowPct}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--theme-border)]">
                    <div className="h-full rounded-full bg-[var(--theme-primary)]" style={{ width: `${rowPct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            {canEnrol ? (
              <button
                type="button"
                className={primaryButtonClass}
                onClick={() => { setEnrolForm({ course_id: "", package_id: "", enrolled_on: todayDate() }); setEnrolling(true); }}
              >
                {enrolments.length === 0 ? "Enrol in a course" : "Add another enrolment"}
              </button>
            ) : null}
            <AppNavLink href="/driving-school/courses" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Course catalogue</AppNavLink>
          </div>
        </Card>
      ) : null}

      {tab === "attendance" ? (
        <div className="space-y-4">
          <Card>
            <h2 className="theme-heading font-semibold">Lesson attendance</h2>
            <DataTable
              empty="No lesson attendance recorded yet."
              rows={lessons.filter((row) => row.attendance)}
              columns={[
                { key: "starts_at", label: "Lesson", render: (row) => shortDateTime(row.starts_at) },
                { key: "type", label: "Type", render: (row) => <span className="capitalize">{row.lesson_type}</span> },
                { key: "instructor", label: "Instructor", render: (row) => row.instructor?.full_name || "—" },
                { key: "attendance", label: "Attendance", render: (row) => <StatusBadge value={row.attendance} /> },
                { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
              ]}
            />
          </Card>
          <Card>
            <h2 className="theme-heading font-semibold">Gate attendance</h2>
            {attendance.length === 0 ? <Empty>No gate marks recorded.</Empty> : (
              <ul className="mt-2 divide-y divide-[var(--theme-border)] text-sm">
                {attendance.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                    <span>{shortDateTime(row.recorded_at)}</span>
                    <span className="flex items-center gap-2"><StatusBadge value={row.direction} /><span className="theme-subtext capitalize text-xs">{row.verification || "none"}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "lessons" ? (
        <Card>
          <h2 className="theme-heading font-semibold">Lessons</h2>
          <DataTable
            empty="No lessons booked yet."
            rows={lessons}
            columns={[
              { key: "starts_at", label: "When", render: (row) => shortDateTime(row.starts_at) },
              { key: "type", label: "Type", render: (row) => <span className="capitalize">{row.lesson_type}</span> },
              { key: "instructor", label: "Instructor", render: (row) => row.instructor?.full_name || "—" },
              { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
              { key: "feedback", label: "Notes", render: (row) => (row.feedback ? <span className="theme-subtext line-clamp-2 max-w-xs text-xs">{row.feedback}</span> : "—") },
            ]}
          />
        </Card>
      ) : null}

      {tab === "payments" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Invoiced" value={money(statementInvoiced)} hint={`${invoices.length} invoices`} icon="receipt" />
            <Stat label="Received" value={money(statementPaid)} hint={`${payments.length} receipts`} icon="check-circle" tone="emerald" />
            <Stat label="Refunded" value={money(statementRefunded)} hint="Against recorded payments" icon="arrow-counterclockwise" tone="rose" />
            <Stat label="Outstanding" value={money(statementOutstanding)} hint="Balance still due" icon="exclamation-circle" tone="amber" />
          </div>
          {Number(creditBalances.total || 0) > 0 ? (
            <Card>
              <h2 className="theme-heading font-semibold">Lesson credits</h2>
              <p className="theme-subtext mt-1 text-xs">Prepaid lessons available to book without a new invoice.</p>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <DetailRow label="Theory credits">{String(creditBalances.theory ?? 0)}</DetailRow>
                <DetailRow label="Practical credits">{String(creditBalances.practical ?? 0)}</DetailRow>
                <DetailRow label="Total credits">{String(creditBalances.total ?? 0)}</DetailRow>
              </dl>
            </Card>
          ) : null}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="theme-heading font-semibold">Fee statement</h2>
                <p className="theme-subtext text-xs">Every invoice raised for this student, with discounts and the balance due.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <AppNavLink href="/driving-school/payments/new" className={primaryButtonClass}>Record payment</AppNavLink>
                {canSend && Number(data?.data?.outstanding) > 0 ? (
                  <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={() => setReminding(true)}>Send reminder</button>
                ) : null}
              </div>
            </div>
            <div className="mt-3">
              <DataTable
                empty="No invoices yet."
                rows={invoices}
                columns={[
                  { key: "invoice_number", label: "Invoice", render: (row) => row.invoice_number },
                  { key: "kind", label: "Type", render: (row) => <span className="capitalize">{row.kind}</span> },
                  { key: "amount", label: "Amount", render: (row) => money(row.amount) },
                  { key: "discount", label: "Discount", render: (row) => (Number(row.discount) > 0 ? money(row.discount) : "—") },
                  { key: "paid", label: "Paid", render: (row) => money((row.payments || []).reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)) },
                  { key: "outstanding", label: "Outstanding", render: (row) => money(row.outstanding) },
                  { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
                  { key: "issued_on", label: "Issued", render: (row) => shortDate(row.issued_on) },
                ]}
              />
            </div>
          </Card>
          <Card>
            <h2 className="theme-heading font-semibold">Receipts & payments</h2>
            <p className="theme-subtext mt-1 text-xs">M-Pesa references are staff-recorded receipts until a configured Safaricom callback confirms them.</p>
            <div className="mt-3">
              <DataTable
                empty="No payments recorded yet."
                rows={[...payments].sort((a, b) => String(b.received_on || "").localeCompare(String(a.received_on || "")))}
                columns={[
                  { key: "received_on", label: "Date", render: (row) => shortDate(row.received_on) },
                  { key: "receipt_no", label: "Receipt", render: (row) => `RCP-${row.id}` },
                  { key: "invoice_number", label: "Invoice", render: (row) => row.invoice_number },
                  { key: "method", label: "Method", render: (row) => <span className="capitalize">{row.method || "—"}</span> },
                  { key: "reference", label: "Reference", render: (row) => row.reference || "—" },
                  { key: "amount", label: "Amount", render: (row) => money(row.amount) },
                  { key: "refunded", label: "Refunded", render: (row) => (row.refunded ? money(row.refunded) : "—") },
                  { key: "confirmed", label: "Confirmed", render: (row) => <StatusBadge value={row.provider_confirmed ? "confirmed" : "recorded"} /> },
                  { key: "receipt", label: "", render: (row) => <button type="button" className="theme-link text-sm font-medium" onClick={() => openReceipt(row)}>Receipt</button> },
                ]}
              />
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "assessments" ? (
        <div className="space-y-4">
          <Card>
            <h2 className="theme-heading font-semibold">Assessments</h2>
            <DataTable
              empty="No assessments yet."
              rows={assessments}
              columns={[
                { key: "title", label: "Check", render: (row) => row.title },
                { key: "kind", label: "Kind", render: (row) => <span className="capitalize">{row.kind === "mock" ? "Mock exam" : row.kind}</span> },
                { key: "instructor", label: "Instructor", render: (row) => row.instructor?.full_name || "—" },
                { key: "score", label: "Score", render: (row) => `${row.score}/${row.max_score}` },
                { key: "result", label: "Result", render: (row) => <StatusBadge value={row.passed ? "passed" : "failed"} /> },
                { key: "assessed_on", label: "Date", render: (row) => shortDate(row.assessed_on) },
              ]}
            />
          </Card>
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="theme-heading font-semibold">Skills ratings</h2>
                <p className="theme-subtext text-xs">Rated by the instructor at the end of each completed practical lesson. Scores show out of 5.</p>
              </div>
              <span className="theme-subtext text-xs">{(student.skill_ratings || []).length} ratings</span>
            </div>
            {(student.skill_ratings || []).length === 0 ? (
              <Empty>No skills rated yet. Rates are captured when a lesson is marked complete.</Empty>
            ) : (
              <div className="mt-3">
                <DataTable
                  rows={student.skill_ratings}
                  columns={[
                    { key: "rated_on", label: "Lesson date", render: (row) => shortDate(row.rated_on) },
                    { key: "instructor", label: "Instructor", render: (row) => row.instructor?.full_name || "—" },
                    { key: "vehicle_control", label: "Control", render: (row) => `${row.vehicle_control}/5` },
                    { key: "observation", label: "Observe", render: (row) => `${row.observation}/5` },
                    { key: "manoeuvres", label: "Manoeuvre", render: (row) => `${row.manoeuvres}/5` },
                    { key: "road_craft", label: "Road craft", render: (row) => `${row.road_craft}/5` },
                    { key: "confidence", label: "Confidence", render: (row) => `${row.confidence}/5` },
                    { key: "overall", label: "Overall", render: (row) => <span className="font-medium tabular-nums">{(Number(row.overall) / 20).toFixed(1)}</span> },
                  ]}
                />
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "documents" ? (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="theme-heading font-semibold">Student documents</h2>
                <p className="theme-subtext mt-1 text-xs">National ID, learner permit, passport photo, medical report, certificates, and other records.</p>
              </div>
              {canEditDocuments ? (
                <button
                  type="button"
                  className={primaryButtonClass}
                  onClick={() => { setDocError(null); setUploadingDoc(true); }}
                >
                  Upload document
                </button>
              ) : null}
            </div>
            {documents.length === 0 ? (
              <Empty>No documents uploaded yet.</Empty>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--theme-border)] text-sm">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="theme-heading font-medium">{doc.title}</p>
                      <p className="theme-subtext text-xs capitalize">
                        {(doc.document_type || "other").replace(/_/g, " ")} · {doc.file_name} · {fileSizeLabel(doc.file_size)}
                        {doc.notes ? ` · ${doc.notes}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <ProtectedFileLink
                        filePath={drivingStudentDocumentFilePath(studentId, doc.id)}
                        label="View"
                        title={doc.title}
                        className="theme-link text-sm font-medium"
                      />
                      {canEditDocuments ? (
                        <button type="button" className="text-sm font-medium text-red-600 hover:underline" onClick={() => void removeDocument(doc)}>
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="theme-heading font-semibold">Certificate & enrolment record</h2>
            <p className="theme-subtext mt-1 text-xs">Course completion certificate and the active enrolment for this student.</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--theme-border)] px-3 py-3">
              <div>
                <p className="theme-heading text-sm font-medium">Course completion certificate</p>
                <p className="theme-subtext mt-0.5 text-xs">{student.certificate_ready ? "Ready to download and print." : "Available once the course lessons and status are complete."}</p>
              </div>
              <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" disabled={!student.certificate_ready || downloadingCertificate} onClick={() => void downloadCertificate()}>
                {downloadingCertificate ? "Preparing…" : "Download PDF"}
              </button>
            </div>
            {enrolment ? (
              <div className="mt-3 rounded-xl border border-[var(--theme-border)] px-3 py-3 text-sm">
                <p className="theme-heading font-medium">{enrolment.course?.name || "Course"}{enrolment.package?.name ? ` · ${enrolment.package.name}` : ""}</p>
                <p className="theme-subtext mt-1 text-xs">Enrolled {shortDate(enrolment.enrolled_on)} · {enrolment.lessons_completed || 0}/{enrolment.lessons_required || 0} lessons · {money(enrolment.price)}</p>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      {tab === "activity" ? (
        <Card>
          <h2 className="theme-heading font-semibold">Activity history</h2>
          <p className="theme-subtext mt-1 text-xs">Lessons, invoices, receipts, assessments, and enrolments in one timeline.</p>
          {activityEvents.length === 0 ? <Empty>No activity recorded yet.</Empty> : (
            <ul className="mt-2 divide-y divide-[var(--theme-border)] text-sm">
              {activityEvents.map((event) => (
                <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="theme-heading block font-medium capitalize">{event.label}</span>
                    <span className="theme-subtext text-xs">{event.detail}</span>
                  </span>
                  <span className="theme-subtext text-xs">{shortDate(event.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
      {reminding ? (
        <OutreachComposeDialog
          ready={messagingReady}
          student={student}
          initialMessage={`Hi ${String(student?.full_name || "there").trim().split(/\s+/)[0]}, a reminder from the school: your fee statement shows an outstanding balance of ${money(student?.outstanding || 0)}. Please contact us to arrange payment.`}
          onClose={() => setReminding(false)}
          onSaved={() => { setReminding(false); messaging.reload(); }}
        />
      ) : null}
      <Editor open={enrolling} title={`Enrol ${student.full_name}`} onClose={() => setEnrolling(false)}>
        <form onSubmit={saveEnrolment} className="space-y-4">
          <p className="theme-subtext text-sm">Adding an enrolment raises the course and registration fees on this student&apos;s fee statement.</p>
          <Field label="Course">
            <DrivingSelect
              value={enrolForm.course_id}
              onChange={(e) => setEnrolForm({ ...enrolForm, course_id: e.target.value, package_id: "" })}
              options={enrolCourses.map((course) => ({ value: String(course.id), label: `${course.name}${course.code ? ` · ${course.code}` : ""}` }))}
              placeholder="Choose a course"
            />
          </Field>
          {enrolPackages.length > 0 ? (
            <Field label="Package">
              <DrivingSelect
                value={enrolForm.package_id}
                onChange={(e) => setEnrolForm({ ...enrolForm, package_id: e.target.value })}
                options={enrolPackages.map((pkg) => ({ value: String(pkg.id), label: `${pkg.name} · ${money(pkg.price)}` }))}
                placeholder="No package (course price)"
              />
            </Field>
          ) : null}
          <Field label="Enrolled on">
            <input type="date" className={inputClass} value={enrolForm.enrolled_on} onChange={(e) => setEnrolForm({ ...enrolForm, enrolled_on: e.target.value })} />
          </Field>
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
            <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={() => setEnrolling(false)}>Cancel</button>
            <button type="submit" className={primaryButtonClass} disabled={savingEnrolment || !enrolForm.course_id}>
              {savingEnrolment ? "Enrolling…" : "Enrol student"}
            </button>
          </div>
        </form>
      </Editor>
      <Editor open={uploadingDoc} title="Upload document" onClose={() => setUploadingDoc(false)}>
        <form onSubmit={uploadDocument} className="space-y-4">
          {docError ? <p className="text-sm text-red-600">{docError}</p> : null}
          <Field label="Title">
            <input className={inputClass} value={docForm.title} maxLength={200} required onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} placeholder="e.g. Learner permit — front" />
          </Field>
          <Field label="Document type">
            <DrivingSelect
              value={docForm.document_type}
              onChange={(e) => setDocForm({ ...docForm, document_type: e.target.value })}
              options={STUDENT_DOCUMENT_TYPES}
            />
          </Field>
          <Field label="File (PDF, image, Word — max 10MB)">
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              required
              onChange={(e) => setDocForm({ ...docForm, file: e.target.files?.[0] ?? null })}
              className="block w-full text-sm text-slate-600"
            />
          </Field>
          <Field label="Notes">
            <textarea className={`${inputClass} h-20 resize-y py-2`} maxLength={500} value={docForm.notes} onChange={(e) => setDocForm({ ...docForm, notes: e.target.value })} />
          </Field>
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
            <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={() => setUploadingDoc(false)}>Cancel</button>
            <button type="submit" className={primaryButtonClass} disabled={savingDoc || !docForm.file || !docForm.title.trim()}>
              {savingDoc ? "Uploading…" : "Upload document"}
            </button>
          </div>
        </form>
      </Editor>
      {slip ? <ServiceReceiptDialog receipt={slip} paper={paper} onPaper={setPaper} onClose={() => setSlip(null)} /> : null}
    </div>
  );
}

export function CoursesScreen() {
  const pathname = usePathname();
  const detail = pathname.match(/\/courses\/(\d+)$/);
  if (detail) return <CourseDetailScreen courseId={Number(detail[1])} />;
  return (
    <>
      <CourseListScreen />
      {pathname.endsWith("/courses/new") ? <CourseFormScreen /> : null}
      {pathname.endsWith("/courses/package") ? <PackageFormScreen /> : null}
    </>
  );
}

function CourseFormScreen() {
  const { exitTo } = useRecordExit("Add course");
  const { branches, showBranchSelect } = useDrivingBranches();
  const [form, setForm] = useState({ code: "", name: "", licence_category: "", price: "", practical_lessons: 10, theory_lessons: 8, branch_id: "" });
  async function save(event) {
    event.preventDefault();
    try {
      await drivingSend("/courses", "POST", {
        ...form,
        price: Number(form.price) || 0,
        branch_id: form.branch_id ? Number(form.branch_id) : null,
      });
      notifySuccess("Course saved with a Standard package.");
      invalidateDrivingReference("courses");
      exitTo("/driving-school/courses");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save the course.");
    }
  }
  return (
    <RecordFormDialog title="Add course" backHref="/driving-school/courses">
      <form onSubmit={save}>
        <p className="theme-subtext mb-4 text-sm">Saving also creates a Standard package from the price and lesson counts.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <BranchField value={form.branch_id} onChange={(value) => setForm({ ...form, branch_id: value })} branches={branches} show={showBranchSelect} allowAll />
          <Field label="Code"><input className={inputClass} required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
          <Field label="Name"><input className={inputClass} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Licence category"><input className={inputClass} placeholder="Class B — light vehicle" value={form.licence_category} onChange={(e) => setForm({ ...form, licence_category: e.target.value })} /></Field>
          <Field label="Standard package price (KSh)"><input className={inputClass} required type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
          <Field label="Practical lessons"><input className={inputClass} type="number" min="0" value={form.practical_lessons} onChange={(e) => setForm({ ...form, practical_lessons: Number(e.target.value) })} /></Field>
          <Field label="Theory lessons"><input className={inputClass} type="number" min="0" value={form.theory_lessons} onChange={(e) => setForm({ ...form, theory_lessons: Number(e.target.value) })} /></Field>
        </div>
        <RecordFormActions backHref="/driving-school/courses" submitLabel="Save course" />
      </form>
    </RecordFormDialog>
  );
}

function PackageFormScreen() {
  const { exitTo } = useRecordExit("Add package");
  const { data } = useLoad(() => fetchDrivingCoursesCached().then((rows) => ({ data: rows })), "package-courses");
  const courses = rowsOf(data);
  const [pkg, setPkg] = useState({ course_id: "", name: "", price: "", registration_fee: "", practical_lessons: 10, theory_lessons: 8 });
  async function savePackage(event) {
    event.preventDefault();
    if (!pkg.course_id) {
      notifyError("Choose the course this package belongs to.");
      return;
    }
    try {
      await drivingSend(`/courses/${pkg.course_id}/packages`, "POST", {
        name: pkg.name.trim(),
        price: Number(pkg.price) || 0,
        registration_fee: Number(pkg.registration_fee) || 0,
        practical_lessons: Number(pkg.practical_lessons) || 0,
        theory_lessons: Number(pkg.theory_lessons) || 0,
      });
      notifySuccess("Package saved.");
      invalidateDrivingReference("courses");
      exitTo("/driving-school/courses");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save the package.");
    }
  }
  return (
    <RecordFormDialog title="Add package" backHref="/driving-school/courses">
      <form onSubmit={savePackage}>
        <p className="theme-subtext mb-4 text-sm">Use this for a second price, such as weekend lessons or extra practical hours.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Course">
            <DrivingSelect value={pkg.course_id} placeholder="Choose a course" onChange={(e) => setPkg({ ...pkg, course_id: e.target.value })} options={[{ value: "", label: "Choose a course" }, ...courses.map((course) => ({ value: String(course.id), label: `${course.code} · ${course.name}` }))]} />
          </Field>
          <Field label="Package name"><input className={inputClass} required value={pkg.name} onChange={(e) => setPkg({ ...pkg, name: e.target.value })} placeholder="Weekend" /></Field>
          <Field label="Price (KSh)"><input className={inputClass} required type="number" min="0" value={pkg.price} onChange={(e) => setPkg({ ...pkg, price: e.target.value })} /></Field>
          <Field label="Registration fee (KSh)"><input className={inputClass} type="number" min="0" value={pkg.registration_fee} onChange={(e) => setPkg({ ...pkg, registration_fee: e.target.value })} /></Field>
          <Field label="Practical lessons"><input className={inputClass} type="number" min="0" value={pkg.practical_lessons} onChange={(e) => setPkg({ ...pkg, practical_lessons: Number(e.target.value) })} /></Field>
          <Field label="Theory lessons"><input className={inputClass} type="number" min="0" value={pkg.theory_lessons} onChange={(e) => setPkg({ ...pkg, theory_lessons: Number(e.target.value) })} /></Field>
        </div>
        <RecordFormActions backHref="/driving-school/courses" submitLabel="Save package" />
        </form>
    </RecordFormDialog>
  );
}

function isoDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function theoryDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: "—", month: "" };
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: date.toLocaleDateString("en-GB", { month: "short" }),
  };
}

function theoryDateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function theoryTimeRange(session) {
  if (!session?.starts_at) return "—";
  return `${lessonTime(session.starts_at)}–${lessonTime(session.ends_at)}`;
}

function completionTone(pct) {
  const value = Number(pct) || 0;
  if (value >= 75) return "bg-emerald-500";
  if (value >= 40) return "bg-sky-500";
  return "bg-amber-500";
}

function CompletionBar({ value }) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[var(--theme-border)]">
      <span className={`block h-full rounded-full ${completionTone(pct)}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

function theoryModuleTopics(module) {
  return (module?.units || []).flatMap((unit) => unit.topics || []);
}

function SessionLine({ session, showCourse = false }) {
  const stamp = theoryDay(session.starts_at);
  const title = session.topic?.name || session.module?.name || session.group_name || (showCourse ? session.course?.name : "Theory class");
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex w-12 shrink-0 flex-col items-center rounded-xl border border-[var(--theme-border)] px-1 py-1 text-center">
          <span className="theme-heading text-sm font-semibold leading-none">{stamp.day}</span>
          <span className="theme-subtext mt-0.5 text-[10px] font-medium uppercase leading-none">{stamp.month}</span>
        </span>
        <div className="min-w-0">
          <p className="theme-heading truncate text-sm font-semibold">{title}</p>
          <p className="theme-subtext text-xs">
            {theoryTimeRange(session)}
            {session.course?.name ? ` · ${session.course.name}` : ""}
            {session.instructor?.full_name ? ` · ${session.instructor.full_name}` : ""}
          </p>
          <p className="theme-subtext mt-0.5 text-xs">
            {session.classroom ? `Room ${session.classroom}` : "Room not set"}
            {session.group_name ? ` · ${session.group_name}` : ""}
            {session.students_count != null ? ` · ${session.students_count} enrolled` : ""}
          </p>
        </div>
      </div>
      <StatusBadge value={session.status} />
    </li>
  );
}

function CourseListScreen() {
  const { user, hasPermission } = useAuth();
  useTabTitle(tabSectionTitle("Courses & theory", "Driving"));
  const isAdmin = Boolean(user?.is_admin || user?.is_super_admin);
  const canViewSchedule = hasPermission("driving.schedule.view");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const debouncedQuery = useDebouncedValue(query);
  const { data, error } = useLoad(
    () => drivingGet("/theory/catalogue", {
      q: debouncedQuery || undefined,
      category: category || undefined,
      status: status || undefined,
      per_page: 60,
    }),
    `theory-catalogue|${debouncedQuery}|${category}|${status}`,
  );
  const week = useLoad(
    () => (canViewSchedule ? drivingGet("/theory/sessions") : Promise.resolve({ data: [] })),
    `theory-week|${canViewSchedule}`,
  );
  const courses = rowsOf(data);
  const kpis = data?.kpis || {};
  const categories = Array.isArray(data?.categories) ? data.categories : [];
  const sessions = rowsOf(week.data).filter((row) => row.status !== "cancelled");
  const readiness = [...courses]
    .sort((a, b) => (Number(b.stats?.average_theory_completion) || 0) - (Number(a.stats?.average_theory_completion) || 0))
    .slice(0, 5);
  const filtered = Boolean(debouncedQuery || category || status);

  return (
    <div>
      <ScreenHeader
        title="Courses & theory"
        subtitle="The licence-class catalogue, the theory syllabus behind each course, and the classroom that runs beside practical training."
      >
        {isAdmin ? (
          <>
            <AppNavLink href="/driving-school/courses/package" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium">Add package</AppNavLink>
            <AppNavLink href="/driving-school/courses/new" className={primaryButtonClass}>Add course</AppNavLink>
          </>
        ) : null}
      </ScreenHeader>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Courses" value={Number(kpis.total_courses) || 0} hint="Active licence classes" icon="journals" />
        <Stat label="Active learners" value={Number(kpis.active_learners) || 0} hint="Enrolled across all courses" icon="people" tone="sky" />
        <Stat label="Theory in progress" value={Number(kpis.theory_in_progress) || 0} hint="Working through the syllabus" icon="book" tone="violet" />
        <Stat label="Ready for practical" value={Number(kpis.ready_for_practical) || 0} hint="Completion approved" icon="check2-circle" tone="emerald" />
      </div>
      <Toolbar>
        <SearchField value={query} onChange={setQuery} placeholder="Search courses, codes or categories" />
        <FilterSelect
          value={category}
          placeholder="All categories"
          onChange={(event) => setCategory(event.target.value)}
          options={[{ value: "", label: "All categories" }, ...categories.map((item) => ({ value: item, label: item }))]}
        />
        <FilterSelect
          value={status}
          placeholder="All statuses"
          onChange={(event) => setStatus(event.target.value)}
          options={[
            { value: "", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
            { value: "archived", label: "Archived" },
          ]}
        />
      </Toolbar>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {!data && !error ? (
        <Card><p className="theme-subtext text-sm">Loading the course catalogue…</p></Card>
      ) : null}
      {data && courses.length === 0 ? (
        <Card>
          <Empty>{filtered ? "No courses match these filters." : "No courses yet. Add a course to start enrolling students and building its theory syllabus."}</Empty>
        </Card>
      ) : null}
      {courses.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => {
            const stats = course.stats || {};
            const prices = (course.packages || []).map((item) => Number(item.price) || 0).filter((value) => value > 0);
            const from = prices.length ? Math.min(...prices) : Number(course.price) || 0;
            const completion = Number(stats.average_theory_completion) || 0;
            return (
              <Card key={course.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-lg bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">{course.code || "Course"}</span>
                  <StatusBadge value={course.archived_at ? "archived" : course.is_active === false ? "inactive" : "active"} />
                </div>
                <AppNavLink href={`/driving-school/courses/${course.id}`} className="theme-heading mt-3 text-base font-semibold hover:underline">
                  {course.name}
                </AppNavLink>
                <p className="theme-subtext text-xs">
                  {[course.licence_category, course.category].filter(Boolean).join(" · ") || "Licence class"}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--theme-border)] pt-3 text-xs">
                  <span><strong className="theme-heading block text-sm">{Number(stats.enrolled_students) || 0}</strong><span className="theme-subtext">learners</span></span>
                  <span><strong className="theme-heading block text-sm">{Number(stats.syllabus_topics) || 0}</strong><span className="theme-subtext">topics</span></span>
                  <span><strong className="theme-heading block text-sm">{Number(stats.theory_in_progress) || 0}</strong><span className="theme-subtext">in theory</span></span>
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="theme-subtext">Theory completion</span>
                    <span className="theme-heading font-medium">{completion}%</span>
                  </div>
                  <CompletionBar value={completion} />
                </div>
                <div className="mt-auto flex items-end justify-between gap-2 border-t border-[var(--theme-border)] pt-3">
                  <div>
                    <p className="theme-heading text-lg font-semibold leading-none">{money(from)}</p>
                    <p className="theme-subtext mt-1 text-xs">{(course.packages || []).length || 1} package{(course.packages || []).length === 1 ? "" : "s"} · from</p>
                  </div>
                  <AppNavLink href={`/driving-school/courses/${course.id}`} className="theme-heading inline-flex items-center gap-1 text-xs font-medium hover:underline">
                    Open course <i className="bi bi-arrow-right" aria-hidden />
                  </AppNavLink>
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}
      <div className={`mt-4 grid gap-4 ${canViewSchedule ? "xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]" : ""}`}>
        {canViewSchedule ? (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="theme-heading font-semibold">Theory classroom · this week</h2>
                <p className="theme-subtext mt-0.5 text-xs">Classes scheduled against the syllabus, with the group and room for each session. Open a course to plan or take attendance.</p>
              </div>
            </div>
            {week.error ? <p className="mt-3 text-sm text-red-600">{week.error}</p> : null}
            {!week.data && !week.error ? <p className="theme-subtext mt-3 text-sm">Checking the classroom timetable…</p> : null}
            {week.data && sessions.length === 0 ? (
              <Empty>No theory classes this week. Open a course and use its Classes tab to plan one.</Empty>
            ) : null}
            {sessions.length > 0 ? (
              <ul className="mt-2 divide-y divide-[var(--theme-border)]">
                {sessions.slice(0, 7).map((session) => <SessionLine key={session.id} session={session} showCourse />)}
              </ul>
            ) : null}
          </Card>
        ) : null}
        <Card>
          <h2 className="theme-heading font-semibold">Theory readiness</h2>
          <p className="theme-subtext mt-0.5 text-xs">How far each course cohort has worked through its syllabus.</p>
          {readiness.length === 0 ? <Empty>Readiness appears once students are enrolled and topics are marked.</Empty> : null}
          <div className="mt-3 space-y-2">
            {readiness.map((course) => {
              const stats = course.stats || {};
              const completion = Number(stats.average_theory_completion) || 0;
              return (
                <AppNavLink key={course.id} href={`/driving-school/courses/${course.id}`} className="block rounded-xl border border-[var(--theme-border)] px-3 py-2 transition hover:border-[var(--theme-primary)]">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="theme-heading truncate font-medium">{course.name}</span>
                    <span className="theme-heading shrink-0 text-xs font-semibold">{completion}%</span>
                  </div>
                  <div className="mt-1.5"><CompletionBar value={completion} /></div>
                  <p className="theme-subtext mt-1 text-xs">
                    {Number(stats.theory_in_progress) || 0} learning · {Number(stats.completed_theory) || 0} finished · {Number(stats.ready_for_practical) || 0} ready for practical
                  </p>
                </AppNavLink>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

const COURSE_RESOURCE_KINDS = [
  { value: "material", label: "Training material", short: "Materials", icon: "journal-text", tone: "bg-indigo-50 text-indigo-700" },
  { value: "road_sign", label: "Road sign & rules", short: "Road signs", icon: "signpost-split", tone: "bg-amber-50 text-amber-700" },
  { value: "video", label: "Video lesson", short: "Videos", icon: "play-btn", tone: "bg-rose-50 text-rose-700" },
  { value: "quiz", label: "Online quiz", short: "Quizzes", icon: "patch-question", tone: "bg-emerald-50 text-emerald-700" },
  { value: "presentation", label: "Presentation", short: "Slides", icon: "easel", tone: "bg-violet-50 text-violet-700" },
  { value: "notes", label: "Study notes", short: "Study notes", icon: "sticky", tone: "bg-sky-50 text-sky-700" },
  { value: "image", label: "Image", short: "Images", icon: "card-image", tone: "bg-fuchsia-50 text-fuchsia-700" },
  { value: "pdf", label: "PDF handout", short: "PDFs", icon: "file-earmark-pdf", tone: "bg-rose-50 text-rose-700" },
];

function resourceKind(value) {
  return COURSE_RESOURCE_KINDS.find((item) => item.value === value) || COURSE_RESOURCE_KINDS[0];
}

function CourseDetailScreen({ courseId }) {
  const { user, hasPermission } = useAuth();
  const canEdit = Boolean(user?.is_admin || user?.is_super_admin || hasPermission("driving.courses.edit"));
  const canSchedule = hasPermission("driving.schedule.create");
  const canManageClasses = hasPermission("driving.schedule.edit");
  const canViewSchedule = hasPermission("driving.schedule.view");
  const canAttendance = hasPermission("driving.attendance.create");
  const [tab, setTab] = useState("overview");
  const [tick, setTick] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [rangeFrom] = useState(() => isoDay(new Date()));
  const [rangeTo] = useState(() => isoDay(new Date(Date.now() + 28 * 86400000)));
  const { data: courseData, error: courseError } = useLoad(
    () => drivingGet(`/theory/courses/${courseId}`),
    `theory-course|${courseId}|${tick}`,
  );
  const sessionsLoad = useLoad(
    () => (canViewSchedule ? drivingGet("/theory/sessions", { course_id: courseId, from: rangeFrom, to: rangeTo }) : Promise.resolve({ data: [] })),
    `theory-course-sessions|${courseId}|${rangeFrom}|${rangeTo}|${canViewSchedule}|${tick}`,
  );
  const materialsLoad = useLoad(
    () => drivingGet("/theory/materials", { course_id: courseId }),
    `theory-materials|${courseId}|${tick}`,
  );
  const studentsLoad = useLoad(
    () => (canSchedule ? drivingGet("/students", { course_id: courseId, status: "active", per_page: 100, lean: true }) : Promise.resolve({ data: [] })),
    `theory-course-students|${courseId}|${canSchedule}`,
  );
  const course = courseData?.data || null;
  useTabTitle(course ? tabDetailTitle("Course", course.name) : null);

  const packages = course?.packages?.length
    ? course.packages
    : course
      ? [{ id: `course-${course.id}`, name: "Standard", price: course.price, theory_lessons: course.theory_lessons, practical_lessons: course.practical_lessons }]
      : [];
  const templates = Array.isArray(course?.curriculumTemplates) ? course.curriculumTemplates : [];
  const template = templates.find((row) => row.is_active) || templates[0] || null;
  const modules = template?.modules || [];
  const topicOptions = [];
  for (const syllabusModule of modules) {
    for (const unit of syllabusModule.units || []) {
      for (const topic of unit.topics || []) {
        topicOptions.push({ id: topic.id, name: topic.name, module_id: syllabusModule.id, unit_id: unit.id, module_name: syllabusModule.name, unit_name: unit.name });
      }
    }
  }
  const sessions = rowsOf(sessionsLoad.data);
  const materials = rowsOf(materialsLoad.data);
  const students = rowsOf(studentsLoad.data);
  const stats = course?.stats || {};
  const instructors = (course?.instructors || []).filter((row) => row.status !== "inactive");
  const startingPrice = packages.length
    ? Math.min(...packages.map((row) => Number(row.price) || 0))
    : Number(course?.price) || 0;
  const theoryCount = Number(course?.theory_lessons) || 0;
  const practicalCount = Number(course?.practical_lessons) || 0;
  const lessonTotal = theoryCount + practicalCount;
  const practicalPct = lessonTotal > 0 ? Math.round((practicalCount / lessonTotal) * 100) : 0;
  const tabs = [
    { value: "overview", label: "Overview" },
    { value: "curriculum", label: `Syllabus${modules.length ? ` (${modules.length})` : ""}` },
    { value: "library", label: `Theory library${materials.length ? ` (${materials.length})` : ""}` },
    ...(canViewSchedule ? [{ value: "classes", label: `Classes${sessions.length ? ` (${sessions.length})` : ""}` }] : []),
  ];
  const reload = () => setTick((value) => value + 1);
  const upcoming = Array.isArray(stats.upcoming_sessions) ? stats.upcoming_sessions : [];

  if (!course) {
    return (
      <div>
        <ScreenHeader title="Course" subtitle="Course packages, theory syllabus and classroom sessions.">
          <AppNavLink href="/driving-school/courses" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium">Back to courses</AppNavLink>
        </ScreenHeader>
        <Card><Empty>{courseError || (courseData == null ? "Loading course…" : "This course could not be found.")}</Empty></Card>
      </div>
    );
  }

  return (
    <div>
      <ScreenHeader
        title={course.name}
        subtitle={[course.code, course.licence_category, course.category].filter(Boolean).join(" · ")}
      >
        <AppNavLink href="/driving-school/courses" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium">Back to courses</AppNavLink>
        <AppNavLink href="/driving-school/assessments" className={primaryButtonClass}>Record assessment</AppNavLink>
      </ScreenHeader>
      {courseError ? <p className="mb-3 text-sm text-red-600">{courseError}</p> : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Learners" value={Number(stats.enrolled_students) || 0} hint={`${Number(stats.theory_in_progress) || 0} working through theory`} icon="people" />
        <Stat label="Theory completion" value={`${Number(stats.average_theory_completion) || 0}%`} hint="Average across enrolled learners" icon="graph-up" tone="sky" />
        <Stat label="Assessment average" value={`${Number(stats.average_assessment_score) || 0}%`} hint="Submitted theory attempts" icon="patch-check" tone="emerald" />
        <Stat label="Syllabus topics" value={Number(stats.syllabus_topics) || 0} hint={`${modules.length} module${modules.length === 1 ? "" : "s"} in the curriculum`} icon="list-check" tone="violet" />
        <Stat label="Theory materials" value={Number(stats.materials) || 0} hint="Notes, signs, videos and quizzes" icon="collection" tone="amber" />
        <Stat label="Ready for practical" value={Number(stats.ready_for_practical) || 0} hint="Completion approved" icon="check2-circle" tone="emerald" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${tab === item.value ? "border-[var(--theme-primary)] bg-[var(--theme-primary)] text-white" : "border-[var(--theme-border)] theme-subtext"}`}
            onClick={() => setTab(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="theme-heading font-semibold">Course plan</h2>
                <p className="theme-subtext mt-0.5 text-xs">What this licence class covers and how the lessons split between the classroom and the car.</p>
              </div>
              <span className="theme-subtext text-xs">{money(startingPrice)} from</span>
            </div>
            {course.description ? <p className="theme-subtext mt-2 text-sm">{course.description}</p> : null}
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="theme-heading font-medium">{practicalCount} practical lessons</span>
                  <span className="theme-subtext">{theoryCount} theory lessons</span>
                </div>
                <span className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--theme-border)]" aria-hidden>
                  <span className="bg-sky-500" style={{ width: `${practicalPct}%` }} />
                  <span className="bg-violet-500" style={{ width: `${100 - practicalPct}%` }} />
                </span>
                <p className="theme-subtext mt-1.5 text-xs">Practical and theory split across the course.</p>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <DetailRow label="Lesson length">{`${course.lesson_minutes || 60} min`}</DetailRow>
                <DetailRow label="Duration">{course.duration_weeks ? `${course.duration_weeks} weeks` : "—"}</DetailRow>
                <DetailRow label="Instalments">{course.instalment_count ? `${course.instalment_count} payments` : "One payment"}</DetailRow>
                <DetailRow label="Attendance">{course.attendance_requirement_percent ? `${course.attendance_requirement_percent}% required` : "—"}</DetailRow>
              </dl>
            </div>
            {instructors.length > 0 ? (
              <div className="mt-4 border-t border-[var(--theme-border)] pt-3">
                <p className="theme-subtext mb-1.5 text-xs uppercase tracking-wide">Instructors for this course</p>
                <div className="flex flex-wrap gap-1.5">
                  {instructors.map((instructor) => (
                    <span key={instructor.id} className="rounded-full border border-[var(--theme-border)] px-2.5 py-0.5 text-xs">{instructor.full_name}</span>
                  ))}
                </div>
              </div>
            ) : null}
          </Card>
          <Card>
            <h2 className="theme-heading font-semibold">Packages & pricing</h2>
            <p className="theme-subtext mt-0.5 text-xs">What a student chooses when they register for this course.</p>
            <div className="mt-3">
              <DataTable
                empty="No packages yet."
                rows={packages}
                columns={[
                  { key: "name", label: "Package", render: (row) => row.name },
                  { key: "price", label: "Price", render: (row) => money(row.price) },
                  { key: "registration_fee", label: "Registration", render: (row) => (row.registration_fee != null ? money(row.registration_fee) : "—") },
                  { key: "practical", label: "Practical", render: (row) => row.practical_lessons ?? "—" },
                  { key: "theory", label: "Theory", render: (row) => row.theory_lessons ?? "—" },
                ]}
              />
            </div>
          </Card>
          <Card>
            <h2 className="theme-heading font-semibold">Completion requirements</h2>
            <p className="theme-subtext mt-0.5 text-xs">A learner is test ready once the syllabus is done and both checks are passed.</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-start gap-2"><i className="bi bi-1-circle theme-heading mt-0.5" aria-hidden /><span><strong className="theme-heading">Theory check passed.</strong> <span className="theme-subtext">At least one passed theory assessment, such as the highway code quiz.</span></span></li>
              <li className="flex items-start gap-2"><i className="bi bi-2-circle theme-heading mt-0.5" aria-hidden /><span><strong className="theme-heading">Practical check passed.</strong> <span className="theme-subtext">An instructor-signed practical assessment.</span></span></li>
              <li className="flex items-start gap-2"><i className="bi bi-3-circle theme-heading mt-0.5" aria-hidden /><span><strong className="theme-heading">Syllabus topics marked complete.</strong> <span className="theme-subtext">Progress is tracked per topic across the modules.</span></span></li>
              {course.attendance_requirement_percent ? (
                <li className="flex items-start gap-2"><i className="bi bi-4-circle theme-heading mt-0.5" aria-hidden /><span><strong className="theme-heading">{course.attendance_requirement_percent}% attendance.</strong> <span className="theme-subtext">Theory class attendance is part of completion.</span></span></li>
              ) : null}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <AppNavLink href="/driving-school/assessments" className={primaryButtonClass}>Record assessment</AppNavLink>
              <AppNavLink href="/driving-school/assessments" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium">View examinations</AppNavLink>
            </div>
          </Card>
          <Card className="lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="theme-heading font-semibold">Upcoming theory classes</h2>
                <p className="theme-subtext mt-0.5 text-xs">The next sessions booked against this course.</p>
              </div>
              {canViewSchedule ? (
                <button type="button" className="theme-secondary-btn rounded-lg px-3 py-1.5 text-xs font-medium" onClick={() => setTab("classes")}>
                  All classes
                </button>
              ) : null}
            </div>
            {upcoming.length === 0 ? (
              <Empty>No theory classes scheduled yet.</Empty>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--theme-border)]">
                {upcoming.map((session) => <SessionLine key={session.id} session={session} />)}
              </ul>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "curriculum" ? (
        <CourseCurriculumPanel
          courseId={courseId}
          modules={modules}
          canEdit={canEdit}
          onChanged={reload}
          onAddModule={() => setDialog({ type: "module" })}
          onAddUnit={(module) => setDialog({ type: "unit", module })}
          onAddTopic={(module, unit) => setDialog({ type: "topic", module, unit })}
        />
      ) : null}

      {tab === "library" ? (
        <CourseLibraryPanel
          courseId={courseId}
          resources={materials}
          loading={materialsLoad.data == null && !materialsLoad.error}
          error={materialsLoad.error}
          canEdit={canEdit}
          onChanged={reload}
        />
      ) : null}

      {tab === "classes" && canViewSchedule ? (
        <CourseClassesPanel
          sessions={sessions}
          loading={sessionsLoad.data == null && !sessionsLoad.error}
          error={sessionsLoad.error}
          canSchedule={canSchedule}
          canManage={canManageClasses}
          canAttendance={canAttendance}
          onAdd={() => setDialog({ type: "session" })}
          onAttendance={(session) => setDialog({ type: "attendance", session })}
          onChanged={reload}
        />
      ) : null}

      {dialog?.type === "module" || dialog?.type === "unit" || dialog?.type === "topic" ? (
        <CurriculumItemDialog
          kind={dialog.type}
          courseId={courseId}
          module={dialog.module}
          unit={dialog.unit}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); reload(); }}
        />
      ) : null}
      {dialog?.type === "session" ? (
        <TheorySessionDialog
          courseId={courseId}
          topics={topicOptions}
          instructors={instructors}
          students={students}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); reload(); }}
        />
      ) : null}
      {dialog?.type === "attendance" ? (
        <TheoryAttendanceDialog
          session={dialog.session}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); reload(); }}
        />
      ) : null}
    </div>
  );
}

function CourseCurriculumPanel({ courseId, modules, canEdit, onChanged, onAddModule, onAddUnit, onAddTopic }) {
  const confirm = useConfirm();
  const [open, setOpen] = useState({});

  async function remove(path, label) {
    const ok = await confirm(confirmDeleteOptions(label));
    if (!ok) return;
    try {
      await drivingSend(path, "DELETE");
      notifySuccess("Removed from the syllabus.");
      onChanged();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not remove this item.");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="theme-heading font-semibold">Theory syllabus</h2>
            <p className="theme-subtext mt-0.5 text-xs">Modules group units, and each unit carries the topics students must complete before their checks.</p>
          </div>
          {canEdit ? (
            <button type="button" className={primaryButtonClass} onClick={onAddModule}>Add module</button>
          ) : null}
        </div>
      </Card>
      {modules.length === 0 ? (
        <Card>
          <Empty>No syllabus yet. Add the first module to outline what this course teaches.</Empty>
        </Card>
      ) : null}
      {modules.map((module, index) => {
        const isOpen = open[module.id] ?? index === 0;
        const topics = theoryModuleTopics(module);
        const theoryMinutes = Number(module.theory_minutes) || topics.reduce((sum, topic) => sum + (Number(topic.theory_minutes) || 0), 0);
        const practicalMinutes = Number(module.practical_minutes) || topics.reduce((sum, topic) => sum + (Number(topic.practical_minutes) || 0), 0);
        return (
          <Card key={module.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen({ ...open, [module.id]: !isOpen })}>
                <p className="theme-heading flex items-center gap-2 font-semibold">
                  <i className={`bi bi-chevron-${isOpen ? "down" : "right"} text-xs`} aria-hidden />
                  {module.name}
                </p>
                <p className="theme-subtext mt-0.5 text-xs">
                  {(module.units || []).length} unit{(module.units || []).length === 1 ? "" : "s"} · {topics.length} topic{topics.length === 1 ? "" : "s"} · {theoryMinutes} min theory · {practicalMinutes} min practical
                </p>
              </button>
              {canEdit ? (
                <div className="flex shrink-0 gap-3 text-xs">
                  <button type="button" className="theme-heading font-medium hover:underline" onClick={() => onAddUnit(module)}>Add unit</button>
                  <button type="button" className="text-red-600 hover:underline" onClick={() => void remove(`/theory/curriculum/modules/${module.id}`, `module “${module.name}”`)}>Remove</button>
                </div>
              ) : null}
            </div>
            {isOpen ? (
              <div className="mt-3 space-y-3">
                {module.description ? <p className="theme-subtext text-sm">{module.description}</p> : null}
                {(module.units || []).length === 0 ? (
                  <p className="theme-subtext text-xs">No units yet. Add a unit to start listing topics.</p>
                ) : null}
                {(module.units || []).map((unit) => (
                  <div key={unit.id} className="rounded-xl border border-[var(--theme-border)] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="theme-heading text-sm font-medium">{unit.name}</p>
                        {unit.description ? <p className="theme-subtext mt-0.5 text-xs">{unit.description}</p> : null}
                      </div>
                      {canEdit ? (
                        <div className="flex shrink-0 gap-3 text-xs">
                          <button type="button" className="theme-heading font-medium hover:underline" onClick={() => onAddTopic(module, unit)}>Add topic</button>
                          <button type="button" className="text-red-600 hover:underline" onClick={() => void remove(`/theory/curriculum/units/${unit.id}`, `unit “${unit.name}”`)}>Remove</button>
                        </div>
                      ) : null}
                    </div>
                    {(unit.topics || []).length > 0 ? (
                      <ul className="mt-2 divide-y divide-[var(--theme-border)]">
                        {(unit.topics || []).map((topic) => (
                          <li key={topic.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                            <div className="flex min-w-0 items-start gap-2">
                              <i className="bi bi-dot theme-subtext mt-0.5" aria-hidden />
                              <div className="min-w-0">
                                <p className="theme-heading text-sm">{topic.name}</p>
                                {topic.description ? <p className="theme-subtext line-clamp-2 text-xs">{topic.description}</p> : null}
                                <p className="theme-subtext mt-0.5 text-[11px]">
                                  {Number(topic.theory_minutes) || 0} min theory · {Number(topic.practical_minutes) || 0} min practical
                                  {topic.training_method ? ` · ${String(topic.training_method).replace(/_/g, " ")}` : ""}
                                  {topic.assessment_requirement ? ` · check: ${topic.assessment_requirement}` : ""}
                                </p>
                              </div>
                            </div>
                            {canEdit ? (
                              <button type="button" className="theme-subtext shrink-0 text-xs hover:text-red-600" onClick={() => void remove(`/theory/curriculum/topics/${topic.id}`, `topic “${topic.name}”`)}>
                                Remove
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="theme-subtext mt-2 text-xs">No topics in this unit yet.</p>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </Card>
        );
      })}
      <p className="theme-subtext text-xs">Course {courseId} · topics marked in class roll up into each student&apos;s theory progress.</p>
    </div>
  );
}

function CourseLibraryPanel({ courseId, resources, loading, error, canEdit, onChanged }) {
  const confirm = useConfirm();
  const [kindFilter, setKindFilter] = useState("");
  const [form, setForm] = useState({ kind: "material", title: "", summary: "", url: "", body: "", duration_minutes: "", file: null });
  const [busy, setBusy] = useState(false);
  const counts = Object.fromEntries(COURSE_RESOURCE_KINDS.map((item) => [item.value, resources.filter((row) => row.kind === item.value).length]));
  const visible = kindFilter ? resources.filter((row) => row.kind === kindFilter) : resources;

  async function addResource(event) {
    event.preventDefault();
    if (!form.title.trim()) {
      notifyError("Give the resource a title.");
      return;
    }
    setBusy(true);
    try {
      const fields = {
        course_id: courseId,
        kind: form.kind,
        title: form.title.trim(),
        summary: form.summary.trim() || null,
        url: form.url.trim() || null,
        body: form.body.trim() || null,
        duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
      };
      if (form.file) await apiUploadForm("/driving-school/theory/materials", { ...fields, file: form.file });
      else await drivingSend("/theory/materials", "POST", fields);
      notifySuccess("Theory resource added to the course.");
      setForm({ kind: form.kind, title: "", summary: "", url: "", body: "", duration_minutes: "", file: null });
      onChanged();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save the resource.");
    } finally {
      setBusy(false);
    }
  }

  async function archiveResource(row) {
    const ok = await confirm(confirmDeleteOptions(`“${row.title}”`, `Remove “${row.title}” from the course library?`));
    if (!ok) return;
    try {
      await drivingSend(`/theory/materials/${row.id}/archive`, "PATCH", { archived: true });
      notifySuccess("Resource removed.");
      onChanged();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not remove the resource.");
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="theme-heading font-semibold">Theory library</h2>
            <p className="theme-subtext mt-0.5 text-xs">Materials, road signs, videos and quizzes students revise before their theory check.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={`rounded-full border px-2.5 py-1 text-xs font-medium ${kindFilter === "" ? "border-[var(--theme-primary)] text-[var(--theme-primary)]" : "border-[var(--theme-border)] theme-subtext"}`} onClick={() => setKindFilter("")}>All {resources.length}</button>
            {COURSE_RESOURCE_KINDS.map((item) => (
              <button key={item.value} type="button" className={`rounded-full border px-2.5 py-1 text-xs font-medium ${kindFilter === item.value ? "border-[var(--theme-primary)] text-[var(--theme-primary)]" : "border-[var(--theme-border)] theme-subtext"}`} onClick={() => setKindFilter(item.value)}>
                {item.short} {counts[item.value] || 0}
              </button>
            ))}
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {loading ? <p className="theme-subtext mt-3 text-sm">Loading the library…</p> : null}
        {!loading && visible.length === 0 ? (
          <Empty>No resources in this view. Add training material so students can revise before their checks.</Empty>
        ) : null}
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {visible.map((row) => {
            const kind = resourceKind(row.kind);
            return (
              <li key={row.id} className="flex flex-col rounded-xl border border-[var(--theme-border)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${kind.tone}`} aria-hidden>
                    <i className={`bi bi-${kind.icon}`} />
                  </span>
                  {canEdit ? (
                    <button type="button" className="theme-subtext text-xs hover:text-red-600" onClick={() => void archiveResource(row)}>Remove</button>
                  ) : null}
                </div>
                <p className="theme-heading mt-2 text-sm font-semibold">{row.title}</p>
                <p className="theme-subtext text-[11px] uppercase tracking-wide">{kind.label}{row.duration_minutes ? ` · ${row.duration_minutes} min` : ""}</p>
                {row.summary ? <p className="theme-subtext mt-1 line-clamp-2 text-xs">{row.summary}</p> : null}
                {row.body ? <p className="theme-subtext mt-1 line-clamp-3 whitespace-pre-line text-xs">{row.body}</p> : null}
                <div className="mt-auto flex flex-wrap gap-3 pt-2 text-xs">
                  {row.url ? (
                    <a href={row.url} target="_blank" rel="noreferrer" className="theme-heading inline-flex items-center gap-1 font-medium hover:underline">
                      Open link <i className="bi bi-box-arrow-up-right" aria-hidden />
                    </a>
                  ) : null}
                  {row.file_url ? (
                    <a href={row.file_url} target="_blank" rel="noreferrer" className="theme-heading inline-flex items-center gap-1 font-medium hover:underline">
                      Open file <i className="bi bi-paperclip" aria-hidden />
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
      {canEdit ? (
        <Card>
          <h2 className="theme-heading font-semibold">Add to the library</h2>
          <p className="theme-subtext mt-0.5 text-xs">Attach notes, a link, a file or quiz instructions to this course.</p>
          <form onSubmit={addResource} className="mt-3 space-y-3">
            <Field label="Kind">
              <DrivingSelect value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} options={COURSE_RESOURCE_KINDS.map((item) => ({ value: item.value, label: item.label }))} />
            </Field>
            <Field label="Title"><input className={inputClass} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Highway code — junctions" /></Field>
            <Field label="Short summary"><input className={inputClass} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="What students should take from this" /></Field>
            <Field label="Link (optional)"><input className={inputClass} type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" /></Field>
            <Field label="Reading time (minutes)"><input className={inputClass} type="number" min="1" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} /></Field>
            <Field label="File (optional)"><input className={inputClass} type="file" accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,image/*,video/mp4,video/quicktime" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })} /></Field>
            <Field label="Notes"><textarea className={`${inputClass} h-24 resize-y py-2`} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Key points, rules or quiz questions" /></Field>
            <button type="submit" className={primaryButtonClass} disabled={busy}>{busy ? "Saving…" : "Add resource"}</button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}

function CourseClassesPanel({ sessions, loading, error, canSchedule, canManage, canAttendance, onAdd, onAttendance, onChanged }) {
  const [busyId, setBusyId] = useState(null);

  async function completeSession(session) {
    setBusyId(session.id);
    try {
      await drivingSend(`/theory/sessions/${session.id}/status`, "PATCH", { status: "completed" });
      notifySuccess("Class marked completed. Topics with attendance are marked done.");
      onChanged();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not update the class.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="theme-heading font-semibold">Theory classes</h2>
            <p className="theme-subtext mt-0.5 text-xs">Sessions booked for this course over the next four weeks. Mark attendance in class to roll topic progress forward.</p>
          </div>
          {canSchedule ? (
            <button type="button" className={primaryButtonClass} onClick={onAdd}>Schedule class</button>
          ) : null}
        </div>
      </Card>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {loading ? <Card><p className="theme-subtext text-sm">Loading theory classes…</p></Card> : null}
      {!loading && sessions.length === 0 ? (
        <Card><Empty>No theory classes scheduled in the next four weeks.</Empty></Card>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {sessions.map((session) => {
          const summary = session.attendance_summary || {};
          const title = session.topic?.name || session.module?.name || session.group_name || "Theory class";
          return (
            <Card key={session.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="theme-heading font-semibold">{theoryDateLabel(session.starts_at)}</p>
                  <p className="theme-subtext text-xs">{theoryTimeRange(session)} · Room {session.classroom || "—"}{session.group_name ? ` · ${session.group_name}` : ""}</p>
                </div>
                <StatusBadge value={session.status} />
              </div>
              <p className="theme-heading mt-2 text-sm font-medium">{title}</p>
              <p className="theme-subtext text-xs">
                {session.instructor?.full_name || "Instructor not set"}
                {session.capacity ? ` · capacity ${session.capacity}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--theme-border)] pt-3 text-xs">
                <span className="theme-subtext">
                  {session.students_count ?? 0} enrolled · {summary.present ?? 0} present · {summary.absent ?? 0} absent · {summary.late ?? 0} late
                </span>
                <div className="flex gap-3">
                  {canAttendance && session.status !== "cancelled" ? (
                    <button type="button" className="theme-heading font-medium hover:underline" onClick={() => onAttendance(session)}>Attendance</button>
                  ) : null}
                  {canManage && ["scheduled", "in_progress"].includes(session.status) ? (
                    <button type="button" className="theme-heading font-medium hover:underline disabled:opacity-50" disabled={busyId === session.id} onClick={() => void completeSession(session)}>
                      {busyId === session.id ? "Saving…" : "Mark completed"}
                    </button>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function CurriculumItemDialog({ kind, courseId, module: parentModule, unit: parentUnit, onClose, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => (
    kind === "topic"
      ? { name: "", description: "", theory_minutes: 30, practical_minutes: 0, training_method: "classroom", assessment_requirement: "" }
      : { name: "", description: "" }
  ));
  const titles = { module: "Add module", unit: "Add unit", topic: "Add topic" };
  const paths = {
    module: `/theory/courses/${courseId}/curriculum/modules`,
    unit: `/theory/curriculum/modules/${parentModule?.id}/units`,
    topic: `/theory/curriculum/units/${parentUnit?.id}/topics`,
  };

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) {
      notifyError("Give this item a name.");
      return;
    }
    setBusy(true);
    try {
      const body = kind === "topic"
        ? {
          name: form.name.trim(),
          description: form.description.trim() || null,
          theory_minutes: Number(form.theory_minutes) || 0,
          practical_minutes: Number(form.practical_minutes) || 0,
          training_method: form.training_method || null,
          assessment_requirement: form.assessment_requirement.trim() || null,
        }
        : { name: form.name.trim(), description: form.description.trim() || null };
      await drivingSend(paths[kind], "POST", body);
      notifySuccess(kind === "module" ? "Module added." : kind === "unit" ? "Unit added." : "Topic added.");
      onSaved();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save this item.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Editor open title={titles[kind]} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {kind === "topic" && parentModule && parentUnit ? (
          <p className="theme-subtext text-xs">{parentModule.name} · {parentUnit.name}</p>
        ) : null}
        <Field label="Name"><input className={inputClass} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={kind === "module" ? "Road signs and markings" : kind === "unit" ? "Warning signs" : "Recognising warning signs"} /></Field>
        <Field label="Description"><textarea className={`${inputClass} h-20 resize-y py-2`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        {kind === "topic" ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Theory minutes"><input className={inputClass} type="number" min="0" value={form.theory_minutes} onChange={(e) => setForm({ ...form, theory_minutes: e.target.value })} /></Field>
              <Field label="Practical minutes"><input className={inputClass} type="number" min="0" value={form.practical_minutes} onChange={(e) => setForm({ ...form, practical_minutes: e.target.value })} /></Field>
            </div>
            <Field label="Training method">
              <DrivingSelect
                value={form.training_method}
                onChange={(e) => setForm({ ...form, training_method: e.target.value })}
                options={[
                  { value: "classroom", label: "Classroom" },
                  { value: "in_car", label: "In the car" },
                  { value: "simulator", label: "Simulator" },
                  { value: "online", label: "Online" },
                  { value: "workshop", label: "Workshop" },
                ]}
              />
            </Field>
            <Field label="Assessment requirement"><input className={inputClass} value={form.assessment_requirement} onChange={(e) => setForm({ ...form, assessment_requirement: e.target.value })} placeholder="Online quiz · 80% to pass" /></Field>
          </>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
          <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryButtonClass} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Editor>
  );
}

function TheorySessionDialog({ courseId, topics, instructors, students, onClose, onSaved }) {
  const [form, setForm] = useState({ date: isoDay(new Date()), start: "09:00", end: "11:00", topic_id: "", instructor_id: "", classroom: "", group_name: "", capacity: "" });
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  function toggleStudent(id) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.date || !form.start || !form.end) {
      notifyError("Choose the date and times for this class.");
      return;
    }
    const topic = topics.find((row) => String(row.id) === String(form.topic_id));
    setBusy(true);
    try {
      await drivingSend("/theory/sessions", "POST", {
        course_id: courseId,
        module_id: topic?.module_id ?? null,
        unit_id: topic?.unit_id ?? null,
        topic_id: topic?.id ?? null,
        instructor_id: form.instructor_id ? Number(form.instructor_id) : null,
        classroom: form.classroom.trim() || null,
        group_name: form.group_name.trim() || null,
        capacity: form.capacity ? Number(form.capacity) : null,
        starts_at: `${form.date}T${form.start}:00`,
        ends_at: `${form.date}T${form.end}:00`,
        student_ids: [...selected],
      });
      notifySuccess("Theory class scheduled.");
      onSaved();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not schedule this class.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Editor open title="Schedule theory class" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date"><input className={inputClass} type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Starts"><input className={inputClass} type="time" required value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
          <Field label="Ends"><input className={inputClass} type="time" required value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field>
        </div>
        <Field label="Topic">
          <DrivingSelect
            value={form.topic_id}
            placeholder="No specific topic"
            onChange={(e) => setForm({ ...form, topic_id: e.target.value })}
            options={[{ value: "", label: "No specific topic" }, ...topics.map((topic) => ({ value: String(topic.id), label: `${topic.name} · ${topic.unit_name}` }))]}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Instructor">
            <DrivingSelect
              value={form.instructor_id}
              placeholder="Unassigned"
              onChange={(e) => setForm({ ...form, instructor_id: e.target.value })}
              options={[{ value: "", label: "Unassigned" }, ...instructors.map((row) => ({ value: String(row.id), label: row.full_name }))]}
            />
          </Field>
          <Field label="Classroom"><input className={inputClass} value={form.classroom} onChange={(e) => setForm({ ...form, classroom: e.target.value })} placeholder="Room 2" /></Field>
          <Field label="Group name"><input className={inputClass} value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })} placeholder="Evening intake" /></Field>
          <Field label="Capacity"><input className={inputClass} type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Field>
        </div>
        <div>
          <p className="theme-subtext mb-1 text-xs">{selected.size} of {students.length} enrolled learners selected</p>
          {students.length === 0 ? (
            <p className="theme-subtext text-xs">No active learners are enrolled in this course yet.</p>
          ) : (
            <ul className="max-h-48 divide-y divide-[var(--theme-border)] overflow-y-auto rounded-xl border border-[var(--theme-border)] px-3">
              {students.map((student) => (
                <li key={student.id}>
                  <label className="flex items-center gap-3 py-2 text-sm">
                    <input type="checkbox" checked={selected.has(student.id)} onChange={() => toggleStudent(student.id)} />
                    <PersonName name={student.full_name} detail={student.student_number} />
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
          <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryButtonClass} disabled={busy}>{busy ? "Scheduling…" : "Schedule class"}</button>
        </div>
      </form>
    </Editor>
  );
}

const ATTENDANCE_OPTIONS = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
  { value: "excused", label: "Excused" },
];

function TheoryAttendanceDialog({ session, onClose, onSaved }) {
  const { data, error } = useLoad(() => drivingGet(`/theory/sessions/${session.id}`), `theory-session|${session.id}`);
  const detail = data?.data || null;
  const students = detail?.students || [];
  const [statuses, setStatuses] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!detail) return;
    setStatuses(Object.fromEntries((detail.students || []).map((student) => [student.id, student.attendance_status || "present"])));
  }, [detail]);

  async function save(event) {
    event.preventDefault();
    if (!students.length) return;
    setBusy(true);
    try {
      await drivingSend(`/theory/sessions/${session.id}/attendance`, "POST", {
        records: students.map((student) => ({ student_id: student.id, status: statuses[student.id] || "present" })),
      });
      notifySuccess("Attendance saved.");
      onSaved();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save attendance.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Editor open title="Class attendance" onClose={onClose} wide>
      <p className="theme-subtext mb-3 text-sm">
        {theoryDateLabel(session.starts_at)} · {theoryTimeRange(session)} · {session.topic?.name || session.course?.name || "Theory class"}
      </p>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {!data && !error ? <p className="theme-subtext text-sm">Loading the class register…</p> : null}
      {data && students.length === 0 ? (
        <Empty>No learners are assigned to this class yet. Re-schedule it and pick the students.</Empty>
      ) : null}
      {students.length > 0 ? (
        <form onSubmit={save}>
          <ul className="divide-y divide-[var(--theme-border)]">
            {students.map((student) => (
              <li key={student.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <PersonName name={student.full_name} detail={student.student_number} />
                <div className="flex flex-wrap gap-1">
                  {ATTENDANCE_OPTIONS.map((option) => {
                    const active = (statuses[student.id] || "present") === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${active ? "border-[var(--theme-primary)] bg-[var(--theme-primary)] text-white" : "border-[var(--theme-border)] theme-subtext"}`}
                        onClick={() => setStatuses({ ...statuses, [student.id]: option.value })}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
            <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>Cancel</button>
            <button type="submit" className={primaryButtonClass} disabled={busy}>{busy ? "Saving…" : "Save attendance"}</button>
          </div>
        </form>
      ) : null}
    </Editor>
  );
}

function studentOptionLabel(student) {
  const detail = student?.phone || student?.student_number || "";
  return detail ? `${student.full_name} · ${detail}` : String(student?.full_name || "");
}

function LessonFormScreen() {
  const { exitTo } = useRecordExit("Book lesson");
  const { branches, showBranchSelect } = useDrivingBranches();
  const [branchFilter, setBranchFilter] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [form, setForm] = useState({ student_id: "", instructor_id: "", vehicle_id: "", lesson_type: "practical", starts_at: "", duration_minutes: 60, location: "" });
  const [preset, setPreset] = useState(null);
  useEffect(() => {
    const parsed = bookingPresetFromSearch(window.location.search);
    if (parsed.branch_id) setBranchFilter(parsed.branch_id);
    if (parsed.starts_at) {
      setForm((current) => ({ ...current, starts_at: parsed.starts_at }));
    }
    if (parsed.instructor_id || parsed.vehicle_id) {
      setForm((current) => ({
        ...current,
        instructor_id: parsed.instructor_id || current.instructor_id,
        vehicle_id: parsed.vehicle_id || current.vehicle_id,
      }));
    }
    if (parsed.date) setPreset(parsed);
  }, []);
  const loadStudentOptions = useCallback(async (term) => {
    const response = await drivingGet("/students", {
      status: "active",
      lean: 1,
      per_page: 20,
      q: term,
      branch_id: branchFilter || undefined,
    });
    return rowsOf(response).map((student) => ({
      value: String(student.id),
      label: studentOptionLabel(student),
      student,
    }));
  }, [branchFilter]);
  const instructorLoad = useLoad(() => fetchDrivingInstructorsCached().then((rows) => ({ data: rows })), "lesson-form-instructors");
  const vehicleLoad = useLoad(() => fetchDrivingVehiclesCached().then((rows) => ({ data: rows })), "lesson-form-vehicles");
  const allInstructors = rowsOf(instructorLoad.data);
  const allVehicles = rowsOf(vehicleLoad.data);
  const studentSelectOptions = selectedStudent
    ? [{ value: String(selectedStudent.id), label: studentOptionLabel(selectedStudent) }]
    : [];
  const lessonBranchId = selectedStudent?.branch_id ?? branchFilter;
  const instructors = allInstructors.filter((row) => row.status !== "inactive" && belongsToBranch(row, lessonBranchId));
  const vehicles = allVehicles.filter((row) => (row.status === "available" || !row.status) && belongsToBranch(row, lessonBranchId));
  function chooseStudent(student) {
    const studentBranchId = student.branch_id ?? branchFilter;
    setSelectedStudent(student);
    if (student.branch_id && !branchFilter) setBranchFilter(String(student.branch_id));
    setForm((current) => {
      const next = { ...current, student_id: String(student.id) };
      const instructor = allInstructors.find((row) => String(row.id) === String(next.instructor_id));
      if (instructor && !belongsToBranch(instructor, studentBranchId)) next.instructor_id = "";
      const vehicle = allVehicles.find((row) => String(row.id) === String(next.vehicle_id));
      if (vehicle && !belongsToBranch(vehicle, studentBranchId)) next.vehicle_id = "";
      return next;
    });
  }
  function clearStudent() {
    setSelectedStudent(null);
    setForm((current) => ({ ...current, student_id: "" }));
  }
  function chooseStudentId(value, option) {
    if (!value) {
      clearStudent();
      return;
    }
    if (option?.student) chooseStudent(option.student);
  }
  async function save(event) {
    event.preventDefault();
    if (!form.student_id || !form.instructor_id) {
      notifyError("Choose a student and an instructor.");
      return;
    }
    try {
      await drivingSend("/lessons", "POST", {
        ...form,
        student_id: Number(form.student_id),
        instructor_id: Number(form.instructor_id),
        vehicle_id: form.vehicle_id ? Number(form.vehicle_id) : null,
        starts_at: form.starts_at,
      });
      notifySuccess("Lesson booked.");
      exitTo("/driving-school/schedule");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not book the lesson.");
    }
  }
  return (
    <RecordFormDialog title="Book a lesson" subtitle={preset?.starts_at ? `Booking for ${new Date(`${preset.starts_at}:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} at ${preset.starts_at.slice(11)} — change the time below if needed.` : "Search for the student, then confirm the time, instructor and vehicle."} backHref="/driving-school/schedule">
      <form onSubmit={save}>
        <div className="grid gap-4 sm:grid-cols-2">
          <BranchField
            value={branchFilter}
            onChange={(value) => { setBranchFilter(value); clearStudent(); setForm((current) => ({ ...current, instructor_id: "", vehicle_id: "" })); }}
            branches={branches}
            show={showBranchSelect}
            allowAll
          />
          <Field label="Student">
            <SearchableSelect
              value={form.student_id}
              options={studentSelectOptions}
              loadOptions={loadStudentOptions}
              minSearchLength={2}
              idleSearchLabel="Type at least 2 characters"
              emptyLabel="No active students match"
              placeholder="Search name, phone or student number"
              onChange={chooseStudentId}
              className={inputClass}
            />
          </Field>
          <Field label="Type">
            <DrivingSelect value={form.lesson_type} onChange={(e) => setForm({ ...form, lesson_type: e.target.value })} options={[{ value: "practical", label: "Practical" }, { value: "theory", label: "Theory" }]} />
          </Field>
          <Field label="Instructor">
            <DrivingSelect value={form.instructor_id} placeholder="Choose an instructor" onChange={(e) => setForm({ ...form, instructor_id: e.target.value })} options={[{ value: "", label: "Choose an instructor" }, ...instructors.map((row) => ({ value: String(row.id), label: row.full_name }))]} />
          </Field>
          <Field label="Vehicle">
            <DrivingSelect value={form.vehicle_id} placeholder="No vehicle" onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })} options={[{ value: "", label: "No vehicle" }, ...vehicles.map((row) => ({ value: String(row.id), label: row.registration_number }))]} />
          </Field>
          <Field label="Starts"><input className={inputClass} required type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></Field>
          <Field label="Duration (minutes)"><input className={inputClass} type="number" min="15" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} /></Field>
          <Field label="Location"><input className={inputClass} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Yard, route, or classroom" /></Field>
        </div>
        <RecordFormActions backHref="/driving-school/schedule" submitLabel="Book lesson" />
      </form>
    </RecordFormDialog>
  );
}

export function ScheduleScreen() {
  const pathname = usePathname();
  return (
    <>
      <ScheduleListScreen />
      {pathname.endsWith("/schedule/new") ? <LessonFormScreen /> : null}
    </>
  );
}

function toDateTimeLocal(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function shiftIsoDay(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function mondayOf(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`);
  return shiftIsoDay(isoDate, -((date.getDay() + 6) % 7));
}

function shiftIsoMonth(isoDate, months) {
  const date = new Date(`${isoDate}T00:00:00`);
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  const pad = (number) => String(number).padStart(2, "0");
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
}

function monthGrid(isoDate) {
  const first = `${isoDate.slice(0, 7)}-01`;
  const firstDate = new Date(`${first}T00:00:00`);
  const lastDate = new Date(firstDate.getFullYear(), firstDate.getMonth() + 1, 0);
  const pad = (number) => String(number).padStart(2, "0");
  const last = `${lastDate.getFullYear()}-${pad(lastDate.getMonth() + 1)}-${pad(lastDate.getDate())}`;
  return {
    start: mondayOf(first),
    end: shiftIsoDay(mondayOf(last), 6),
    label: firstDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
  };
}

function weekRangeLabel(startIso, endIso) {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  const month = (date, options) => date.toLocaleDateString("en-GB", options);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} – ${end.getDate()} ${month(end, { month: "short" })} ${end.getFullYear()}`;
  }
  return `${month(start, { day: "numeric", month: "short" })} – ${month(end, { day: "numeric", month: "short" })} ${end.getFullYear()}`;
}

function DetailRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="theme-subtext text-xs">{label}</dt>
      <dd className="theme-heading text-right text-sm font-medium">{children || "—"}</dd>
    </div>
  );
}

function ScheduleListScreen() {
  const router = useRouter();
  useTabTitle(tabSectionTitle("Schedule", "Driving"));
  const today = todayDate();
  const { branches, showBranchSelect } = useDrivingBranches();
  const [date, setDate] = useState(todayDate);
  const [view, setView] = useState("week");
  const [selectedLessonId, setSelectedLessonId] = useState(null);
  const [branchFilter, setBranchFilter] = useState("");
  const [instructorFilter, setInstructorFilter] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [busyLessonId, setBusyLessonId] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const preset = params.get("instructor");
    if (preset) setInstructorFilter(preset);
    const presetVehicle = params.get("vehicle");
    if (presetVehicle) setVehicleFilter(presetVehicle);
  }, []);
  const [moving, setMoving] = useState(null);
  const [savingMove, setSavingMove] = useState(false);
  const [moveForm, setMoveForm] = useState({ starts_at: "", duration_minutes: 60, instructor_id: "", vehicle_id: "", location: "" });
  const [completing, setCompleting] = useState(null);
  const [savingComplete, setSavingComplete] = useState(false);
  const [completeForm, setCompleteForm] = useState({ attendance: "present", outcome: "", feedback: "", start_odometer: "", end_odometer: "", skills: {} });
  const weekStart = useMemo(() => mondayOf(date), [date]);
  const weekEnd = useMemo(() => shiftIsoDay(weekStart, 6), [weekStart]);
  const month = useMemo(() => monthGrid(date), [date]);
  const rangeFrom = view === "week" ? weekStart : view === "month" ? month.start : date;
  const rangeTo = view === "week" ? weekEnd : view === "month" ? month.end : date;
  const { data, error, reload } = useLoad(() => drivingGet("/lessons", { from: rangeFrom, to: rangeTo, branch_id: branchFilter || undefined }), `lessons:${rangeFrom}|${rangeTo}|${branchFilter}`);
  const instructorLoad = useLoad(() => fetchDrivingInstructorsCached().then((rows) => ({ data: rows })), "schedule-instructors");
  const vehicleLoad = useLoad(() => fetchDrivingVehiclesCached().then((rows) => ({ data: rows })), "schedule-vehicles");
  const instructors = rowsOf(instructorLoad.data).filter((row) => belongsToBranch(row, branchFilter));
  const vehicles = rowsOf(vehicleLoad.data).filter((row) => belongsToBranch(row, branchFilter));
  const lessons = rowsOf(data);
  const filtersActive = Boolean(instructorFilter || vehicleFilter);
  const visibleLessons = useMemo(
    () =>
      lessons.filter(
        (lesson) =>
          (!instructorFilter || String(lesson.instructor?.id ?? lesson.instructor_id ?? "") === instructorFilter) &&
          (!vehicleFilter || String(lesson.vehicle?.id ?? lesson.vehicle_id ?? "") === vehicleFilter),
      ),
    [lessons, instructorFilter, vehicleFilter],
  );
  const boardInstructors = instructorFilter ? instructors.filter((row) => String(row.id) === instructorFilter) : instructors;
  const selectedLesson = visibleLessons.find((lesson) => String(lesson.id) === String(selectedLessonId)) || null;
  const dayLessons = lessons.filter((lesson) => String(lesson.starts_at || "").slice(0, 10) === date && lesson.status !== "cancelled");
  const busyInstructors = new Set(dayLessons.map((lesson) => Number(lesson.instructor?.id ?? lesson.instructor_id)).filter(Boolean));
  const busyVehicles = new Set(dayLessons.map((lesson) => Number(lesson.vehicle?.id ?? lesson.vehicle_id)).filter(Boolean));

  function openCompletion(lesson, status) {
    if (status !== "completed") return false;
    setCompleting(lesson);
    setCompleteForm({
      attendance: lesson.attendance || "present",
      outcome: lesson.outcome || "",
      feedback: lesson.feedback || "",
      start_odometer: lesson.start_odometer ?? "",
      end_odometer: lesson.end_odometer ?? "",
      skills: {},
    });
    return true;
  }

  function openFeedback(lesson) {
    setCompleting(lesson);
    setCompleteForm({
      attendance: lesson.attendance || "present",
      outcome: lesson.outcome || "",
      feedback: lesson.feedback || "",
      start_odometer: lesson.start_odometer ?? "",
      end_odometer: lesson.end_odometer ?? "",
      skills: {},
    });
  }

  async function updateLessonStatus(lesson, status) {
    if (openCompletion(lesson, status)) return;
    setBusyLessonId(lesson.id);
    try {
      await drivingSend(`/lessons/${lesson.id}`, "PUT", {
        status,
        attendance: status === "no_show" ? "absent" : undefined,
      });
      notifySuccess(status === "no_show" ? "Marked no-show." : "Lesson cancelled.");
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not update the lesson.");
    } finally {
      setBusyLessonId(null);
    }
  }

  async function saveCompletion(event) {
    event.preventDefault();
    if (!completing) return;
    if (completeForm.start_odometer && completeForm.end_odometer && Number(completeForm.end_odometer) < Number(completeForm.start_odometer)) {
      notifyError("End odometer cannot be lower than the start odometer.");
      return;
    }
    const ratedSkills = Object.fromEntries(Object.entries(completeForm.skills).filter(([, value]) => Number(value) > 0));
    setSavingComplete(true);
    try {
      await drivingSend(`/lessons/${completing.id}`, "PUT", {
        status: "completed",
        attendance: completeForm.attendance || "present",
        outcome: completeForm.outcome || null,
        feedback: completeForm.feedback.trim() || null,
        start_odometer: completeForm.start_odometer === "" ? null : Number(completeForm.start_odometer),
        end_odometer: completeForm.end_odometer === "" ? null : Number(completeForm.end_odometer),
        skills: Object.keys(ratedSkills).length ? ratedSkills : null,
      });
      notifySuccess(
        Object.keys(ratedSkills).length
          ? "Lesson completed, skills rated and vehicle mileage updated."
          : completeForm.feedback.trim() ? "Lesson completed with feedback." : "Lesson completed.",
      );
      setCompleting(null);
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not complete the lesson.");
    } finally {
      setSavingComplete(false);
    }
  }

  function openMove(lesson) {
    const start = new Date(lesson.starts_at);
    const end = lesson.ends_at ? new Date(lesson.ends_at) : null;
    const minutes = end && !Number.isNaN(end.getTime()) ? Math.max(15, Math.round((end - start) / 60000)) : 60;
    setMoveForm({
      starts_at: toDateTimeLocal(lesson.starts_at),
      duration_minutes: minutes,
      instructor_id: String(lesson.instructor_id || lesson.instructor?.id || ""),
      vehicle_id: String(lesson.vehicle_id || lesson.vehicle?.id || ""),
      location: lesson.location || "",
    });
    setMoving(lesson);
  }

  async function saveMove(event) {
    event.preventDefault();
    if (!moveForm.instructor_id) {
      notifyError("Choose an instructor.");
      return;
    }
    setSavingMove(true);
    try {
      await drivingSend(`/lessons/${moving.id}`, "PUT", {
        starts_at: moveForm.starts_at,
        duration_minutes: Number(moveForm.duration_minutes) || 60,
        instructor_id: Number(moveForm.instructor_id),
        vehicle_id: moveForm.vehicle_id ? Number(moveForm.vehicle_id) : null,
        location: moveForm.location,
      });
      notifySuccess("Lesson moved.");
      setMoving(null);
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not move the lesson.");
    } finally {
      setSavingMove(false);
    }
  }

  async function moveLessonTo(lesson, startsAt) {
    if (!lesson || String(busyLessonId) === String(lesson.id)) return;
    setBusyLessonId(lesson.id);
    try {
      await drivingSend(`/lessons/${lesson.id}`, "PUT", { starts_at: startsAt });
      notifySuccess(`Moved to ${startsAt.slice(0, 16).replace("T", " ")}.`);
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not move the lesson.");
    } finally {
      setBusyLessonId(null);
    }
  }

  function openBooking({ dateIso, hour = 9, instructorId = "", vehicleId = "" }) {
    if (dateIso) setDate(dateIso);
    router.push(buildBookingHref({ dateIso, hour, instructorId, vehicleId, branchId: branchFilter }));
  }

  return (
    <div>
      <ScreenHeader title="Lesson scheduling" subtitle="Click any free slot on the calendar — or right-click a day — to book a lesson with that date, time and instructor already filled in. Select a lesson to open its booking details, then move, complete, or cancel it.">
        <BranchFilter value={branchFilter} onChange={setBranchFilter} branches={branches} show={showBranchSelect} />
        <div className="inline-flex overflow-hidden rounded-lg border border-[var(--theme-border)] text-sm">
          {["day", "week", "month"].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              aria-pressed={view === mode}
              className={`px-3 py-2 capitalize ${view === mode ? "bg-[var(--theme-primary)] font-semibold text-white" : "theme-subtext font-medium"}`}
            >
              {mode}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="theme-secondary-btn rounded-lg px-3 py-2 text-sm"
            aria-label={`Previous ${view}`}
            onClick={() => setDate((current) => (view === "week" ? shiftIsoDay(current, -7) : view === "month" ? shiftIsoMonth(current, -1) : shiftIsoDay(current, -1)))}
          >
            Previous
          </button>
          <div className="w-40">
            <input className={inputClass} type="date" aria-label="Schedule date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <button
            type="button"
            className="theme-secondary-btn rounded-lg px-3 py-2 text-sm"
            aria-label={`Next ${view}`}
            onClick={() => setDate((current) => (view === "week" ? shiftIsoDay(current, 7) : view === "month" ? shiftIsoMonth(current, 1) : shiftIsoDay(current, 1)))}
          >
            Next
          </button>
          {date !== today ? (
            <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm" onClick={() => setDate(today)}>Today</button>
          ) : null}
        </div>
        <div className="w-40">
          <DrivingSelect
            value={instructorFilter}
            onChange={(event) => setInstructorFilter(event.target.value)}
            options={[{ value: "", label: "All instructors" }, ...instructors.map((row) => ({ value: String(row.id), label: row.full_name }))]}
            placeholder="All instructors"
          />
        </div>
        <div className="w-40">
          <DrivingSelect
            value={vehicleFilter}
            onChange={(event) => setVehicleFilter(event.target.value)}
            options={[{ value: "", label: "All vehicles" }, ...vehicles.map((row) => ({ value: String(row.id), label: row.registration_number }))]}
            placeholder="All vehicles"
          />
        </div>
        {view === "week" ? <span className="theme-subtext text-xs">{weekRangeLabel(weekStart, weekEnd)}</span> : null}
        {view === "month" ? <span className="theme-subtext text-xs">{month.label}</span> : null}
        <AppNavLink href={buildBookingHref({ dateIso: date, instructorId: instructorFilter, vehicleId: vehicleFilter, branchId: branchFilter })} className={primaryButtonClass}>Book lesson</AppNavLink>
      </ScreenHeader>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="theme-heading font-semibold">Availability · {shortDate(date)}</h2>
          <span className="theme-subtext text-xs">{dayLessons.length} lesson{dayLessons.length === 1 ? "" : "s"} on this day</span>
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="theme-subtext text-xs font-medium uppercase tracking-wide">Instructors</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {instructors.length === 0 ? <span className="theme-subtext text-xs">No instructors on record.</span> : instructors.filter((row) => row.status !== "inactive").map((row) => {
                const busy = busyInstructors.has(Number(row.id));
                return (
                  <span key={row.id} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${busy ? "bg-sky-50 text-sky-700" : "bg-emerald-50 text-emerald-700"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${busy ? "bg-sky-500" : "bg-emerald-500"}`} aria-hidden />
                    {row.full_name} · {busy ? "booked" : "free"}
                  </span>
                );
              })}
            </div>
          </div>
          <div>
            <p className="theme-subtext text-xs font-medium uppercase tracking-wide">Vehicles</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {vehicles.length === 0 ? <span className="theme-subtext text-xs">No vehicles on record.</span> : vehicles.map((row) => {
                const busy = busyVehicles.has(Number(row.id));
                return (
                  <span key={row.id} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${busy ? "bg-sky-50 text-sky-700" : row.status === "available" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${busy ? "bg-sky-500" : row.status === "available" ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden />
                    {row.registration_number} · {busy ? "on lesson" : row.status === "available" ? "free" : String(row.status || "").replace(/_/g, " ")}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </Card>
      <Card>
        {filtersActive && visibleLessons.length === 0 ? (
          <p className="theme-subtext mb-3 text-xs">No lessons match these filters. Clear the instructor or vehicle filter to see the full schedule.</p>
        ) : null}
        {view === "month" ? (
          <MonthBoard
            lessons={visibleLessons}
            monthStart={date}
            today={today}
            onDayOpen={(iso) => {
              setDate(iso);
              setView("day");
            }}
            onAddLesson={(iso) => openBooking({ dateIso: iso, instructorId: instructorFilter, vehicleId: vehicleFilter })}
          />
        ) : view === "week" ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
            <WeekBoard
              lessons={visibleLessons}
              weekStart={weekStart}
              today={today}
              selectedLessonId={selectedLessonId}
              onLessonOpen={(lesson) => setSelectedLessonId(lesson.id)}
              onDayOpen={(iso) => {
                setDate(iso);
                setView("day");
              }}
              onAddLesson={(iso, hour) => openBooking({ dateIso: iso, hour, instructorId: instructorFilter, vehicleId: vehicleFilter })}
            />
            {selectedLesson ? (
              <div className="h-fit rounded-xl border border-[var(--theme-border)] p-3 xl:sticky xl:top-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="theme-heading text-sm font-semibold">Booking details</h2>
                  <button type="button" className="theme-subtext rounded px-1 text-lg leading-none" aria-label="Close booking details" onClick={() => setSelectedLessonId(null)}>×</button>
                </div>
                <div className="mt-3">
                  <PersonName name={selectedLesson.student?.full_name || "Student"} detail={selectedLesson.student?.student_number} />
                </div>
                <dl className="mt-3 space-y-2 border-t border-[var(--theme-border)] pt-3">
                  <DetailRow label="Instructor">{selectedLesson.instructor?.full_name}</DetailRow>
                  <DetailRow label="Vehicle">{selectedLesson.vehicle?.registration_number || "No vehicle"}</DetailRow>
                  <DetailRow label="Date & time">{shortDate(selectedLesson.starts_at)} · {lessonTime(selectedLesson.starts_at)}</DetailRow>
                  <DetailRow label="Type">{selectedLesson.lesson_type === "theory" ? "Theory" : "Practical"}</DetailRow>
                  <DetailRow label="Status"><StatusBadge value={selectedLesson.status} /></DetailRow>
                  {selectedLesson.location ? <DetailRow label="Location">{selectedLesson.location}</DetailRow> : null}
                </dl>
                <div className="mt-3 flex flex-col gap-2 border-t border-[var(--theme-border)] pt-3">
                  {!["completed", "cancelled", "no_show"].includes(String(selectedLesson.status || "")) ? (
                    <>
                      <button type="button" className={primaryButtonClass} onClick={() => void updateLessonStatus(selectedLesson, "completed")}>Complete lesson</button>
                      <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={() => openMove(selectedLesson)}>Move lesson</button>
                      <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium text-red-600" onClick={() => void updateLessonStatus(selectedLesson, "cancelled")}>Cancel lesson</button>
                    </>
                  ) : (
                    <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={() => openFeedback(selectedLesson)}>{selectedLesson.feedback ? "Edit notes" : "Add notes"}</button>
                  )}
                  {selectedLesson.student?.id ? (
                    <AppNavLink href={`/driving-school/students/${selectedLesson.student.id}`} className="text-center text-sm font-medium text-[var(--theme-primary)]">View student</AppNavLink>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <DayBoard
            lessons={visibleLessons}
            instructors={boardInstructors}
            busyLessonId={busyLessonId}
            onLessonAction={(lesson, status) => void updateLessonStatus(lesson, status)}
            onLessonReschedule={openMove}
            onLessonFeedback={openFeedback}
            onLessonDrop={(lesson, startsAt) => void moveLessonTo(lesson, startsAt)}
            onAddLesson={(instructorId, hour) => openBooking({ dateIso: date, hour, instructorId: instructorId === "all" ? instructorFilter : instructorId, vehicleId: vehicleFilter })}
          />
        )}
      </Card>
      <Editor open={Boolean(completing)} title={completing ? `Complete ${completing.student?.full_name || "lesson"}` : "Complete lesson"} onClose={() => setCompleting(null)}>
        <form onSubmit={saveCompletion} className="flex flex-col gap-4">
          <p className="theme-subtext text-sm">
            {completing ? `${completing.lesson_type === "theory" ? "Theory" : "Practical"} lesson · ${lessonTime(completing.starts_at)}` : ""}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Attendance">
              <DrivingSelect
                value={completeForm.attendance}
                onChange={(event) => setCompleteForm({ ...completeForm, attendance: event.target.value })}
                options={[
                  { value: "present", label: "Present" },
                  { value: "late", label: "Late" },
                  { value: "excused", label: "Excused" },
                  { value: "absent", label: "Absent" },
                ]}
              />
            </Field>
            <Field label="Outcome (optional)">
              <input
                className={inputClass}
                maxLength={40}
                placeholder="e.g. Ready for test"
                value={completeForm.outcome}
                onChange={(event) => setCompleteForm({ ...completeForm, outcome: event.target.value })}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Odometer at start (km)">
              <input
                className={inputClass}
                type="number"
                min="0"
                placeholder="Optional"
                value={completeForm.start_odometer}
                onChange={(event) => setCompleteForm({ ...completeForm, start_odometer: event.target.value })}
              />
            </Field>
            <Field label="Odometer at end (km)">
              <input
                className={inputClass}
                type="number"
                min="0"
                placeholder="Updates the vehicle mileage"
                value={completeForm.end_odometer}
                onChange={(event) => setCompleteForm({ ...completeForm, end_odometer: event.target.value })}
              />
            </Field>
          </div>
          {String(completing?.status || "") !== "completed" ? (
            <div>
              <p className="theme-heading mb-1 text-sm font-medium">Skills rating</p>
              <p className="theme-subtext mb-2 text-xs">Rate 1 (needs work) to 5 (test standard). Ratings feed the instructor score and the student&apos;s exam readiness.</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  ["vehicle_control", "Vehicle control"],
                  ["observation", "Observation"],
                  ["manoeuvres", "Manoeuvres"],
                  ["road_craft", "Road craft"],
                  ["confidence", "Confidence"],
                ].map(([key, label]) => (
                  <label key={key} className="text-xs">
                    <span className="theme-subtext mb-1 block">{label}</span>
                    <select
                      className={inputClass}
                      value={completeForm.skills[key] || "0"}
                      onChange={(event) => setCompleteForm({ ...completeForm, skills: { ...completeForm.skills, [key]: event.target.value } })}
                    >
                      {[0, 1, 2, 3, 4, 5].map((score) => (
                        <option key={score} value={score}>{score === 0 ? "—" : `${score} / 5`}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          <Field label="Instructor notes for the student">
            <textarea
              className={`${inputClass} h-28 resize-y py-2`}
              maxLength={2000}
              placeholder="What went well, what to practise before the next lesson…"
              value={completeForm.feedback}
              onChange={(event) => setCompleteForm({ ...completeForm, feedback: event.target.value })}
            />
          </Field>
          <div className="flex justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
            <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={() => setCompleting(null)}>Keep as is</button>
            <button type="submit" className={primaryButtonClass} disabled={savingComplete}>{savingComplete ? "Saving…" : "Complete lesson"}</button>
          </div>
        </form>
      </Editor>
      <Editor open={Boolean(moving)} title={moving ? `Move ${moving.student?.full_name || "lesson"}` : "Move lesson"} onClose={() => setMoving(null)}>
        <form onSubmit={saveMove} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts"><input className={inputClass} required type="datetime-local" value={moveForm.starts_at} onChange={(event) => setMoveForm({ ...moveForm, starts_at: event.target.value })} /></Field>
            <Field label="Duration (minutes)"><input className={inputClass} required type="number" min="15" max="480" value={moveForm.duration_minutes} onChange={(event) => setMoveForm({ ...moveForm, duration_minutes: event.target.value })} /></Field>
            <Field label="Instructor">
              <DrivingSelect value={moveForm.instructor_id} placeholder="Choose an instructor" onChange={(event) => setMoveForm({ ...moveForm, instructor_id: event.target.value })} options={[{ value: "", label: "Choose an instructor" }, ...instructors.map((row) => ({ value: String(row.id), label: row.full_name }))]} />
            </Field>
            <Field label="Vehicle">
              <DrivingSelect value={moveForm.vehicle_id} placeholder="No vehicle" onChange={(event) => setMoveForm({ ...moveForm, vehicle_id: event.target.value })} options={[{ value: "", label: "No vehicle" }, ...vehicles.map((row) => ({ value: String(row.id), label: row.registration_number }))]} />
            </Field>
            <Field label="Location"><input className={inputClass} value={moveForm.location} onChange={(event) => setMoveForm({ ...moveForm, location: event.target.value })} /></Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
            <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={() => setMoving(null)}>Keep as is</button>
            <button type="submit" className={primaryButtonClass} disabled={savingMove}>{savingMove ? "Moving…" : "Move lesson"}</button>
          </div>
        </form>
      </Editor>
    </div>
  );
}

function prettyLabel(name) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function DirectoryScreen({ title, subtitle, path, fields, columns, person = false, addLabel, adminOnly = false }) {
  const pathname = usePathname();
  const createHref = `/driving-school${path}/new`;
  return (
    <>
      <DirectoryListScreen title={title} subtitle={subtitle} path={path} fields={fields} columns={columns} person={person} addLabel={addLabel} createHref={createHref} adminOnly={adminOnly} />
      {pathname === createHref ? <DirectoryFormScreen title={addLabel || `Add ${title.replace(/s$/, "").toLowerCase()}`} path={path} fields={fields} backHref={`/driving-school${path}`} /> : null}
    </>
  );
}

function DirectoryFormScreen({ title, path, fields, backHref }) {
  const { exitTo } = useRecordExit(title);
  const { branches, showBranchSelect, defaultBranchId } = useDrivingBranches();
  const [branchId, setBranchId] = useState("");
  const [form, setForm] = useState(() => Object.fromEntries(fields.map((field) => [field.name, field.default ?? ""])));
  useEffect(() => {
    if (showBranchSelect && !branchId) setBranchId(defaultBranchId);
  }, [defaultBranchId, showBranchSelect, branchId]);
  async function save(event) {
    event.preventDefault();
    const body = { ...form };
    for (const field of fields) {
      if (field.type === "number" && body[field.name] !== "") body[field.name] = Number(body[field.name]);
    }
    if (branchId) body.branch_id = Number(branchId);
    try {
      await drivingSend(path, "POST", body);
      notifySuccess("Saved.");
      if (path.includes("instructor")) invalidateDrivingReference("instructors");
      if (path.includes("vehicle")) invalidateDrivingReference("vehicles");
      exitTo(backHref);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save.");
    }
  }
  return (
    <RecordFormDialog title={title} backHref={backHref}>
      <form onSubmit={save}>
        <div className="grid gap-4 sm:grid-cols-2">
          <BranchField value={branchId} onChange={setBranchId} branches={branches} show={showBranchSelect} />
          {fields.map((field) => (
            <Field key={field.name} label={field.label}>
              <input className={inputClass} required={field.required} type={field.type || "text"} value={form[field.name]} onChange={(e) => setForm({ ...form, [field.name]: e.target.value })} />
            </Field>
          ))}
        </div>
        <RecordFormActions backHref={backHref} />
        </form>
    </RecordFormDialog>
  );
}

function DirectoryListScreen({ title, subtitle, path, columns, person = false, addLabel, createHref, adminOnly = false }) {
  const { user } = useAuth();
  const { branches, showBranchSelect } = useDrivingBranches();
  const isAdmin = Boolean(user?.is_admin || user?.is_super_admin);
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const { data, error } = useLoad(() => drivingGet(path, { branch_id: branchFilter || undefined }), `${path}|${branchFilter}`);
  const list = rowsOf(data).filter((row) => {
    const haystack = columns.map((column) => row[column]).join(" ").toLowerCase();
    return !query || haystack.includes(query.trim().toLowerCase());
  });
  const tableColumns = columns.map((column, index) => ({
    key: column,
    label: prettyLabel(column),
    render: (row) => {
      if (index === 0 && person) return <PersonName name={row[column]} detail={row.instructor_number} />;
      if (column === "status") return <StatusBadge value={row.status} />;
      if (column === "amount" || column === "lesson_pay") return money(row[column]);
      return row[column] || "—";
    },
  }));
  if (!columns.includes("status") && list.some((row) => row.status)) {
    tableColumns.push({ key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> });
  }
  if (showBranchSelect) {
    tableColumns.splice(person ? 1 : 0, 0, {
      key: "branch",
      label: "Branch",
      render: (row) => branchNameOf(branches, row.branch_id),
    });
  }
  return (
    <div>
      <ScreenHeader title={title} subtitle={subtitle}>
        {adminOnly && !isAdmin ? null : <AppNavLink href={createHref} className={primaryButtonClass}>{addLabel || `Add ${title.replace(/s$/, "").toLowerCase()}`}</AppNavLink>}
      </ScreenHeader>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <Toolbar>
        <SearchField value={query} onChange={setQuery} placeholder={`Search ${title.toLowerCase()}`} />
        <BranchFilter value={branchFilter} onChange={setBranchFilter} branches={branches} show={showBranchSelect} />
      </Toolbar>
      <Card>
        <DataTable columns={tableColumns} rows={list} empty="Nothing saved yet." />
      </Card>
    </div>
  );
}

const INSTRUCTOR_FIELDS = [
  { name: "full_name", label: "Name", required: true },
  { name: "phone", label: "Phone" },
  { name: "licence_info", label: "Licence" },
  { name: "licence_expires_on", label: "Licence expires", type: "date" },
  { name: "lesson_pay", label: "Pay per lesson (KSh)", type: "number" },
];

export function InstructorsScreen() {
  const pathname = usePathname();
  const createHref = "/driving-school/instructors/new";
  const detail = pathname.match(/\/instructors\/(\d+)$/);
  return (
    <>
      {detail ? <InstructorProfileScreen instructorId={detail[1]} /> : <InstructorListScreen createHref={createHref} />}
      {pathname === createHref ? (
        <DirectoryFormScreen title="Add instructor" path="/instructors" fields={INSTRUCTOR_FIELDS} backHref="/driving-school/instructors" />
      ) : null}
    </>
  );
}

function InstructorProfileScreen({ instructorId }) {
  const { branches, showBranchSelect } = useDrivingBranches();
  const { data, error } = useLoad(() => drivingGet(`/instructors/${instructorId}`), `instructor:${instructorId}`);
  const instructor = data?.data;
  useTabTitle(instructor ? tabDetailTitle("Instructor", instructor.full_name) : null);
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!instructor) return <p className="theme-subtext text-sm">Loading the instructor profile…</p>;
  const stats = instructor.stats || {};
  return (
    <div className="space-y-4">
      <ScreenHeader title={instructor.full_name} subtitle={`${instructor.instructor_number} · ${instructor.licence_info || "Licence not recorded"}${showBranchSelect ? ` · ${branchNameOf(branches, instructor.branch_id)}` : ""}`}>
        <AppNavLink href="/driving-school/instructors" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Back to instructors</AppNavLink>
        <AppNavLink href={`/driving-school/schedule?instructor=${instructor.id}`} className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Open schedule</AppNavLink>
        <AppNavLink href="/driving-school/schedule/new" className={primaryButtonClass}>Book lesson</AppNavLink>
      </ScreenHeader>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Status" value={<StatusBadge value={instructor.status} />} hint={instructor.phone || "No phone"} icon="person-badge" tone="indigo" />
        <Stat label="Lessons (30 days)" value={stats.lessons_30d || 0} hint={`${stats.completed_30d || 0} completed`} icon="calendar-check" tone="sky" />
        <Stat label="Completion rate" value={`${stats.completion_rate || 0}%`} hint={`${stats.no_shows_30d || 0} no-shows`} icon="graph-up-arrow" tone="emerald" />
        <Stat label="Class rating" value={instructor.skill_summary?.average ? `${Number(instructor.skill_summary.average).toFixed(1)} / 5` : "—"} hint={`${instructor.skill_summary?.ratings || 0} lesson ratings`} icon="star" tone="violet" />
        <Stat label="Lesson pay (30 days)" value={money(stats.earnings_30d || 0)} hint={`${money(instructor.lesson_pay)} per completed lesson`} icon="cash-coin" tone="amber" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <h2 className="theme-heading font-semibold">Today&apos;s schedule</h2>
          {(instructor.today_lessons || []).length === 0 ? <Empty>No lessons booked for today.</Empty> : (
            <ul className="mt-2 divide-y divide-[var(--theme-border)] text-sm">
              {instructor.today_lessons.map((lesson) => (
                <li key={lesson.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>
                    <span className="theme-heading block font-medium">{lesson.student?.full_name || "Student"}</span>
                    <span className="theme-subtext capitalize text-xs">{lesson.lesson_type} · {lesson.vehicle?.registration_number || "No vehicle"}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="theme-subtext text-xs">{lessonTime(lesson.starts_at)}</span>
                    <StatusBadge value={lesson.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="theme-heading font-semibold">Profile</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <DetailRow label="Phone">{instructor.phone || "—"}</DetailRow>
            <DetailRow label="Email">{instructor.email || "—"}</DetailRow>
            <DetailRow label="Licence">{instructor.licence_info || "—"}</DetailRow>
            <DetailRow label="Licence expires">{licenceLabel(instructor.licence_expires_on)}</DetailRow>
            <DetailRow label="Students (30 days)">{String(stats.students_30d ?? 0)}</DetailRow>
            <DetailRow label="Upcoming lessons">{String(stats.upcoming_lessons ?? 0)}</DetailRow>
            <DetailRow label="Lesson pay">{money(instructor.lesson_pay)}</DetailRow>
            {showBranchSelect ? <DetailRow label="Branch">{branchNameOf(branches, instructor.branch_id)}</DetailRow> : null}
          </dl>
        </Card>
      </div>
      <Card>
        <div className="flex items-center justify-between gap-2">
          <h2 className="theme-heading font-semibold">Assigned students</h2>
          <span className="theme-subtext text-xs tabular-nums">{(instructor.students || []).length} students</span>
        </div>
        <p className="theme-subtext mt-1 text-xs">Students who name this instructor as preferred, or who have taken lessons with them.</p>
        <DataTable
          empty="No students assigned yet."
          rows={instructor.students || []}
          columns={[
            { key: "student", label: "Student", render: (row) => <AppNavLink href={`/driving-school/students/${row.id}`} className="hover:underline"><PersonName name={row.full_name} detail={row.student_number || row.phone} /></AppNavLink> },
            { key: "course", label: "Course", render: (row) => row.course || "—" },
            { key: "lessons", label: "Lessons", render: (row) => row.lessons },
            { key: "completed", label: "Completed", render: (row) => row.completed },
            { key: "last_lesson", label: "Last lesson", render: (row) => (row.last_lesson ? shortDate(row.last_lesson) : "—") },
            { key: "preferred", label: "Preferred", render: (row) => (row.preferred ? <StatusBadge value="active" /> : "—") },
          ]}
        />
      </Card>
      <Card>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="theme-heading font-semibold">Skills taught</h2>
            <p className="theme-subtext mt-1 text-xs">Average lesson ratings given by this instructor across the five core skills.</p>
          </div>
          <span className="theme-subtext text-xs tabular-nums">{instructor.skill_summary?.ratings || 0} ratings</span>
        </div>
        {(instructor.skill_summary?.ratings || 0) === 0 ? <Empty>No lesson ratings yet. Ratings are captured when a lesson is completed.</Empty> : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[["vehicle_control", "Vehicle control"], ["observation", "Observation"], ["manoeuvres", "Manoeuvres"], ["road_craft", "Road craft"], ["confidence", "Confidence"]].map(([key, label]) => {
              const value = Number(instructor.skill_summary?.breakdown?.[key] || 0);
              return (
                <div key={key} className="rounded-xl border border-[var(--theme-border)] px-3 py-2">
                  <p className="theme-subtext text-xs">{label}</p>
                  <p className="theme-heading mt-1 text-lg font-semibold tabular-nums">{value.toFixed(1)} <span className="theme-subtext text-xs font-normal">/ 5</span></p>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--theme-border)]">
                    <div className="h-full rounded-full bg-[var(--theme-primary)]" style={{ width: `${Math.min(100, (value / 5) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <Card>
        <h2 className="theme-heading font-semibold">Lesson history</h2>
        <DataTable
          empty="No lessons recorded yet."
          rows={instructor.recent_lessons || []}
          columns={[
            { key: "starts_at", label: "When", render: (row) => shortDateTime(row.starts_at) },
            { key: "student", label: "Student", render: (row) => <PersonName name={row.student?.full_name || "Student"} detail={row.student?.student_number} /> },
            { key: "type", label: "Type", render: (row) => <span className="capitalize">{row.lesson_type}</span> },
            { key: "vehicle", label: "Vehicle", render: (row) => row.vehicle?.registration_number || "—" },
            { key: "attendance", label: "Attendance", render: (row) => row.attendance ? <StatusBadge value={row.attendance} /> : "—" },
            { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
          ]}
        />
      </Card>
    </div>
  );
}

function InstructorListScreen({ createHref }) {
  useTabTitle(tabSectionTitle("Instructors", "Driving"));
  const { user } = useAuth();
  const { branches, showBranchSelect } = useDrivingBranches();
  const isAdmin = Boolean(user?.is_admin || user?.is_super_admin);
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const { data, error } = useLoad(() => drivingGet("/instructors", { branch_id: branchFilter || undefined }), `instructors|${branchFilter}`);
  const list = rowsOf(data).filter((row) => {
    const haystack = [row.full_name, row.phone, row.licence_info, row.instructor_number].join(" ").toLowerCase();
    return !query.trim() || haystack.includes(query.trim().toLowerCase());
  });
  return (
    <div>
      <ScreenHeader title="Instructors" subtitle="Lesson pay is a calculated rate. It is not money already paid to the instructor.">
        {isAdmin ? <AppNavLink href={createHref} className={primaryButtonClass}>Add instructor</AppNavLink> : null}
      </ScreenHeader>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <Toolbar>
        <SearchField value={query} onChange={setQuery} placeholder="Search instructors" />
        <BranchFilter value={branchFilter} onChange={setBranchFilter} branches={branches} show={showBranchSelect} />
      </Toolbar>
      {list.length === 0 ? (
        <Card><Empty>No instructors yet. Add an instructor to start booking lessons.</Empty></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {list.map((row) => (
            <Card key={row.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <PersonName name={row.full_name} detail={row.instructor_number || row.phone} />
                <StatusBadge value={row.status} />
              </div>
              <dl className="space-y-1 border-t border-[var(--theme-border)] pt-3 text-xs">
                <DetailRow label="Licence">{row.licence_info}</DetailRow>
                <DetailRow label="Licence expires">{licenceLabel(row.licence_expires_on)}</DetailRow>
                <DetailRow label="Lessons (30 days)">{`${row.stats?.lessons_30d ?? 0} · ${row.stats?.completion_rate ?? 0}% completed`}</DetailRow>
                <DetailRow label="Class rating">{row.stats?.rating ? `${Number(row.stats.rating).toFixed(1)} / 5` : "Not rated yet"}</DetailRow>
                <DetailRow label="Phone">{row.phone}</DetailRow>
                <DetailRow label="Pay per lesson">{money(row.lesson_pay)}</DetailRow>
                {showBranchSelect ? <DetailRow label="Branch">{branchNameOf(branches, row.branch_id)}</DetailRow> : null}
              </dl>
              <AppNavLink href={`/driving-school/instructors/${row.id}`} className="theme-secondary-btn mt-auto rounded-lg px-3 py-2 text-center text-sm font-medium">View profile</AppNavLink>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ComplianceBadge({ compliance }) {
  const state = compliance?.state || "ok";
  const tone = state === "overdue"
    ? "bg-rose-50 text-rose-700"
    : state === "due_soon"
      ? "bg-amber-50 text-amber-800"
      : "bg-emerald-50 text-emerald-700";
  const dot = state === "overdue" ? "bg-rose-500" : state === "due_soon" ? "bg-amber-500" : "bg-emerald-500";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      {state.replace(/_/g, " ")}
    </span>
  );
}

function VehicleFormScreen() {
  const { exitTo } = useRecordExit("Add vehicle");
  const { branches, showBranchSelect, defaultBranchId } = useDrivingBranches();
  const [form, setForm] = useState({
    registration_number: "",
    branch_id: "",
    make: "",
    model: "",
    year: "",
    insurance_expires_on: "",
    inspection_expires_on: "",
    odometer: "",
    transmission: "manual",
    status: "available",
    maintenance_notes: "",
  });

  useEffect(() => {
    if (showBranchSelect) setForm((current) => (current.branch_id ? current : { ...current, branch_id: defaultBranchId }));
  }, [defaultBranchId, showBranchSelect]);

  function setField(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function save(event) {
    event.preventDefault();
    const body = { ...form };
    if (body.branch_id) body.branch_id = Number(body.branch_id);
    else delete body.branch_id;
    for (const key of ["year", "odometer"]) {
      if (body[key] === "") delete body[key];
      else body[key] = Number(body[key]);
    }
    for (const key of ["make", "model", "insurance_expires_on", "inspection_expires_on", "maintenance_notes"]) {
      if (!String(body[key] || "").trim()) delete body[key];
    }
    try {
      await drivingSend("/vehicles", "POST", body);
      notifySuccess("Vehicle saved.");
      invalidateDrivingReference("vehicles");
      exitTo("/driving-school/vehicles");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save the vehicle.");
    }
  }

  return (
    <RecordFormDialog title="Add vehicle" backHref="/driving-school/vehicles">
      <form onSubmit={save}>
        <p className="theme-subtext mb-4 text-sm">Compliance dates drive the fleet warnings on the vehicle list.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <BranchField value={form.branch_id} onChange={(value) => setField("branch_id", value)} branches={branches} show={showBranchSelect} />
          <Field label="Registration"><input className={inputClass} required value={form.registration_number} onChange={(event) => setField("registration_number", event.target.value)} /></Field>
          <Field label="Make"><input className={inputClass} value={form.make} onChange={(event) => setField("make", event.target.value)} /></Field>
          <Field label="Model"><input className={inputClass} value={form.model} onChange={(event) => setField("model", event.target.value)} /></Field>
          <Field label="Year"><input className={inputClass} type="number" min="1980" max="2100" value={form.year} onChange={(event) => setField("year", event.target.value)} /></Field>
          <Field label="Insurance expires"><input className={inputClass} type="date" value={form.insurance_expires_on} onChange={(event) => setField("insurance_expires_on", event.target.value)} /></Field>
          <Field label="Inspection expires"><input className={inputClass} type="date" value={form.inspection_expires_on} onChange={(event) => setField("inspection_expires_on", event.target.value)} /></Field>
          <Field label="Odometer (km)"><input className={inputClass} type="number" min="0" value={form.odometer} onChange={(event) => setField("odometer", event.target.value)} /></Field>
          <Field label="Transmission">
            <DrivingSelect value={form.transmission} onChange={(event) => setField("transmission", event.target.value)} options={[{ value: "manual", label: "Manual" }, { value: "automatic", label: "Automatic" }]} />
          </Field>
          <Field label="Status">
            <DrivingSelect value={form.status} onChange={(event) => setField("status", event.target.value)} options={[{ value: "available", label: "Available" }, { value: "in_use", label: "In use" }, { value: "maintenance", label: "Maintenance" }, { value: "inactive", label: "Inactive" }]} />
          </Field>
          <Field label="Maintenance notes"><input className={inputClass} value={form.maintenance_notes} onChange={(event) => setField("maintenance_notes", event.target.value)} /></Field>
        </div>
        <RecordFormActions backHref="/driving-school/vehicles" submitLabel="Save vehicle" />
      </form>
    </RecordFormDialog>
  );
}

function VehicleListScreen() {
  const { user } = useAuth();
  useTabTitle(tabSectionTitle("Vehicles", "Driving"));
  const { branches, showBranchSelect } = useDrivingBranches();
  const isAdmin = Boolean(user?.is_admin || user?.is_super_admin);
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const debouncedQuery = useDebouncedValue(query);
  const { data, error, reload } = useLoad(() => drivingGet("/vehicles", { per_page: 100, branch_id: branchFilter || undefined }), `vehicles|${branchFilter}`);
  const [serviceVehicle, setServiceVehicle] = useState(null);
  const [services, setServices] = useState([]);
  const [servicesBusy, setServicesBusy] = useState(false);
  const [serviceForm, setServiceForm] = useState({ serviced_on: todayDate(), odometer: "", cost: "", notes: "" });
  const vehicles = rowsOf(data).filter((vehicle) => {
    if (!debouncedQuery.trim()) return true;
    const haystack = `${vehicle.registration_number} ${vehicle.make || ""} ${vehicle.model || ""}`.toLowerCase();
    return haystack.includes(debouncedQuery.trim().toLowerCase());
  });

  async function openServices(vehicle) {
    setServiceVehicle(vehicle);
    setServices([]);
    setServiceForm({ serviced_on: todayDate(), odometer: vehicle.odometer || "", cost: "", notes: "" });
    setServicesBusy(true);
    try {
      const response = await drivingGet(`/vehicles/${vehicle.id}/services`);
      setServices(rowsOf(response));
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not load the service log.");
    } finally {
      setServicesBusy(false);
    }
  }

  async function addService(event) {
    event.preventDefault();
    if (!serviceVehicle) return;
    setServicesBusy(true);
    try {
      await drivingSend(`/vehicles/${serviceVehicle.id}/services`, "POST", {
        serviced_on: serviceForm.serviced_on,
        ...(serviceForm.odometer !== "" ? { odometer: Number(serviceForm.odometer) } : {}),
        ...(serviceForm.cost !== "" ? { cost: Number(serviceForm.cost) } : {}),
        ...(serviceForm.notes ? { notes: serviceForm.notes } : {}),
      });
      notifySuccess("Service saved.");
      const response = await drivingGet(`/vehicles/${serviceVehicle.id}/services`);
      setServices(rowsOf(response));
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save the service.");
    } finally {
      setServicesBusy(false);
    }
  }

  return (
    <div>
      <ScreenHeader title="Vehicles" subtitle="Fleet compliance is based on insurance and inspection dates. A vehicle marked maintenance or inactive cannot be booked.">
        {isAdmin ? <AppNavLink href="/driving-school/vehicles/new" className={primaryButtonClass}>Add vehicle</AppNavLink> : null}
      </ScreenHeader>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <Toolbar>
        <SearchField value={query} onChange={setQuery} placeholder="Search registration, make, or model" />
        <BranchFilter value={branchFilter} onChange={setBranchFilter} branches={branches} show={showBranchSelect} />
      </Toolbar>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total vehicles" value={vehicles.length} hint="On the fleet" icon="car-front" tone="indigo" />
        <Stat label="Available" value={vehicles.filter((row) => row.status === "available").length} hint="Ready to book" icon="check-circle" tone="emerald" />
        <Stat label="In use" value={vehicles.filter((row) => row.status === "in_use").length} hint="On a lesson" icon="clock" tone="sky" />
        <Stat label="Maintenance" value={vehicles.filter((row) => row.status === "maintenance").length} hint="Cannot be booked" icon="wrench-adjustable" tone="amber" />
      </div>
      {vehicles.length === 0 ? (
        <Card><Empty>No vehicles yet. Add a vehicle to book practical lessons.</Empty></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {vehicles.map((vehicle) => (
            <Card key={vehicle.id} className="flex flex-col">
              <div className="relative mb-3 flex h-24 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-200">
                <i className="bi bi-car-front text-4xl text-slate-400" aria-hidden />
                <span className="absolute right-2 top-2"><StatusBadge value={vehicle.status} /></span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="theme-heading truncate text-base font-semibold">{vehicle.registration_number}</p>
                  <p className="theme-subtext truncate text-xs">{[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ") || "—"}</p>
                </div>
                <ComplianceBadge compliance={vehicle.compliance} />
              </div>
              <dl className="mt-3 space-y-1 text-xs">
                <DetailRow label="Assigned instructor">{vehicle.last_instructor || "No lessons yet"}</DetailRow>
                <DetailRow label="Mileage">{`${Number(vehicle.odometer || 0).toLocaleString()} km`}</DetailRow>
                <DetailRow label="Insurance">{shortDate(vehicle.insurance_expires_on)}</DetailRow>
                <DetailRow label="Inspection">{shortDate(vehicle.inspection_expires_on)}</DetailRow>
                {showBranchSelect ? <DetailRow label="Branch">{branchNameOf(branches, vehicle.branch_id)}</DetailRow> : null}
              </dl>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <AppNavLink href={`/driving-school/vehicles/${vehicle.id}`} className="theme-primary-btn rounded-lg px-3 py-2 text-center text-sm font-medium">Open vehicle</AppNavLink>
                <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={() => void openServices(vehicle)}>Service log</button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Editor open={Boolean(serviceVehicle)} title={serviceVehicle ? `Service log · ${serviceVehicle.registration_number}` : "Service log"} onClose={() => setServiceVehicle(null)} wide>
        {servicesBusy && services.length === 0 ? <Empty>Loading the service log…</Empty> : services.length === 0 ? <Empty>No services recorded.</Empty> : (
          <DataTable
            rows={services}
            columns={[
              { key: "serviced_on", label: "Date", render: (row) => shortDate(row.serviced_on) },
              { key: "odometer", label: "Odometer", render: (row) => (row.odometer != null ? `${row.odometer} km` : "—") },
              { key: "cost", label: "Cost", render: (row) => money(row.cost) },
              { key: "notes", label: "Notes", render: (row) => row.notes || "—" },
            ]}
          />
        )}
        {isAdmin ? (
          <form onSubmit={addService} className="mt-4 border-t border-[var(--theme-border)] pt-4">
            <FormSection title="Add a service" />
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Date"><input className={inputClass} required type="date" value={serviceForm.serviced_on} onChange={(event) => setServiceForm({ ...serviceForm, serviced_on: event.target.value })} /></Field>
              <Field label="Odometer (km)"><input className={inputClass} type="number" min="0" value={serviceForm.odometer} onChange={(event) => setServiceForm({ ...serviceForm, odometer: event.target.value })} /></Field>
              <Field label="Cost (KSh)"><input className={inputClass} type="number" min="0" value={serviceForm.cost} onChange={(event) => setServiceForm({ ...serviceForm, cost: event.target.value })} /></Field>
              <Field label="Notes"><input className={inputClass} value={serviceForm.notes} onChange={(event) => setServiceForm({ ...serviceForm, notes: event.target.value })} /></Field>
            </div>
            <div className="mt-3 flex justify-end">
              <button type="submit" className={primaryButtonClass} disabled={servicesBusy}>{servicesBusy ? "Saving…" : "Save service"}</button>
            </div>
          </form>
        ) : null}
      </Editor>
    </div>
  );
}

export function VehiclesScreen() {
  const pathname = usePathname();
  const detail = pathname.match(/\/vehicles\/(\d+)$/);
  if (detail) return <VehicleDetailScreen vehicleId={Number(detail[1])} />;
  return (
    <>
      <VehicleListScreen />
      {pathname.endsWith("/vehicles/new") ? <VehicleFormScreen /> : null}
    </>
  );
}

function VehicleDetailScreen({ vehicleId }) {
  const { user } = useAuth();
  const isAdmin = Boolean(user?.is_admin || user?.is_super_admin);
  const { branches, showBranchSelect } = useDrivingBranches();
  const { data, error, reload } = useLoad(() => drivingGet(`/vehicles/${vehicleId}`), `vehicle:${vehicleId}`);
  const [fuelBusy, setFuelBusy] = useState(false);
  const [fuelForm, setFuelForm] = useState({ filled_on: todayDate(), litres: "", cost: "", odometer: "", station: "" });
  const vehicle = data?.data;
  useTabTitle(vehicle ? tabDetailTitle("Vehicle", vehicle.registration_number) : null);
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!vehicle) return <p className="theme-subtext text-sm">Loading the vehicle profile…</p>;
  const stats = vehicle.stats || {};
  const title = [vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(" ");

  async function addFuel(event) {
    event.preventDefault();
    setFuelBusy(true);
    try {
      await drivingSend(`/vehicles/${vehicle.id}/fuel-logs`, "POST", {
        filled_on: fuelForm.filled_on,
        litres: Number(fuelForm.litres),
        cost: Number(fuelForm.cost),
        ...(fuelForm.odometer !== "" ? { odometer: Number(fuelForm.odometer) } : {}),
        ...(fuelForm.station ? { station: fuelForm.station } : {}),
      });
      notifySuccess("Fuel log saved.");
      setFuelForm({ filled_on: todayDate(), litres: "", cost: "", odometer: "", station: "" });
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save the fuel log.");
    } finally {
      setFuelBusy(false);
    }
  }

  async function removeFuel(log) {
    if (!window.confirm(`Remove the fuel log for ${shortDate(log.filled_on)}?`)) return;
    try {
      await drivingSend(`/fuel-logs/${log.id}`, "DELETE");
      notifySuccess("Fuel log removed.");
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not remove the fuel log.");
    }
  }

  return (
    <div className="space-y-4">
      <ScreenHeader title={vehicle.registration_number} subtitle={[title, vehicle.category, vehicle.transmission].filter(Boolean).join(" · ") || "Fleet vehicle"}>
        <AppNavLink href="/driving-school/vehicles" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Back to fleet</AppNavLink>
        <AppNavLink href={`/driving-school/schedule?vehicle=${vehicle.id}`} className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Open schedule</AppNavLink>
        <AppNavLink href="/driving-school/schedule/new" className={primaryButtonClass}>Book lesson</AppNavLink>
      </ScreenHeader>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Status" value={<StatusBadge value={vehicle.status} />} hint={<ComplianceBadge compliance={vehicle.compliance} />} icon="car-front" tone="indigo" />
        <Stat label="Lessons (30 days)" value={stats.lessons_30d || 0} hint={`${stats.completed_30d || 0} completed`} icon="calendar-check" tone="sky" />
        <Stat label="Odometer" value={`${Number(stats.last_odometer || 0).toLocaleString()} km`} hint={stats.last_service_on ? `Last service ${shortDate(stats.last_service_on)}` : "No service recorded"} icon="speedometer2" tone="violet" />
        <Stat label="Service cost (12 months)" value={money(stats.service_cost_12m || 0)} hint={`${stats.service_count || 0} services logged`} icon="wrench-adjustable" tone="amber" />
        <Stat label="Fuel cost (12 months)" value={money(stats.fuel_cost_12m || 0)} hint={`${Number(stats.fuel_litres_12m || 0).toLocaleString()} litres`} icon="fuel-pump" tone="rose" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <h2 className="theme-heading font-semibold">Vehicle details</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <DetailRow label="Make & model">{title || "—"}</DetailRow>
            <DetailRow label="Year">{vehicle.year ? String(vehicle.year) : "—"}</DetailRow>
            <DetailRow label="Category">{vehicle.category || "—"}</DetailRow>
            <DetailRow label="Transmission">{vehicle.transmission || "—"}</DetailRow>
            <DetailRow label="Odometer">{`${Number(vehicle.odometer || 0).toLocaleString()} km`}</DetailRow>
            {showBranchSelect ? <DetailRow label="Branch">{branchNameOf(branches, vehicle.branch_id)}</DetailRow> : null}
            {vehicle.maintenance_notes ? <DetailRow label="Notes">{vehicle.maintenance_notes}</DetailRow> : null}
          </dl>
        </Card>
        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="theme-heading font-semibold">Compliance</h2>
            <ComplianceBadge compliance={vehicle.compliance} />
          </div>
          <dl className="mt-3 space-y-3 text-sm">
            <DetailRow label="Insurance expires">{shortDate(vehicle.insurance_expires_on)}</DetailRow>
            <DetailRow label="Inspection expires">{shortDate(vehicle.inspection_expires_on)}</DetailRow>
          </dl>
          <p className="theme-subtext mt-3 text-xs">A vehicle past insurance or inspection cannot be offered for new bookings. Update the dates from the fleet list.</p>
        </Card>
        <Card>
          <h2 className="theme-heading font-semibold">Assigned instructors</h2>
          <p className="theme-subtext mt-1 text-xs">Instructors who have used this vehicle for lessons.</p>
          {(vehicle.instructors || []).length === 0 ? <Empty>No lessons recorded with this vehicle yet.</Empty> : (
            <ul className="mt-2 divide-y divide-[var(--theme-border)] text-sm">
              {vehicle.instructors.map((row) => (
                <li key={row.instructor_id} className="flex items-center justify-between gap-2 py-2.5">
                  <AppNavLink href={`/driving-school/instructors/${row.instructor_id}`} className="min-w-0 hover:underline">
                    <span className="theme-heading block truncate font-medium">{row.instructor?.full_name || "Instructor"}</span>
                    <span className="theme-subtext block truncate text-xs">{row.instructor?.instructor_number || ""}</span>
                  </AppNavLink>
                  <span className="theme-subtext shrink-0 text-xs tabular-nums">{row.lessons} lessons</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card>
        <h2 className="theme-heading font-semibold">Service & maintenance history</h2>
        <p className="theme-subtext mt-1 text-xs">Mileage and costs logged against this vehicle.</p>
        <div className="mt-3">
          <DataTable
            empty="No services recorded."
            rows={vehicle.services || []}
            columns={[
              { key: "serviced_on", label: "Date", render: (row) => shortDate(row.serviced_on) },
              { key: "odometer", label: "Odometer", render: (row) => (row.odometer != null ? `${row.odometer} km` : "—") },
              { key: "cost", label: "Cost", render: (row) => money(row.cost) },
              { key: "notes", label: "Notes", render: (row) => row.notes || "—" },
            ]}
          />
        </div>
      </Card>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="theme-heading font-semibold">Fuel</h2>
            <p className="theme-subtext mt-1 text-xs">Monthly fuel spend and every fill-up logged against this vehicle.</p>
          </div>
          <span className="theme-subtext text-xs">Last 6 months</span>
        </div>
        {(vehicle.fuel_trend || []).length === 0 ? <Empty>No fuel logs yet.</Empty> : (
          <div className="mt-3">
            <BarChart
              points={vehicle.fuel_trend.map((row) => ({ label: row.month, value: Number(row.cost) || 0 }))}
              format={money}
            />
          </div>
        )}
        <div className="mt-3">
          <DataTable
            empty="No fill-ups recorded."
            rows={vehicle.fuel_logs || []}
            columns={[
              { key: "filled_on", label: "Date", render: (row) => shortDate(row.filled_on) },
              { key: "litres", label: "Litres", render: (row) => `${Number(row.litres).toLocaleString()} L` },
              { key: "cost", label: "Cost", render: (row) => money(row.cost) },
              { key: "odometer", label: "Odometer", render: (row) => (row.odometer != null ? `${Number(row.odometer).toLocaleString()} km` : "—") },
              { key: "station", label: "Station", render: (row) => row.station || "—" },
              ...(isAdmin ? [{
                key: "actions",
                label: "",
                render: (row) => <button type="button" className="text-sm font-medium text-red-600" onClick={() => void removeFuel(row)}>Remove</button>,
              }] : []),
            ]}
          />
        </div>
        {isAdmin ? (
          <form onSubmit={addFuel} className="mt-4 border-t border-[var(--theme-border)] pt-4">
            <FormSection title="Log a fill-up" />
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <Field label="Date"><input className={inputClass} required type="date" value={fuelForm.filled_on} onChange={(event) => setFuelForm({ ...fuelForm, filled_on: event.target.value })} /></Field>
              <Field label="Litres"><input className={inputClass} required type="number" min="0.01" step="0.01" value={fuelForm.litres} onChange={(event) => setFuelForm({ ...fuelForm, litres: event.target.value })} /></Field>
              <Field label="Cost (KSh)"><input className={inputClass} required type="number" min="0" value={fuelForm.cost} onChange={(event) => setFuelForm({ ...fuelForm, cost: event.target.value })} /></Field>
              <Field label="Odometer (km)"><input className={inputClass} type="number" min="0" value={fuelForm.odometer} onChange={(event) => setFuelForm({ ...fuelForm, odometer: event.target.value })} /></Field>
              <Field label="Station"><input className={inputClass} value={fuelForm.station} onChange={(event) => setFuelForm({ ...fuelForm, station: event.target.value })} /></Field>
            </div>
            <div className="mt-3 flex justify-end">
              <button type="submit" className={primaryButtonClass} disabled={fuelBusy}>{fuelBusy ? "Saving…" : "Save fuel log"}</button>
            </div>
          </form>
        ) : null}
      </Card>
      <Card>
        <h2 className="theme-heading font-semibold">Assignment history</h2>
        <p className="theme-subtext mt-1 text-xs">Recent lessons booked with this vehicle.</p>
        <div className="mt-3">
          <DataTable
            empty="No lessons booked with this vehicle yet."
            rows={vehicle.recent_lessons || []}
            columns={[
              { key: "starts_at", label: "When", render: (row) => shortDateTime(row.starts_at) },
              { key: "student", label: "Student", render: (row) => <PersonName name={row.student?.full_name || "Student"} detail={row.student?.student_number} /> },
              { key: "instructor", label: "Instructor", render: (row) => row.instructor?.full_name || "—" },
              { key: "type", label: "Type", render: (row) => <span className="capitalize">{row.lesson_type}</span> },
              { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
            ]}
          />
        </div>
      </Card>
    </div>
  );
}

function clockHm(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function nowHm() {
  return clockHm(new Date());
}

function durationLabel(minutes) {
  if (minutes == null) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function verificationLabel(value) {
  if (value === "signature") return "Signature";
  if (value === "thumb") return "Thumb mark";
  return "—";
}

function AttendanceStateBadge({ status }) {
  const onSite = status === "in";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${onSite ? "bg-sky-50 text-sky-700" : "bg-emerald-50 text-emerald-700"}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${onSite ? "bg-sky-500" : "bg-emerald-500"}`} aria-hidden />
      {onSite ? "On site" : "Checked out"}
    </span>
  );
}

export function AttendanceScreen({ mode = "today" }) {
  const isHistory = mode === "history";
  useTabTitle(tabSectionTitle(isHistory ? "Attendance history" : "Attendance", "Driving"));
  const { hasPermission } = useAuth();
  const canRecord = hasPermission("driving.attendance.create");
  const { branches, showBranchSelect } = useDrivingBranches();
  const today = todayDate();
  const [branchFilter, setBranchFilter] = useState("");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState(() => ({ from: shiftIsoDay(today, -1), to: shiftIsoDay(today, -1) }));
  const debouncedSearch = useDebouncedValue(search);
  const query = debouncedSearch.trim();
  const load = useLoad(
    () => drivingGet("/attendance", isHistory
      ? { from: range.from, to: range.to, q: query || undefined, branch_id: branchFilter || undefined }
      : { date: today, branch_id: branchFilter || undefined }),
    isHistory ? `attendance-history:${range.from}:${range.to}:${query}|${branchFilter}` : `attendance-today:${today}|${branchFilter}`,
  );
  const logs = rowsOf(load.data);
  const sessions = useMemo(
    () => attendanceSessions(logs, isHistory ? {} : { search }),
    [logs, isHistory, search],
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  useEffect(() => {
    setSearch("");
  }, [isHistory]);
  useEffect(() => {
    setPage(1);
  }, [isHistory, range.from, range.to, query, search]);
  const lastPage = Math.max(1, Math.ceil(sessions.length / pageSize));
  const safePage = Math.min(page, lastPage);
  const pageRows = sessions.slice((safePage - 1) * pageSize, safePage * pageSize);

  const [recordOpen, setRecordOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const debouncedStudentQuery = useDebouncedValue(studentQuery);
  const studentTerm = debouncedStudentQuery.trim();
  const [form, setForm] = useState({ student_id: "", date: todayDate(), check_in: "", check_out: "", verification: "none", mark: "" });
  const studentSearchLoad = useLoad(
    () => (recordOpen && !selectedStudent && studentTerm.length >= 2
      ? drivingGet("/students", { status: "active", lean: 1, per_page: 20, q: studentTerm, branch_id: branchFilter || undefined })
      : Promise.resolve(null)),
    `attendance-student-search:${recordOpen}:${studentTerm}:${branchFilter}:${selectedStudent ? selectedStudent.id : ""}`,
  );
  const studentOptions = rowsOf(studentSearchLoad.data);
  const formMinutes = useMemo(() => {
    if (!form.check_in || !form.check_out) return null;
    const [inHour, inMinute] = form.check_in.split(":").map(Number);
    const [outHour, outMinute] = form.check_out.split(":").map(Number);
    const diff = (outHour * 60 + outMinute) - (inHour * 60 + inMinute);
    return diff > 0 ? diff : null;
  }, [form.check_in, form.check_out]);

  function openRecord(row = null, { checkOut = false } = {}) {
    setEditing(row);
    setSelectedStudent(row
      ? { id: row.student_id, full_name: row.student_name || row.student?.full_name || "", student_number: row.student_number || row.student?.student_number || "" }
      : null);
    setStudentQuery("");
    setSaveError("");
    setForm({
      student_id: row ? String(row.student_id) : "",
      date: row?.day || todayDate(),
      check_in: row?.check_in_at ? clockHm(row.check_in_at) : nowHm(),
      check_out: checkOut ? nowHm() : row?.check_out_at ? clockHm(row.check_out_at) : "",
      verification: row?.verification && row.verification !== "none" ? row.verification : "none",
      mark: "",
    });
    setRecordOpen(true);
  }

  async function saveRecord(event) {
    event.preventDefault();
    if (!form.student_id) {
      setSaveError("Choose a student.");
      return;
    }
    if (!form.check_in) {
      setSaveError("Set a check-in time.");
      return;
    }
    if (form.check_out && form.check_out <= form.check_in) {
      setSaveError("Check-out must be after check-in. If the lesson crossed midnight, record it as two separate days.");
      return;
    }
    const keepStoredMark = editing?.verification === form.verification && form.verification !== "none";
    if (form.verification !== "none" && !form.mark && !keepStoredMark) {
      setSaveError(form.verification === "thumb" ? "Draw the thumb mark, or choose no extra check." : "Draw the signature, or choose no extra check.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await drivingSend("/attendance/day", "POST", {
        student_id: Number(form.student_id),
        date: form.date,
        check_in: form.check_in,
        check_out: form.check_out || null,
        verification: form.verification,
        ...(form.verification !== "none" && form.mark ? { mark: form.mark } : {}),
      });
      notifySuccess(form.check_out ? "Attendance saved with check-out." : "Check-in saved. The student shows as on site.");
      setRecordOpen(false);
      load.reload();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Could not save attendance.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <ScreenHeader
        title={isHistory ? "Previous attendance" : "Today's attendance"}
        subtitle={isHistory
          ? "Attendance from earlier days. Change the dates or search by student name, phone or number."
          : "Only students checked in today appear here. Record arrival when they come in and check them out when they leave."}
      >
        <BranchFilter value={branchFilter} onChange={setBranchFilter} branches={branches} show={showBranchSelect} />
        <AppNavLink href={isHistory ? "/driving-school/attendance" : "/driving-school/attendance/history"} className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">
          {isHistory ? "Today's attendance" : "Previous attendance"}
        </AppNavLink>
        {canRecord ? <button type="button" className={primaryButtonClass} onClick={() => openRecord()}>Record attendance</button> : null}
      </ScreenHeader>
      {load.error ? <p className="mb-3 text-sm text-red-600">{load.error}</p> : null}
      <Card>
        {isHistory ? (
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Field label="From">
              <input
                type="date"
                className={`${inputClass} w-40`}
                value={range.from}
                max={range.to}
                onChange={(event) => setRange((prev) => ({ from: event.target.value, to: event.target.value > prev.to ? event.target.value : prev.to }))}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                className={`${inputClass} w-40`}
                value={range.to}
                max={today}
                onChange={(event) => setRange((prev) => ({ from: event.target.value < prev.from ? event.target.value : prev.from, to: event.target.value }))}
              />
            </Field>
            <Field label="Search">
              <SearchField value={search} onChange={setSearch} placeholder="Name, phone or student number" />
            </Field>
          </div>
        ) : (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <SearchField value={search} onChange={setSearch} placeholder="Search checked-in students" />
            <span className="theme-subtext text-xs">{sessions.length} student{sessions.length === 1 ? "" : "s"} checked in today</span>
          </div>
        )}
        <DataTable
          empty={search.trim()
            ? "No attendance matches this search."
            : isHistory
              ? "No attendance in this date range."
              : "No one has checked in today yet. Use Record attendance to add the first arrival."}
          rows={pageRows}
          columns={[
            ...(isHistory ? [{ key: "day", label: "Date", render: (row) => shortDate(row.day) }] : []),
            { key: "student", label: "Student", render: (row) => <PersonName name={row.student_name || "Student"} detail={row.student_number} /> },
            { key: "status", label: "Status", render: (row) => <AttendanceStateBadge status={row.status} /> },
            { key: "in", label: "Check in", render: (row) => (row.check_in_at ? lessonTime(row.check_in_at) : "—") },
            { key: "out", label: "Check out", render: (row) => (row.check_out_at ? lessonTime(row.check_out_at) : "—") },
            { key: "hours", label: "Time on site", render: (row) => durationLabel(attendanceMinutes(row)) },
            { key: "verification", label: "Verification", render: (row) => verificationLabel(row.verification) },
            ...(canRecord ? [{
              key: "actions",
              label: "",
              render: (row) => (
                <button
                  type="button"
                  className="theme-secondary-btn rounded-lg px-3 py-1.5 text-xs font-medium"
                  onClick={() => openRecord(row, { checkOut: !isHistory && row.status === "in" && row.day === today })}
                >
                  {!isHistory && row.status === "in" ? "Check out" : "Edit"}
                </button>
              ),
            }] : []),
          ]}
        />
        <PaginationBar
          page={safePage}
          totalPages={lastPage}
          total={sessions.length}
          pageSize={pageSize}
          onChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </Card>

      <FormDrawer
        title={editing ? "Edit attendance" : "Record attendance"}
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        onSubmit={saveRecord}
        saving={saving}
        error={saveError}
        submitLabel={editing ? "Save attendance" : "Record attendance"}
        wide
      >
        {selectedStudent ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--theme-border)] px-3 py-2">
            <PersonName name={selectedStudent.full_name || "Student"} detail={selectedStudent.student_number} />
            {editing ? null : (
              <button
                type="button"
                className="theme-subtext text-xs font-medium hover:underline"
                onClick={() => {
                  setSelectedStudent(null);
                  setForm((prev) => ({ ...prev, student_id: "" }));
                }}
              >
                Change
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Field label="Student">
              <SearchField value={studentQuery} onChange={setStudentQuery} placeholder="Search name, phone or student number" />
            </Field>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--theme-border)]">
              {studentTerm.length < 2 ? (
                <Empty>Type at least 2 characters to search students.</Empty>
              ) : studentSearchLoad.error ? (
                <Empty>{studentSearchLoad.error}</Empty>
              ) : studentOptions.length === 0 ? (
                <Empty>No active students match “{studentTerm}”.</Empty>
              ) : (
                <ul className="divide-y divide-[var(--theme-border)]">
                  {studentOptions.map((student) => (
                    <li key={student.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--theme-hover)]"
                        onClick={() => {
                          setSelectedStudent(student);
                          setForm((prev) => ({ ...prev, student_id: String(student.id) }));
                        }}
                      >
                        <PersonName name={student.full_name} detail={student.student_number} />
                        <span className="theme-subtext text-xs">{student.phone || ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        <Field label="Date">
          <input
            type="date"
            className={inputClass}
            max={today}
            value={form.date}
            onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <HrTimePickerField label="Check in" value={form.check_in} onChange={(value) => setForm((prev) => ({ ...prev, check_in: value }))} defaultPeriod="AM" required />
          <HrTimePickerField label="Check out" value={form.check_out} onChange={(value) => setForm((prev) => ({ ...prev, check_out: value }))} defaultPeriod="PM" />
        </div>
        <p className="theme-subtext text-xs">
          {formMinutes != null
            ? `Time on site: ${durationLabel(formMinutes)}.`
            : form.check_in
              ? "Leave check-out empty while the student is still on site."
              : "Set the arrival time using hour, minute and AM/PM."}
        </p>
        <Field label="Verification">
          <DrivingSelect
            value={form.verification}
            onChange={(event) => setForm((prev) => ({ ...prev, verification: event.target.value, mark: "" }))}
            options={[
              { value: "none", label: "No extra check" },
              { value: "signature", label: "Signature" },
              { value: "thumb", label: "Thumb mark" },
            ]}
          />
        </Field>
        {form.verification !== "none" ? (
          <Field label={form.verification === "thumb" ? "Thumb mark" : "Signature"}>
            <MarkPad
              key={`attendance-mark-${form.verification}-${editing?.key || "new"}`}
              onChange={(mark) => setForm((prev) => ({ ...prev, mark }))}
            />
            <span className="theme-subtext mt-1 block text-xs">
              {editing?.verification === form.verification
                ? "Leave blank to keep the stored mark."
                : `Draw the ${form.verification === "thumb" ? "thumb mark" : "signature"} before saving.`}
            </span>
          </Field>
        ) : null}
      </FormDrawer>
    </div>
  );
}

function AssessmentCheckDialog({ students, branches, showBranchSelect, onClose, onSaved }) {
  const instructorLoad = useLoad(() => fetchDrivingInstructorsCached().then((rows) => ({ data: rows })), "assessment-check-instructors");
  const instructors = rowsOf(instructorLoad.data);
  const [branchId, setBranchId] = useState("");
  const [form, setForm] = useState({
    student_id: "",
    kind: "practical",
    title: "School practical check",
    instructor_id: "",
    score: "",
    max_score: "100",
    comments: "",
    assessed_on: todayDate(),
  });
  const [busy, setBusy] = useState(false);

  const studentOptions = rowsOf(students).filter((row) => !branchId || String(row.branch_id) === String(branchId));
  const kindTitle = { theory: "School theory check", practical: "School practical check", mock: "Mock examination" };
  const percent = Number(form.max_score) > 0 ? Math.min(100, Math.round((Number(form.score) || 0) / Number(form.max_score) * 100)) : 0;

  function changeKind(kind) {
    setForm((current) => ({
      ...current,
      kind,
      title: Object.values(kindTitle).includes(current.title) || !current.title.trim() ? kindTitle[kind] : current.title,
    }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.student_id) {
      notifyError("Choose the learner being assessed.");
      return;
    }
    if (form.score === "" || Number(form.score) < 0) {
      notifyError("Enter the score the learner achieved.");
      return;
    }
    if (Number(form.score) > Number(form.max_score)) {
      notifyError("The score cannot be higher than the maximum score.");
      return;
    }
    setBusy(true);
    try {
      await drivingSend("/assessments", "POST", {
        student_id: Number(form.student_id),
        instructor_id: form.instructor_id ? Number(form.instructor_id) : null,
        kind: form.kind,
        title: form.title.trim(),
        score: Number(form.score),
        max_score: Number(form.max_score) || 100,
        comments: form.comments.trim() || null,
        assessed_on: form.assessed_on,
      });
      notifySuccess("Assessment recorded.");
      onSaved();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not record this assessment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Editor open title="Record an assessment" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <p className="rounded-xl border border-[var(--theme-border)] px-3 py-2 text-xs text-amber-800">
          This is an internal school check and feeds the learner&apos;s examination readiness. It is not an official NTSA result.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <BranchField value={branchId} onChange={(value) => { setBranchId(value); setForm((current) => ({ ...current, student_id: "" })); }} branches={branches} show={showBranchSelect} allowAll />
          <Field label="Learner">
            <DrivingSelect required value={form.student_id} placeholder="Choose a learner" onChange={(event) => setForm({ ...form, student_id: event.target.value })} options={[{ value: "", label: "Choose a learner" }, ...studentOptions.map((row) => ({ value: String(row.id), label: `${row.full_name}${row.student_number ? ` · ${row.student_number}` : ""}` }))]} />
          </Field>
          <Field label="Assessment type">
            <DrivingSelect value={form.kind} onChange={(event) => changeKind(event.target.value)} options={[{ value: "practical", label: "Practical check" }, { value: "theory", label: "Theory check" }, { value: "mock", label: "Mock examination" }]} />
          </Field>
          <Field label="Instructor (optional)">
            <DrivingSelect value={form.instructor_id} placeholder="No instructor" onChange={(event) => setForm({ ...form, instructor_id: event.target.value })} options={[{ value: "", label: "No instructor" }, ...instructors.map((row) => ({ value: String(row.id), label: row.full_name }))]} />
          </Field>
          <Field label="Title"><input className={inputClass} required maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></Field>
          <Field label="Date"><input className={inputClass} required type="date" max={todayDate()} value={form.assessed_on} onChange={(event) => setForm({ ...form, assessed_on: event.target.value })} /></Field>
          <Field label="Score"><input className={inputClass} required type="number" min="0" value={form.score} onChange={(event) => setForm({ ...form, score: event.target.value })} /></Field>
          <Field label="Maximum score"><input className={inputClass} required type="number" min="1" max="1000" value={form.max_score} onChange={(event) => setForm({ ...form, max_score: event.target.value })} /></Field>
        </div>
        <div className="rounded-xl border border-[var(--theme-border)] px-3 py-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="theme-subtext">Result</span>
            <span className="theme-heading font-semibold tabular-nums">{form.score === "" ? "—" : `${percent}%`}</span>
          </div>
          <div className="mt-2"><CompletionBar value={percent} /></div>
        </div>
        <Field label="Remarks">
          <textarea className={`${inputClass} h-20 resize-y py-2`} maxLength={2000} placeholder="Notes for the learner's file" value={form.comments} onChange={(event) => setForm({ ...form, comments: event.target.value })} />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={busy} className={primaryButtonClass}>{busy ? "Saving…" : "Save assessment"}</button>
        </div>
      </form>
    </Editor>
  );
}

export function AssessmentsScreen() {
  return <AssessmentListScreen />;
}

const EXAM_KINDS = [
  { value: "theory", label: "Theory test", short: "Theory", tone: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  { value: "practical", label: "Practical test", short: "Practical", tone: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  { value: "mock", label: "Mock exam", short: "Mock", tone: "bg-amber-50 text-amber-800", dot: "bg-amber-500" },
];

function examKind(value) {
  return EXAM_KINDS.find((row) => row.value === value) || { value, label: value || "Examination", short: value || "Exam", tone: "bg-slate-100 text-slate-600", dot: "bg-slate-400" };
}

const EXAM_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "absent", label: "Absent" },
  { value: "cancelled", label: "Cancelled" },
];

function examStatus(value) {
  const normalized = value === "booked" ? "scheduled" : value || "scheduled";
  return EXAM_STATUSES.find((row) => row.value === normalized) || { value: normalized, label: normalized };
}

function ExamStatusBadge({ value }) {
  return <StatusBadge value={value === "booked" ? "scheduled" : value} />;
}

const EXAM_PAYMENT_STATES = {
  free: { label: "Free", tone: "bg-slate-100 text-slate-600" },
  paid: { label: "Paid", tone: "bg-emerald-50 text-emerald-700" },
  outstanding: { label: "Outstanding", tone: "bg-amber-50 text-amber-800" },
};

function examPaymentInfo(row) {
  const fee = Number(row?.fee_amount) || 0;
  const status = row?.payment_status || (fee > 0 ? (row?.invoice?.status === "paid" ? "paid" : "outstanding") : "free");
  const state = EXAM_PAYMENT_STATES[status] || EXAM_PAYMENT_STATES.free;
  return { ...state, fee };
}

function ExamPaymentBadge({ row }) {
  const info = examPaymentInfo(row);
  return (
    <span className="flex flex-col gap-0.5">
      <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-medium ${info.tone}`}>{info.label}</span>
      {info.fee > 0 ? <span className="theme-subtext text-[11px] tabular-nums">KSh {info.fee.toLocaleString()}</span> : null}
    </span>
  );
}

const LICENCE_CATEGORIES = ["A", "B", "C", "D", "E"];

const QUESTION_TOPICS = [
  "Traffic signs",
  "Road markings",
  "Highway code",
  "Defensive driving",
  "Vehicle controls",
  "Road safety",
  "Traffic regulations",
  "Emergencies",
  "Basic vehicle maintenance",
];

const PRACTICAL_RESULTS = [
  { value: "pass", label: "Pass", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "needs_improvement", label: "Needs improvement", tone: "bg-amber-50 text-amber-800 border-amber-200" },
  { value: "fail", label: "Fail", tone: "bg-rose-50 text-rose-700 border-rose-200" },
  { value: "not_assessed", label: "Not assessed", tone: "bg-slate-100 text-slate-600 border-slate-200" },
];

function practicalResult(value) {
  return PRACTICAL_RESULTS.find((row) => row.value === value) || PRACTICAL_RESULTS[3];
}

function practicalItems(row) {
  const value = row?.practical;
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.items) ? value.items : [];
}

function practicalMeta(row) {
  return row?.practical && !Array.isArray(row.practical) ? row.practical : {};
}

const DEFAULT_PRACTICAL_TEMPLATE = [
  "Pre-drive checks",
  "Vehicle controls",
  "Moving off and stopping",
  "Steering and road position",
  "Observation and mirror use",
  "Junctions and roundabouts",
  "Parking",
  "Hill start",
  "Emergency stop",
];

const DEFAULT_EXAM_SETTINGS = {
  pass_mark: 70,
  attempt_limit: 1,
  retake_fee: 0,
  theory_fee: 0,
  practical_fee: 0,
  mock_fee: 0,
  eligibility: { enrolment: true, theory_progress: false, practical_progress: false, attendance: false, fees: false, documents: false },
  notifications: { on_schedule: true, remind_before: true, on_result: true },
  practical_template: DEFAULT_PRACTICAL_TEMPLATE,
};

function examCategory(row) {
  return row?.licence_category || row?.enrolment?.course?.licence_category || "—";
}

function percent(part, total) {
  return total > 0 ? Math.min(100, Math.round((Number(part) / Number(total)) * 100)) : 0;
}

function scorePercent(score, max) {
  return Number(max) > 0 ? Math.round((Number(score) / Number(max)) * 100) : 0;
}

function printExamDocument(title, lines) {
  const win = window.open("", "_blank", "width=820,height=900");
  if (!win) {
    notifyError("Allow pop-ups to print this result.");
    return;
  }
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  win.document.write(`<!doctype html><html><head><title>${escape(title)}</title><style>
    body{font-family:ui-sans-serif,system-ui,sans-serif;color:#0f172a;padding:32px;line-height:1.5}
    h1{font-size:20px;margin:0 0 4px} h2{font-size:14px;margin:24px 0 8px}
    table{width:100%;border-collapse:collapse;margin-top:8px} th,td{border-bottom:1px solid #e2e8f0;padding:8px;text-align:left;font-size:12px;vertical-align:top}
    .muted{color:#64748b;font-size:12px} .pill{display:inline-block;border:1px solid #e2e8f0;border-radius:999px;padding:2px 8px;font-size:11px}
    .notice{margin-top:24px;border:1px solid #fde68a;background:#fffbeb;padding:10px;border-radius:8px;font-size:11px;color:#92400e}
  </style></head><body><h1>${escape(title)}</h1><p class="muted">${escape(new Date().toLocaleString())}</p>${lines}</body></html>`);
  win.document.write(`<p class="notice">This is an internal driving-school record. It is not an official NTSA examination result or certificate.</p>`);
  win.document.close();
  win.focus();
  win.print();
}

function studentKey(student) {
  return student?.id ?? student?.student_number ?? student?.full_name ?? "unknown";
}

function printStudentExamReports(groups) {
  if (!groups.length) return;
  const win = window.open("", "_blank", "width=820,height=900");
  if (!win) {
    notifyError("Allow pop-ups to print this report.");
    return;
  }
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const pages = groups.map(({ student, rows }) => {
    const gradedRows = rows.filter((row) => row.status !== "absent");
    const passedRows = rows.filter((row) => row.status === "passed");
    const failedRows = rows.filter((row) => row.status === "failed");
    const absentRows = rows.filter((row) => row.status === "absent");
    const passRate = gradedRows.length > 0 ? Math.round((passedRows.length / gradedRows.length) * 100) : 0;
    const categories = [...new Set(rows.map((row) => row.category).filter((value) => value && value !== "—"))];
    const tableRows = rows.map((row) => `<tr>
      <td>${escape(row.source === "theory" ? "Theory" : "Practical")}</td>
      <td>${escape(row.paper)}${row.meta ? `<br><span class="muted">${escape(row.meta)}</span>` : ""}</td>
      <td>${escape(row.category)}</td>
      <td>#${escape(row.attemptNumber)}</td>
      <td>${row.percent != null ? `${escape(row.percent)}%` : "—"}${row.rawScore && row.rawScore !== "—" ? `<br><span class="muted">${escape(row.rawScore)}</span>` : ""}</td>
      <td>${escape(examStatus(row.status).label)}</td>
      <td>${escape(shortDate(row.date))}</td>
    </tr>`).join("");
    return `<section class="page">
      <header class="head">
        <div>
          <h1>${escape(student?.full_name || "Learner")}</h1>
          <p class="muted">Admission No. ${escape(student?.student_number || "—")}${categories.length ? ` · Category ${escape(categories.join(", "))}` : ""}</p>
        </div>
        <span class="pill">Driving school examination report</span>
      </header>
      <div class="tiles">
        <div class="tile"><div class="v">${rows.length}</div><div class="k">Examinations</div></div>
        <div class="tile"><div class="v">${passedRows.length}</div><div class="k">Passed</div></div>
        <div class="tile"><div class="v">${failedRows.length}</div><div class="k">Failed</div></div>
        <div class="tile"><div class="v">${absentRows.length}</div><div class="k">Absent</div></div>
        <div class="tile"><div class="v">${passRate}%</div><div class="k">Pass rate</div></div>
      </div>
      <h2>Examination history</h2>
      <table>
        <thead><tr><th>Type</th><th>Examination</th><th>Category</th><th>Attempt</th><th>Score</th><th>Result</th><th>Date</th></tr></thead>
        <tbody>${tableRows || `<tr><td colspan="7" class="muted">No examination results recorded for this learner.</td></tr>`}</tbody>
      </table>
      <p class="notice">This is an internal driving-school record. It is not an official NTSA examination result or certificate.</p>
    </section>`;
  }).join("");
  win.document.write(`<!doctype html><html><head><title>Learner examination reports</title><style>
    body{font-family:ui-sans-serif,system-ui,sans-serif;color:#0f172a;padding:32px;line-height:1.5;margin:0}
    .page{page-break-after:always} .page:last-child{page-break-after:auto}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:8px;gap:12px}
    h1{font-size:20px;margin:0 0 2px} h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#475569;margin:18px 0 6px}
    .muted{color:#64748b;font-size:11px;margin:0}
    .tiles{display:flex;gap:8px;margin:12px 0 4px}
    .tile{flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px}
    .tile .v{font-size:18px;font-weight:600} .tile .k{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
    table{width:100%;border-collapse:collapse;margin-top:6px}
    th,td{border-bottom:1px solid #e2e8f0;padding:7px 8px;text-align:left;font-size:11.5px;vertical-align:top}
    th{font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
    .pill{display:inline-block;border:1px solid #e2e8f0;border-radius:999px;padding:2px 8px;font-size:10px;white-space:nowrap}
    .notice{margin-top:18px;border:1px solid #fde68a;background:#fffbeb;padding:8px 10px;border-radius:6px;font-size:10.5px;color:#92400e}
  </style></head><body>${pages}</body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

function examHistoryRows(bookings, studentId) {
  return bookings
    .filter((row) => Number(row.student_id) === Number(studentId))
    .sort((a, b) => String(b.scheduled_on || "").localeCompare(String(a.scheduled_on || "")) || Number(b.id) - Number(a.id));
}

const THEORY_EXAM_TYPES = [
  { value: "quiz", label: "Quiz" },
  { value: "unit", label: "Unit test" },
  { value: "module", label: "Module test" },
  { value: "mock", label: "Mock exam" },
  { value: "final", label: "Final exam" },
  { value: "revision", label: "Revision test" },
];

function theoryExamType(value) {
  return THEORY_EXAM_TYPES.find((row) => row.value === value) || { value: value || "mock", label: value ? String(value) : "Exam" };
}

const QUESTION_TYPES = [
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "true_false", label: "True / false" },
  { value: "single_answer", label: "Single answer" },
  { value: "multiple_answer", label: "Multiple answers" },
  { value: "scenario", label: "Scenario" },
  { value: "image", label: "Image question" },
];

function questionTypeLabel(value) {
  return QUESTION_TYPES.find((row) => row.value === value)?.label || "Question";
}

function questionOptionLabel(option) {
  if (option && typeof option === "object") return String(option.label ?? option.text ?? JSON.stringify(option));
  return String(option ?? "");
}

function questionOptions(question) {
  if (Array.isArray(question?.options) && question.options.length > 0) {
    return question.options.map(questionOptionLabel);
  }
  return question?.type === "true_false" ? ["True", "False"] : [];
}

function theoryPassStats(exam) {
  const attempted = Number(exam?.attempts_count) || 0;
  const passed = Number(exam?.passed_attempts_count) || 0;
  return { attempted, passed, rate: attempted > 0 ? Math.round((passed / attempted) * 100) : 0 };
}

function ExamCalendar({ bookings, month, selectedDay, onSelectDay, onShift }) {
  const grid = monthGrid(month);
  const byDay = {};
  for (const row of bookings) {
    const key = String(row.scheduled_on || "").slice(0, 10);
    if (!key) continue;
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(row);
  }
  const days = [];
  for (let iso = grid.start; iso <= grid.end; iso = shiftIsoDay(iso, 1)) {
    days.push({ iso, dayNumber: new Date(`${iso}T00:00:00`).getDate(), inMonth: iso.slice(0, 7) === month.slice(0, 7), items: byDay[iso] || [] });
  }
  const today = todayDate();
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="theme-heading font-semibold">Examination calendar</h2>
          <p className="theme-subtext mt-0.5 text-xs">Sessions, registrations and results by day. Select a day to see its agenda.</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="theme-secondary-btn rounded-lg px-2 py-1 text-sm" aria-label="Previous month" onClick={() => onShift(-1)}>‹</button>
          <span className="theme-subtext min-w-[110px] text-center text-xs font-medium">{grid.label}</span>
          <button type="button" className="theme-secondary-btn rounded-lg px-2 py-1 text-sm" aria-label="Next month" onClick={() => onShift(1)}>›</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 pb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
          <span key={label} className="theme-subtext px-1 text-[10px] font-medium uppercase">{label}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const selected = day.iso === selectedDay;
          return (
            <button
              key={day.iso}
              type="button"
              onClick={() => onSelectDay(day.iso)}
              className={`min-h-[64px] rounded-lg border p-1 text-left transition ${selected ? "border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_10%,transparent)] ring-1 ring-[var(--theme-primary)]" : day.items.length ? "border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_5%,transparent)] hover:border-[var(--theme-primary)]" : "border-[var(--theme-border)] hover:border-[var(--theme-primary)]"} ${day.inMonth ? "" : "opacity-45"}`}
            >
              <span className={`block text-xs font-semibold tabular-nums ${day.iso === today ? "text-[var(--theme-primary)]" : "theme-heading"}`}>{day.dayNumber}</span>
              {day.items.length ? (
                <>
                  <span className="theme-subtext mt-0.5 block text-[9px] font-medium tabular-nums">{day.items.length} exam{day.items.length === 1 ? "" : "s"}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-0.5">
                    {day.items.slice(0, 4).map((row) => (
                      <span key={row.id} className={`h-1.5 w-1.5 rounded-full ${examKind(row.kind).dot}`} title={`${examKind(row.kind).short} · ${row.student?.full_name || "Student"}`} />
                    ))}
                    {day.items.length > 4 ? <span className="theme-subtext text-[9px] font-semibold tabular-nums">+{day.items.length - 4}</span> : null}
                  </span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="theme-subtext mt-3 flex flex-wrap items-center gap-3 text-[11px]">
        {EXAM_KINDS.map((kind) => (
          <span key={kind.value} className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${kind.dot}`} aria-hidden />
            {kind.short}
          </span>
        ))}
      </div>
    </Card>
  );
}

function AssessmentListScreen() {
  useTabTitle(tabSectionTitle("Examinations", "Driving"));
  const { user, hasPermission } = useAuth();
  const confirm = useConfirm();
  const { branches, showBranchSelect } = useDrivingBranches();
  const isAdmin = Boolean(user?.is_admin || user?.is_super_admin);
  const canView = Boolean(isAdmin || hasPermission("driving.exams.view") || hasPermission("driving.assessments.view"));
  const can = (action) => Boolean(isAdmin || hasPermission(`driving.exams.${action}`) || hasPermission("driving.assessments.create"));
  const canSchedule = can("schedule");
  const canStart = can("start");
  const canResults = can("results");
  const canConduct = can("conduct");
  const canBank = can("bank");
  const canSettings = can("settings");
  const canRetakes = can("retakes");
  const canViewFees = Boolean(isAdmin || hasPermission("driving.fees.view"));
  const canNotify = Boolean(isAdmin || hasPermission("driving.outreach.create"));

  const [branchFilter, setBranchFilter] = useState("");
  const [tab, setTab] = useState("overview");
  const [month, setMonth] = useState(todayDate);
  const [selectedDay, setSelectedDay] = useState(todayDate);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [tick, setTick] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [runner, setRunner] = useState(null);
  const [selectedExam, setSelectedExam] = useState(null);
  const [bookingQuery, setBookingQuery] = useState("");
  const [bookingKind, setBookingKind] = useState("");
  const [bookingStatus, setBookingStatus] = useState("");
  const [readinessQuery, setReadinessQuery] = useState("");
  const refresh = () => setTick((value) => value + 1);

  const checksLoad = useLoad(
    () => drivingGet("/assessments", { branch_id: branchFilter || undefined }),
    `assessments|${branchFilter}|${tick}`,
  );
  const studentsLoad = useLoad(
    () => drivingGet("/students", { status: "active", branch_id: branchFilter || undefined, per_page: 100 }),
    `assessments-students|${branchFilter}|${tick}`,
  );
  const examsLoad = useLoad(
    () => drivingGet("/exams", { branch_id: branchFilter || undefined }),
    `exams|${branchFilter}|${tick}`,
  );
  const theoryLoad = useLoad(
    () => drivingGet("/theory/assessments", { per_page: 100 }),
    `theory-assessments|${tick}`,
  );
  const questionsLoad = useLoad(
    () => drivingGet("/theory/questions", { per_page: 100 }),
    `theory-questions|${tick}`,
  );
  const coursesLoad = useLoad(
    () => fetchDrivingCoursesCached().then((rows) => ({ data: rows })),
    "exam-courses",
  );
  const settingsLoad = useLoad(() => drivingGet("/exam-settings"), `exam-settings|${tick}`);
  const instructorsLoad = useLoad(
    () => fetchDrivingInstructorsCached().then((rows) => ({ data: rows })),
    "exam-instructors",
  );
  const invoicesLoad = useLoad(
    () => (canViewFees ? drivingGet("/invoices", { per_page: 100 }) : Promise.resolve(null)),
    `exam-invoices|${tick}`,
  );

  const settings = useMemo(() => {
    const rows = settingsLoad.data?.data || {};
    return {
      ...DEFAULT_EXAM_SETTINGS,
      ...rows,
      eligibility: { ...DEFAULT_EXAM_SETTINGS.eligibility, ...(rows.eligibility || {}) },
      notifications: { ...DEFAULT_EXAM_SETTINGS.notifications, ...(rows.notifications || {}) },
      practical_template: rows.practical_template?.length ? rows.practical_template : DEFAULT_PRACTICAL_TEMPLATE,
    };
  }, [settingsLoad.data]);

  const bookings = useMemo(() => {
    const payload = examsLoad.data?.data && !Array.isArray(examsLoad.data.data) ? examsLoad.data.data : {};
    const upcoming = Array.isArray(payload.upcoming) ? payload.upcoming : [];
    const recent = Array.isArray(payload.recent) ? payload.recent : [];
    const seen = new Set();
    return [...upcoming, ...recent].filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  }, [examsLoad.data]);
  const checks = rowsOf(checksLoad.data);
  const theoryExams = rowsOf(theoryLoad.data);
  const questions = rowsOf(questionsLoad.data);
  const students = rowsOf(studentsLoad.data);
  const courses = rowsOf(coursesLoad.data);
  const instructors = rowsOf(instructorsLoad.data);
  const invoices = rowsOf(invoicesLoad.data);
  const error = checksLoad.error || examsLoad.error || theoryLoad.error || questionsLoad.error || settingsLoad.error;

  const categoryOptions = useMemo(() => {
    const values = new Set(LICENCE_CATEGORIES);
    for (const row of bookings) {
      const value = examCategory(row);
      if (value && value !== "—") values.add(value);
    }
    for (const course of courses) {
      if (course.licence_category) values.add(course.licence_category);
    }
    return [...values].sort();
  }, [bookings, courses]);

  const outstandingByStudent = useMemo(() => {
    const map = new Map();
    for (const row of invoices) {
      const outstanding = Number(row.outstanding ?? (Number(row.amount || 0) - Number(row.discount || 0)));
      if (outstanding <= 0) continue;
      const key = Number(row.student_id);
      map.set(key, (map.get(key) || 0) + outstanding);
    }
    return map;
  }, [invoices]);

  const topicNames = useMemo(() => {
    const map = new Map();
    for (const row of questions) {
      if (row.topic?.id && row.topic?.name) map.set(Number(row.topic.id), row.topic.name);
    }
    return map;
  }, [questions]);

  const readiness = useMemo(() => {
    const byStudent = new Map();
    for (const row of checks) {
      const key = Number(row.student_id);
      if (!byStudent.has(key)) byStudent.set(key, []);
      byStudent.get(key).push(row);
    }
    const upcomingByStudent = new Map();
    for (const row of bookings) {
      if (!["draft", "scheduled", "booked", "in_progress"].includes(row.status || "scheduled")) continue;
      const key = Number(row.student_id);
      if (!upcomingByStudent.has(key)) upcomingByStudent.set(key, []);
      upcomingByStudent.get(key).push(row);
    }
    return students
      .map((student) => {
        const enrolment = (student.enrolments || []).find((row) => row.status === "active") || (student.enrolments || [])[0] || null;
        const studentChecks = (byStudent.get(Number(student.id)) || []).slice().sort((a, b) => String(b.assessed_on || "").localeCompare(String(a.assessed_on || "")));
        const theoryCheck = studentChecks.find((row) => row.kind === "theory");
        const practicalCheck = studentChecks.find((row) => row.kind === "practical");
        const mockCheck = studentChecks.find((row) => row.kind === "mock");
        const state = examReadiness(student, enrolment, studentChecks);
        const theoryScore = theoryCheck ? scorePercent(theoryCheck.score, theoryCheck.max_score) : state.theoryPassed ? 100 : 0;
        const practicalScore = practicalCheck ? scorePercent(practicalCheck.score, practicalCheck.max_score) : state.latestSkill ?? 0;
        const attendance = state.pct;
        const mockScore = mockCheck ? scorePercent(mockCheck.score, mockCheck.max_score) : theoryScore;
        const readinessScore = Math.round((theoryScore + practicalScore + attendance + mockScore) / 4);
        const feeDue = outstandingByStudent.get(Number(student.id)) || 0;
        const permitOk = !student.learner_permit_expires_on || daysFromNow(student.learner_permit_expires_on) >= 0;
        const ready = state.practicalPassed && state.theoryPassed && attendance >= 80 && readinessScore >= 70 && permitOk;
        const upcoming = upcomingByStudent.get(Number(student.id)) || [];
        const category = enrolment?.course?.licence_category || "—";
        return {
          student,
          enrolment,
          category,
          theoryScore,
          practicalScore,
          attendance,
          mockScore,
          readinessScore,
          feeDue,
          permitOk,
          ready,
          upcoming,
          checks: studentChecks,
          ...state,
        };
      })
      .sort((a, b) => b.readinessScore - a.readinessScore);
  }, [students, checks, bookings, outstandingByStudent]);

  const readinessByStudent = useMemo(() => new Map(readiness.map((row) => [Number(row.student.id), row])), [readiness]);

  const monthKey = month.slice(0, 7);
  const monthBookings = useMemo(
    () => bookings
      .filter((row) => String(row.scheduled_on || "").slice(0, 7) === monthKey)
      .filter((row) => !categoryFilter || examCategory(row) === categoryFilter),
    [bookings, monthKey, categoryFilter],
  );
  const monthTheory = theoryExams.filter((row) => !row.created_at || String(row.created_at).slice(0, 7) === monthKey);
  const passedCount = monthBookings.filter((row) => row.status === "passed").length;
  const failedCount = monthBookings.filter((row) => row.status === "failed").length;
  const absentCount = monthBookings.filter((row) => row.status === "absent").length;
  const completedCount = passedCount + failedCount;
  const passRate = completedCount > 0 ? Math.round((passedCount / completedCount) * 100) : 0;
  const scheduledCount = monthBookings.filter((row) => ["draft", "scheduled", "booked"].includes(row.status || "scheduled")).length;
  const pendingAssessments = bookings.filter((row) => row.kind === "practical" && (row.status === "in_progress" || (row.status !== "passed" && row.status !== "failed" && row.status !== "absent" && row.status !== "cancelled" && daysFromNow(row.scheduled_on) < 0))).length;
  const theoryAttempts = theoryExams.reduce((total, row) => total + (Number(row.attempts_count) || 0), 0);
  const theoryPassed = theoryExams.reduce((total, row) => total + (Number(row.passed_attempts_count) || 0), 0);
  const theoryPassRate = theoryAttempts > 0 ? Math.round((theoryPassed / theoryAttempts) * 100) : 0;
  const retakeCount = failedCount + absentCount;

  const readyNotRegistered = readiness.filter((row) => row.ready && row.upcoming.length === 0);
  const registeredUpcoming = bookings
    .filter((row) => ["draft", "scheduled", "booked"].includes(row.status || "scheduled"))
    .sort((a, b) => String(a.scheduled_on || "").localeCompare(String(b.scheduled_on || "")));
  const awaitingResults = bookings
    .filter((row) => row.status === "in_progress" || row.status === "completed")
    .sort((a, b) => String(a.scheduled_on || "").localeCompare(String(b.scheduled_on || "")));

  const pipelineStages = [
    {
      title: "Ready, not registered",
      dot: "bg-emerald-500",
      rows: readyNotRegistered.map((row) => ({
        id: `ready-${row.student.id}`,
        student: row.student,
        meta: `${row.category} · ${row.readinessScore}% ready`,
        action: canSchedule ? () => registerLearner(row) : null,
        actionLabel: "Register",
      })),
    },
    {
      title: "Held back",
      dot: "bg-amber-500",
      rows: readiness
        .filter((row) => !row.ready && row.upcoming.length === 0)
        .map((row) => ({
          id: `held-${row.student.id}`,
          student: row.student,
          meta: row.feeDue > 0
            ? `Balance KSh ${Number(row.feeDue).toLocaleString("en-KE")}`
            : !row.permitOk
              ? "Learner permit expired"
              : row.attendance < 80
                ? `${row.attendance}% attendance`
                : !row.theoryPassed
                  ? "Theory not passed"
                  : !row.practicalPassed
                    ? "Practical not passed"
                    : `${row.readinessScore}% readiness`,
        })),
    },
    {
      title: "Registered",
      dot: "bg-sky-500",
      rows: registeredUpcoming.map((row) => ({
        id: `booked-${row.id}`,
        student: row.student,
        meta: `${examKind(row.kind).short} · ${shortDate(row.scheduled_on)}`,
      })),
    },
    {
      title: "Awaiting result",
      dot: "bg-violet-500",
      rows: awaitingResults.map((row) => ({
        id: `awaiting-${row.id}`,
        student: row.student,
        meta: `${examKind(row.kind).short} · ${shortDate(row.scheduled_on)}`,
        action: (row.kind === "practical" ? canConduct : canResults) ? () => openResult(row) : null,
        actionLabel: row.kind === "practical" ? "Assess" : "Result",
      })),
    },
  ];

  const visibleBookings = bookings
    .filter((row) => {
      const needle = bookingQuery.trim().toLowerCase();
      if (!needle) return true;
      return [
        row.reference,
        row.student?.full_name,
        row.student?.student_number,
        row.instructor?.full_name,
        row.examiner,
        row.location,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
    })
    .filter((row) => !bookingKind || row.kind === bookingKind)
    .filter((row) => !bookingStatus || examStatus(row.status).value === bookingStatus || row.status === bookingStatus)
    .filter((row) => !categoryFilter || examCategory(row) === categoryFilter)
    .sort((a, b) => String(a.scheduled_on || "").localeCompare(String(b.scheduled_on || "")) || String(a.scheduled_time || "").localeCompare(String(b.scheduled_time || "")));

  const selectedDayBookings = bookings
    .filter((row) => String(row.scheduled_on || "").slice(0, 10) === selectedDay)
    .filter((row) => !categoryFilter || examCategory(row) === categoryFilter)
    .sort((a, b) => String(a.scheduled_time || "").localeCompare(String(b.scheduled_time || "")));

  const visibleReadiness = readiness
    .filter((row) => {
      const needle = readinessQuery.trim().toLowerCase();
      if (!needle) return true;
      return [row.student?.full_name, row.student?.student_number, row.category]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    })
    .sort((a, b) => b.readinessScore - a.readinessScore);

  const practicalBookings = bookings
    .filter((row) => row.kind === "practical")
    .filter((row) => !categoryFilter || examCategory(row) === categoryFilter)
    .sort((a, b) => String(b.scheduled_on || "").localeCompare(String(a.scheduled_on || "")));

  const failedBookings = bookings.filter((row) => row.status === "failed" || row.status === "absent");
  const retakes = readiness
    .map((row) => {
      const failed = examHistoryRows(failedBookings, row.student.id);
      if (failed.length === 0 && !failedBookings.some((item) => Number(item.student_id) === Number(row.student.id))) return null;
      const history = examHistoryRows(bookings, row.student.id);
      const latest = failed[0] || null;
      const upcoming = row.upcoming.find((item) => item.kind === latest?.kind);
      return { ...row, latest, failed, history, retakeScheduled: upcoming || null };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.latest?.scheduled_on || "").localeCompare(String(a.latest?.scheduled_on || "")));

  const tabs = [
    { value: "overview", label: "Overview" },
    { value: "schedule", label: "Exam schedule", count: bookings.length },
    { value: "theory", label: "Theory exams", count: theoryExams.length },
    { value: "practical", label: "Practical exams", count: practicalBookings.length },
    { value: "results", label: "Results" },
    { value: "retakes", label: "Retakes", count: retakes.length },
    { value: "readiness", label: "Readiness", count: `${readiness.filter((row) => row.ready).length}/${readiness.length}` },
    { value: "questions", label: "Question bank", count: questions.length },
    { value: "settings", label: "Exam settings" },
  ];

  async function cancelBooking(row) {
    const ok = await confirm({
      title: "Cancel examination",
      message: `Cancel ${row.student?.full_name || "this learner"}'s ${examKind(row.kind).label.toLowerCase()} on ${shortDate(row.scheduled_on)}? The record stays on file.`,
      confirmLabel: "Cancel examination",
      destructive: true,
    });
    if (!ok) return;
    try {
      await drivingSend(`/exams/${row.id}`, "PATCH", { status: "cancelled" });
      notifySuccess("Examination cancelled.");
      refresh();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not cancel this booking.");
    }
  }

  async function notifyBooking(row) {
    const ok = await confirm({
      title: "Notify learner",
      message: `Queue an examination update for ${row.student?.full_name || "this learner"} (${row.student?.phone || "no phone on file"})?`,
      confirmLabel: "Queue notification",
    });
    if (!ok) return;
    try {
      await drivingSend(`/exams/${row.id}`, "PATCH", { notify: true });
      notifySuccess("Notification queued.");
      refresh();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not queue this notification.");
    }
  }

  async function deleteExam(row) {
    const ok = await confirm(confirmDeleteOptions(`“${row.name}”`, `Delete “${row.name}” and its recorded attempts? This cannot be undone.`));
    if (!ok) return;
    try {
      await drivingSend(`/theory/assessments/${row.id}`, "DELETE");
      notifySuccess("Theory exam deleted.");
      if (selectedExam?.id === row.id) setSelectedExam(null);
      refresh();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not delete this exam.");
    }
  }

  async function deleteQuestion(row) {
    const ok = await confirm(confirmDeleteOptions("this question", "Delete this question? It will also be removed from any exam that uses it."));
    if (!ok) return;
    try {
      await drivingSend(`/theory/questions/${row.id}`, "DELETE");
      notifySuccess("Question deleted.");
      refresh();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not delete this question.");
    }
  }

  async function exportSchedule() {
    try {
      await downloadExcelFromRows(`Examinations-${monthKey}.xlsx`, "Examinations", [
        ["Reference", "Student", "Admission no.", "Test type", "Licence category", "Instructor", "Examiner", "Date", "Start time", "Status", "Score", "Attempt"],
        ...visibleBookings.map((row) => [
          row.reference || `EXM-${row.id}`,
          row.student?.full_name || "",
          row.student?.student_number || "",
          examKind(row.kind).label,
          examCategory(row),
          row.instructor?.full_name || "",
          row.examiner || "",
          shortDate(row.scheduled_on),
          row.scheduled_time || "",
          examStatus(row.status).label,
          row.score != null ? Number(row.score) : "",
          row.attempt_number || 1,
        ]),
      ]);
      notifySuccess("Examination schedule exported.");
    } catch {
      notifyError("Could not export the schedule.");
    }
  }

  async function exportExamReport(kind) {
    const reports = {
      theory: { name: "Theory pass rate", header: ["Exam", "Type", "Course", "Attempts", "Passed", "Pass rate"], rows: () => theoryExams.map((exam) => { const stats = theoryPassStats(exam); return [exam.name, theoryExamType(exam.type).label, exam.course?.name || "All courses", stats.attempted, stats.passed, `${stats.rate}%`]; }) },
      practical: { name: "Practical pass rate", header: ["Licence category", "Assessed", "Passed", "Failed", "Pass rate"], rows: () => [...new Set(practicalBookings.map((row) => examCategory(row)))].map((category) => { const rows = practicalBookings.filter((row) => examCategory(row) === category && ["passed", "failed"].includes(row.status)); return [category, rows.length, rows.filter((row) => row.status === "passed").length, rows.filter((row) => row.status === "failed").length, `${rows.length ? Math.round(rows.filter((row) => row.status === "passed").length / rows.length * 100) : 0}%`]; }) },
      students: { name: "Student exam performance", header: ["Student", "Admission no.", "Category", "Theory %", "Practical %", "Attendance %", "Readiness", "Status"], rows: () => readiness.map((row) => [row.student.full_name, row.student.student_number, row.category, row.theoryScore, row.practicalScore, row.attendance, row.readinessScore, row.ready ? "Ready" : row.upcoming.length ? "Registered" : "In preparation"]) },
      instructors: { name: "Instructor performance", header: ["Instructor", "Exams", "Passed", "Failed", "Pass rate"], rows: () => [...new Set(bookings.map((row) => row.instructor?.full_name).filter(Boolean))].map((name) => { const rows = bookings.filter((row) => row.instructor?.full_name === name && ["passed", "failed"].includes(row.status)); return [name, rows.length, rows.filter((row) => row.status === "passed").length, rows.filter((row) => row.status === "failed").length, `${rows.length ? Math.round(rows.filter((row) => row.status === "passed").length / rows.length * 100) : 0}%`]; }) },
      examiners: { name: "Examiner performance", header: ["Examiner", "Exams", "Passed", "Failed", "Pass rate"], rows: () => [...new Set(bookings.map((row) => row.examiner).filter(Boolean))].map((name) => { const rows = bookings.filter((row) => row.examiner === name && ["passed", "failed"].includes(row.status)); return [name, rows.length, rows.filter((row) => row.status === "passed").length, rows.filter((row) => row.status === "failed").length, `${rows.length ? Math.round(rows.filter((row) => row.status === "passed").length / rows.length * 100) : 0}%`]; }) },
      retakes: { name: "Retake analysis", header: ["Student", "Admission no.", "Test type", "Date", "Status", "Attempt", "Examiner"], rows: () => failedBookings.map((row) => [row.student?.full_name || "", row.student?.student_number || "", examKind(row.kind).label, shortDate(row.scheduled_on), examStatus(row.status).label, row.attempt_number || 1, row.examiner || ""]) },
      categories: { name: "Category performance", header: ["Licence category", "Exams", "Passed", "Failed", "Pass rate"], rows: () => [...new Set(bookings.map((row) => examCategory(row)).filter((value) => value !== "—"))].map((category) => { const rows = bookings.filter((row) => examCategory(row) === category && ["passed", "failed"].includes(row.status)); return [category, rows.length, rows.filter((row) => row.status === "passed").length, rows.filter((row) => row.status === "failed").length, `${rows.length ? Math.round(rows.filter((row) => row.status === "passed").length / rows.length * 100) : 0}%`]; }) },
      monthly: { name: "Monthly examination statistics", header: ["Month", "Scheduled", "Completed", "Passed", "Failed", "Absent"], rows: () => [...new Set(bookings.map((row) => String(row.scheduled_on || "").slice(0, 7)).filter(Boolean))].sort().map((key) => { const rows = bookings.filter((row) => String(row.scheduled_on || "").slice(0, 7) === key); return [key, rows.filter((row) => ["draft", "scheduled", "booked"].includes(row.status || "scheduled")).length, rows.filter((row) => ["passed", "failed"].includes(row.status)).length, rows.filter((row) => row.status === "passed").length, rows.filter((row) => row.status === "failed").length, rows.filter((row) => row.status === "absent").length]; }) },
    };
    const report = reports[kind];
    if (!report) return;
    try {
      await downloadExcelFromRows(`${report.name.replace(/\s+/g, "-")}-${monthKey}.xlsx`, report.name, [report.header, ...report.rows()]);
      notifySuccess(`${report.name} exported.`);
    } catch {
      notifyError("Could not export this report.");
    }
  }

  function registerLearner(row) {
    setDialog({ type: "booking", studentId: row.student.id, kind: "practical", licenceCategory: row.category });
  }

  function openResult(row) {
    if (row.kind === "practical") {
      if (!canConduct) return;
      setDialog({ type: "practical", booking: row });
      return;
    }
    if (!canResults) return;
    setDialog({ type: "result", booking: row });
  }

  function scheduleRetake(row) {
    setDialog({
      type: "booking",
      studentId: row.student.id,
      kind: row.latest?.kind || "practical",
      licenceCategory: row.category,
      notes: `Retake after ${examStatus(row.latest?.status).label.toLowerCase()} on ${shortDate(row.latest?.scheduled_on)}.`,
    });
  }

  const dayLabel = new Date(`${selectedDay}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });

  return (
    <div>
      <ScreenHeader
        title="Examinations"
        subtitle={`${new Date(`${monthKey}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })} · registrations, sessions, results and readiness. Internal school examinations are kept separate from official NTSA examinations.`}
      >
        <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={exportSchedule}>Export</button>
        {can("create") ? <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={() => setDialog({ type: "assessment-check" })}>Record assessment</button> : null}
        {canResults ? <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={() => setDialog({ type: "result-picker" })}>Record result</button> : null}
        {canSchedule ? <button type="button" className={primaryButtonClass} onClick={() => setDialog({ type: "booking" })}>Schedule exam</button> : null}
      </ScreenHeader>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {!canView ? <Card><Empty>You do not have permission to view examinations.</Empty></Card> : (
        <>
          <Toolbar>
            {showBranchSelect ? <BranchFilter value={branchFilter} onChange={setBranchFilter} branches={branches} show /> : null}
            <input
              type="month"
              className={`${inputClass} w-auto`}
              value={monthKey}
              onChange={(event) => {
                if (!event.target.value) return;
                setMonth(`${event.target.value}-01`);
                setSelectedDay(`${event.target.value}-01`);
              }}
              aria-label="Examination month"
            />
            <FilterSelect
              value={categoryFilter}
              placeholder="All licence categories"
              onChange={(event) => setCategoryFilter(event.target.value)}
              options={[{ value: "", label: "All licence categories" }, ...categoryOptions.map((value) => ({ value, label: `Category ${value}` }))]}
            />
          </Toolbar>

          {tab === "overview" ? (
            <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Total exams" value={monthBookings.length} hint={`${monthTheory.length} theory paper${monthTheory.length === 1 ? "" : "s"} configured`} icon="clipboard2-pulse" />
              <Stat label="Scheduled" value={scheduledCount} hint="Draft, scheduled and in progress" icon="calendar-event" tone="sky" />
              <Stat label="Pending assessments" value={pendingAssessments} hint="Practical exams awaiting a result" icon="hourglass-split" tone="amber" />
              <Stat label="Completed" value={completedCount} hint={`${passedCount} passed · ${failedCount} failed`} icon="check2-circle" tone="emerald" />
              <Stat label="Pass rate" value={`${passRate}%`} hint={`${passedCount} of ${completedCount} completed exams`} icon="graph-up-arrow" tone="emerald" />
              <Stat label="Failed" value={failedCount} hint={`${absentCount} absent`} icon="x-circle" tone="rose" />
              <Stat label="Retakes required" value={retakeCount} hint={`${retakes.filter((row) => !row.retakeScheduled).length} not yet rebooked`} icon="arrow-repeat" tone="violet" />
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap gap-2">
            {tabs.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`rounded-full border px-3 py-1.5 text-sm font-medium ${tab === item.value ? "border-[var(--theme-primary)] bg-[var(--theme-primary)] text-white" : "border-[var(--theme-border)] theme-subtext"}`}
                onClick={() => { setTab(item.value); if (item.value !== "theory") setSelectedExam(null); }}
              >
                {item.label}{item.count ? ` (${item.count})` : ""}
              </button>
            ))}
          </div>

          {tab === "overview" ? (
            <div className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                <ExamCalendar bookings={monthBookings} month={month} selectedDay={selectedDay} onSelectDay={setSelectedDay} onShift={(step) => { const next = shiftIsoMonth(month, step); setMonth(next); setSelectedDay(`${next.slice(0, 7)}-01`); }} />
                <Card>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h2 className="theme-heading font-semibold">{dayLabel}</h2>
                      <p className="theme-subtext mt-0.5 text-xs">{selectedDayBookings.length} session{selectedDayBookings.length === 1 ? "" : "s"} · theory, practical and mock</p>
                    </div>
                    {canSchedule ? <button type="button" className="theme-secondary-btn rounded-lg px-3 py-1.5 text-xs font-medium" onClick={() => setDialog({ type: "booking", scheduledOn: selectedDay })}>Add session</button> : null}
                  </div>
                  {selectedDayBookings.length === 0 ? (
                    <Empty>No examinations on this day.</Empty>
                  ) : (
                    <ul className="mt-2 divide-y divide-[var(--theme-border)]">
                      {selectedDayBookings.map((row) => (
                        <li key={row.id} className="py-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0">
                              <span className="theme-heading block text-sm font-medium">{row.scheduled_time || "Time TBC"} · {examKind(row.kind).short} · Category {examCategory(row)}</span>
                              <span className="theme-subtext block truncate text-xs">{row.student?.full_name || "Student"} · {row.location || "Location TBC"}{row.examiner ? ` · ${row.examiner}` : ""}</span>
                            </span>
                            <ExamStatusBadge value={row.status} />
                          </div>
                          {(row.kind === "practical" ? canConduct : canResults) && ["draft", "scheduled", "booked", "in_progress"].includes(row.status || "scheduled") ? (
                            <button type="button" className="theme-subtext mt-1 text-xs font-medium hover:underline" onClick={() => setDialog(row.kind === "practical" ? { type: "practical", booking: row } : { type: "result", booking: row })}>
                              {row.kind === "practical" ? "Conduct assessment" : "Record result"}
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="theme-heading font-semibold">Registration pipeline</h2>
                    <p className="theme-subtext mt-0.5 text-xs">Who can sit next, who is held back, and where results are still outstanding.</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {pipelineStages.map((stage) => (
                    <div key={stage.title} className="rounded-xl border border-[var(--theme-border)] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="theme-heading flex min-w-0 items-center gap-2 text-xs font-semibold">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${stage.dot}`} />
                          <span className="truncate">{stage.title}</span>
                        </p>
                        <span className="theme-subtext shrink-0 text-[11px] font-medium tabular-nums">{stage.rows.length}</span>
                      </div>
                      {stage.rows.length === 0 ? (
                        <p className="theme-subtext mt-2 text-xs">None</p>
                      ) : (
                        <ul className="mt-2 space-y-1.5">
                          {stage.rows.slice(0, 3).map((row) => (
                            <li key={row.id} className="flex items-center justify-between gap-2 text-xs">
                              <AppNavLink href={`/driving-school/students/${row.student?.id}`} title={row.student?.full_name || "Student"} className="theme-heading min-w-0 flex-1 truncate font-medium hover:underline">
                                {row.student?.full_name || "Student"}
                              </AppNavLink>
                              <span className="theme-subtext max-w-[55%] shrink-0 truncate text-right text-[11px]">{row.meta}</span>
                              {row.action ? (
                                <button type="button" className="theme-secondary-btn shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium" onClick={row.action}>{row.actionLabel}</button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                      {stage.rows.length > 3 ? (
                        <p className="theme-subtext mt-1.5 text-[11px]">+{stage.rows.length - 3} more</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          ) : null}

          {tab === "schedule" ? (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="theme-heading font-semibold">Exam schedule</h2>
                  <p className="theme-subtext mt-0.5 text-xs">Schedule, reschedule, cancel and notify learners. A cancelled or failed booking is kept; a retake always creates a new attempt.</p>
                </div>
                {canSchedule ? <button type="button" className={primaryButtonClass} onClick={() => setDialog({ type: "booking" })}>Schedule exam</button> : null}
              </div>
              <div className="mb-3 mt-3 flex flex-wrap gap-2">
                <SearchField value={bookingQuery} onChange={setBookingQuery} placeholder="Search reference, student, examiner" />
                <FilterSelect
                  value={bookingKind}
                  placeholder="All test types"
                  onChange={(event) => setBookingKind(event.target.value)}
                  options={[{ value: "", label: "All test types" }, ...EXAM_KINDS.map((kind) => ({ value: kind.value, label: kind.label }))]}
                />
                <FilterSelect
                  value={bookingStatus}
                  placeholder="All statuses"
                  onChange={(event) => setBookingStatus(event.target.value)}
                  options={[{ value: "", label: "All statuses" }, ...EXAM_STATUSES.map((status) => ({ value: status.value, label: status.label }))]}
                />
              </div>
              {!examsLoad.data && !examsLoad.error ? <p className="theme-subtext text-sm">Loading examinations…</p> : null}
              {examsLoad.data ? (
                <DataTable
                  empty={bookings.length ? "No examinations match these filters." : "No examinations scheduled yet."}
                  rows={visibleBookings}
                  columns={[
                    { key: "reference", label: "Reference", render: (row) => <span className="theme-heading text-xs font-semibold tabular-nums">{row.reference || `EXM-${String(row.id).padStart(6, "0")}`}</span> },
                    { key: "student", label: "Student", render: (row) => <PersonName name={row.student?.full_name || "Student"} detail={row.student?.student_number} /> },
                    { key: "kind", label: "Test type", render: (row) => <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${examKind(row.kind).tone}`}>{examKind(row.kind).label}</span> },
                    { key: "category", label: "Category", render: (row) => examCategory(row) },
                    { key: "instructor", label: "Instructor", render: (row) => row.instructor?.full_name || "—" },
                    { key: "examiner", label: "Examiner", render: (row) => row.examiner || "—" },
                    { key: "date", label: "Exam date", render: (row) => <span className="tabular-nums">{shortDate(row.scheduled_on)}</span> },
                    { key: "time", label: "Start", render: (row) => row.scheduled_time || "—" },
                    { key: "status", label: "Status", render: (row) => <ExamStatusBadge value={row.status} /> },
                    { key: "payment", label: "Payment", render: (row) => <ExamPaymentBadge row={row} /> },
                    { key: "attempt", label: "Attempt", render: (row) => `#${row.attempt_number || 1}` },
                    {
                      key: "actions",
                      label: "",
                      render: (row) => (
                        <div className="flex flex-wrap justify-end gap-1">
                          {(row.kind === "practical" ? canConduct : canResults) && !["passed", "failed", "cancelled"].includes(row.status) ? (
                            <button type="button" className="theme-secondary-btn rounded px-2 py-1 text-[11px] font-medium" onClick={() => setDialog(row.kind === "practical" ? { type: "practical", booking: row } : { type: "result", booking: row })}>
                              {row.kind === "practical" ? "Assess" : "Result"}
                            </button>
                          ) : null}
                          <button type="button" className="theme-secondary-btn rounded px-2 py-1 text-[11px] font-medium" onClick={() => setDialog({ type: "history", student: row.student })}>History</button>
                          {canSchedule && row.status !== "cancelled" && !["passed", "failed", "absent"].includes(row.status) ? (
                            <button type="button" className="theme-secondary-btn rounded px-2 py-1 text-[11px] font-medium" onClick={() => setDialog({ type: "booking-edit", booking: row })}>Reschedule</button>
                          ) : null}
                          {canNotify && row.status !== "cancelled" ? <button type="button" className="theme-secondary-btn rounded px-2 py-1 text-[11px] font-medium" onClick={() => notifyBooking(row)}>Notify</button> : null}
                          {canSchedule && !["passed", "failed", "cancelled", "absent"].includes(row.status) ? (
                            <button type="button" className="theme-secondary-btn rounded px-2 py-1 text-[11px] font-medium" onClick={() => cancelBooking(row)}>Cancel</button>
                          ) : null}
                        </div>
                      ),
                    },
                  ]}
                />
              ) : null}
            </Card>
          ) : null}

          {tab === "theory" && selectedExam ? (
            <TheoryExamResultsPanel
              exam={selectedExam}
              topicNames={topicNames}
              canManage={canResults}
              refreshKey={tick}
              onBack={() => setSelectedExam(null)}
              onMarkAttempt={() => setDialog({ type: "attempt", exam: selectedExam })}
              onReview={(attempt) => setDialog({ type: "result-detail", attemptId: attempt.id })}
            />
          ) : null}

          {tab === "theory" && !selectedExam ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="theme-subtext text-sm">Papers built from the question bank. Auto-marking scores each attempt against the answer key; learners can sit auto-marked papers in the distraction-free exam room.</p>
                {can("start") || canSchedule ? <button type="button" className={primaryButtonClass} onClick={() => setDialog({ type: "theory-exam" })}>New theory exam</button> : null}
              </div>
              {theoryLoad.error ? <p className="mb-3 text-sm text-red-600">{theoryLoad.error}</p> : null}
              {!theoryLoad.data && !theoryLoad.error ? <Card><p className="theme-subtext text-sm">Loading theory exams…</p></Card> : null}
              {theoryLoad.data && theoryExams.length === 0 ? (
                <Card><Empty>No theory exams yet. Create one from the question bank to test learners and track pass rates.</Empty></Card>
              ) : null}
              {theoryExams.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {theoryExams.map((exam) => {
                    const stats = theoryPassStats(exam);
                    const availability = [exam.available_from ? shortDate(exam.available_from) : null, exam.available_to ? shortDate(exam.available_to) : null].filter(Boolean);
                    return (
                      <Card key={exam.id} className="flex flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <span className="rounded-lg bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700">{theoryExamType(exam.type).label}</span>
                          <StatusBadge value={exam.is_active === false ? "inactive" : "active"} />
                        </div>
                        <button type="button" className="theme-heading mt-3 text-left text-base font-semibold hover:underline" onClick={() => setSelectedExam(exam)}>{exam.name}</button>
                        <p className="theme-subtext text-xs">{[exam.course?.name, `${Number(exam.questions_count) || 0} questions`, exam.duration_minutes ? `${exam.duration_minutes} min` : null].filter(Boolean).join(" · ")}</p>
                        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--theme-border)] pt-3 text-xs">
                          <span><strong className="theme-heading block text-sm tabular-nums">{stats.attempted}</strong><span className="theme-subtext">attempts</span></span>
                          <span><strong className="theme-heading block text-sm tabular-nums">{stats.passed}</strong><span className="theme-subtext">passed</span></span>
                          <span><strong className="theme-heading block text-sm tabular-nums">{Number(exam.pass_mark) || 0}%</strong><span className="theme-subtext">pass mark</span></span>
                        </div>
                        <div className="mt-3">
                          <div className="mb-1 flex items-center justify-between text-xs"><span className="theme-subtext">Pass rate</span><span className="theme-heading font-medium">{stats.rate}%</span></div>
                          <CompletionBar value={stats.rate} />
                        </div>
                        <p className="theme-subtext mt-2 text-xs capitalize">
                          {[availability.length ? `Available ${availability.join(" – ")}` : null, exam.attempt_limit ? `${exam.attempt_limit} attempt${exam.attempt_limit === 1 ? "" : "s"}` : "Unlimited attempts", exam.auto_mark === false ? "Marked manually" : "Auto-marked", exam.randomize_questions ? "Randomised questions" : null, exam.shuffle_answers ? "Shuffled answers" : null].filter(Boolean).join(" · ")}
                        </p>
                        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--theme-border)] pt-3">
                          <button type="button" className="theme-secondary-btn rounded-lg px-3 py-1.5 text-xs font-medium" onClick={() => setSelectedExam(exam)}>Results</button>
                          {canStart && exam.auto_mark !== false && Number(exam.questions_count) > 0 ? (
                            <button type="button" className="theme-secondary-btn rounded-lg px-3 py-1.5 text-xs font-medium" onClick={() => setDialog({ type: "runner-setup", exam })}>Start exam</button>
                          ) : null}
                          {canResults ? <button type="button" className="theme-secondary-btn rounded-lg px-3 py-1.5 text-xs font-medium" onClick={() => setDialog({ type: "attempt", exam })}>Mark attempt</button> : null}
                          {canSchedule ? <button type="button" className="theme-secondary-btn rounded-lg px-3 py-1.5 text-xs font-medium" onClick={() => setDialog({ type: "theory-exam", exam })}>Edit</button> : null}
                          {canSchedule ? <button type="button" className="theme-subtext px-1 text-xs font-medium hover:text-rose-600" onClick={() => deleteExam(exam)}>Delete</button> : null}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : null}
            </>
          ) : null}

          {tab === "practical" ? (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="theme-heading font-semibold">Practical examinations</h2>
                  <p className="theme-subtext mt-0.5 text-xs">Examiner assessments use the school&apos;s checklist template. Each skill is marked pass, needs improvement, fail or not assessed; critical safety errors fail the test automatically.</p>
                </div>
                {canSchedule ? <button type="button" className={primaryButtonClass} onClick={() => setDialog({ type: "booking", kind: "practical" })}>Schedule practical</button> : null}
              </div>
              <div className="mt-3">
                <DataTable
                  empty="No practical examinations yet. Schedule one to record an examiner assessment."
                  rows={practicalBookings}
                  columns={[
                    { key: "reference", label: "Reference", render: (row) => <span className="theme-heading text-xs font-semibold tabular-nums">{row.reference || `EXM-${String(row.id).padStart(6, "0")}`}</span> },
                    { key: "student", label: "Student", render: (row) => <PersonName name={row.student?.full_name || "Student"} detail={row.student?.student_number} /> },
                    { key: "category", label: "Category", render: (row) => examCategory(row) },
                    { key: "instructor", label: "Instructor", render: (row) => row.instructor?.full_name || "—" },
                    { key: "examiner", label: "Examiner", render: (row) => row.examiner || "—" },
                    { key: "date", label: "Date", render: (row) => shortDate(row.scheduled_on) },
                    { key: "skills", label: "Skills", render: (row) => { const items = practicalItems(row); return items.length ? `${items.filter((item) => item.result === "pass").length}/${items.length} passed` : "—"; } },
                    { key: "score", label: "Score", render: (row) => (row.score != null ? <span className="tabular-nums">{Number(row.score)}%</span> : "—") },
                    { key: "result", label: "Result", render: (row) => <ExamStatusBadge value={row.status} /> },
                    {
                      key: "actions",
                      label: "",
                      render: (row) => (canConduct ? (
                        <div className="flex flex-wrap justify-end gap-1">
                          {!["passed", "failed", "cancelled"].includes(row.status) ? <button type="button" className="theme-secondary-btn rounded px-2 py-1 text-[11px] font-medium" onClick={() => setDialog({ type: "practical", booking: row })}>Assess</button> : null}
                          <button type="button" className="theme-secondary-btn rounded px-2 py-1 text-[11px] font-medium" onClick={() => setDialog({ type: "result-detail", booking: row })}>View</button>
                          <button type="button" className="theme-secondary-btn rounded px-2 py-1 text-[11px] font-medium" onClick={() => setDialog({ type: "history", student: row.student })}>History</button>
                        </div>
                      ) : "—"),
                    },
                  ]}
                />
              </div>
            </Card>
          ) : null}

          {tab === "results" ? (
            <ExamResultsPanel
              bookings={bookings}
              courses={courses}
              canExport
              onOpenTheory={(attemptId) => setDialog({ type: "result-detail", attemptId })}
              onOpenPractical={(booking) => setDialog({ type: "result-detail", booking })}
            />
          ) : null}

          {tab === "readiness" ? (
            <div className="space-y-4">
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="theme-heading font-semibold">Examination readiness</h2>
                    <p className="theme-subtext mt-0.5 text-xs">Readiness scores theory, practical skills, attendance and mock exams. Register a learner only when the school&apos;s eligibility rules are met.</p>
                  </div>
                  <span className="theme-subtext text-xs">{readiness.filter((row) => row.ready).length} ready of {readiness.length}</span>
                </div>
                <div className="mt-3"><SearchField value={readinessQuery} onChange={setReadinessQuery} placeholder="Search learner, admission no. or category" /></div>
                <div className="mt-3">
                  <DataTable
                    empty="No active learners to assess."
                    rows={visibleReadiness}
                    columns={[
                      { key: "student", label: "Student", render: (row) => <AppNavLink href={`/driving-school/students/${row.student.id}`}><PersonName name={row.student.full_name} detail={row.student.student_number} /></AppNavLink> },
                      { key: "category", label: "Cat.", render: (row) => row.category },
                      { key: "theory", label: "Theory", render: (row) => <span className="tabular-nums">{row.theoryScore}%</span> },
                      { key: "skills", label: "Practical skills", render: (row) => <span className="tabular-nums">{row.practicalScore}%</span> },
                      { key: "attendance", label: "Attendance", render: (row) => <span className="tabular-nums">{row.attendance}%</span> },
                      { key: "mock", label: "Mock", render: (row) => <span className="tabular-nums">{row.mockScore}%</span> },
                      { key: "readiness", label: "Readiness", render: (row) => <div className="flex items-center gap-2"><span className="theme-heading w-8 text-xs font-semibold tabular-nums">{row.readinessScore}</span><span className="w-20"><CompletionBar value={row.readinessScore} /></span></div> },
                      {
                        key: "action",
                        label: "Action",
                        render: (row) => (row.upcoming.length
                          ? <StatusBadge value="scheduled" />
                          : row.ready && canSchedule
                            ? <button type="button" className="theme-secondary-btn rounded px-2 py-1 text-[11px] font-medium" onClick={() => registerLearner(row)}>Register</button>
                            : <span className="theme-subtext text-xs">{row.feeDue > 0 ? "Settle fees" : row.attendance < 80 ? "More lessons" : !row.theoryScore ? "Book mock" : "In preparation"}</span>),
                      },
                    ]}
                  />
                </div>
              </Card>
              <Card>
                <h2 className="theme-heading font-semibold">Examination reports</h2>
                <p className="theme-subtext mt-0.5 text-xs">Every report respects the current branch and licence-category filters.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["theory", "Theory pass rate"],
                    ["practical", "Practical pass rate"],
                    ["students", "Student performance"],
                    ["instructors", "Instructor performance"],
                    ["examiners", "Examiner performance"],
                    ["retakes", "Retake analysis"],
                    ["categories", "Category performance"],
                    ["monthly", "Monthly statistics"],
                  ].map(([key, label]) => (
                    <button key={key} type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-left text-xs font-medium" onClick={() => exportExamReport(key)}>
                      <i className="bi bi-filetype-xlsx mr-2" aria-hidden />{label}
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          ) : null}

          {tab === "retakes" ? (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="theme-heading font-semibold">Retakes</h2>
                  <p className="theme-subtext mt-0.5 text-xs">Failed, absent and retake-recommended learners are identified automatically. A retake creates a new attempt; previous attempts are never overwritten.</p>
                </div>
                <span className="theme-subtext text-xs">{retakes.filter((row) => !row.retakeScheduled).length} awaiting rebooking</span>
              </div>
              {retakes.length === 0 ? <Empty>No retakes required. Failed or absent results will appear here automatically.</Empty> : (
                <div className="mt-3 space-y-3">
                  {retakes.map((row) => (
                    <div key={row.student.id} className="rounded-xl border border-[var(--theme-border)] p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <AppNavLink href={`/driving-school/students/${row.student.id}`} className="theme-heading text-sm font-semibold hover:underline">{row.student.full_name}</AppNavLink>
                          <p className="theme-subtext text-xs">{row.student.student_number} · Category {row.category} · {row.failed.length} failed or absent exam{row.failed.length === 1 ? "" : "s"}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {row.retakeScheduled ? <StatusBadge value="scheduled" /> : (
                            <>
                              {canSchedule ? <button type="button" className="theme-secondary-btn rounded px-2 py-1 text-[11px] font-medium" onClick={() => scheduleRetake(row)}>Schedule retake</button> : null}
                              {canRetakes && canViewFees && row.latest ? <button type="button" className="theme-secondary-btn rounded px-2 py-1 text-[11px] font-medium" onClick={() => setDialog({ type: "retake-fee", booking: row.latest, settings })}>Raise retake fee</button> : null}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                        <div>
                          <p className="theme-subtext text-[11px] font-semibold uppercase">Latest attempt</p>
                          <p className="theme-heading mt-0.5">{row.latest ? `${examKind(row.latest.kind).label} · ${shortDate(row.latest.scheduled_on)} · ${examStatus(row.latest.status).label}` : "—"}</p>
                          <p className="theme-subtext">Attempt #{row.latest?.attempt_number || 1}{row.latest?.retake_recommended ? " · retake recommended" : ""}</p>
                        </div>
                        <div>
                          <p className="theme-subtext text-[11px] font-semibold uppercase">Training recommendation</p>
                          <p className="theme-heading mt-0.5 line-clamp-2">{row.latest?.recommendations || (row.attendance < 80 ? "Complete more practical lessons before the retake." : "Book a mock assessment before the retake.")}</p>
                        </div>
                        <div>
                          <p className="theme-subtext text-[11px] font-semibold uppercase">Exam history</p>
                          <ul className="mt-0.5 space-y-0.5">
                            {row.history.slice(0, 3).map((item) => (
                              <li key={item.id} className="theme-subtext">{shortDate(item.scheduled_on)} · {examKind(item.kind).short} · {examStatus(item.status).label} · #{item.attempt_number || 1}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ) : null}

          {tab === "questions" ? (
            <QuestionBankPanel
              questions={questions}
              courses={courses}
              settings={settings}
              loading={questionsLoad.data == null && !questionsLoad.error}
              error={questionsLoad.error}
              canEdit={canBank}
              onAdd={() => setDialog({ type: "question" })}
              onBulk={() => setDialog({ type: "question-import" })}
              onEdit={(row) => setDialog({ type: "question-edit", question: row })}
              onDelete={deleteQuestion}
              onChanged={refresh}
            />
          ) : null}

          {tab === "settings" ? (
            <ExamSettingsPanel settings={settings} canEdit={canSettings} loading={settingsLoad.data == null && !settingsLoad.error} error={settingsLoad.error} onSaved={refresh} />
          ) : null}
        </>
      )}

      {dialog?.type === "booking" || dialog?.type === "booking-edit" ? (
        <ExamBookingDialog
          booking={dialog.booking || null}
          students={students}
          instructors={instructors}
          settings={settings}
          readinessByStudent={readinessByStudent}
          initialStudentId={dialog.studentId}
          initialKind={dialog.kind}
          initialCategory={dialog.licenceCategory}
          initialDate={dialog.scheduledOn}
          initialNotes={dialog.notes}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); refresh(); }}
        />
      ) : null}
      {dialog?.type === "result" ? (
        <ExamResultDialog
          booking={dialog.booking}
          settings={settings}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); refresh(); }}
        />
      ) : null}
      {dialog?.type === "assessment-check" ? (
        <AssessmentCheckDialog
          students={studentsLoad.data}
          branches={branches}
          showBranchSelect={showBranchSelect}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); refresh(); }}
        />
      ) : null}
      {dialog?.type === "result-picker" ? (
        <ExamResultPickerDialog
          bookings={bookings}
          onClose={() => setDialog(null)}
          onPick={(booking) => setDialog(booking.kind === "practical" ? { type: "practical", booking } : { type: "result", booking })}
        />
      ) : null}
      {dialog?.type === "practical" ? (
        <PracticalAssessmentDialog
          booking={dialog.booking}
          settings={settings}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); refresh(); }}
        />
      ) : null}
      {dialog?.type === "history" ? (
        <ExamHistoryDialog student={dialog.student} bookings={bookings} onClose={() => setDialog(null)} onResult={(row) => setDialog({ type: "result-detail", booking: row })} />
      ) : null}
      {dialog?.type === "retake-fee" ? (
        <ExamRetakeFeeDialog booking={dialog.booking} settings={dialog.settings} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); refresh(); }} />
      ) : null}
      {dialog?.type === "result-detail" ? (
        <ExamResultDetailDialog attemptId={dialog.attemptId} booking={dialog.booking} settings={settings} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.type === "theory-exam" ? (
        <TheoryExamDialog
          exam={dialog.exam || null}
          courses={courses}
          questions={questions}
          settings={settings}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); refresh(); }}
        />
      ) : null}
      {dialog?.type === "attempt" ? (
        <TheoryAttemptDialog
          exam={dialog.exam}
          students={students}
          settings={settings}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); refresh(); }}
        />
      ) : null}
      {dialog?.type === "runner-setup" ? (
        <ExamRunnerSetupDialog
          exam={dialog.exam}
          students={students}
          onClose={() => setDialog(null)}
          onStart={({ student, enrolment, override }) => { setDialog(null); setRunner({ exam: dialog.exam, student, enrolment, override }); }}
        />
      ) : null}
      {dialog?.type === "question" || dialog?.type === "question-edit" ? (
        <QuestionDialog
          question={dialog.type === "question-edit" ? dialog.question : null}
          courses={courses}
          settings={settings}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); refresh(); }}
        />
      ) : null}
      {dialog?.type === "question-import" ? (
        <QuestionImportDialog courses={courses} settings={settings} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); refresh(); }} />
      ) : null}
      {runner ? (
        <ExamRunner
          exam={runner.exam}
          student={runner.student}
          enrolment={runner.enrolment}
          override={Boolean(runner.override)}
          onClose={() => setRunner(null)}
          onSubmitted={() => { setRunner(null); refresh(); }}
        />
      ) : null}
    </div>
  );
}

function ExamBookingDialog({ booking = null, students, instructors = [], settings, readinessByStudent, initialStudentId, initialKind, initialCategory, initialDate, initialNotes, onClose, onSaved }) {
  const editing = Boolean(booking);
  const [form, setForm] = useState(() => ({
    student_id: booking?.student_id ? String(booking.student_id) : initialStudentId ? String(initialStudentId) : "",
    kind: booking?.kind || initialKind || "practical",
    instructor_id: booking?.instructor_id ? String(booking.instructor_id) : "",
    licence_category: booking?.licence_category || initialCategory || "",
    examiner: booking?.examiner || "",
    scheduled_on: booking?.scheduled_on ? String(booking.scheduled_on).slice(0, 10) : initialDate || todayDate(),
    scheduled_time: booking?.scheduled_time ? String(booking.scheduled_time).slice(0, 5) : "",
    location: booking?.location || "",
    notes: booking?.notes || initialNotes || "",
    status: booking?.status === "draft" ? "draft" : "scheduled",
    notify: false,
    override: false,
    override_reason: "",
  }));
  const [busy, setBusy] = useState(false);
  const studentId = form.student_id;
  const selectedStudent = students.find((row) => String(row.id) === String(studentId)) || null;
  const selectedReadiness = readinessByStudent?.get(Number(studentId)) || null;
  const feeKind = editing ? booking.kind : form.kind;
  const examFee = feeKind === "practical"
    ? Number(settings?.practical_fee) || 0
    : feeKind === "mock" ? Number(settings?.mock_fee) || 0 : Number(settings?.theory_fee) || 0;
  const feeDeferred = editing ? booking.status === "draft" : form.status === "draft";

  useEffect(() => {
    if (!selectedReadiness) return;
    setForm((current) => (current.licence_category ? current : { ...current, licence_category: selectedReadiness.category === "—" ? "" : selectedReadiness.category }));
  }, [selectedReadiness]);

  const eligibilityRules = settings?.eligibility || DEFAULT_EXAM_SETTINGS.eligibility;
  const eligibility = useMemo(() => {
    if (!selectedReadiness) return [];
    const student = selectedReadiness.student;
    return [
      { key: "enrolment", label: "Active course enrolment", enabled: eligibilityRules.enrolment, passed: Boolean(selectedReadiness.enrolment), detail: selectedReadiness.enrolment?.course?.name || "No active enrolment" },
      { key: "theory_progress", label: "Theory progress", enabled: eligibilityRules.theory_progress, passed: selectedReadiness.theoryPassed, detail: `${selectedReadiness.theoryScore}% theory checks` },
      { key: "practical_progress", label: "Practical progress", enabled: eligibilityRules.practical_progress, passed: selectedReadiness.practicalPassed, detail: `${selectedReadiness.practicalScore}% practical` },
      { key: "attendance", label: "Attendance requirement", enabled: eligibilityRules.attendance, passed: selectedReadiness.attendance >= 80, detail: `${selectedReadiness.attendance}% lessons completed` },
      { key: "fees", label: "Outstanding fees", enabled: eligibilityRules.fees, passed: !selectedReadiness.feeDue, detail: selectedReadiness.feeDue ? `KSh ${Number(selectedReadiness.feeDue).toLocaleString("en-KE")} outstanding` : "No balance" },
      { key: "documents", label: "Required documents", enabled: eligibilityRules.documents, passed: selectedReadiness.permitOk, detail: selectedReadiness.permitOk ? "Learner permit valid" : "Permit expired" },
    ].filter((row) => row.enabled);
  }, [selectedReadiness, eligibilityRules]);
  const failedChecks = eligibility.filter((row) => !row.passed);

  async function submit(event) {
    event.preventDefault();
    if (!editing && !form.student_id) {
      notifyError("Choose the learner sitting this examination.");
      return;
    }
    if (failedChecks.length > 0 && !form.override_reason.trim()) {
      notifyError("Record the authorisation reason for registering this learner.");
      return;
    }
    setBusy(true);
    try {
      const body = {
        scheduled_on: form.scheduled_on,
        scheduled_time: form.scheduled_time || null,
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
        examiner: form.examiner.trim() || null,
        licence_category: form.licence_category || null,
        instructor_id: form.instructor_id ? Number(form.instructor_id) : null,
      };
      if (!editing) {
        const res = await drivingSend("/exams", "POST", {
          ...body,
          student_id: Number(form.student_id),
          kind: form.kind,
          status: form.status,
          eligibility: eligibility.map((row) => ({ key: row.key, label: row.label, passed: row.passed, detail: row.detail })),
          override_reason: form.override_reason.trim() || null,
        });
        const created = res?.data;
        if (form.notify && created?.id) {
          await drivingSend(`/exams/${created.id}`, "PATCH", { notify: true });
        }
        notifySuccess(res.message || "Examination scheduled.");
      } else {
        await drivingSend(`/exams/${booking.id}`, "PATCH", {
          ...body,
          notify: form.notify,
        });
        notifySuccess("Examination updated.");
      }
      onSaved();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save this examination.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Editor open title={editing ? "Reschedule examination" : form.status === "draft" ? "Save examination draft" : "Schedule examination"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        {form.notify && !editing ? <p className="theme-subtext text-xs">The learner will be added to the notification queue after saving.</p> : null}
        {editing ? (
          <div className="rounded-xl border border-[var(--theme-border)] px-3 py-2 text-sm">
            <p className="theme-heading font-medium">{booking.student?.full_name || "Learner"} · {examKind(booking.kind).label}</p>
            <p className="theme-subtext text-xs">{booking.reference || `EXM-${booking.id}`} · Attempt #{booking.attempt_number || 1}. Rescheduling does not create a new attempt.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Learner">
              <DrivingSelect
                required
                value={form.student_id}
                placeholder="Choose a learner"
                onChange={(event) => setForm({ ...form, student_id: event.target.value, licence_category: "" })}
                options={[{ value: "", label: "Choose a learner" }, ...students.map((student) => ({ value: String(student.id), label: `${student.full_name} · ${student.student_number}` }))]}
              />
            </Field>
            <Field label="Test type">
              <DrivingSelect
                value={form.kind}
                onChange={(event) => setForm({ ...form, kind: event.target.value })}
                options={EXAM_KINDS.map((kind) => ({ value: kind.value, label: kind.label }))}
              />
            </Field>
            <Field label="Licence category">
              <DrivingSelect
                value={form.licence_category}
                placeholder="Choose a category"
                onChange={(event) => setForm({ ...form, licence_category: event.target.value })}
                options={[{ value: "", label: "Not specified" }, ...LICENCE_CATEGORIES.map((value) => ({ value, label: `Category ${value}` }))]}
              />
            </Field>
            <Field label="Instructor (optional)">
              <DrivingSelect
                value={form.instructor_id}
                placeholder="No instructor"
                onChange={(event) => setForm({ ...form, instructor_id: event.target.value })}
                options={[{ value: "", label: "No instructor" }, ...instructors.map((instructor) => ({ value: String(instructor.id), label: instructor.full_name }))]}
              />
            </Field>
          </div>
        )}
        {editing ? (
          <p className="theme-subtext text-xs">
            {Number(booking.fee_amount) > 0
              ? `Fee KSh ${Number(booking.fee_amount).toLocaleString()} — ${booking.payment_status === "paid" ? "paid" : "outstanding on the learner invoices"}.`
              : examFee > 0 ? `Draft — KSh ${examFee.toLocaleString()} is invoiced once this exam is scheduled.` : "No fee is charged for this examination."}
          </p>
        ) : examFee > 0 ? (
          <p className="theme-subtext text-xs">
            {examKind(feeKind).label} fee: KSh {examFee.toLocaleString()}.
            {feeDeferred ? " Saved as a draft, so the learner is invoiced only once it is scheduled." : " Invoiced to the learner when this exam is scheduled."}
          </p>
        ) : (
          <p className="theme-subtext text-xs">{examKind(feeKind).label} is free — no invoice is raised for this attempt.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date">
            <input className={inputClass} required type="date" min={editing ? undefined : todayDate()} value={form.scheduled_on} onChange={(event) => setForm({ ...form, scheduled_on: event.target.value })} />
          </Field>
          <Field label="Start time">
            <input className={inputClass} type="time" value={form.scheduled_time} onChange={(event) => setForm({ ...form, scheduled_time: event.target.value })} />
          </Field>
          <Field label="Examiner (optional)">
            <input className={inputClass} value={form.examiner} onChange={(event) => setForm({ ...form, examiner: event.target.value })} placeholder="Officer or examiner" />
          </Field>
        </div>
        <Field label="Location">
          <input className={inputClass} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} placeholder="Test centre, circuit or school room" />
        </Field>
        <Field label="Notes">
          <textarea className={`${inputClass} h-20 resize-y py-2`} maxLength={500} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Optional notes for the examination" />
        </Field>

        {!editing && selectedReadiness ? (
          <div className="rounded-xl border border-[var(--theme-border)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="theme-heading text-sm font-semibold">Eligibility check</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${failedChecks.length ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
                {failedChecks.length ? `${failedChecks.length} requirement${failedChecks.length === 1 ? "" : "s"} unmet` : "All checks passed"}
              </span>
            </div>
            {eligibility.length === 0 ? (
              <p className="theme-subtext mt-1 text-xs">No eligibility checks are enabled in Examination settings.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {eligibility.map((row) => (
                  <li key={row.key} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5">
                      <i className={`bi ${row.passed ? "bi-check-circle text-emerald-600" : "bi-exclamation-circle text-amber-600"}`} aria-hidden />
                      <span className="theme-heading font-medium">{row.label}</span>
                    </span>
                    <span className="theme-subtext truncate">{row.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            {failedChecks.length > 0 ? (
              <Field label="Authorisation reason (required)">
                <textarea className={`${inputClass} mt-1 h-16 resize-y py-2`} maxLength={500} value={form.override_reason} onChange={(event) => setForm({ ...form, override_reason: event.target.value })} placeholder="Who authorised this registration and why?" />
              </Field>
            ) : null}
          </div>
        ) : null}

        {!editing ? (
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.status === "scheduled"} onChange={(event) => setForm({ ...form, status: event.target.checked ? "scheduled" : "draft" })} />
              Publish as scheduled
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.notify} onChange={(event) => setForm({ ...form, notify: event.target.checked })} />
              Notify the learner
            </label>
          </div>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.notify} onChange={(event) => setForm({ ...form, notify: event.target.checked })} />
            Notify the learner about the change
          </label>
        )}

        <div className="flex justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
          <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryButtonClass} disabled={busy}>
            {busy ? "Saving…" : editing ? "Save changes" : form.status === "draft" ? "Save draft" : "Schedule examination"}
          </button>
        </div>
      </form>
    </Editor>
  );
}

function ExamResultDialog({ booking, settings, onClose, onSaved }) {
  const confirm = useConfirm();
  const [form, setForm] = useState({
    status: ["passed", "failed", "absent"].includes(booking.status) ? booking.status : "passed",
    score: booking.score != null ? String(booking.score) : "",
    examiner: booking.examiner || "",
    notes: booking.notes || "",
    retake_recommended: Boolean(booking.retake_recommended),
    notify: false,
  });
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (form.status === "passed" && form.score !== "" && Number(form.score) < Number(settings?.pass_mark || 0)) {
      const ok = await confirm({
        title: "Pass mark mismatch",
        message: `This learner scored ${form.score}% which is below the school pass mark of ${settings.pass_mark}%. Record the result as passed anyway?`,
        confirmLabel: "Record passed",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await drivingSend(`/exams/${booking.id}`, "PATCH", {
        status: form.status,
        score: form.score === "" ? null : Number(form.score),
        examiner: form.examiner.trim() || null,
        notes: form.notes.trim() || null,
        retake_recommended: form.status === "passed" ? false : form.retake_recommended,
        notify: form.notify,
      });
      notifySuccess(`Examination recorded as ${examStatus(form.status).label.toLowerCase()}.`);
      onSaved();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not record this result.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Editor open title="Record examination result" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="rounded-xl border border-[var(--theme-border)] px-3 py-2 text-sm">
          <p className="theme-heading font-medium">{booking.student?.full_name || "Learner"} · {examKind(booking.kind).label}</p>
          <p className="theme-subtext text-xs">{booking.reference || `EXM-${booking.id}`} · {shortDate(booking.scheduled_on)} · Attempt #{booking.attempt_number || 1}</p>
          <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">Internal school result. It does not represent an official NTSA result or certificate.</p>
        </div>
        {booking.kind === "practical" ? (
          <p className="theme-subtext text-xs">For a full practical assessment with the skills checklist and critical safety errors, use <strong>Conduct assessment</strong> instead of this quick result form.</p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Outcome">
            <DrivingSelect
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
              options={[
                { value: "passed", label: "Passed" },
                { value: "failed", label: "Failed" },
                { value: "absent", label: "Absent" },
                { value: "cancelled", label: "Cancelled" },
              ]}
            />
          </Field>
          <Field label="Score (%)">
            <input className={inputClass} type="number" min="0" max="100" value={form.score} onChange={(event) => setForm({ ...form, score: event.target.value })} placeholder={booking.kind === "theory" ? "Theory percentage" : "Practical percentage"} />
          </Field>
        </div>
        <Field label="Examiner">
          <input className={inputClass} value={form.examiner} onChange={(event) => setForm({ ...form, examiner: event.target.value })} placeholder="Officer or examiner who signed off" />
        </Field>
        <Field label="Examiner remarks">
          <textarea className={`${inputClass} h-20 resize-y py-2`} maxLength={500} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Anything worth remembering about this attempt" />
        </Field>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {form.status !== "passed" ? (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.retake_recommended} onChange={(event) => setForm({ ...form, retake_recommended: event.target.checked })} />
              Recommend a retake
            </label>
          ) : null}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.notify} onChange={(event) => setForm({ ...form, notify: event.target.checked })} />
            Notify the learner
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
          <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryButtonClass} disabled={busy}>{busy ? "Saving…" : "Save result"}</button>
        </div>
      </form>
    </Editor>
  );
}

function ExamResultPickerDialog({ bookings, onClose, onPick }) {
  const [query, setQuery] = useState("");
  const pending = bookings
    .filter((row) => !["passed", "failed", "cancelled"].includes(row.status))
    .filter((row) => {
      const needle = query.trim().toLowerCase();
      if (!needle) return true;
      return [row.reference, row.student?.full_name, row.student?.student_number].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
    })
    .sort((a, b) => String(a.scheduled_on || "").localeCompare(String(b.scheduled_on || "")));

  return (
    <Editor open title="Record a result" onClose={onClose} wide>
      <div className="space-y-3">
        <p className="theme-subtext text-sm">Choose the examination whose result you want to record. Only examinations without a final result are listed.</p>
        <SearchField value={query} onChange={setQuery} placeholder="Search reference or learner" />
        <div className="max-h-[55vh] overflow-y-auto">
          <DataTable
            empty="No examinations are awaiting a result."
            rows={pending}
            columns={[
              { key: "student", label: "Student", render: (row) => <PersonName name={row.student?.full_name || "Student"} detail={row.student?.student_number} /> },
              { key: "kind", label: "Type", render: (row) => examKind(row.kind).label },
              { key: "date", label: "Date", render: (row) => shortDate(row.scheduled_on) },
              { key: "status", label: "Status", render: (row) => <ExamStatusBadge value={row.status} /> },
              { key: "actions", label: "", render: (row) => <button type="button" className="theme-secondary-btn rounded px-2 py-1 text-[11px] font-medium" onClick={() => onPick(row)}>Open</button> },
            ]}
          />
        </div>
      </div>
    </Editor>
  );
}

function ExamHistoryDialog({ student, bookings, onClose, onResult }) {
  const history = examHistoryRows(bookings, student?.id);
  return (
    <Editor open title={`${student?.full_name || "Learner"} · exam history`} onClose={onClose} wide>
      <p className="theme-subtext mb-3 text-sm">{student?.student_number} · every attempt is retained. Results cannot be overwritten.</p>
      <DataTable
        empty="No examinations recorded for this learner yet."
        rows={history}
        columns={[
          { key: "reference", label: "Reference", render: (row) => <span className="text-xs font-semibold tabular-nums">{row.reference || `EXM-${row.id}`}</span> },
          { key: "kind", label: "Exam", render: (row) => examKind(row.kind).label },
          { key: "date", label: "Date", render: (row) => shortDate(row.scheduled_on) },
          { key: "attempt", label: "Attempt", render: (row) => `#${row.attempt_number || 1}` },
          { key: "score", label: "Score", render: (row) => (row.score != null ? `${Number(row.score)}%` : "—") },
          { key: "result", label: "Result", render: (row) => <ExamStatusBadge value={row.status} /> },
          { key: "examiner", label: "Examiner", render: (row) => row.examiner || "—" },
          { key: "actions", label: "", render: (row) => (["passed", "failed", "absent"].includes(row.status) ? <button type="button" className="theme-secondary-btn rounded px-2 py-1 text-[11px] font-medium" onClick={() => onResult(row)}>View</button> : "—") },
        ]}
      />
    </Editor>
  );
}

function ExamRetakeFeeDialog({ booking, settings, onClose, onSaved }) {
  const [amount, setAmount] = useState(settings?.retake_fee ? String(settings.retake_fee) : "");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const res = await drivingSend(`/exams/${booking.id}/retake-fee`, "POST", { amount: Number(amount) || undefined });
      notifySuccess(res.message || "Retake fee added to the learner's invoices.");
      onSaved();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not raise the retake fee.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Editor open title="Raise retake fee" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="theme-subtext text-sm">
          {booking.student?.full_name || "Learner"} · {examKind(booking.kind).label} · Attempt #{booking.attempt_number || 1}. The fee is added as a new invoice in Fees &amp; Payments.
        </p>
        <Field label="Retake fee (KSh)">
          <input className={inputClass} type="number" min="1" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        {!settings?.retake_fee ? <p className="theme-subtext text-xs">Tip: set a default retake fee in Exam settings.</p> : null}
        <div className="flex justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
          <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryButtonClass} disabled={busy}>{busy ? "Adding…" : "Add invoice"}</button>
        </div>
      </form>
    </Editor>
  );
}

function PracticalAssessmentDialog({ booking, settings, onClose, onSaved }) {
  const confirm = useConfirm();
  const vehiclesLoad = useLoad(() => fetchDrivingVehiclesCached().then((rows) => ({ data: rows })), "practical-assessment-vehicles");
  const vehicles = rowsOf(vehiclesLoad.data);
  const template = settings?.practical_template?.length ? settings.practical_template : DEFAULT_PRACTICAL_TEMPLATE;
  const existingItems = practicalItems(booking);
  const existingMeta = practicalMeta(booking);
  const [items, setItems] = useState(() => template.map((skill) => ({
    skill,
    result: existingItems.find((item) => item.skill === skill)?.result || "not_assessed",
  })));
  const [form, setForm] = useState({
    examiner: booking.examiner || "",
    vehicle_id: existingMeta.vehicle_id ? String(existingMeta.vehicle_id) : "",
    assessed_on: existingMeta.assessed_on || todayDate(),
    critical_errors: Array.isArray(existingMeta.critical_errors) ? existingMeta.critical_errors.join("\n") : "",
    score: booking.score != null ? String(booking.score) : "",
    recommendations: booking.recommendations || "",
    retake_recommended: Boolean(booking.retake_recommended),
    notify: false,
  });
  const [scoreTouched, setScoreTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const assessed = items.filter((item) => item.result !== "not_assessed");
  const autoScore = assessed.length > 0 ? Math.round((items.filter((item) => item.result === "pass").length / assessed.length) * 100) : 0;
  const criticalErrors = form.critical_errors.split("\n").map((value) => value.trim()).filter(Boolean);
  const hasFail = items.some((item) => item.result === "fail");
  const outcome = criticalErrors.length > 0 || hasFail ? "failed" : "passed";
  const score = scoreTouched && form.score !== "" ? Number(form.score) : autoScore;
  const selectedVehicle = vehicles.find((vehicle) => String(vehicle.id) === String(form.vehicle_id)) || null;

  function setResult(skill, result) {
    setItems((current) => current.map((item) => (item.skill === skill ? { ...item, result } : item)));
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.examiner.trim()) {
      notifyError("Record the examiner who conducted this assessment.");
      return;
    }
    if (assessed.length === 0) {
      notifyError("Mark at least one skill before saving the assessment.");
      return;
    }
    const ok = await confirm({
      title: "Save practical assessment?",
      message: `Record this practical examination as ${examStatus(outcome).label.toLowerCase()} at ${score}%. Previous attempts are kept and a new attempt is numbered separately.`,
      confirmLabel: "Save assessment",
      destructive: outcome === "failed",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await drivingSend(`/exams/${booking.id}`, "PATCH", {
        status: outcome,
        score,
        examiner: form.examiner.trim(),
        recommendations: form.recommendations.trim() || null,
        retake_recommended: outcome === "passed" ? false : form.retake_recommended,
        notify: form.notify,
        practical: {
          template,
          items,
          critical_errors: criticalErrors,
          assessed_on: form.assessed_on,
          vehicle_id: selectedVehicle?.id || null,
          vehicle_label: selectedVehicle ? `${selectedVehicle.registration_number || selectedVehicle.plate_number || ""} ${selectedVehicle.make_model || selectedVehicle.model || ""}`.trim() : null,
        },
      });
      notifySuccess("Practical assessment saved.");
      onSaved();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save this practical assessment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Editor open title="Practical examination assessment" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="rounded-xl border border-[var(--theme-border)] px-3 py-2 text-sm">
          <p className="theme-heading font-medium">{booking.student?.full_name || "Learner"} · Category {examCategory(booking)}</p>
          <p className="theme-subtext text-xs">{booking.reference || `EXM-${booking.id}`} · {shortDate(booking.scheduled_on)} · Attempt #{booking.attempt_number || 1}{booking.instructor?.full_name ? ` · ${booking.instructor.full_name}` : ""}</p>
          <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">This is an internal school assessment, not an official NTSA examination result.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Examiner">
            <input className={inputClass} required value={form.examiner} onChange={(event) => setForm({ ...form, examiner: event.target.value })} placeholder="Examiner name" />
          </Field>
          <Field label="Assessment date">
            <input className={inputClass} type="date" value={form.assessed_on} onChange={(event) => setForm({ ...form, assessed_on: event.target.value })} />
          </Field>
          <Field label="Vehicle used">
            <DrivingSelect
              value={form.vehicle_id}
              placeholder="Not recorded"
              onChange={(event) => setForm({ ...form, vehicle_id: event.target.value })}
              options={[{ value: "", label: "Not recorded" }, ...vehicles.map((vehicle) => ({ value: String(vehicle.id), label: [vehicle.registration_number || vehicle.plate_number, vehicle.make_model || vehicle.model].filter(Boolean).join(" · ") || `Vehicle ${vehicle.id}` }))]}
            />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="theme-heading text-sm font-semibold">Driving skills checklist</p>
            <span className="theme-subtext text-xs">{assessed.length} of {items.length} assessed · score {score}%</span>
          </div>
          <ul className="divide-y divide-[var(--theme-border)] rounded-xl border border-[var(--theme-border)] px-3">
            {items.map((item) => (
              <li key={item.skill} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="theme-heading min-w-0 text-sm">{item.skill}</span>
                <div className="flex flex-wrap gap-1">
                  {PRACTICAL_RESULTS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${item.result === option.value ? option.tone : "theme-subtext border-[var(--theme-border)]"}`}
                      onClick={() => setResult(item.skill, option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <Field label="Critical safety errors (one per line)">
          <textarea className={`${inputClass} h-20 resize-y py-2`} value={form.critical_errors} onChange={(event) => setForm({ ...form, critical_errors: event.target.value })} placeholder={"Dangerous overtake\nFailed to give way at a junction"} />
        </Field>
        {criticalErrors.length > 0 ? <p className="text-xs font-medium text-rose-600">A critical safety error automatically fails this assessment.</p> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Overall score (%)">
            <input
              className={inputClass}
              type="number"
              min="0"
              max="100"
              value={scoreTouched ? form.score : String(autoScore)}
              onChange={(event) => { setScoreTouched(true); setForm({ ...form, score: event.target.value }); }}
            />
          </Field>
          <div className="rounded-xl border border-[var(--theme-border)] px-3 py-2 text-sm">
            <p className="theme-subtext text-xs">Overall result</p>
            <p className={`theme-heading mt-0.5 font-semibold ${outcome === "passed" ? "text-emerald-700" : "text-rose-700"}`}>{examStatus(outcome).label}</p>
            <p className="theme-subtext text-[11px]">Derived from the checklist and critical errors.</p>
          </div>
        </div>

        <Field label="Examiner comments and recommendations">
          <textarea className={`${inputClass} h-20 resize-y py-2`} maxLength={5000} value={form.recommendations} onChange={(event) => setForm({ ...form, recommendations: event.target.value })} placeholder="What should the learner practise before a retake?" />
        </Field>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {outcome !== "passed" ? (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.retake_recommended} onChange={(event) => setForm({ ...form, retake_recommended: event.target.checked })} />
              Recommend a retake
            </label>
          ) : null}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.notify} onChange={(event) => setForm({ ...form, notify: event.target.checked })} />
            Notify the learner
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
          <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryButtonClass} disabled={busy}>{busy ? "Saving…" : "Save assessment"}</button>
        </div>
      </form>
    </Editor>
  );
}

function ExamRunnerSetupDialog({ exam, students, onClose, onStart }) {
  const [studentId, setStudentId] = useState("");
  const [override, setOverride] = useState(false);
  const selectedStudent = students.find((row) => String(row.id) === String(studentId)) || null;
  const enrolment = selectedStudent
    ? (selectedStudent.enrolments || []).find((row) => row.status === "active" && (!exam.course_id || Number(row.course_id) === Number(exam.course_id)))
      || (selectedStudent.enrolments || []).find((row) => row.status === "active")
      || null
    : null;

  return (
    <Editor open title={`Start ${exam.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="theme-subtext text-sm">
          {theoryExamType(exam.type).label} · {Number(exam.questions_count) || 0} questions · {exam.duration_minutes ? `${exam.duration_minutes} minutes` : "no time limit"} · {Number(exam.pass_mark) || 0}% to pass.
        </p>
        <Field label="Learner sitting this paper">
          <DrivingSelect
            value={studentId}
            placeholder="Choose a learner"
            onChange={(event) => setStudentId(event.target.value)}
            options={[{ value: "", label: "Choose a learner" }, ...students.map((student) => ({ value: String(student.id), label: `${student.full_name} · ${student.student_number}` }))]}
          />
        </Field>
        {selectedStudent ? (
          <p className="theme-subtext text-xs">
            {enrolment ? `Answers are linked to ${enrolment.course?.name || "the learner's enrolment"}; wrong answers flag revision topics.` : "This learner has no active enrolment; revision topics will not be flagged."}
          </p>
        ) : null}
        <div className="rounded-xl border border-[var(--theme-border)] p-3 text-xs">
          <p className="theme-heading font-semibold">Exam room rules</p>
          <ul className="theme-subtext mt-1 list-disc space-y-0.5 pl-4">
            <li>The paper opens in a distraction-free full-screen workspace.</li>
            <li>Answers save automatically on this device until submission.</li>
            <li>The timer submits automatically when time runs out.</li>
            <li>Only an authorised supervisor can pause the timer.</li>
          </ul>
        </div>
        {Number(exam.attempt_limit) > 0 ? (
          <label className="flex items-start gap-2 text-sm">
            <input className="mt-1" type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} />
            <span>
              <span className="theme-heading block font-medium">Authorise an extra attempt</span>
              <span className="theme-subtext block text-xs">Only tick when a supervisor allows this learner to exceed the {exam.attempt_limit}-attempt limit.</span>
            </span>
          </label>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
          <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>Cancel</button>
          <button type="button" className={primaryButtonClass} disabled={!selectedStudent} onClick={() => onStart({ student: selectedStudent, enrolment, override })}>Open exam room</button>
        </div>
      </div>
    </Editor>
  );
}

function ExamRunner({ exam, student, enrolment, override = false, onClose, onSubmitted }) {
  const confirm = useConfirm();
  const detailLoad = useLoad(() => drivingGet(`/theory/assessments/${exam.id}`), `exam-runner|${exam.id}`);
  const detail = detailLoad.data?.data || null;
  const storageKey = `driving-exam-runner-${exam.id}-${student?.id}`;
  const [paper, setPaper] = useState([]);
  const [answers, setAnswers] = useState({});
  const [flags, setFlags] = useState({});
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(null);
  const [paused, setPaused] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const submittedRef = useRef(false);
  const answersRef = useRef({});
  const paperRef = useRef([]);
  const startedRef = useRef(null);

  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { paperRef.current = paper; }, [paper]);
  useEffect(() => { startedRef.current = startedAt; }, [startedAt]);

  useEffect(() => {
    const questions = Array.isArray(detail?.questions) ? detail.questions : [];
    if (questions.length === 0) return;
    let saved = null;
    try {
      saved = JSON.parse(window.sessionStorage.getItem(storageKey) || "null");
    } catch {
      saved = null;
    }
    let ordered = questions.map((row) => ({
      ...row,
      options: detail.shuffle_answers ? [...questionOptions(row)].sort(() => Math.random() - 0.5) : questionOptions(row),
    }));
    if (detail.randomize_questions) ordered = [...ordered].sort(() => Math.random() - 0.5);
    if (Number(detail.question_count) > 0) ordered = ordered.slice(0, Number(detail.question_count));
    const duration = Number(detail.duration_minutes) > 0 ? Number(detail.duration_minutes) * 60 : 60 * 60;
    setPaper(ordered);
    setStartedAt(saved?.startedAt || new Date().toISOString());
    setRemaining(saved?.remaining != null ? saved.remaining : duration);
    setAnswers(saved?.answers || {});
    setFlags(saved?.flags || {});
    setIndex(saved?.index || 0);
    // Re-initialising only when the paper or learner changes keeps the timer stable mid-exam.
  }, [detail, storageKey]);

  useEffect(() => {
    if (!paper.length || result) return;
    window.sessionStorage.setItem(storageKey, JSON.stringify({ answers, flags, index, remaining, startedAt }));
  }, [answers, flags, index, remaining, startedAt, paper.length, result, storageKey]);

  const submitRef = useRef(null);
  useEffect(() => { submitRef.current = submitPaper; });

  useEffect(() => {
    if (remaining == null || paused || result || busy) return undefined;
    if (remaining <= 0) {
      submitRef.current?.(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setRemaining((value) => Math.max(0, (value ?? 1) - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining, paused, result, busy]);

  const current = paper[index] || null;
  const answeredIds = paper.filter((row) => {
    const value = answers[row.id];
    return Array.isArray(value) ? value.length > 0 : value != null && value !== "";
  }).map((row) => row.id);
  const unanswered = paper.length - answeredIds.length;

  function setAnswer(questionId, value) {
    setAnswers((currentAnswers) => ({ ...currentAnswers, [questionId]: value }));
  }

  function toggleOption(question, option) {
    setAnswers((currentAnswers) => {
      const existing = Array.isArray(currentAnswers[question.id]) ? currentAnswers[question.id] : [];
      const next = existing.includes(option) ? existing.filter((value) => value !== option) : [...existing, option];
      return { ...currentAnswers, [question.id]: next };
    });
  }

  async function pausePaper() {
    const ok = await confirm({
      title: "Pause this examination?",
      message: "Only a supervisor should pause a live paper. The timer stops until the exam is resumed.",
      confirmLabel: "Pause examination",
    });
    if (ok) setPaused(true);
  }

  async function exitPaper() {
    const ok = await confirm({
      title: "Leave without submitting?",
      message: "Saved answers stay on this device, but the attempt is not recorded until the paper is submitted.",
      confirmLabel: "Leave exam room",
      destructive: true,
    });
    if (ok) onClose();
  }

  async function submitPaper(auto = false) {
    if (submittedRef.current || result) return;
    if (!auto) {
      const ok = await confirm({
        title: "Submit this paper?",
        message: unanswered > 0 ? `${unanswered} question${unanswered === 1 ? "" : "s"} will be submitted unanswered. You cannot change answers after submission.` : "All questions are answered. Submit for automatic marking?",
        confirmLabel: "Submit paper",
        destructive: true,
      });
      if (!ok) return;
    }
    submittedRef.current = true;
    setBusy(true);
    try {
      const elapsed = startedRef.current ? Math.max(0, Math.round((Date.now() - new Date(startedRef.current).getTime()) / 1000)) : null;
      const res = await drivingSend(`/theory/assessments/${exam.id}/attempts`, "POST", {
        student_id: Number(student.id),
        enrolment_id: enrolment?.id || null,
        started_at: startedRef.current || undefined,
        submitted_at: new Date().toISOString(),
        duration_seconds: elapsed ?? undefined,
        override: Boolean(override),
        answers: paperRef.current
          .map((row) => ({ question_id: row.id, answer: answersRef.current[row.id] ?? null }))
          .filter((row) => row.answer !== null && row.answer !== "" && !(Array.isArray(row.answer) && row.answer.length === 0)),
      });
      window.sessionStorage.removeItem(storageKey);
      setResult({ attempt: res?.data, auto });
    } catch (err) {
      submittedRef.current = false;
      notifyError(err instanceof ApiError ? err.message : "Could not submit this paper.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const attempt = result.attempt || {};
    const percentage = Math.round(Number(attempt.percentage) || 0);
    const answersById = new Map((attempt.answers || []).map((row) => [Number(row.question_id), row]));
    return (
      <div className="fixed inset-0 z-[120] overflow-y-auto bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="theme-subtext text-xs font-medium uppercase tracking-wide">{result.auto ? "Time expired · submitted automatically" : "Paper submitted"}</p>
                <h2 className="theme-heading mt-1 text-xl font-semibold">{exam.name}</h2>
                <p className="theme-subtext text-sm">{student?.full_name} · {student?.student_number} · Attempt #{attempt.attempt_number || 1}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${attempt.passed ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{attempt.passed ? "Passed" : "Failed"} · {percentage}%</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat label="Score" value={`${Number(attempt.score) || 0} / ${Number(attempt.max_score) || 0}`} icon="check2-square" />
              <Stat label="Pass mark" value={`${Number(exam.pass_mark) || 0}%`} icon="bullseye" tone="sky" />
              <Stat label="Time used" value={attempt.duration_seconds ? `${Math.round(attempt.duration_seconds / 60)} min` : "—"} icon="stopwatch" tone="violet" />
            </div>
            <p className="theme-subtext mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">This is an internal school result, not an official NTSA result or certificate.</p>
            <div className="mt-4 space-y-3">
              {paper.map((row, position) => {
                const answerRow = answersById.get(Number(row.id));
                const given = answers[row.id];
                const givenText = Array.isArray(given) ? given.join(", ") : given || "No answer";
                return (
                  <div key={row.id} className="rounded-xl border border-[var(--theme-border)] p-3">
                    <p className="theme-heading text-sm font-medium">{position + 1}. {row.question}</p>
                    <p className={`mt-1 text-xs font-medium ${answerRow?.is_correct ? "text-emerald-700" : "text-rose-600"}`}>{answerRow?.is_correct ? "Correct" : "Incorrect"} · Your answer: {givenText}</p>
                    {row.explanation ? <p className="theme-subtext mt-1 text-xs">{row.explanation}</p> : null}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" className={primaryButtonClass} onClick={onSubmitted}>Done</button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-white text-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{exam.name}</p>
          <p className="truncate text-xs text-slate-500">{student?.full_name} · {student?.student_number} · {examCategory(enrolment?.course ? { licence_category: enrolment.course.licence_category } : {})}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-lg px-3 py-1 text-sm font-semibold tabular-nums ${remaining != null && remaining <= 300 ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700"}`}>
            {remaining == null ? "—" : `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`}
          </span>
          {paused ? (
            <button type="button" className="rounded-lg bg-emerald-600 px-3 py-1 text-sm font-semibold text-white" onClick={() => setPaused(false)}>Resume</button>
          ) : (
            <button type="button" className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium" onClick={pausePaper}>Pause</button>
          )}
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium" onClick={exitPaper}>Exit</button>
        </div>
      </header>

      {detailLoad.error ? <p className="p-4 text-sm text-rose-600">{detailLoad.error}</p> : null}
      {!detail && !detailLoad.error ? <p className="p-4 text-sm text-slate-500">Preparing the paper…</p> : null}

      {paused ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-md text-center">
            <p className="text-lg font-semibold">Paper paused by a supervisor</p>
            <p className="mt-1 text-sm text-slate-500">Answers and the timer are frozen until the exam is resumed.</p>
            <button type="button" className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => setPaused(false)}>Resume examination</button>
          </div>
        </div>
      ) : detail ? (
        <div className="grid flex-1 gap-0 overflow-hidden md:grid-cols-[minmax(0,1fr)_260px]">
          <main className="overflow-y-auto p-4 sm:p-8">
            {current ? (
              <div className="mx-auto max-w-2xl">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Question {index + 1} of {paper.length}</p>
                  <button type="button" className={`rounded-full border px-3 py-1 text-xs font-medium ${flags[current.id] ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-300 text-slate-600"}`} onClick={() => setFlags((value) => ({ ...value, [current.id]: !value[current.id] }))}>
                    {flags[current.id] ? "Flagged for review" : "Flag for review"}
                  </button>
                </div>
                {current.image_url ? <img src={current.image_url} alt="Question" className="mt-4 max-h-64 rounded-xl border border-slate-200 object-contain" /> : null}
                <h2 className="mt-4 text-lg font-semibold leading-relaxed">{current.question}</h2>
                <p className="mt-1 text-xs text-slate-500">{questionTypeLabel(current.type)} · {Number(current.marks) || 1} mark{(Number(current.marks) || 1) === 1 ? "" : "s"}{current.topic?.name ? ` · ${current.topic.name}` : ""}</p>
                <div className="mt-5 space-y-2">
                  {current.options.length > 0 ? current.options.map((option) => {
                    const multiple = current.type === "multiple_answer";
                    const checked = multiple ? (Array.isArray(answers[current.id]) ? answers[current.id] : []).includes(option) : answers[current.id] === option;
                    return (
                      <label key={option} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm ${checked ? "border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_8%,transparent)]" : "border-slate-200 hover:border-slate-300"}`}>
                        <input className="mt-0.5" type={multiple ? "checkbox" : "radio"} name={`runner-${current.id}`} checked={checked} onChange={() => (multiple ? toggleOption(current, option) : setAnswer(current.id, option))} />
                        <span>{option}</span>
                      </label>
                    );
                  }) : (
                    <textarea className="w-full rounded-xl border border-slate-200 p-3 text-sm" rows={4} value={typeof answers[current.id] === "string" ? answers[current.id] : ""} onChange={(event) => setAnswer(current.id, event.target.value)} placeholder="Type the answer" />
                  )}
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
                  <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-40" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>Previous</button>
                  <div className="flex items-center gap-2">
                    <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600" onClick={() => setAnswer(current.id, null)}>Clear answer</button>
                    <button type="button" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={index >= paper.length - 1} onClick={() => setIndex((value) => Math.min(paper.length - 1, value + 1))}>Next</button>
                  </div>
                </div>
              </div>
            ) : null}
          </main>
          <aside className="border-t border-slate-200 bg-slate-50 p-4 md:overflow-y-auto md:border-l md:border-t-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Question palette</p>
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {paper.map((row, position) => {
                const answered = answeredIds.includes(row.id);
                const currentQuestion = position === index;
                return (
                  <button
                    key={row.id}
                    type="button"
                    title={`Question ${position + 1}${flags[row.id] ? " · flagged" : ""}`}
                    className={`relative h-8 rounded-md border text-xs font-semibold tabular-nums ${currentQuestion ? "border-indigo-600 bg-indigo-600 text-white" : answered ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500"}`}
                    onClick={() => setIndex(position)}
                  >
                    {position + 1}
                    {flags[row.id] ? <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-500" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 space-y-1 text-xs text-slate-500">
              <p>{answeredIds.length} answered · {unanswered} remaining</p>
              <p className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden /> Flagged for review</p>
            </div>
            <button type="button" className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} onClick={() => submitPaper(false)}>
              {busy ? "Submitting…" : "Submit paper"}
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Answers are saved automatically on this device until the paper is submitted. Internal school result only.</p>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function ExamResultsPanel({ bookings = [], courses = [], canExport, onOpenTheory, onOpenPractical }) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [resultFilter, setResultFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [period, setPeriod] = useState("all");

  const fromDate = useMemo(() => {
    if (period === "all") return undefined;
    const now = new Date();
    if (period === "year") return `${now.getFullYear()}-01-01`;
    return new Date(now.getTime() - (period === "30d" ? 30 : 90) * 86400000).toISOString().slice(0, 10);
  }, [period]);

  const attemptsLoad = useLoad(
    () => drivingGet("/theory/attempts", { from: fromDate }),
    `exam-results-attempts|${fromDate || "all"}`,
  );
  const attempts = rowsOf(attemptsLoad.data);

  const courseFor = useCallback((courseId) => (
    courses.find((course) => Number(course.id) === Number(courseId)) || null
  ), [courses]);

  const theoryRows = useMemo(() => attempts.map((attempt) => {
    const course = courseFor(attempt.assessment?.course_id);
    return {
      key: `theory-${attempt.id}`,
      source: "theory",
      student: attempt.student,
      paper: attempt.assessment?.name || "Theory paper",
      meta: [theoryExamType(attempt.assessment?.type).label, course?.name].filter(Boolean).join(" · "),
      category: course?.licence_category || "—",
      attemptNumber: attempt.attempt_number || 1,
      percent: Math.round(Number(attempt.percentage) || 0),
      rawScore: `${Number(attempt.score) || 0} / ${Number(attempt.max_score) || 0}`,
      status: attempt.passed ? "passed" : "failed",
      date: attempt.submitted_at,
      attempt,
    };
  }), [attempts, courseFor]);

  const practicalRows = useMemo(() => bookings
    .filter((row) => row.kind === "practical" && ["passed", "failed", "absent"].includes(row.status))
    .filter((row) => !fromDate || String(row.scheduled_on || "") >= fromDate)
    .map((row) => ({
      key: `practical-${row.id}`,
      source: "practical",
      student: row.student,
      paper: row.reference || "Practical assessment",
      meta: ["Practical test", row.examiner, row.enrolment?.course?.name].filter(Boolean).join(" · "),
      category: examCategory(row),
      attemptNumber: row.attempt_number || 1,
      percent: row.score != null && row.status !== "absent" ? Math.round(Number(row.score)) : null,
      rawScore: row.score != null && row.status !== "absent" ? `${Math.round(Number(row.score))}%` : "—",
      status: row.status,
      date: row.scheduled_on,
      booking: row,
    })), [bookings, fromDate]);

  const baseRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...theoryRows, ...practicalRows].filter((row) => {
      if (resultFilter && row.status !== resultFilter) return false;
      if (categoryFilter && row.category !== categoryFilter) return false;
      if (needle) {
        const haystack = [row.student?.full_name, row.student?.student_number, row.paper, row.meta, row.category].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [theoryRows, practicalRows, query, resultFilter, categoryFilter]);

  const typeCounts = useMemo(() => ({
    all: baseRows.length,
    theory: baseRows.filter((row) => row.source === "theory").length,
    practical: baseRows.filter((row) => row.source === "practical").length,
  }), [baseRows]);

  const rows = useMemo(() => baseRows
    .filter((row) => kindFilter === "all" || row.source === kindFilter)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))), [baseRows, kindFilter]);

  const studentGroups = useMemo(() => {
    const groups = new Map();
    for (const row of rows) {
      const key = studentKey(row.student);
      if (!groups.has(key)) groups.set(key, { student: row.student, rows: [] });
      groups.get(key).rows.push(row);
    }
    return [...groups.values()].sort((a, b) => String(a.student?.full_name || "").localeCompare(String(b.student?.full_name || "")));
  }, [rows]);

  function printStudentReport(student) {
    const key = studentKey(student);
    const group = studentGroups.find((item) => studentKey(item.student) === key);
    if (group) printStudentExamReports([group]);
  }

  const categoryOptions = useMemo(() => [...new Set(
    [...theoryRows, ...practicalRows].map((row) => row.category).filter((value) => value && value !== "—"),
  )].sort(), [theoryRows, practicalRows]);

  const theoryBase = baseRows.filter((row) => row.source === "theory");
  const practicalBase = baseRows.filter((row) => row.source === "practical");
  const gradedTheory = theoryBase.filter((row) => row.status !== "absent").length;
  const gradedPractical = practicalBase.filter((row) => row.status !== "absent").length;
  const theoryPassed = theoryBase.filter((row) => row.status === "passed").length;
  const practicalPassed = practicalBase.filter((row) => row.status === "passed").length;
  const passed = theoryPassed + practicalPassed;
  const failed = baseRows.filter((row) => row.status === "failed").length;
  const absent = baseRows.filter((row) => row.status === "absent").length;
  const graded = gradedTheory + gradedPractical;
  const passRate = graded > 0 ? Math.round((passed / graded) * 100) : 0;
  const theoryRate = gradedTheory > 0 ? Math.round((theoryPassed / gradedTheory) * 100) : 0;
  const practicalRate = gradedPractical > 0 ? Math.round((practicalPassed / gradedPractical) * 100) : 0;
  const share = (value) => (baseRows.length > 0 ? (value / baseRows.length) * 100 : 0);

  const skillFailures = useMemo(() => {
    const counts = new Map();
    for (const row of bookings) {
      if (row.kind !== "practical" || row.status !== "failed") continue;
      for (const item of practicalItems(row)) {
        if (!item || item.result === "pass" || item.result === "not_assessed") continue;
        const key = item.skill || item.name;
        if (!key) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [bookings]);

  async function exportResults() {
    try {
      await downloadExcelFromRows("Examination-results.xlsx", "Results", [
        ["Student", "Admission No", "Type", "Paper", "Category", "Attempt", "Score", "Percentage", "Result", "Date"],
        ...rows.map((row) => [
          row.student?.full_name || "Learner",
          row.student?.student_number || "",
          row.source === "theory" ? "Theory" : "Practical",
          row.paper,
          row.category,
          row.attemptNumber,
          row.rawScore,
          row.percent != null ? `${row.percent}%` : "",
          examStatus(row.status).label,
          shortDate(row.date),
        ]),
      ]);
      notifySuccess("Results exported.");
    } catch {
      notifyError("Could not export these results.");
    }
  }

  const kindChips = [
    { value: "all", label: "All results" },
    { value: "theory", label: "Theory" },
    { value: "practical", label: "Practical" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="theme-heading font-semibold">Examination results</h2>
            <p className="theme-subtext mt-0.5 text-xs">Auto-marked theory attempts and marked practical assessments. Absent learners are kept apart from failures so pass rates stay accurate. Print reports covers one report page per learner in the current view.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {studentGroups.length > 0 ? (
              <button
                type="button"
                className="theme-secondary-btn rounded-lg px-3 py-1.5 text-sm font-medium"
                title="Print one report page per learner in the current view"
                onClick={() => printStudentExamReports(studentGroups)}
              >
                <i className="bi bi-printer mr-2" aria-hidden />Print reports ({studentGroups.length})
              </button>
            ) : null}
            {canExport ? (
              <button type="button" className="theme-secondary-btn rounded-lg px-3 py-1.5 text-sm font-medium" onClick={exportResults}>
                <i className="bi bi-filetype-xlsx mr-2" aria-hidden />Export results
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {kindChips.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`rounded-full border px-3 py-1.5 text-sm font-medium ${kindFilter === item.value ? "border-[var(--theme-primary)] bg-[var(--theme-primary)] text-white" : "border-[var(--theme-border)] theme-subtext"}`}
              onClick={() => setKindFilter(item.value)}
            >
              {item.label} <span className="tabular-nums">({typeCounts[item.value]})</span>
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <SearchField value={query} onChange={setQuery} placeholder="Search learner, admission no., paper or examiner" />
          <FilterSelect
            value={resultFilter}
            placeholder="All results"
            onChange={(event) => setResultFilter(event.target.value)}
            options={[{ value: "", label: "All results" }, { value: "passed", label: "Passed" }, { value: "failed", label: "Failed" }, { value: "absent", label: "Absent" }]}
          />
          {categoryOptions.length > 1 ? (
            <FilterSelect
              value={categoryFilter}
              placeholder="All categories"
              onChange={(event) => setCategoryFilter(event.target.value)}
              options={[{ value: "", label: "All categories" }, ...categoryOptions.map((value) => ({ value, label: `Category ${value}` }))]}
            />
          ) : null}
          <FilterSelect
            value={period}
            placeholder="All time"
            onChange={(event) => setPeriod(event.target.value)}
            options={[{ value: "all", label: "All time" }, { value: "30d", label: "Last 30 days" }, { value: "90d", label: "Last 90 days" }, { value: "year", label: "This year" }]}
          />
        </div>

        {baseRows.length > 0 ? (
          <div className="mt-4">
            <div className="flex h-2 overflow-hidden rounded-full bg-[var(--theme-border)]">
              <span className="block h-full bg-emerald-500" style={{ width: `${share(passed)}%` }} />
              <span className="block h-full bg-rose-500" style={{ width: `${share(failed)}%` }} />
              <span className="block h-full bg-slate-400" style={{ width: `${share(absent)}%` }} />
            </div>
            <div className="theme-subtext mt-1.5 flex flex-wrap gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />{passed} passed</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" />{failed} failed</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400" />{absent} absent</span>
            </div>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Results logged" value={baseRows.length} hint={`${typeCounts.theory} theory · ${typeCounts.practical} practical`} icon="clipboard-data" />
        <Stat label="Overall pass rate" value={`${passRate}%`} hint={`${passed} passed of ${graded} graded`} icon="patch-check" tone="emerald" />
        <Stat label="Theory pass rate" value={`${theoryRate}%`} hint={`${theoryPassed}/${gradedTheory} attempts`} icon="journal-check" tone="sky" />
        <Stat label="Practical pass rate" value={`${practicalRate}%`} hint={`${practicalPassed}/${gradedPractical} assessed`} icon="car-front" tone="violet" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="theme-heading font-semibold">{kindFilter === "theory" ? "Theory results" : kindFilter === "practical" ? "Practical results" : "All results"}</h2>
            <p className="theme-subtext mt-0.5 text-xs">Newest first. Open a result to review the paper, per-question marks or the practical checklist, or print a report for the learner.</p>
          </div>
          <span className="theme-subtext text-xs tabular-nums">{rows.length} shown{rows.length !== baseRows.length ? ` of ${baseRows.length}` : ""}</span>
        </div>

        {attemptsLoad.error ? <p className="mt-3 text-sm text-red-600">{attemptsLoad.error}</p> : null}
        {!attemptsLoad.data && !attemptsLoad.error ? <p className="theme-subtext mt-3 text-sm">Loading theory results…</p> : null}

        <div className="mt-3">
          <DataTable
            empty="No results match these filters yet. Auto-marked theory attempts and completed practical assessments appear here."
            rows={rows}
            columns={[
              { key: "student", label: "Learner", render: (row) => <PersonName name={row.student?.full_name || "Learner"} detail={row.student?.student_number} /> },
              {
                key: "paper",
                label: "Examination",
                render: (row) => (
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5">
                      <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${row.source === "theory" ? "bg-sky-50 text-sky-700" : "bg-violet-50 text-violet-700"}`}>{row.source === "theory" ? "Theory" : "Practical"}</span>
                      <span className="theme-heading max-w-[220px] truncate text-sm font-medium">{row.paper}</span>
                    </span>
                    <span className="theme-subtext truncate text-[11px]">{row.meta || "—"}</span>
                  </span>
                ),
              },
              { key: "category", label: "Category", render: (row) => row.category },
              { key: "attempt", label: "Attempt", render: (row) => <span className="tabular-nums">#{row.attemptNumber}</span> },
              {
                key: "score",
                label: "Score",
                render: (row) => (row.percent == null ? (
                  <span className="theme-subtext text-xs">Not scored</span>
                ) : (
                  <div className="min-w-[104px]">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="theme-heading text-sm font-semibold tabular-nums">{row.percent}%</span>
                      <span className="theme-subtext text-[11px] tabular-nums">{row.rawScore}</span>
                    </div>
                    <div className="mt-1"><CompletionBar value={row.percent} /></div>
                  </div>
                )),
              },
              { key: "result", label: "Result", render: (row) => <ExamStatusBadge value={row.status} /> },
              { key: "date", label: "Date", render: (row) => <span className="tabular-nums">{shortDate(row.date)}</span> },
              {
                key: "actions",
                label: "",
                render: (row) => (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      className="theme-secondary-btn rounded px-2 py-1 text-[11px] font-medium"
                      onClick={() => (row.source === "theory" ? onOpenTheory(row.attempt.id) : onOpenPractical(row.booking))}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      className="theme-secondary-btn rounded px-2 py-1 text-[11px] font-medium"
                      title={`Print ${row.student?.full_name || "learner"} report`}
                      onClick={() => printStudentReport(row.student)}
                    >
                      <i className="bi bi-printer" aria-hidden />
                    </button>
                  </span>
                ),
              },
            ]}
          />
        </div>

        {failed + absent > 0 ? <p className="theme-subtext mt-3 text-xs">{failed} failed · {absent} absent. Retakes are tracked on the Retakes tab.</p> : null}
      </Card>

      {skillFailures.length > 0 ? (
        <Card>
          <div>
            <h2 className="theme-heading font-semibold">Why learners fail</h2>
            <p className="theme-subtext mt-0.5 text-xs">Practical skills marked fail or needs improvement, ranked across all failed assessments. Use this to target lessons before retakes.</p>
          </div>
          <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {skillFailures.map(([skill, count]) => (
              <li key={skill} className="flex items-center gap-3 text-sm">
                <span className="theme-heading w-40 shrink-0 truncate" title={skill}>{skill}</span>
                <span className="flex-1"><CompletionBar value={Math.min(100, count * 20)} /></span>
                <span className="theme-subtext w-8 shrink-0 text-right text-xs tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function ExamResultDetailDialog({ attemptId, booking, settings, onClose }) {
  const attemptLoad = useLoad(
    () => (attemptId ? drivingGet(`/theory/attempts/${attemptId}`) : Promise.resolve(null)),
    `exam-result-detail|${attemptId || ""}`,
  );
  const attempt = attemptLoad.data?.data || null;
  const answers = Array.isArray(attempt?.answers) ? attempt.answers : [];
  const correctCount = answers.filter((row) => row.is_correct).length;
  const practical = booking ? practicalItems(booking) : [];
  const meta = booking ? practicalMeta(booking) : {};
  const criticalErrors = Array.isArray(meta.critical_errors) ? meta.critical_errors : [];
  const vehicleLabel = meta.vehicle_label || [meta.vehicle?.registration_number || meta.vehicle?.plate_number, meta.vehicle?.make_model || meta.vehicle?.model].filter(Boolean).join(" ");

  function answerText(value) {
    if (Array.isArray(value)) return value.map(questionOptionLabel).join(", ") || "No answer";
    return value != null && value !== "" ? String(value) : "No answer";
  }

  function printTheory() {
    const lines = [
      `<p class="muted"><strong>${attempt.student?.full_name || "Learner"}</strong> · ${attempt.student?.student_number || ""} · ${attempt.assessment?.name || "Theory paper"} · Attempt #${attempt.attempt_number}</p>`,
      `<p class="muted">Score ${Number(attempt.score) || 0} / ${Number(attempt.max_score) || 0} · ${Math.round(Number(attempt.percentage) || 0)}% · Pass mark ${Number(attempt.assessment?.pass_mark) || Number(settings?.pass_mark) || 0}% · <span class="pill">${attempt.passed ? "Passed" : "Failed"}</span></p>`,
      `<h2>Question breakdown</h2><table><thead><tr><th>#</th><th>Question</th><th>Answer</th><th>Correct</th><th>Result</th></tr></thead><tbody>`,
      ...answers.map((row, index) => `<tr><td>${index + 1}</td><td>${String(row.question?.question || "").replace(/[<>&]/g, "")}<br><span class="muted">${String(row.question?.topic?.name || "")}</span></td><td>${answerText(row.answer)}</td><td>${answerText(row.question?.correct_answer)}</td><td>${row.is_correct ? "Correct" : "Incorrect"}</td></tr>`),
      '</tbody></table>',
    ].join("");
    printExamDocument("Theory examination result", lines);
  }

  function printPractical() {
    const lines = [
      `<p class="muted"><strong>${booking.student?.full_name || "Learner"}</strong> · ${booking.student?.student_number || ""} · ${examKind(booking.kind).label} · ${booking.reference || ""} · Attempt #${booking.attempt_number || 1}</p>`,
      `<p class="muted">Category ${examCategory(booking)} · ${shortDate(booking.scheduled_on)} · Examiner ${booking.examiner || "—"} · Vehicle ${vehicleLabel || "—"} · Score ${booking.score != null ? `${Number(booking.score)}%` : "—"} · <span class="pill">${examStatus(booking.status).label}</span></p>`,
      `<h2>Skills checklist</h2><table><thead><tr><th>Skill</th><th>Result</th></tr></thead><tbody>`,
      ...practical.map((item) => `<tr><td>${String(item.skill)}</td><td>${practicalResult(item.result).label}</td></tr>`),
      '</tbody></table>',
      criticalErrors.length ? `<h2>Critical safety errors</h2><ul>${criticalErrors.map((item) => `<li>${String(item).replace(/[<>&]/g, "")}</li>`).join("")}</ul>` : '',
      booking.recommendations ? `<h2>Examiner comments</h2><p>${String(booking.recommendations).replace(/[<>&]/g, "")}</p>` : '',
    ].join("");
    printExamDocument("Practical examination result", lines);
  }

  async function exportDetail() {
    try {
      if (attempt) {
        await downloadExcelFromRows(`Theory-result-${attempt.student?.student_number || attempt.id}.xlsx`, "Breakdown", [
          ["#", "Question", "Topic", "Learner answer", "Correct answer", "Result", "Marks"],
          ...answers.map((row, index) => [
            index + 1,
            row.question?.question || "",
            row.question?.topic?.name || "",
            answerText(row.answer),
            answerText(row.question?.correct_answer),
            row.is_correct ? "Correct" : "Incorrect",
            Number(row.marks_awarded) || 0,
          ]),
        ]);
      } else {
        await downloadExcelFromRows(`Practical-result-${booking.reference || booking.id}.xlsx`, "Checklist", [
          ["Skill", "Result"],
          ...practical.map((item) => [item.skill, practicalResult(item.result).label]),
          [],
          ["Critical safety errors"],
          ...(criticalErrors.length ? criticalErrors.map((item) => [item]) : [["None"]]),
        ]);
      }
      notifySuccess("Result exported.");
    } catch {
      notifyError("Could not export this result.");
    }
  }

  if (attemptId && !attempt && !attemptLoad.error) {
    return <Editor open title="Result detail" onClose={onClose} wide><p className="theme-subtext text-sm">Loading result…</p></Editor>;
  }
  if (attemptLoad.error) {
    return <Editor open title="Result detail" onClose={onClose} wide><p className="text-sm text-red-600">{attemptLoad.error}</p></Editor>;
  }

  return (
    <Editor open title={attempt ? "Theory result" : "Practical result"} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="rounded-xl border border-[var(--theme-border)] px-3 py-2 text-sm">
          {attempt ? (
            <>
              <p className="theme-heading font-medium">{attempt.student?.full_name || "Learner"} · {attempt.student?.student_number}</p>
              <p className="theme-subtext text-xs">{attempt.assessment?.name || "Theory paper"} · Attempt #{attempt.attempt_number} · Submitted {shortDateTime(attempt.submitted_at)}</p>
              <p className="theme-heading mt-1 text-lg font-semibold">{Number(attempt.score) || 0} / {Number(attempt.max_score) || 0} <span className="theme-subtext text-sm font-normal">({Math.round(Number(attempt.percentage) || 0)}%)</span> · <span className={attempt.passed ? "text-emerald-700" : "text-rose-700"}>{attempt.passed ? "Passed" : "Failed"}</span></p>
            </>
          ) : (
            <>
              <p className="theme-heading font-medium">{booking.student?.full_name || "Learner"} · {booking.student?.student_number}</p>
              <p className="theme-subtext text-xs">{booking.reference || `EXM-${booking.id}`} · Category {examCategory(booking)} · {shortDate(booking.scheduled_on)} · Attempt #{booking.attempt_number || 1}</p>
              <p className="theme-heading mt-1 text-lg font-semibold">{booking.score != null ? `${Number(booking.score)}%` : "No score"} · <ExamStatusBadge value={booking.status} /></p>
            </>
          )}
          <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">Internal driving-school record. Not an official NTSA result or certificate.</p>
        </div>

        {attempt ? (
          <>
            <div className="grid gap-3 text-xs sm:grid-cols-4">
              <div><p className="theme-subtext">Pass mark</p><p className="theme-heading font-medium">{Number(attempt.assessment?.pass_mark) || Number(settings?.pass_mark) || 0}%</p></div>
              <div><p className="theme-subtext">Duration</p><p className="theme-heading font-medium">{attempt.duration_seconds != null ? `${Math.round(Number(attempt.duration_seconds) / 60)} min` : "—"}</p></div>
              <div><p className="theme-subtext">Correct answers</p><p className="theme-heading font-medium">{correctCount} of {answers.length}</p></div>
            </div>
            <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
              {answers.map((row, index) => (
                <div key={row.id || index} className={`rounded-xl border p-3 text-sm ${row.is_correct ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40"}`}>
                  <p className="theme-heading font-medium">{index + 1}. {row.question?.question}</p>
                  <p className="theme-subtext mt-1 text-xs">{row.question?.topic?.name || "No topic"} · {Number(row.marks_awarded) || 0} / {Number(row.question?.marks) || 1} marks</p>
                  <p className="mt-1 text-xs"><span className="theme-subtext">Learner:</span> {answerText(row.answer)}</p>
                  <p className="text-xs"><span className="theme-subtext">Correct:</span> {answerText(row.question?.correct_answer)}</p>
                  {row.question?.explanation ? <p className="theme-subtext mt-1 text-xs">{row.question.explanation}</p> : null}
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-3 text-xs sm:grid-cols-3">
              <div><p className="theme-subtext">Examiner</p><p className="theme-heading font-medium">{booking.examiner || "—"}</p></div>
              <div><p className="theme-subtext">Vehicle</p><p className="theme-heading font-medium">{vehicleLabel || "—"}</p></div>
              <div><p className="theme-subtext">Retake</p><p className="theme-heading font-medium">{booking.retake_recommended ? "Recommended" : "Not required"}</p></div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--theme-border)]">
              <table className="w-full text-sm">
                <thead className="bg-[var(--theme-surface-muted)] text-left text-xs">
                  <tr><th className="px-3 py-2">Skill</th><th className="px-3 py-2">Result</th></tr>
                </thead>
                <tbody>
                  {practical.length === 0 ? <tr><td className="theme-subtext px-3 py-3" colSpan={2}>No checklist recorded for this assessment.</td></tr> : practical.map((item) => {
                    const result = practicalResult(item.result);
                    return (
                      <tr key={item.skill} className="border-t border-[var(--theme-border)]">
                        <td className="px-3 py-2">{item.skill}</td>
                        <td className="px-3 py-2"><span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${result.tone}`}>{result.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {criticalErrors.length > 0 ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-sm font-semibold text-rose-700">Critical safety errors</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-rose-700">{criticalErrors.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            ) : null}
            {booking.recommendations ? (
              <div className="rounded-xl border border-[var(--theme-border)] p-3">
                <p className="theme-heading text-sm font-semibold">Examiner comments</p>
                <p className="theme-subtext mt-1 text-sm">{booking.recommendations}</p>
              </div>
            ) : null}
          </>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
          <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={exportDetail}>Export</button>
          <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={attempt ? printTheory : printPractical}>Print</button>
          <button type="button" className={primaryButtonClass} onClick={onClose}>Close</button>
        </div>
      </div>
    </Editor>
  );
}

const ELIGIBILITY_LABELS = [
  { key: "enrolment", label: "Active enrolment", hint: "Learner must have an active enrolment for the course." },
  { key: "theory_progress", label: "Theory progress", hint: "Required theory topics must be completed before booking." },
  { key: "practical_progress", label: "Practical progress", hint: "Minimum practical lessons must be completed." },
  { key: "attendance", label: "Attendance", hint: "Learner must meet the attendance threshold." },
  { key: "fees", label: "Outstanding fees", hint: "Block exams when the learner has unpaid invoices." },
  { key: "documents", label: "Required documents", hint: "Identification and permit documents must be on file." },
];

const NOTIFICATION_LABELS = [
  { key: "on_schedule", label: "When an exam is scheduled", hint: "Notify the learner with the date, time and venue." },
  { key: "remind_before", label: "Reminder before the exam", hint: "Send a reminder ahead of the examination." },
  { key: "on_result", label: "When a result is released", hint: "Tell the learner when their result is recorded." },
];

function ExamSettingsPanel({ settings, canEdit, loading, error, onSaved }) {
  const [form, setForm] = useState(() => ({
    pass_mark: String(settings?.pass_mark ?? DEFAULT_EXAM_SETTINGS.pass_mark),
    attempt_limit: String(settings?.attempt_limit ?? DEFAULT_EXAM_SETTINGS.attempt_limit),
    retake_fee: String(settings?.retake_fee ?? DEFAULT_EXAM_SETTINGS.retake_fee),
    theory_fee: String(settings?.theory_fee ?? DEFAULT_EXAM_SETTINGS.theory_fee),
    practical_fee: String(settings?.practical_fee ?? DEFAULT_EXAM_SETTINGS.practical_fee),
    mock_fee: String(settings?.mock_fee ?? DEFAULT_EXAM_SETTINGS.mock_fee),
    eligibility: { ...DEFAULT_EXAM_SETTINGS.eligibility, ...(settings?.eligibility || {}) },
    notifications: { ...DEFAULT_EXAM_SETTINGS.notifications, ...(settings?.notifications || {}) },
    practical_template: (settings?.practical_template?.length ? settings.practical_template : DEFAULT_PRACTICAL_TEMPLATE).join("\n"),
  }));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setForm({
      pass_mark: String(settings.pass_mark ?? DEFAULT_EXAM_SETTINGS.pass_mark),
      attempt_limit: String(settings.attempt_limit ?? DEFAULT_EXAM_SETTINGS.attempt_limit),
      retake_fee: String(settings.retake_fee ?? DEFAULT_EXAM_SETTINGS.retake_fee),
      theory_fee: String(settings.theory_fee ?? DEFAULT_EXAM_SETTINGS.theory_fee),
      practical_fee: String(settings.practical_fee ?? DEFAULT_EXAM_SETTINGS.practical_fee),
      mock_fee: String(settings.mock_fee ?? DEFAULT_EXAM_SETTINGS.mock_fee),
      eligibility: { ...DEFAULT_EXAM_SETTINGS.eligibility, ...(settings.eligibility || {}) },
      notifications: { ...DEFAULT_EXAM_SETTINGS.notifications, ...(settings.notifications || {}) },
      practical_template: (settings.practical_template?.length ? settings.practical_template : DEFAULT_PRACTICAL_TEMPLATE).join("\n"),
    });
  }, [settings]);

  async function save(event) {
    event.preventDefault();
    const template = form.practical_template.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!template.length) {
      notifyError("Keep at least one practical checklist item.");
      return;
    }
    setBusy(true);
    try {
      await drivingSend("/exam-settings", "PUT", {
        pass_mark: Number(form.pass_mark) || 0,
        attempt_limit: Number(form.attempt_limit) || 0,
        retake_fee: Number(form.retake_fee) || 0,
        theory_fee: Number(form.theory_fee) || 0,
        practical_fee: Number(form.practical_fee) || 0,
        mock_fee: Number(form.mock_fee) || 0,
        eligibility: form.eligibility,
        notifications: form.notifications,
        practical_template: template,
      });
      notifySuccess("Examination settings saved.");
      onSaved();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save examination settings.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Card><p className="theme-subtext text-sm">Loading examination settings…</p></Card>;
  if (error) return <Card><p className="text-sm text-red-600">{error}</p></Card>;

  return (
    <form onSubmit={save} className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="theme-heading font-semibold">Examination settings</h2>
            <p className="theme-subtext mt-0.5 text-xs">Defaults applied to new theory papers, practical assessments, retakes and learner notifications.</p>
          </div>
          <span className="theme-subtext text-xs">{settings?.saved ? "Saved configuration" : "Using defaults"}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Theory pass mark (%)">
            <input className={inputClass} type="number" min="0" max="100" disabled={!canEdit} value={form.pass_mark} onChange={(event) => setForm({ ...form, pass_mark: event.target.value })} />
          </Field>
          <Field label="Attempts allowed before a retake">
            <input className={inputClass} type="number" min="0" max="20" disabled={!canEdit} value={form.attempt_limit} onChange={(event) => setForm({ ...form, attempt_limit: event.target.value })} />
          </Field>
          <Field label="Retake fee (KSh)">
            <input className={inputClass} type="number" min="0" step="0.01" disabled={!canEdit} value={form.retake_fee} onChange={(event) => setForm({ ...form, retake_fee: event.target.value })} />
          </Field>
        </div>
        <p className="theme-subtext mt-2 text-xs">0 attempts means unlimited attempts. The retake fee is used as the default when raising a retake invoice.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Theory exam fee (KSh)">
            <input className={inputClass} type="number" min="0" step="0.01" disabled={!canEdit} value={form.theory_fee} onChange={(event) => setForm({ ...form, theory_fee: event.target.value })} />
          </Field>
          <Field label="Practical exam fee (KSh)">
            <input className={inputClass} type="number" min="0" step="0.01" disabled={!canEdit} value={form.practical_fee} onChange={(event) => setForm({ ...form, practical_fee: event.target.value })} />
          </Field>
          <Field label="Mock exam fee (KSh)">
            <input className={inputClass} type="number" min="0" step="0.01" disabled={!canEdit} value={form.mock_fee} onChange={(event) => setForm({ ...form, mock_fee: event.target.value })} />
          </Field>
        </div>
        <p className="theme-subtext mt-2 text-xs">0 means that exam type is free. A first attempt with a fee is invoiced to the learner when the exam is scheduled; the schedule then shows Free, Paid or Outstanding. Retakes stay on the retake fee.</p>
      </Card>

      <Card>
        <h3 className="theme-heading font-semibold">Pre-exam eligibility checks</h3>
        <p className="theme-subtext mt-0.5 text-xs">Selected checks must pass before an exam can be scheduled. Staff can override with a recorded reason.</p>
        <ul className="mt-3 space-y-2">
          {ELIGIBILITY_LABELS.map((item) => (
            <li key={item.key} className="flex items-start justify-between gap-3 rounded-xl border border-[var(--theme-border)] px-3 py-2">
              <div>
                <p className="theme-heading text-sm font-medium">{item.label}</p>
                <p className="theme-subtext text-xs">{item.hint}</p>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={Boolean(form.eligibility[item.key])}
                  onChange={(event) => setForm({ ...form, eligibility: { ...form.eligibility, [item.key]: event.target.checked } })}
                />
                Required
              </label>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h3 className="theme-heading font-semibold">Learner notifications</h3>
        <ul className="mt-3 space-y-2">
          {NOTIFICATION_LABELS.map((item) => (
            <li key={item.key} className="flex items-start justify-between gap-3 rounded-xl border border-[var(--theme-border)] px-3 py-2">
              <div>
                <p className="theme-heading text-sm font-medium">{item.label}</p>
                <p className="theme-subtext text-xs">{item.hint}</p>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={Boolean(form.notifications[item.key])}
                  onChange={(event) => setForm({ ...form, notifications: { ...form.notifications, [item.key]: event.target.checked } })}
                />
                Enabled
              </label>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h3 className="theme-heading font-semibold">Practical examiner checklist template</h3>
        <p className="theme-subtext mt-0.5 text-xs">One skill per line. The same template is used for every licence category unless adjusted per assessment.</p>
        <textarea
          className={`${inputClass} mt-3 h-48 resize-y py-2 font-mono text-xs`}
          disabled={!canEdit}
          value={form.practical_template}
          onChange={(event) => setForm({ ...form, practical_template: event.target.value })}
        />
        <p className="theme-subtext mt-1 text-xs">{form.practical_template.split("\n").filter((line) => line.trim()).length} checklist items</p>
      </Card>

      {canEdit ? (
        <div className="flex justify-end">
          <button type="submit" className={primaryButtonClass} disabled={busy}>{busy ? "Saving…" : "Save settings"}</button>
        </div>
      ) : <p className="theme-subtext text-xs">You have view-only access to examination settings.</p>}
    </form>
  );
}

function parseQuestionImport(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return { rows: [], errors: [] };
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { rows: [], errors: ["That JSON could not be parsed."] };
    }
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.questions) ? parsed.questions : [];
    return { rows: list.map((row) => normalizeImportedQuestion(row)), errors: list.length ? [] : ["No questions found in that JSON."] };
  }
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { rows: [], errors: ["Add a header row and at least one question."] };
  const headers = lines[0].split(",").map((value) => value.trim().toLowerCase().replace(/\s+/g, "_"));
  const rawRows = lines.slice(1).map((line) => {
    const values = [];
    let current = "";
    let quoted = false;
    for (const char of line) {
      if (char === '"') { quoted = !quoted; continue; }
      if (char === "," && !quoted) { values.push(current); current = ""; continue; }
      current += char;
    }
    values.push(current);
    const row = {};
    headers.forEach((header, index) => { row[header] = (values[index] || "").trim(); });
    return row;
  });
  return { rows: rawRows.map((row) => normalizeImportedQuestion(row)), errors: [] };
}

function normalizeImportedQuestion(raw = {}) {
  const pickOptions = () => {
    const explicit = ["option_a", "option_b", "option_c", "option_d", "option_e"]
      .map((key) => raw[key])
      .filter((value) => value != null && String(value).trim() !== "");
    if (explicit.length) return explicit.map((value) => String(value).trim());
    if (raw.options) {
      return Array.isArray(raw.options)
        ? raw.options.map((value) => String(value).trim())
        : String(raw.options).split("|").map((value) => value.trim()).filter(Boolean);
    }
    return [];
  };
  const options = pickOptions();
  const correctRaw = raw.correct_answer ?? raw.correct ?? "";
  const correct = (Array.isArray(correctRaw) ? correctRaw : String(correctRaw).split("|"))
    .map((value) => String(value).trim())
    .filter(Boolean)
    .map((value) => {
      if (/^[A-Ea-e]$/.test(value)) {
        const index = value.toUpperCase().charCodeAt(0) - 65;
        return options[index] || value;
      }
      return value;
    });
  const tags = raw.tags
    ? (Array.isArray(raw.tags) ? raw.tags : String(raw.tags).split("|")).map((value) => String(value).trim()).filter(Boolean)
    : [];
  return {
    question: String(raw.question ?? "").trim(),
    type: String(raw.type || (options.length ? (correct.length > 1 ? "multiple_answer" : "multiple_choice") : "scenario")).trim() || "multiple_choice",
    options,
    correct_answer: correct,
    explanation: String(raw.explanation ?? "").trim(),
    difficulty: ["easy", "medium", "hard"].includes(String(raw.difficulty || "").toLowerCase()) ? String(raw.difficulty).toLowerCase() : "medium",
    marks: Number(raw.marks) > 0 ? Number(raw.marks) : 1,
    category: String(raw.category ?? raw.topic ?? "").trim(),
    licence_category: String(raw.licence_category ?? raw.category_code ?? "").trim(),
    tags,
    image_url: String(raw.image_url ?? "").trim(),
    course_name: String(raw.course ?? raw.course_name ?? "").trim(),
  };
}

function QuestionImportDialog({ courses, onClose, onSaved }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const parsed = useMemo(() => parseQuestionImport(text), [text]);
  const invalid = parsed.rows.filter((row) => !row.question || (row.options.length > 0 && row.correct_answer.length === 0));
  const importable = parsed.rows.filter((row) => row.question && (row.options.length === 0 || row.correct_answer.length > 0));

  function loadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ""));
    reader.readAsText(file);
  }

  function downloadTemplate() {
    const csv = [
      "question,option_a,option_b,option_c,option_d,correct_answer,category,licence_category,difficulty,explanation,tags,marks,image_url",
      '"What does a flashing red traffic light mean?","Stop and wait","Proceed slowly","Speed up","Honk and continue","Stop and wait","Traffic signs","B","easy","A flashing red light is treated like a stop sign.","traffic signs|signals",1,"',
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "question-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function runImport() {
    if (!importable.length) {
      notifyError("There are no valid questions to import.");
      return;
    }
    setBusy(true);
    setProgress({ done: 0, total: importable.length, failed: 0 });
    let failed = 0;
    for (let index = 0; index < importable.length; index += 1) {
      const row = importable[index];
      const course = row.course_name
        ? courses.find((item) => String(item.name).toLowerCase() === row.course_name.toLowerCase())
        : null;
      try {
        await drivingSend("/theory/questions", "POST", {
          course_id: course?.id || null,
          question: row.question,
          type: row.type,
          options: row.options.length ? row.options : null,
          correct_answer: row.correct_answer.length ? row.correct_answer : null,
          explanation: row.explanation || null,
          difficulty: row.difficulty,
          marks: row.marks,
          category: row.category || null,
          licence_category: row.licence_category || null,
          tags: row.tags.length ? row.tags : null,
          image_url: row.image_url || null,
          is_active: true,
        });
      } catch {
        failed += 1;
      }
      setProgress({ done: index + 1, total: importable.length, failed });
    }
    setBusy(false);
    if (failed) {
      notifyError(`${importable.length - failed} questions imported, ${failed} failed. Check duplicate or invalid entries.`);
    } else {
      notifySuccess(`${importable.length} questions imported.`);
    }
    onSaved();
  }

  return (
    <Editor open title="Import questions" onClose={onClose} wide>
      <div className="space-y-3">
        <p className="theme-subtext text-sm">
          Upload a CSV or JSON file, or paste rows below. CSV columns: question, option_a–option_d, correct_answer, category, licence_category, difficulty, explanation, tags (pipe separated), marks, image_url.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="theme-secondary-btn cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium">
            Choose file
            <input type="file" accept=".csv,.json,.txt" className="hidden" onChange={loadFile} />
          </label>
          <button type="button" className="theme-secondary-btn rounded-lg px-3 py-1.5 text-sm font-medium" onClick={downloadTemplate}>Download CSV template</button>
        </div>
        <Field label="Questions">
          <textarea
            className={`${inputClass} h-48 resize-y py-2 font-mono text-xs`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={'question,option_a,option_b,option_c,option_d,correct_answer\n"What does a red light mean?","Stop","Go","Slow down","Reverse","Stop"'}
          />
        </Field>
        {parsed.errors.map((message) => <p key={message} className="text-xs text-rose-600">{message}</p>)}
        {parsed.rows.length > 0 ? (
          <div className="rounded-xl border border-[var(--theme-border)] p-3">
            <p className="theme-heading text-sm font-medium">{importable.length} ready · {invalid.length} invalid</p>
            {invalid.length > 0 ? <p className="text-xs text-rose-600">Rows need a question and, when options are supplied, a correct answer.</p> : null}
            <ul className="theme-subtext mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
              {parsed.rows.slice(0, 8).map((row, index) => (
                <li key={index} className="truncate">{row.question || "(missing question)"}{row.category ? ` · ${row.category}` : ""}{row.licence_category ? ` · Cat ${row.licence_category}` : ""}</li>
              ))}
              {parsed.rows.length > 8 ? <li>…and {parsed.rows.length - 8} more</li> : null}
            </ul>
          </div>
        ) : null}
        {progress ? (
          <div>
            <CompletionBar value={percent(progress.done, progress.total)} />
            <p className="theme-subtext mt-1 text-xs">Imported {progress.done} of {progress.total}{progress.failed ? ` · ${progress.failed} failed` : ""}</p>
          </div>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
          <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>Cancel</button>
          <button type="button" className={primaryButtonClass} disabled={busy || importable.length === 0} onClick={runImport}>{busy ? "Importing…" : `Import ${importable.length} question${importable.length === 1 ? "" : "s"}`}</button>
        </div>
      </div>
    </Editor>
  );
}

function TheoryExamDialog({ exam, courses, questions, settings, onClose, onSaved }) {
  const editing = Boolean(exam);
  const [form, setForm] = useState({
    course_id: exam?.course_id ? String(exam.course_id) : "",
    name: exam?.name || "",
    type: exam?.type || "mock",
    total_marks: exam?.total_marks != null ? String(exam.total_marks) : "",
    pass_mark: exam?.pass_mark != null ? String(exam.pass_mark) : String(settings?.pass_mark ?? 70),
    duration_minutes: exam?.duration_minutes != null ? String(exam.duration_minutes) : "30",
    attempt_limit: exam?.attempt_limit != null ? String(exam.attempt_limit) : String(settings?.attempt_limit ?? 1),
    question_count: exam?.question_count != null ? String(exam.question_count) : "",
    randomize_questions: Boolean(exam?.randomize_questions),
    shuffle_answers: Boolean(exam?.shuffle_answers),
    auto_mark: exam?.auto_mark !== false,
    is_active: exam?.is_active !== false,
    available_from: exam?.available_from ? String(exam.available_from).slice(0, 10) : "",
    available_to: exam?.available_to ? String(exam.available_to).slice(0, 10) : "",
    instructions: exam?.instructions || "",
  });
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const detailLoad = useLoad(
    () => (editing ? drivingGet(`/theory/assessments/${exam.id}`) : Promise.resolve(null)),
    `theory-exam-detail|${exam?.id || "new"}`,
  );

  useEffect(() => {
    const detail = detailLoad.data?.data;
    if (!detail) return;
    setForm((current) => ({
      ...current,
      course_id: detail.course_id ? String(detail.course_id) : current.course_id,
      name: detail.name || current.name,
      type: detail.type || current.type,
      total_marks: detail.total_marks != null ? String(detail.total_marks) : current.total_marks,
      pass_mark: detail.pass_mark != null ? String(detail.pass_mark) : current.pass_mark,
      duration_minutes: detail.duration_minutes != null ? String(detail.duration_minutes) : current.duration_minutes,
      attempt_limit: detail.attempt_limit != null ? String(detail.attempt_limit) : current.attempt_limit,
      question_count: detail.question_count != null ? String(detail.question_count) : "",
      randomize_questions: Boolean(detail.randomize_questions),
      shuffle_answers: Boolean(detail.shuffle_answers),
      auto_mark: detail.auto_mark !== false,
      is_active: detail.is_active !== false,
      available_from: detail.available_from ? String(detail.available_from).slice(0, 10) : "",
      available_to: detail.available_to ? String(detail.available_to).slice(0, 10) : "",
      instructions: detail.instructions || "",
    }));
    setSelected(new Set((detail.questions || []).map((row) => row.id)));
  }, [detailLoad.data]);

  const courseQuestions = questions.filter((row) => {
    if (!form.course_id) return !row.course_id;
    return !row.course_id || String(row.course_id) === String(form.course_id);
  });
  const selectedMarks = courseQuestions
    .filter((row) => selected.has(row.id))
    .reduce((total, row) => total + (Number(row.marks) || 1), 0);

  function toggleQuestion(id) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.course_id) {
      notifyError("Choose the course this exam belongs to.");
      return;
    }
    if (!form.name.trim()) {
      notifyError("Give this exam a name.");
      return;
    }
    setBusy(true);
    try {
      const body = {
        course_id: Number(form.course_id),
        name: form.name.trim(),
        type: form.type,
        total_marks: form.total_marks !== "" ? Number(form.total_marks) : selectedMarks || null,
        pass_mark: Number(form.pass_mark) || 0,
        duration_minutes: form.duration_minutes !== "" ? Number(form.duration_minutes) : null,
        attempt_limit: form.attempt_limit !== "" ? Number(form.attempt_limit) : 0,
        question_count: form.question_count !== "" ? Number(form.question_count) : null,
        randomize_questions: form.randomize_questions,
        shuffle_answers: form.shuffle_answers,
        auto_mark: form.auto_mark,
        is_active: form.is_active,
        available_from: form.available_from || null,
        available_to: form.available_to || null,
        instructions: form.instructions.trim() || null,
        question_ids: [...selected],
      };
      if (editing) {
        await drivingSend(`/theory/assessments/${exam.id}`, "PUT", body);
        notifySuccess("Theory exam updated.");
      } else {
        await drivingSend("/theory/assessments", "POST", body);
        notifySuccess("Theory exam created.");
      }
      onSaved();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save this exam.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Editor open title={editing ? "Edit theory exam" : "New theory exam"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        {editing && detailLoad.data == null && !detailLoad.error ? <p className="theme-subtext text-sm">Loading exam settings…</p> : null}
        {detailLoad.error ? <p className="text-sm text-red-600">{detailLoad.error}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Course">
            <DrivingSelect
              value={form.course_id}
              placeholder="Choose a course"
              onChange={(event) => { setForm({ ...form, course_id: event.target.value }); setSelected(new Set()); }}
              options={[{ value: "", label: "Choose a course" }, ...courses.map((course) => ({ value: String(course.id), label: `${course.name}${course.code ? ` · ${course.code}` : ""}` }))]}
            />
          </Field>
          <Field label="Exam name">
            <input className={inputClass} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Highway code mock" />
          </Field>
          <Field label="Type">
            <DrivingSelect
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value })}
              options={THEORY_EXAM_TYPES.map((type) => ({ value: type.value, label: type.label }))}
            />
          </Field>
          <Field label="Pass mark (%)">
            <input className={inputClass} type="number" min="0" max="100" value={form.pass_mark} onChange={(event) => setForm({ ...form, pass_mark: event.target.value })} />
          </Field>
          <Field label="Duration (minutes)">
            <input className={inputClass} type="number" min="1" max="600" value={form.duration_minutes} onChange={(event) => setForm({ ...form, duration_minutes: event.target.value })} />
          </Field>
          <Field label="Attempt limit (0 = unlimited)">
            <input className={inputClass} type="number" min="0" max="20" value={form.attempt_limit} onChange={(event) => setForm({ ...form, attempt_limit: event.target.value })} />
          </Field>
          <Field label="Available from">
            <input className={inputClass} type="date" value={form.available_from} onChange={(event) => setForm({ ...form, available_from: event.target.value })} />
          </Field>
          <Field label="Available to">
            <input className={inputClass} type="date" value={form.available_to} onChange={(event) => setForm({ ...form, available_to: event.target.value })} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Questions per sitting (optional)">
            <input className={inputClass} type="number" min="1" max="500" value={form.question_count} onChange={(event) => setForm({ ...form, question_count: event.target.value })} placeholder="Use every selected question" />
          </Field>
          <div className="flex flex-col justify-end gap-2 pb-1 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.auto_mark} onChange={(event) => setForm({ ...form, auto_mark: event.target.checked })} />
              Auto-mark answers
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
              Active
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.randomize_questions} onChange={(event) => setForm({ ...form, randomize_questions: event.target.checked })} />
            Randomise question order
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.shuffle_answers} onChange={(event) => setForm({ ...form, shuffle_answers: event.target.checked })} />
            Shuffle answer options
          </label>
        </div>
        <Field label="Instructions for learners">
          <textarea className={`${inputClass} h-20 resize-y py-2`} maxLength={5000} value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} placeholder="Answer all questions. You have 30 minutes." />
        </Field>
        <div>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <p className="theme-subtext text-xs">
              {selected.size} question{selected.size === 1 ? "" : "s"} selected · {selectedMarks} mark{selectedMarks === 1 ? "" : "s"}
              {form.total_marks === "" ? " (total marks taken from the questions)" : ""}
            </p>
            <button type="button" className="theme-subtext text-xs font-medium hover:underline" onClick={() => setSelected(new Set(courseQuestions.map((row) => row.id)))}>Select all</button>
          </div>
          {!form.course_id ? (
            <p className="theme-subtext rounded-xl border border-dashed border-[var(--theme-border)] px-3 py-4 text-xs">Choose a course to pull questions from its bank. Questions shared across all courses are listed too.</p>
          ) : courseQuestions.length === 0 ? (
            <p className="theme-subtext rounded-xl border border-dashed border-[var(--theme-border)] px-3 py-4 text-xs">This course has no questions yet. Add them in the Question bank tab first.</p>
          ) : (
            <ul className="max-h-56 divide-y divide-[var(--theme-border)] overflow-y-auto rounded-xl border border-[var(--theme-border)] px-3">
              {courseQuestions.map((row) => (
                <li key={row.id}>
                  <label className="flex items-start gap-3 py-2 text-sm">
                    <input className="mt-1" type="checkbox" checked={selected.has(row.id)} onChange={() => toggleQuestion(row.id)} />
                    <span className="min-w-0">
                      <span className="theme-heading block text-sm">{row.question}</span>
                      <span className="theme-subtext block text-xs">
                        {questionTypeLabel(row.type)} · {Number(row.marks) || 1} mark{(Number(row.marks) || 1) === 1 ? "" : "s"}
                        {row.topic?.name ? ` · ${row.topic.name}` : row.topic_id ? ` · Topic ${row.topic_id}` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
          <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryButtonClass} disabled={busy || (editing && detailLoad.data == null && !detailLoad.error)}>{busy ? "Saving…" : editing ? "Save exam" : "Create exam"}</button>
        </div>
      </form>
    </Editor>
  );
}

function TheoryExamResultsPanel({ exam, topicNames, canManage, refreshKey, onBack, onMarkAttempt, onReview }) {
  const { data, error } = useLoad(() => drivingGet(`/theory/assessments/${exam.id}/results`), `theory-exam-results|${exam.id}|${refreshKey}`);
  const attempts = rowsOf(data);
  const summary = data?.summary || null;
  const revision = summary?.topics_requiring_revision && !Array.isArray(summary.topics_requiring_revision)
    ? Object.entries(summary.topics_requiring_revision)
    : [];

  return (
    <div>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700">{theoryExamType(exam.type).label}</span>
              <StatusBadge value={exam.is_active === false ? "inactive" : "active"} />
            </div>
            <h2 className="theme-heading mt-2 text-lg font-semibold">{exam.name}</h2>
            <p className="theme-subtext text-xs">
              {[exam.course?.name, `${Number(exam.questions_count) || 0} questions`, exam.duration_minutes ? `${exam.duration_minutes} min` : null, `${Number(exam.pass_mark) || 0}% to pass`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="theme-secondary-btn rounded-lg px-3 py-1.5 text-sm font-medium" onClick={onBack}>All theory exams</button>
            {canManage ? <button type="button" className={primaryButtonClass} onClick={onMarkAttempt}>Mark attempt</button> : null}
          </div>
        </div>
      </Card>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Attempts" value={Number(summary?.attempts) || 0} hint={`${Number(summary?.submitted) || 0} submitted`} icon="pencil-square" />
        <Stat label="Pass rate" value={`${Number(summary?.pass_rate) || 0}%`} hint={`${Number(summary?.passed) || 0} passed · ${Number(summary?.failed) || 0} failed`} icon="patch-check" tone="emerald" />
        <Stat label="Average score" value={`${Number(summary?.average_percentage) || 0}%`} hint="Across submitted attempts" icon="graph-up" tone="sky" />
        <Stat label="Revision topics" value={revision.length} hint="Topics with wrong answers" icon="exclamation-triangle" tone="amber" />
      </div>
      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {!data && !error ? <Card className="mt-4"><p className="theme-subtext text-sm">Loading attempts…</p></Card> : null}
      {revision.length > 0 ? (
        <Card className="mt-4">
          <h3 className="theme-heading font-semibold">Topics needing revision</h3>
          <p className="theme-subtext mt-0.5 text-xs">Learners got these syllabus topics wrong most often. Wrong answers automatically flag the topic for revision on the enrolment.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {revision.map(([topicId, count]) => (
              <span key={topicId} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--theme-border)] px-2.5 py-1 text-xs">
                <span className="theme-heading font-medium">{topicNames.get(Number(topicId)) || `Topic ${topicId}`}</span>
                <span className="theme-subtext tabular-nums">{count} miss{Number(count) === 1 ? "" : "es"}</span>
              </span>
            ))}
          </div>
        </Card>
      ) : null}
      <Card className="mt-4">
        <h3 className="theme-heading font-semibold mb-3">Attempts</h3>
        <DataTable
          empty="No attempts recorded yet. Use Mark attempt to score the first paper."
          rows={attempts}
          columns={[
            { key: "student", label: "Learner", render: (row) => <PersonName name={row.student?.full_name || "Learner"} detail={row.student?.student_number} /> },
            { key: "attempt", label: "Attempt", render: (row) => `#${row.attempt_number}` },
            { key: "score", label: "Score", render: (row) => `${Number(row.score) || 0} / ${Number(row.max_score) || 0}` },
            { key: "percentage", label: "Percentage", render: (row) => <span className="tabular-nums">{Math.round(Number(row.percentage) || 0)}%</span> },
            { key: "result", label: "Result", render: (row) => <StatusBadge value={row.passed ? "passed" : "failed"} /> },
            { key: "submitted", label: "Submitted", render: (row) => shortDate(row.submitted_at) },
            {
              key: "actions",
              label: "",
              render: (row) => (
                <button type="button" className="theme-secondary-btn rounded px-2 py-1 text-[11px] font-medium" onClick={() => onReview?.(row)}>View</button>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}

function TheoryAttemptDialog({ exam, students, onClose, onSaved }) {
  const { data, error } = useLoad(() => drivingGet(`/theory/assessments/${exam.id}`), `theory-attempt-exam|${exam.id}`);
  const detail = data?.data || null;
  const questions = Array.isArray(detail?.questions) ? detail.questions : [];
  const autoMark = detail ? detail.auto_mark !== false : exam.auto_mark !== false;
  const [studentId, setStudentId] = useState("");
  const [answers, setAnswers] = useState({});
  const [score, setScore] = useState("");
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const questionMarks = questions.reduce((total, row) => total + (Number(row.marks) || 1), 0);
  const selectedStudent = students.find((row) => String(row.id) === String(studentId)) || null;
  const enrolment = selectedStudent
    ? (selectedStudent.enrolments || []).find((row) => row.status === "active" && (!detail?.course_id || Number(row.course_id) === Number(detail.course_id)))
      || (selectedStudent.enrolments || []).find((row) => row.status === "active")
      || null
    : null;

  function setAnswer(questionId, value) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }

  function toggleOption(questionId, option) {
    setAnswers((current) => {
      const existing = Array.isArray(current[questionId]) ? current[questionId] : [];
      const next = existing.includes(option) ? existing.filter((value) => value !== option) : [...existing, option];
      return { ...current, [questionId]: next };
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (!studentId) {
      notifyError("Choose the learner who sat this paper.");
      return;
    }
    setBusy(true);
    try {
      const body = { student_id: Number(studentId) };
      if (enrolment) body.enrolment_id = enrolment.id;
      if (autoMark) {
        body.answers = questions
          .map((row) => ({ question_id: row.id, answer: answers[row.id] ?? null }))
          .filter((row) => row.answer !== null && row.answer !== "" && !(Array.isArray(row.answer) && row.answer.length === 0));
      } else {
        body.score = Number(score) || 0;
      }
      if (override) body.override = true;
      const res = await drivingSend(`/theory/assessments/${exam.id}/attempts`, "POST", body);
      const attempt = res?.data;
      const percentage = attempt?.percentage != null ? Math.round(Number(attempt.percentage)) : null;
      notifySuccess(attempt?.passed ? `Attempt passed at ${percentage}%.` : percentage != null ? `Attempt recorded at ${percentage}%.` : "Attempt recorded.");
      onSaved();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not record this attempt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Editor open title="Mark a theory attempt" onClose={onClose} wide>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {!data && !error ? <p className="theme-subtext text-sm">Loading the exam paper…</p> : null}
      {detail ? (
        <form onSubmit={submit} className="space-y-3">
          <p className="theme-subtext text-sm">
            {exam.name} · {autoMark ? "auto-marked against the answer key" : "scored manually"} · {questionMarks || Number(exam.total_marks) || 0} marks
          </p>
          <Field label="Learner">
            <DrivingSelect
              required
              value={studentId}
              placeholder="Choose a learner"
              onChange={(event) => setStudentId(event.target.value)}
              options={[{ value: "", label: "Choose a learner" }, ...students.map((student) => ({ value: String(student.id), label: `${student.full_name} · ${student.student_number}` }))]}
            />
          </Field>
          {selectedStudent ? (
            <p className="theme-subtext text-xs">
              {enrolment
                ? `Wrong answers will flag revision topics on ${enrolment.course?.name || "this learner's enrolment"}.`
                : "This learner has no active enrolment, so revision topics will not be flagged automatically."}
            </p>
          ) : null}
          {autoMark ? (
            questions.length === 0 ? (
              <Empty>This exam has no questions attached. Edit the exam and select questions before marking attempts.</Empty>
            ) : (
              <ul className="max-h-[45vh] divide-y divide-[var(--theme-border)] overflow-y-auto rounded-xl border border-[var(--theme-border)] px-3">
                {questions.map((row, index) => {
                  const options = questionOptions(row);
                  const multiple = row.type === "multiple_answer";
                  return (
                    <li key={row.id} className="py-3">
                      <p className="theme-heading text-sm font-medium">{index + 1}. {row.question}</p>
                      <p className="theme-subtext text-xs">
                        {questionTypeLabel(row.type)} · {Number(row.marks) || 1} mark{(Number(row.marks) || 1) === 1 ? "" : "s"}
                        {row.topic?.name ? ` · ${row.topic.name}` : ""}
                      </p>
                      {options.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {options.map((option) => {
                            const checked = multiple ? (Array.isArray(answers[row.id]) ? answers[row.id] : []).includes(option) : answers[row.id] === option;
                            return (
                              <label
                                key={option}
                                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${checked ? "border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_10%,transparent)]" : "border-[var(--theme-border)]"}`}
                              >
                                <input
                                  type={multiple ? "checkbox" : "radio"}
                                  name={`question-${row.id}`}
                                  checked={checked}
                                  onChange={() => (multiple ? toggleOption(row.id, option) : setAnswer(row.id, option))}
                                />
                                {option}
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <input
                          className={`${inputClass} mt-2`}
                          value={typeof answers[row.id] === "string" ? answers[row.id] : ""}
                          onChange={(event) => setAnswer(row.id, event.target.value)}
                          placeholder="Learner's answer"
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )
          ) : questionMarks === 0 ? (
            <Empty>This exam has no questions attached, so a score cannot be calculated. Edit the exam and select questions first.</Empty>
          ) : (
            <Field label={`Score out of ${questionMarks || Number(exam.total_marks) || 0}`}>
              <input className={inputClass} type="number" min="0" required value={score} onChange={(event) => setScore(event.target.value)} />
            </Field>
          )}
          {Number(exam.attempt_limit) > 0 ? (
            <label className="flex items-start gap-2 text-sm">
              <input className="mt-1" type="checkbox" checked={override} onChange={(event) => setOverride(event.target.checked)} />
              <span>
                <span className="theme-heading block font-medium">Authorise an extra attempt</span>
                <span className="theme-subtext block text-xs">Tick only when a supervisor allows this learner to retake beyond the {exam.attempt_limit}-attempt limit.</span>
              </span>
            </label>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
            <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>Cancel</button>
            <button type="submit" className={primaryButtonClass} disabled={busy || questions.length === 0}>{busy ? "Marking…" : "Save attempt"}</button>
          </div>
        </form>
      ) : null}
    </Editor>
  );
}

function QuestionBankPanel({ questions, courses, loading, error, canEdit, onAdd, onBulk, onEdit, onDelete }) {
  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [licenceFilter, setLicenceFilter] = useState("");
  const [showTip, setShowTip] = useState(true);

  const visible = questions.filter((row) => {
    const needle = query.trim().toLowerCase();
    if (needle && ![row.question, row.category, ...(Array.isArray(row.tags) ? row.tags : [])].filter(Boolean).join(" ").toLowerCase().includes(needle)) return false;
    if (courseFilter && String(row.course_id || "") !== courseFilter) return false;
    if (typeFilter && row.type !== typeFilter) return false;
    if (difficultyFilter && row.difficulty !== difficultyFilter) return false;
    if (topicFilter && row.category !== topicFilter) return false;
    if (licenceFilter && row.licence_category !== licenceFilter) return false;
    return true;
  });

  const withImages = questions.filter((row) => row.image_url).length;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="theme-heading font-semibold">Question bank</h2>
          <p className="theme-subtext mt-0.5 text-xs">The pool of theory questions. Tag each question to a syllabus topic so wrong answers flag revision automatically.</p>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="theme-secondary-btn rounded-lg px-3 py-1.5 text-sm font-medium" onClick={onBulk}>Import</button>
            <button type="button" className={primaryButtonClass} onClick={onAdd}>Add question</button>
          </div>
        ) : null}
      </div>
      {showTip ? (
        <div className="mt-3 flex items-start justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
          <p>{questions.length} questions · {withImages} with road-sign images · bulk import accepts CSV or JSON with one question per row.</p>
          <button type="button" className="font-semibold" onClick={() => setShowTip(false)} aria-label="Dismiss">×</button>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <SearchField value={query} onChange={setQuery} placeholder="Search questions or tags" />
        <FilterSelect
          value={courseFilter}
          placeholder="All courses"
          onChange={(event) => setCourseFilter(event.target.value)}
          options={[{ value: "", label: "All courses" }, ...courses.map((course) => ({ value: String(course.id), label: course.name }))]}
        />
        <FilterSelect
          value={topicFilter}
          placeholder="All topics"
          onChange={(event) => setTopicFilter(event.target.value)}
          options={[{ value: "", label: "All topics" }, ...QUESTION_TOPICS.map((topic) => ({ value: topic, label: topic }))]}
        />
        <FilterSelect
          value={licenceFilter}
          placeholder="All categories"
          onChange={(event) => setLicenceFilter(event.target.value)}
          options={[{ value: "", label: "All categories" }, ...LICENCE_CATEGORIES.map((category) => ({ value: category, label: `Category ${category}` }))]}
        />
        <FilterSelect
          value={typeFilter}
          placeholder="All types"
          onChange={(event) => setTypeFilter(event.target.value)}
          options={[{ value: "", label: "All types" }, ...QUESTION_TYPES.map((type) => ({ value: type.value, label: type.label }))]}
        />
        <FilterSelect
          value={difficultyFilter}
          placeholder="Any difficulty"
          onChange={(event) => setDifficultyFilter(event.target.value)}
          options={[
            { value: "", label: "Any difficulty" },
            { value: "easy", label: "Easy" },
            { value: "medium", label: "Medium" },
            { value: "hard", label: "Hard" },
          ]}
        />
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="theme-subtext mt-3 text-sm">Loading questions…</p> : null}
      {!loading && !error ? (
        <div className="mt-3">
          <DataTable
            empty={questions.length ? "No questions match these filters." : "No questions yet. Add the first one or import a batch to start building theory exams."}
            rows={visible}
            columns={[
              {
                key: "question",
                label: "Question",
                render: (row) => (
                  <div className="flex items-center gap-2">
                    {row.image_url ? <img src={row.image_url} alt="" className="h-8 w-8 shrink-0 rounded border border-[var(--theme-border)] object-cover" /> : null}
                    <span className="theme-heading block max-w-md truncate text-sm">{row.question}</span>
                  </div>
                ),
              },
              { key: "course", label: "Course", render: (row) => row.course?.name || "All courses" },
              { key: "topic", label: "Topic", render: (row) => row.category || row.topic?.name || (row.topic_id ? `Topic ${row.topic_id}` : "—") },
              { key: "licence", label: "Category", render: (row) => row.licence_category || "—" },
              { key: "type", label: "Type", render: (row) => questionTypeLabel(row.type) },
              { key: "difficulty", label: "Difficulty", render: (row) => <span className="capitalize">{row.difficulty || "—"}</span> },
              { key: "status", label: "Status", render: (row) => <StatusBadge value={row.is_active === false ? "inactive" : "active"} /> },
              {
                key: "tags",
                label: "Tags",
                render: (row) => (Array.isArray(row.tags) && row.tags.length ? (
                  <div className="flex max-w-[160px] flex-wrap gap-1">
                    {row.tags.slice(0, 3).map((tag) => <span key={tag} className="rounded-full border border-[var(--theme-border)] px-1.5 py-0.5 text-[10px]">{tag}</span>)}
                    {row.tags.length > 3 ? <span className="theme-subtext text-[10px]">+{row.tags.length - 3}</span> : null}
                  </div>
                ) : "—"),
              },
              {
                key: "actions",
                label: "",
                render: (row) => (canEdit ? (
                  <div className="flex justify-end gap-1">
                    <button type="button" className="theme-secondary-btn rounded px-2 py-1 text-[11px] font-medium" onClick={() => onEdit(row)}>Edit</button>
                    <button type="button" className="theme-secondary-btn rounded px-2 py-1 text-[11px] font-medium" onClick={() => onDelete(row)}>Delete</button>
                  </div>
                ) : "—"),
              },
            ]}
          />
        </div>
      ) : null}
    </Card>
  );
}

function QuestionDialog({ question, courses, onClose, onSaved }) {
  const editing = Boolean(question);
  const [form, setForm] = useState(() => ({
    course_id: question?.course_id ? String(question.course_id) : "",
    topic_id: question?.topic_id ? String(question.topic_id) : "",
    question: question?.question || "",
    type: question?.type || "multiple_choice",
    optionsText: question
      ? (Array.isArray(question.options) ? question.options.map(questionOptionLabel) : []).join("\n")
      : "True\nFalse",
    correct: Array.isArray(question?.correct_answer) ? question.correct_answer.map(String) : [],
    explanation: question?.explanation || "",
    difficulty: question?.difficulty || "medium",
    marks: question?.marks != null ? String(question.marks) : "1",
    category: question?.category || "",
    licence_category: question?.licence_category || "",
    tags: Array.isArray(question?.tags) ? question.tags.join(", ") : "",
    image_url: question?.image_url || "",
    is_active: question?.is_active !== false,
  }));
  const [busy, setBusy] = useState(false);
  const courseLoad = useLoad(
    () => (form.course_id ? drivingGet(`/theory/courses/${form.course_id}`) : Promise.resolve(null)),
    `question-course|${form.course_id}`,
  );

  const course = courseLoad.data?.data || null;
  const templates = Array.isArray(course?.curriculumTemplates) ? course.curriculumTemplates : [];
  const template = templates.find((row) => row.is_active) || templates[0] || null;
  const topicOptions = [];
  for (const syllabusModule of template?.modules || []) {
    for (const unit of syllabusModule.units || []) {
      for (const topic of unit.topics || []) {
        topicOptions.push({ id: topic.id, name: topic.name, module_id: syllabusModule.id, unit_id: unit.id, label: `${topic.name} · ${unit.name}` });
      }
    }
  }

  const options = form.type === "scenario"
    ? []
    : form.optionsText.split("\n").map((value) => value.trim()).filter(Boolean);
  const choiceOptions = form.type === "true_false" ? ["True", "False"] : options;
  const multiple = form.type === "multiple_answer";

  function toggleCorrect(value) {
    setForm((current) => {
      const exists = current.correct.includes(value);
      const next = multiple
        ? exists ? current.correct.filter((item) => item !== value) : [...current.correct, value]
        : [value];
      return { ...current, correct: next };
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.question.trim()) {
      notifyError("Write the question.");
      return;
    }
    setBusy(true);
    try {
      const topic = topicOptions.find((row) => String(row.id) === String(form.topic_id)) || null;
      const body = {
        course_id: form.course_id ? Number(form.course_id) : null,
        module_id: topic?.module_id ?? question?.module_id ?? null,
        topic_id: form.topic_id ? Number(form.topic_id) : null,
        question: form.question.trim(),
        type: form.type,
        options: choiceOptions.length ? choiceOptions : null,
        correct_answer: form.correct.length ? form.correct : null,
        explanation: form.explanation.trim() || null,
        difficulty: form.difficulty,
        marks: Number(form.marks) || 1,
        category: form.category || null,
        licence_category: form.licence_category || null,
        tags: form.tags.split(",").map((value) => value.trim()).filter(Boolean),
        image_url: form.image_url.trim() || null,
        is_active: form.is_active,
      };
      if (editing) {
        await drivingSend(`/theory/questions/${question.id}`, "PUT", body);
        notifySuccess("Question updated.");
      } else {
        await drivingSend("/theory/questions", "POST", body);
        notifySuccess("Question added.");
      }
      onSaved();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save this question.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Editor open title={editing ? "Edit question" : "Add question"} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Course (optional)">
            <DrivingSelect
              value={form.course_id}
              placeholder="All courses"
              onChange={(event) => setForm({ ...form, course_id: event.target.value, topic_id: "" })}
              options={[{ value: "", label: "All courses" }, ...courses.map((course) => ({ value: String(course.id), label: course.name }))]}
            />
          </Field>
          <Field label="Syllabus topic (optional)">
            <DrivingSelect
              value={form.topic_id}
              placeholder={form.course_id ? "No specific topic" : "Choose a course first"}
              onChange={(event) => setForm({ ...form, topic_id: event.target.value })}
              options={[{ value: "", label: "No specific topic" }, ...topicOptions.map((topic) => ({ value: String(topic.id), label: topic.label }))]}
            />
          </Field>
        </div>
        <Field label="Question">
          <textarea className={`${inputClass} h-20 resize-y py-2`} required maxLength={5000} value={form.question} onChange={(event) => setForm({ ...form, question: event.target.value })} placeholder="What does a flashing red traffic light mean?" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Answer format">
            <DrivingSelect
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value, correct: [] })}
              options={QUESTION_TYPES.map((type) => ({ value: type.value, label: type.label }))}
            />
          </Field>
          <Field label="Difficulty">
            <DrivingSelect
              value={form.difficulty}
              onChange={(event) => setForm({ ...form, difficulty: event.target.value })}
              options={[
                { value: "easy", label: "Easy" },
                { value: "medium", label: "Medium" },
                { value: "hard", label: "Hard" },
              ]}
            />
          </Field>
        </div>
        {form.type !== "scenario" && form.type !== "true_false" ? (
          <Field label="Answer options (one per line)">
            <textarea
              className={`${inputClass} h-24 resize-y py-2 font-mono text-xs`}
              value={form.optionsText}
              onChange={(event) => setForm({ ...form, optionsText: event.target.value })}
              placeholder={"Stop\nProceed with caution\nSpeed up"}
            />
            <button type="button" className="theme-subtext mt-1 text-xs font-medium hover:underline" onClick={() => setForm({ ...form, optionsText: "" })}>Clear options</button>
          </Field>
        ) : null}
        <div>
          <p className="theme-subtext mb-1 text-xs">{multiple ? "Correct answers (select all that apply)" : "Correct answer"}</p>
          {choiceOptions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {choiceOptions.map((option) => {
                const checked = form.correct.includes(option);
                return (
                  <label
                    key={option}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${checked ? "border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_10%,transparent)]" : "border-[var(--theme-border)]"}`}
                  >
                    <input type={multiple ? "checkbox" : "radio"} name="correct-answer" checked={checked} onChange={() => toggleCorrect(option)} />
                    {option}
                  </label>
                );
              })}
            </div>
          ) : (
            <input
              className={inputClass}
              value={form.correct.join(", ")}
              onChange={(event) => setForm({ ...form, correct: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })}
              placeholder="Type the expected answer"
            />
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Syllabus topic">
            <DrivingSelect
              value={form.category}
              placeholder="No syllabus topic"
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              options={[{ value: "", label: "No syllabus topic" }, ...QUESTION_TOPICS.map((topic) => ({ value: topic, label: topic }))]}
            />
          </Field>
          <Field label="Licence category">
            <DrivingSelect
              value={form.licence_category}
              placeholder="All categories"
              onChange={(event) => setForm({ ...form, licence_category: event.target.value })}
              options={[{ value: "", label: "All categories" }, ...LICENCE_CATEGORIES.map((category) => ({ value: category, label: `Category ${category}` }))]}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tags (comma separated)">
            <input className={inputClass} value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="traffic signs, signals, junctions" />
          </Field>
          <Field label="Road-sign or diagram image URL">
            <input className={inputClass} value={form.image_url} onChange={(event) => setForm({ ...form, image_url: event.target.value })} placeholder="https://…" />
          </Field>
        </div>
        {form.image_url ? <img src={form.image_url} alt="Question illustration" className="max-h-40 rounded-xl border border-[var(--theme-border)] object-contain" /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Marks">
            <input className={inputClass} type="number" min="0.01" max="100" step="0.01" value={form.marks} onChange={(event) => setForm({ ...form, marks: event.target.value })} />
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
            Active in the bank
          </label>
        </div>
        <Field label="Explanation (shown after marking)">
          <textarea className={`${inputClass} h-20 resize-y py-2`} maxLength={5000} value={form.explanation} onChange={(event) => setForm({ ...form, explanation: event.target.value })} placeholder="Why the correct answer is right" />
        </Field>
        <div className="flex justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
          <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>Cancel</button>
          <button type="submit" className={primaryButtonClass} disabled={busy}>{busy ? "Saving…" : editing ? "Save question" : "Add question"}</button>
        </div>
      </form>
    </Editor>
  );
}

function PaymentFormScreen() {
  const { exitTo } = useRecordExit("Record payment");
  const { organization } = useAuth();
  const { branches, showBranchSelect } = useDrivingBranches();
  const [branchFilter, setBranchFilter] = useState("");
  const { data } = useLoad(() => drivingGet("/invoices", { branch_id: branchFilter || undefined }), `payment-form-invoices|${branchFilter}`);
  const [paper, setPaper] = useState("a4");
  const [slip, setSlip] = useState(null);
  const [payment, setPayment] = useState({ invoice_id: "", amount: "", method: "cash", reference: "" });
  const invoices = rowsOf(data);
  async function save(event) {
    event.preventDefault();
    try {
      const res = await drivingSend("/payments", "POST", { ...payment, invoice_id: Number(payment.invoice_id), amount: Number(payment.amount) });
      notifySuccess(res.message || "Payment recorded.");
      const recorded = res.data || {};
      const invoice = invoices.find((row) => String(row.id) === String(payment.invoice_id)) || {};
      const paymentRow = recorded.id ? recorded : null;
      if (paymentRow) {
        setSlip(buildDrivingFeeReceipt({
          payment: { ...paymentRow, outstanding: recorded.outstanding ?? invoice.outstanding },
          invoice: recorded.invoice || invoice,
          student: recorded.student || invoice.student,
          organization,
        }));
      } else {
        exitTo("/driving-school/payments");
      }
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not record the payment.");
    }
  }
  return (
    <>
    <RecordFormDialog title="Record a receipt" backHref="/driving-school/payments">
      <form onSubmit={save}>
        <div className="grid gap-4 sm:grid-cols-2">
          <BranchField value={branchFilter} onChange={(value) => { setBranchFilter(value); setPayment((current) => ({ ...current, invoice_id: "" })); }} branches={branches} show={showBranchSelect} allowAll />
          <Field label="Invoice">
            <DrivingSelect required value={payment.invoice_id} placeholder="Choose an invoice" onChange={(e) => setPayment({ ...payment, invoice_id: e.target.value })} options={[{ value: "", label: "Choose an invoice" }, ...invoices.map((row) => ({ value: String(row.id), label: `${row.invoice_number} · due ${money(row.outstanding)}` }))]} />
          </Field>
          <Field label="Amount (KSh)"><input className={inputClass} required type="number" min="0" step="0.01" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} /></Field>
          <Field label="Method">
            <DrivingSelect value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })} options={[{ value: "cash", label: "Cash" }, { value: "bank", label: "Bank" }, { value: "card", label: "Card" }, { value: "mpesa", label: "M-Pesa reference" }]} />
          </Field>
          <Field label="Reference"><input className={inputClass} value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} placeholder="Receipt or transaction code" /></Field>
        </div>
        <RecordFormActions backHref="/driving-school/payments" submitLabel="Record receipt" />
        </form>
    </RecordFormDialog>
    {slip ? <ServiceReceiptDialog receipt={slip} paper={paper} onPaper={setPaper} onClose={() => exitTo("/driving-school/payments")} /> : null}
    </>
  );
}

export function PaymentsScreen() {
  const pathname = usePathname();
  return (
    <>
      <PaymentListScreen />
      {pathname.endsWith("/payments/new") ? <PaymentFormScreen /> : null}
    </>
  );
}

function PaymentListScreen() {
  useTabTitle(tabSectionTitle("Payments", "Driving"));
  const { organization } = useAuth();
  const { branches, showBranchSelect } = useDrivingBranches();
  const [branchFilter, setBranchFilter] = useState("");
  const { data, error } = useLoad(() => drivingGet("/invoices", { branch_id: branchFilter || undefined }), `invoices|${branchFilter}`);
  const { data: receiptsData } = useLoad(
    () => drivingGet("/reports", { report: "revenue", from: todayDate(), to: todayDate(), branch_id: branchFilter || undefined }),
    `today-receipts|${branchFilter}`,
  );
  const { data: overviewData } = useLoad(
    () => drivingGet("/fees/overview", { branch_id: branchFilter || undefined }),
    `fees-overview|${branchFilter}`,
  );
  const [paper, setPaper] = useState("a4");
  const [slip, setSlip] = useState(null);
  const overview = overviewData?.data && !Array.isArray(overviewData.data) ? overviewData.data : (overviewData || {});
  const collections = Array.isArray(overview.collections) ? overview.collections : [];
  const aging = Array.isArray(overview.aging) ? overview.aging : [];
  const mpesaFeed = Array.isArray(overview.mpesa) ? overview.mpesa : [];
  const invoices = rowsOf(data);
  const receiptsToday = rowsOf(receiptsData);
  const receivedToday = receiptsToday.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const mpesaToday = receiptsToday.filter((row) => row.method === "mpesa").length;
  const totalFees = invoices.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const totalOutstanding = invoices.reduce((sum, row) => sum + (Number(row.outstanding) || 0), 0);
  const collected = Math.max(0, totalFees - totalOutstanding);
  const oldestDays = Number(overview.oldest_days) || 0;
  const maxAging = Math.max(...aging.map((row) => Number(row.amount) || 0), 1);
  const refundsMonth = overview.refunds_month || {};
  function openReceipt(row) {
    const paymentRow = row.latest_payment;
    if (!paymentRow) return;
    setSlip(buildDrivingFeeReceipt({
      payment: { ...paymentRow, outstanding: row.outstanding },
      invoice: row,
      student: row.student,
      organization,
    }));
  }
  return (
    <div>
      <ScreenHeader title="Payments" subtitle="An M-Pesa reference recorded here is a staff receipt. It is not confirmed by Safaricom unless a configured callback matches it.">
        <AppNavLink href="/driving-school/expenses" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Expenses</AppNavLink>
        <AppNavLink href="/driving-school/payments/new" className={primaryButtonClass}>Record payment</AppNavLink>
      </ScreenHeader>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {showBranchSelect ? (
        <Toolbar>
          <BranchFilter value={branchFilter} onChange={setBranchFilter} branches={branches} show />
        </Toolbar>
      ) : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Today's receipts" value={money(receivedToday)} hint={`${receiptsToday.length} payments · ${mpesaToday} M-Pesa`} icon="phone" tone="sky" />
        <Stat label="Invoices" value={invoices.length} hint={`${invoices.filter((row) => Number(row.outstanding) > 0).length} with a balance`} icon="receipt" tone="violet" />
        <Stat label="Collected" value={money(collected)} hint={`${money(totalFees)} total fees`} icon="check-circle" tone="emerald" />
        <Stat label="Outstanding" value={money(totalOutstanding)} hint="Across all invoices" icon="exclamation-circle" tone="amber" />
        <Stat label="Total fees" value={money(totalFees)} hint="Invoices raised for this school" icon="cash-stack" tone="indigo" />
      </div>
      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="theme-heading font-semibold">Collections trend</h2>
            <span className="theme-subtext text-xs">Last 6 months</span>
          </div>
          <p className="theme-subtext mt-1 text-xs">Receipts recorded each month, before refunds.</p>
          <div className="mt-3">
            <BarChart points={collections.map((row) => ({ label: row.label, value: row.collected }))} format={money} />
          </div>
          <p className="theme-subtext mt-2 text-xs">
            Refunds this month: {refundsMonth.count || 0} · {money(refundsMonth.amount || 0)}
          </p>
        </Card>
        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="theme-heading font-semibold">Outstanding by age</h2>
            <span className="theme-subtext text-xs tabular-nums">Oldest {oldestDays} days</span>
          </div>
          <p className="theme-subtext mt-1 text-xs">Open invoice balances grouped by how long they have gone unpaid.</p>
          {aging.every((row) => !Number(row.amount)) ? (
            <Empty>No unpaid balances in this branch view.</Empty>
          ) : (
            <ul className="mt-3 space-y-3">
              {aging.map((row) => {
                const pct = Math.round(((Number(row.amount) || 0) / maxAging) * 100);
                return (
                  <li key={row.bucket}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="theme-heading font-medium">{row.bucket}</span>
                      <span className="theme-subtext tabular-nums">{row.count} invoice{row.count === 1 ? "" : "s"} · {money(row.amount)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-[color-mix(in_srgb,var(--theme-border)_60%,transparent)]">
                      <div className="h-1.5 rounded-full bg-[var(--theme-primary)]" style={{ width: `${Math.max(2, pct)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
      <Card>
        <div className="flex items-center justify-between gap-2">
          <h2 className="theme-heading font-semibold">M-Pesa feed</h2>
          <span className="theme-subtext text-xs">Latest {mpesaFeed.length} receipt{mpesaFeed.length === 1 ? "" : "s"}</span>
        </div>
        <p className="theme-subtext mt-1 text-xs">A staff receipt is only marked provider-confirmed once a Safaricom callback matches the reference.</p>
        {mpesaFeed.length === 0 ? (
          <Empty>No M-Pesa receipts recorded yet. Record one from the Record payment screen.</Empty>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {mpesaFeed.map((row) => (
              <li key={row.id} className="rounded-lg border border-[var(--theme-border)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <AppNavLink href={`/driving-school/students/${row.student_id}`} className="theme-heading block truncate text-sm font-medium hover:underline">
                      {row.student || "Student"}
                    </AppNavLink>
                    <span className="theme-subtext block truncate text-xs">{row.invoice || "—"} · {row.reference || "No reference"}</span>
                  </span>
                  <span className="theme-heading shrink-0 text-sm font-semibold tabular-nums">{money(row.amount)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="theme-subtext text-xs">{shortDate(row.received_on)}</span>
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${row.provider_confirmed ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {row.provider_confirmed ? "Provider confirmed" : "Staff receipt"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="mt-4">
        <DataTable
          empty="Enrol a student on a priced course to create an invoice."
          rows={invoices}
          columns={[
            { key: "student", label: "Student", render: (row) => <AppNavLink href={`/driving-school/students/${row.student_id}`} className="hover:underline"><PersonName name={row.student?.full_name || "Student"} detail={row.student?.student_number} /></AppNavLink> },
            { key: "invoice", label: "Invoice", render: (row) => row.invoice_number },
            ...(showBranchSelect ? [{ key: "branch", label: "Branch", render: (row) => branchNameOf(branches, row.branch_id ?? row.student?.branch_id) }] : []),
            { key: "kind", label: "Description", render: (row) => <span className="capitalize">{row.kind}</span> },
            { key: "amount", label: "Amount", render: (row) => money(row.amount) },
            { key: "method", label: "Method", render: (row) => <span className="capitalize">{row.latest_payment?.method || "—"}</span> },
            { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
            { key: "receipt", label: "", render: (row) => row.latest_payment ? <button type="button" className="theme-link text-sm font-medium" onClick={() => openReceipt(row)}>Receipt</button> : null },
          ]}
        />
      </Card>
      {slip ? <ServiceReceiptDialog receipt={slip} paper={paper} onPaper={setPaper} onClose={() => setSlip(null)} /> : null}
    </div>
  );
}

export function ExpensesScreen() {
  useTabTitle(tabSectionTitle("Expenses", "Driving"));
  return (
    <DirectoryScreen
      title="Expenses"
      subtitle="Expenses are operating costs. They are not subtracted from the collected-fees figure on the dashboard."
      path="/expenses"
      fields={[
        { name: "category", label: "Category", required: true },
        { name: "amount", label: "Amount (KSh)", type: "number", required: true },
        { name: "spent_on", label: "Date", type: "date", required: true },
      ]}
      columns={["spent_on", "category", "amount"]}
    />
  );
}

const DRIVING_REPORTS = {
  enrolments: {
    label: "Enrolments",
    columns: [["registered_on", "Registered"], ["student_number", "Number"], ["full_name", "Student"], ["status", "Status"]],
  },
  outstanding: {
    label: "Outstanding fees",
    columns: [["invoice_number", "Invoice"], ["outstanding", "Outstanding"], ["age_bucket", "Age bucket"], ["age_days", "Days open"], ["status", "Status"]],
    money: ["outstanding"],
  },
  lessons: {
    label: "Lessons",
    columns: [["starts_at", "Starts"], ["lesson_type", "Type"], ["attendance", "Attendance"], ["status", "Status"]],
  },
  vehicles: {
    label: "Vehicles",
    columns: [["registration_number", "Registration"], ["make", "Make"], ["model", "Model"], ["status", "Status"], ["insurance_expires_on", "Insurance expires"], ["inspection_expires_on", "Inspection expires"]],
  },
  expenses: {
    label: "Expenses",
    columns: [["spent_on", "Date"], ["category", "Category"], ["amount", "Amount"]],
    money: ["amount"],
  },
  course_performance: {
    label: "Course performance",
    columns: [["course", "Course"], ["code", "Code"], ["enrolments", "Enrolments"], ["active", "Active"], ["completed", "Completed"], ["avg_progress", "Avg progress %"], ["revenue", "Revenue"]],
    money: ["revenue"],
  },
  instructor_performance: {
    label: "Instructor performance",
    columns: [["instructor", "Instructor"], ["number", "Number"], ["lessons", "Lessons"], ["completed", "Completed"], ["no_shows", "No-shows"], ["completion_rate", "Completion %"], ["earnings", "Lesson pay"]],
    money: ["earnings"],
  },
  lesson_attendance: {
    label: "Lesson attendance",
    columns: [["starts_at", "Starts"], ["instructor", "Instructor"], ["type", "Type"], ["attendance", "Attendance"], ["status", "Status"]],
  },
  completions: {
    label: "Completions",
    columns: [["student_number", "Number"], ["student", "Student"], ["course", "Course"], ["enrolled_on", "Enrolled"], ["completed_on", "Completed"]],
  },
  exams: {
    label: "Examination results",
    columns: [["student_number", "Number"], ["student", "Student"], ["kind", "Kind"], ["title", "Exam"], ["score", "Score"], ["max_score", "Max"], ["result", "Result"], ["assessed_on", "Date"]],
  },
  vehicle_utilisation: {
    label: "Vehicle utilisation",
    columns: [["registration_number", "Registration"], ["make", "Make"], ["model", "Model"], ["status", "Status"], ["lessons", "Lessons"], ["completed", "Completed"], ["utilisation", "Utilisation %"], ["service_cost", "Service cost"]],
    money: ["service_cost"],
  },
  branch_comparison: {
    label: "Branch comparison",
    columns: [["branch", "Branch"], ["active_students", "Students"], ["enrolments", "Enrolments"], ["lessons", "Lessons"], ["collected", "Collected"], ["outstanding", "Outstanding"]],
    money: ["collected", "outstanding"],
  },
  fuel: {
    label: "Fuel log",
    columns: [["filled_on", "Date"], ["registration_number", "Vehicle"], ["litres", "Litres"], ["cost", "Cost"], ["odometer", "Odometer"], ["station", "Station"]],
    money: ["cost"],
  },
};

function reportCell(row, key, moneyKeys) {
  const value = row?.[key];
  if (value == null || value === "") return "—";
  if (moneyKeys.includes(key)) return money(value);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return text.replace("T", " ").slice(0, 16);
  return text;
}

export function ReportsScreen({ reportKey }) {
  if (reportKey && DRIVING_REPORTS[reportKey]) return <ReportDetailScreen reportKey={reportKey} />;
  return <ReportHubScreen />;
}

function ReportHubScreen() {
  useTabTitle(tabSectionTitle("Reports", "Driving"));
  const groups = [
    {
      title: "Money",
      items: ["outstanding", "expenses"],
    },
    {
      title: "Students & courses",
      items: ["enrolments", "completions", "course_performance"],
    },
    {
      title: "Lessons & exams",
      items: ["lessons", "lesson_attendance", "exams", "instructor_performance"],
    },
    {
      title: "Fleet & branches",
      items: ["vehicles", "vehicle_utilisation", "fuel", "branch_comparison"],
    },
  ];
  return (
    <div>
      <ScreenHeader title="Reports & analytics" subtitle="Each report opens on its own page with a date range, branch filter, charts, and Excel, PDF, and CSV export." />
      <div className="space-y-4">
        {groups.map((group) => (
          <Card key={group.title}>
            <h2 className="theme-heading font-semibold">{group.title}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((key) => {
                const meta = REPORT_META[key];
                const spec = DRIVING_REPORTS[key];
                return (
                  <AppNavLink
                    key={key}
                    href={`/driving-school/reports/${key}`}
                    className="group flex items-start gap-3 rounded-xl border border-[var(--theme-border)] px-3 py-3 transition hover:border-[var(--theme-primary)]"
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.tone}`} aria-hidden>
                      <i className={`bi bi-${meta.icon}`} />
                    </span>
                    <span className="min-w-0">
                      <span className="theme-heading block text-sm font-semibold group-hover:text-[var(--theme-primary)]">{spec.label}</span>
                      <span className="theme-subtext mt-0.5 block text-xs">{meta.blurb}</span>
                    </span>
                  </AppNavLink>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

const REPORT_META = {
  enrolments: { icon: "person-plus", tone: "bg-indigo-50 text-indigo-700", blurb: "Students registered in the period, filterable by branch." },
  outstanding: { icon: "exclamation-circle", tone: "bg-amber-50 text-amber-800", blurb: "Invoices still carrying a balance, oldest exposure first." },
  lessons: { icon: "calendar3", tone: "bg-sky-50 text-sky-700", blurb: "Booked lessons with type, attendance, and status." },
  vehicles: { icon: "car-front", tone: "bg-violet-50 text-violet-700", blurb: "Fleet register with insurance and inspection dates." },
  expenses: { icon: "receipt", tone: "bg-rose-50 text-rose-700", blurb: "Operating costs recorded against the school." },
  course_performance: { icon: "journal-bookmark", tone: "bg-emerald-50 text-emerald-700", blurb: "Enrolments, completion, progress, and revenue per course." },
  instructor_performance: { icon: "person-badge", tone: "bg-sky-50 text-sky-700", blurb: "Lessons delivered, completion rate, no-shows, and pay." },
  lesson_attendance: { icon: "clipboard-check", tone: "bg-indigo-50 text-indigo-700", blurb: "Attendance marks per lesson, with instructor and type." },
  completions: { icon: "award", tone: "bg-amber-50 text-amber-800", blurb: "Students who finished a course, with dates." },
  exams: { icon: "patch-question", tone: "bg-violet-50 text-violet-700", blurb: "Assessment results with theory, practical, and mock breakdown." },
  vehicle_utilisation: { icon: "speedometer2", tone: "bg-sky-50 text-sky-700", blurb: "Lessons per vehicle, utilisation, and service cost." },
  fuel: { icon: "fuel-pump", tone: "bg-rose-50 text-rose-700", blurb: "Fuel spend by vehicle, with litres and odometer readings." },
  branch_comparison: { icon: "diagram-3", tone: "bg-indigo-50 text-indigo-700", blurb: "Students, lessons, collections, and balances per branch." },
};

function ReportDetailScreen({ reportKey }) {
  const { branches, showBranchSelect } = useDrivingBranches();
  const [branch, setBranch] = useState("");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayDate);
  const [appliedFrom, setAppliedFrom] = useState(monthStart);
  const [appliedTo, setAppliedTo] = useState(todayDate);
  const appliedReport = reportKey;
  const spec = DRIVING_REPORTS[appliedReport];
  useTabTitle(spec ? tabSectionTitle(spec.label || appliedReport, "Driving") : null);
  const { data, error } = useLoad(
    () => drivingGet("/reports", { report: appliedReport, from: appliedFrom, to: appliedTo, branch_id: branch || undefined }),
    `${appliedReport}:${appliedFrom}:${appliedTo}:${branch}`,
  );
  const assessmentsLoad = useLoad(
    () => drivingGet("/assessments", { branch_id: branch || undefined }),
    `report-assessments:${branch}`,
  );
  const rows = rowsOf(data);
  const moneyKeys = spec.money || [];
  const totals = moneyKeys.map((key) => rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0));
  const dateKey = (spec.columns.find(([key]) => ["received_on", "registered_on", "starts_at", "spent_on", "assessed_on", "completed_on"].includes(key)) || [])[0] || null;
  const chartPoints = useMemo(() => {
    if (!dateKey) return [];
    const moneyKey = spec.money?.[0] || null;
    const buckets = new Map();
    for (const row of rows) {
      const key = String(row[dateKey] || "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(key)) continue;
      const amount = moneyKey ? Number(row[moneyKey]) || 0 : 1;
      buckets.set(key, (buckets.get(key) || 0) + amount);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, value]) => ({ label: `${monthLabel(key).slice(0, 3)} ${key.slice(2, 4)}`, value }));
  }, [dateKey, rows, spec]);
  const periodAssessments = rowsOf(assessmentsLoad.data).filter((row) => {
    const key = String(row.assessed_on || "").slice(0, 10);
    return key >= appliedFrom && key <= appliedTo;
  });
  const passedCount = periodAssessments.filter((row) => row.passed).length;
  const passRate = periodAssessments.length ? Math.round((passedCount / periodAssessments.length) * 100) : 0;
  const typeRates = ["theory", "practical", "mock"].map((kind) => {
    const group = periodAssessments.filter((row) => row.kind === kind);
    const passed = group.filter((row) => row.passed).length;
    return { kind, total: group.length, passed, rate: group.length ? Math.round((passed / group.length) * 100) : 0 };
  });
  const chartFormat = moneyKeys.length ? money : (value) => `${value}`;

  async function exportExcel() {
    const header = spec.columns.map(([, label]) => label);
    const body = rows.map((row) => spec.columns.map(([key]) => {
      const value = row?.[key];
      if (value == null || value === "") return "";
      if (moneyKeys.includes(key)) return Number(value) || 0;
      return String(value);
    }));
    await downloadExcelFromRows(`driving-${appliedReport}.xlsx`, spec.label, [header, ...body]);
  }

  async function exportPdf() {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(14);
    doc.text(`${spec.label} · ${appliedFrom} to ${appliedTo}`, 40, 40);
    doc.setFontSize(9);
    const header = spec.columns.map(([, label]) => label).join("  |  ");
    let y = 70;
    doc.text(header, 40, y);
    y += 16;
    for (const row of rows) {
      if (y > 540) {
        doc.addPage();
        y = 40;
      }
      doc.text(spec.columns.map(([key]) => reportCell(row, key, moneyKeys)).join("  |  "), 40, y);
      y += 14;
    }
    doc.save(`driving-${appliedReport}.pdf`);
  }

  async function exportCsv() {
    try {
      const query = `report=${appliedReport}&from=${appliedFrom}&to=${appliedTo}&format=csv${branch ? `&branch_id=${branch}` : ""}`;
      const blob = await apiFetchBlob(`/driving-school/reports?${query}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `driving-${appliedReport}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not export this report.");
    }
  }

  return (
    <div>
      <ScreenHeader title={spec.label} subtitle={REPORT_META[appliedReport]?.blurb || data?.note || "Report for the selected period."}>
        <AppNavLink href="/driving-school/reports" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">All reports</AppNavLink>
        <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={() => void exportCsv()}>CSV</button>
        <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={() => void exportExcel().catch((err) => notifyError(err instanceof Error ? err.message : "Could not export Excel."))}>Excel</button>
        <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={() => void exportPdf().catch((err) => notifyError(err instanceof Error ? err.message : "Could not export PDF."))}>PDF</button>
      </ScreenHeader>
      <Toolbar>
        <BranchFilter value={branch} onChange={setBranch} branches={branches} show={showBranchSelect} />
        <input className="theme-input theme-input-focus h-[38px] w-auto min-w-[10.5rem] rounded-lg border px-3 py-2 text-sm outline-none" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} aria-label="From" />
        <input className="theme-input theme-input-focus h-[38px] w-auto min-w-[10.5rem] rounded-lg border px-3 py-2 text-sm outline-none" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} aria-label="To" />
        <button
          type="button"
          className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium"
          onClick={() => {
            setAppliedFrom(from);
            setAppliedTo(to);
          }}
        >
          Filter
        </button>
      </Toolbar>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {moneyKeys.length > 0 ? (
          <Stat label={spec.label} value={money(totals[0] || 0)} hint={`${rows.length} rows`} icon="bar-chart-line" tone="indigo" />
        ) : (
          <Stat label={spec.label} value={rows.length} hint="Rows in period" icon="bar-chart-line" tone="indigo" />
        )}
        <Stat label="Period" value={monthLabel(appliedFrom.slice(0, 7)).slice(0, 3)} hint={`${appliedFrom} → ${appliedTo}`} icon="calendar3" tone="sky" />
        {appliedReport === "exams" ? (
          <Stat label="Pass rate" value={`${passRate}%`} hint={`${passedCount}/${periodAssessments.length} assessments`} icon="clipboard-check" tone="emerald" />
        ) : (
          <Stat label="Rows" value={rows.length} hint={`${appliedFrom} → ${appliedTo}`} icon="list-ol" tone="violet" />
        )}
      </div>
      <div className={`mb-4 grid gap-4 ${dateKey ? (appliedReport === "exams" ? "xl:grid-cols-[minmax(0,1fr)_280px]" : "xl:grid-cols-[minmax(0,1fr)]") : "xl:grid-cols-[280px]"}`}>
        {dateKey ? (
          <Card>
            <h2 className="theme-heading mb-3 font-semibold">{moneyKeys.length ? `${spec.label} trend` : `${spec.label} volume`}</h2>
            <BarChart points={chartPoints} format={chartFormat} />
          </Card>
        ) : null}
        {appliedReport === "exams" ? (
          <Card className="flex flex-col items-center justify-center gap-2">
            <h2 className="theme-heading font-semibold">Pass rate</h2>
            <Donut value={passRate} label={periodAssessments.length ? `${passedCount}/${periodAssessments.length} passed` : "No assessments yet"} />
          </Card>
        ) : null}
      </div>
      {appliedReport === "exams" ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {typeRates.map((row) => (
            <Card key={row.kind} className="flex items-center gap-4">
              <Donut value={row.rate} label={`${row.passed}/${row.total}`} />
              <div>
                <p className="theme-heading text-sm font-semibold capitalize">{row.kind === "mock" ? "Mock exams" : row.kind}</p>
                <p className="theme-subtext mt-0.5 text-xs">{row.total === 0 ? "Nothing recorded in this period." : `${row.passed} passed of ${row.total}`}</p>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
      <Card>
        <DataTable
          empty="No rows for this report."
          rows={rows}
          columns={spec.columns.map(([key, label]) => ({
            key,
            label,
            render: (row) => {
              if (["status", "result", "attendance"].includes(key)) return row[key] ? <StatusBadge value={row[key]} /> : "—";
              return reportCell(row, key, moneyKeys);
            },
          }))}
        />
      </Card>
    </div>
  );
}

function monthStart() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function ExistingListScreen({ title, subtitle, path, label }) {
  const { data, error } = useLoad(() => apiRequest(path), path);
  const list = rowsOf(data);
  return (
    <div>
      <PageTitle title={title} subtitle={subtitle} />
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <Card>
        {list.length === 0 ? <Empty>Nothing to show. Manage these records from Administration when you have that permission.</Empty> : list.map((row) => (
          <p key={row.id} className="border-b border-[var(--theme-border)] py-2 text-sm">{label(row)}</p>
        ))}
      </Card>
    </div>
  );
}

function prettyTemplate(value) {
  return String(value || "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function OutreachComposeDialog({ ready, onClose, onSaved, student: presetStudent = null, initialMessage = "" }) {
  const { data } = useLoad(
    () => drivingGet("/students", { per_page: 200, status: "active" }),
    "outreach-students",
  );
  const students = rowsOf(data);
  const [audience, setAudience] = useState("student");
  const [studentId, setStudentId] = useState(presetStudent ? String(presetStudent.id) : "");
  const [message, setMessage] = useState(initialMessage);
  const [busy, setBusy] = useState(false);
  const presetOption = presetStudent
    ? { value: String(presetStudent.id), label: `${presetStudent.full_name}${presetStudent.phone ? ` · ${presetStudent.phone}` : ""}` }
    : null;
  const studentOptions = [
    ...(presetOption && !students.some((student) => String(student.id) === presetOption.value) ? [presetOption] : []),
    ...students.map((student) => ({ value: String(student.id), label: `${student.full_name}${student.phone ? ` · ${student.phone}` : ""}` })),
  ];

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const res = await drivingSend("/notifications", "POST", {
        audience,
        student_id: audience === "student" ? Number(studentId) : undefined,
        message,
        send_now: true,
      });
      notifySuccess(res.message || "Message sent.");
      onSaved();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not send this message.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Editor open title="Compose message" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Audience">
            <DrivingSelect value={audience} onChange={(e) => setAudience(e.target.value)} options={[{ value: "student", label: "One student" }, { value: "all_active", label: "All active students" }]} />
          </Field>
          {audience === "student" ? (
            <Field label="Student">
              <DrivingSelect
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                options={studentOptions}
                placeholder="Choose a student"
              />
            </Field>
          ) : null}
        </div>
        <Field label={`Message (${message.length}/480)`}>
          <textarea
            className="theme-input theme-input-focus w-full rounded-lg border px-3 py-2 text-sm outline-none"
            rows={4}
            maxLength={480}
            required
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Practical lessons resume on Monday at 8am."
          />
        </Field>
        {ready ? null : (
          <p className="theme-subtext text-xs">
            Connect your SMS provider under Settings → SMS &amp; email to send this message.
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
          <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>Cancel</button>
          <button className={primaryButtonClass} type="submit" disabled={busy || !ready || !message.trim() || (audience === "student" && !studentId)}>
            {busy ? "Sending…" : "Send message"}
          </button>
        </div>
      </form>
    </Editor>
  );
}

export function NotificationsScreen() {
  const { hasPermission } = useAuth();
  useTabTitle(tabSectionTitle("Outreach", "Driving"));
  const { branches, showBranchSelect } = useDrivingBranches();
  const [branchFilter, setBranchFilter] = useState("");
  const { data, error, reload } = useLoad(() => drivingGet("/notifications", { per_page: 50, branch_id: branchFilter || undefined }), `notifications|${branchFilter}`);
  const messaging = useLoad(() => drivingGet("/messaging"), "outreach-messaging");
  const [composing, setComposing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [queueBusy, setQueueBusy] = useState(false);
  const rows = rowsOf(data);
  const ready = Boolean(messaging.data?.data?.status?.sms_ready);
  const queuedAll = Number(messaging.data?.data?.queued_count ?? rows.filter((row) => row.status === "queued").length);
  const canSend = hasPermission("driving.outreach.create");

  async function refreshAll() {
    reload();
    messaging.reload();
  }

  async function sendQueued() {
    setQueueBusy(true);
    try {
      const res = await drivingSend("/notifications/send-queued", "POST");
      notifySuccess(res.message || "Queued messages processed.");
      await refreshAll();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not send the queued messages.");
    } finally {
      setQueueBusy(false);
    }
  }

  async function sendOne(row) {
    setBusyId(row.id);
    try {
      const res = await drivingSend(`/notifications/${row.id}/send`, "POST");
      notifySuccess(res.message || "SMS sent.");
      await refreshAll();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not send this message.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <ScreenHeader title="Outreach" subtitle="Send SMS to students through Africa's Talking and track lesson reminders, receipts and announcements.">
        <BranchFilter value={branchFilter} onChange={setBranchFilter} branches={branches} show={showBranchSelect} />
        {canSend ? <button type="button" className={primaryButtonClass} onClick={() => setComposing(true)}>Compose message</button> : null}
        {canSend && ready && queuedAll > 0 ? (
          <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={sendQueued} disabled={queueBusy}>
            {queueBusy ? "Sending…" : `Send queued (${queuedAll})`}
          </button>
        ) : null}
      </ScreenHeader>
      {!ready && queuedAll > 0 ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="flex items-start gap-2">
            <i className="bi bi-exclamation-triangle mt-0.5" aria-hidden />
            <span>{queuedAll} message(s) are waiting. Connect Africa&apos;s Talking to deliver them.</span>
          </span>
          {hasPermission("driving.settings.view") ? <AppNavLink href="/driving-school/settings" className="font-medium underline">Open Settings → SMS & email</AppNavLink> : null}
        </div>
      ) : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Queued" value={queuedAll} hint={ready ? "Ready to send" : "Waiting for a provider"} icon="clock-history" tone="amber" />
        <Stat label="Sent" value={rows.filter((row) => row.status === "sent").length} hint="In the latest messages" icon="check-circle" tone="emerald" />
        <Stat label="Failed" value={rows.filter((row) => row.status === "failed").length} hint="Check the phone or provider" icon="exclamation-circle" tone="rose" />
      </div>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <Card>
        <DataTable
          empty="Nothing queued yet. Lesson reminders are created automatically for upcoming lessons."
          rows={rows}
          columns={[
            { key: "student", label: "Student", render: (row) => <PersonName name={row.student?.full_name || "School"} detail={row.student?.student_number} /> },
            ...(showBranchSelect ? [{ key: "branch", label: "Branch", render: (row) => branchNameOf(branches, row.branch_id) }] : []),
            { key: "template", label: "Message", render: (row) => prettyTemplate(row.template) },
            { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
            { key: "created_at", label: "Queued", render: (row) => shortDateTime(row.created_at) },
            { key: "sent_at", label: "Sent", render: (row) => (row.sent_at ? shortDateTime(row.sent_at) : "—") },
            { key: "body", label: "Body", render: (row) => <span className="theme-subtext line-clamp-2 block max-w-md text-xs">{row.body}</span> },
            ...(canSend && ready ? [{
              key: "actions",
              label: "",
              render: (row) => (row.status === "queued" ? (
                <button type="button" className="theme-link text-sm font-medium" onClick={() => sendOne(row)} disabled={busyId === row.id}>
                  {busyId === row.id ? "Sending…" : "Send"}
                </button>
              ) : null),
            }] : []),
          ]}
        />
      </Card>
      {composing ? (
        <OutreachComposeDialog
          ready={ready}
          onClose={() => setComposing(false)}
          onSaved={() => { setComposing(false); refreshAll(); }}
        />
      ) : null}
    </div>
  );
}

const DRIVING_FEATURE_FIELDS = [
  ["vehicles", "Vehicles", "Fleet records and vehicle assignment on lessons."],
  ["theory", "Theory lessons", "Theory as a lesson and assessment type."],
  ["assessments", "Assessments", "Internal practical and theory checks."],
  ["fees", "Fees & receipts", "Invoices and fee collection."],
  ["expenses", "Expenses", "Operating costs, kept separate from collected fees."],
];

function MessagingStatusPill({ ready }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden />
      {ready ? "Ready to send" : "Needs setup"}
    </span>
  );
}

function MessagingIssues({ issues }) {
  if (!issues?.length) return null;
  return (
    <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      {issues.map((issue) => (
        <li key={issue} className="flex items-start gap-2">
          <i className="bi bi-exclamation-triangle mt-0.5 shrink-0" aria-hidden />
          <span>{issue}</span>
        </li>
      ))}
    </ul>
  );
}

function MessagingPanel() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("driving.settings.edit");
  const { data, error, reload } = useLoad(() => drivingGet("/messaging"), "settings-messaging");
  const status = data?.data?.status || {};
  const queuedCount = Number(data?.data?.queued_count || 0);
  const [smsForm, setSmsForm] = useState({
    sms_enabled: false,
    africas_talking_username: "",
    africas_talking_api_key: "",
    africas_talking_sender_id: "",
    reminder_hours: 24,
    queue_reminders: true,
  });
  const [emailForm, setEmailForm] = useState({
    email_enabled: false,
    email_from_name: "",
    email_from_address: "",
    smtp_enabled: false,
    smtp_host: "",
    smtp_port: 587,
    smtp_username: "",
    smtp_password: "",
    smtp_encryption: "tls",
  });
  const [smsTest, setSmsTest] = useState({ phone: "", message: "" });
  const [emailTest, setEmailTest] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    const saved = data?.data;
    if (!saved?.settings) return;
    const settings = saved.settings;
    setSmsForm({
      sms_enabled: Boolean(settings.sms_enabled),
      africas_talking_username: settings.africas_talking_username || "",
      africas_talking_api_key: settings.africas_talking_api_key || "",
      africas_talking_sender_id: settings.africas_talking_sender_id || "",
      reminder_hours: saved.reminder_hours || 24,
      queue_reminders: saved.queue_reminders !== false,
    });
    setEmailForm({
      email_enabled: Boolean(settings.email_enabled),
      email_from_name: settings.email_from_name || "",
      email_from_address: settings.email_from_address || "",
      smtp_enabled: Boolean(settings.smtp_enabled),
      smtp_host: settings.smtp_host || "",
      smtp_port: settings.smtp_port || 587,
      smtp_username: settings.smtp_username || "",
      smtp_password: settings.smtp_password || "",
      smtp_encryption: settings.smtp_encryption || "tls",
    });
  }, [data]);

  async function saveSms(event) {
    event.preventDefault();
    setBusy("sms");
    try {
      const res = await drivingSend("/messaging", "PATCH", {
        sms_enabled: smsForm.sms_enabled,
        africas_talking_username: smsForm.africas_talking_username || null,
        africas_talking_api_key: smsForm.africas_talking_api_key || null,
        africas_talking_sender_id: smsForm.africas_talking_sender_id || null,
        reminder_hours: Number(smsForm.reminder_hours) || 24,
        queue_reminders: smsForm.queue_reminders,
      });
      notifySuccess(res.message || "SMS settings saved.");
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save SMS settings.");
    } finally {
      setBusy("");
    }
  }

  async function saveEmail(event) {
    event.preventDefault();
    setBusy("email");
    try {
      const res = await drivingSend("/messaging", "PATCH", {
        email_enabled: emailForm.email_enabled,
        email_from_name: emailForm.email_from_name || null,
        email_from_address: emailForm.email_from_address || null,
        smtp_enabled: emailForm.smtp_enabled,
        smtp_host: emailForm.smtp_host || null,
        smtp_port: Number(emailForm.smtp_port) || 587,
        smtp_username: emailForm.smtp_username || null,
        smtp_password: emailForm.smtp_password || null,
        smtp_encryption: emailForm.smtp_encryption,
      });
      notifySuccess(res.message || "Email settings saved.");
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save email settings.");
    } finally {
      setBusy("");
    }
  }

  async function sendTestSms(event) {
    event.preventDefault();
    setBusy("sms-test");
    try {
      const res = await drivingSend("/messaging/test-sms", "POST", {
        phone: smsTest.phone,
        message: smsTest.message || null,
      });
      notifySuccess(res.message || "Test SMS sent.");
      setSmsTest({ phone: smsTest.phone, message: "" });
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not send the test SMS.");
    } finally {
      setBusy("");
    }
  }

  async function sendTestEmail(event) {
    event.preventDefault();
    setBusy("email-test");
    try {
      const res = await drivingSend("/messaging/test-email", "POST", { email: emailTest });
      notifySuccess(res.message || "Test email sent.");
      setEmailTest("");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not send the test email.");
    } finally {
      setBusy("");
    }
  }

  async function sendQueued() {
    setBusy("queue");
    try {
      const res = await drivingSend("/notifications/send-queued", "POST");
      notifySuccess(res.message || "Queued messages processed.");
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not send the queued messages.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="SMS · Africa's Talking"
          value={status.sms_ready ? "Ready" : smsForm.sms_enabled ? "Incomplete" : "Off"}
          hint={smsForm.sms_enabled ? "Reminders and outreach send automatically" : "Enable SMS to start sending"}
          icon="chat-dots"
          tone="indigo"
        />
        <Stat
          label="Email"
          value={status.email_ready ? "Ready" : emailForm.email_enabled ? "Incomplete" : "Off"}
          hint={status.uses_organization_smtp ? "Using your SMTP server" : "Server transport"}
          icon="envelope"
          tone="sky"
        />
        <Stat label="Queued messages" value={queuedCount} hint="Waiting for delivery" icon="clock-history" tone="amber" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="theme-heading text-sm font-semibold">SMS · Africa&apos;s Talking</h2>
              <p className="theme-subtext mt-1 text-xs">Lesson reminders, receipts and announcements go out through your Africa&apos;s Talking account.</p>
            </div>
            <MessagingStatusPill ready={status.sms_ready} />
          </div>
          <form className="mt-4 space-y-4" onSubmit={saveSms}>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={smsForm.sms_enabled} onChange={(e) => setSmsForm({ ...smsForm, sms_enabled: e.target.checked })} disabled={!canEdit} />
              <span>
                <span className="theme-heading font-medium">Send SMS</span>
                <span className="theme-subtext mt-0.5 block text-xs">When off, messages stay queued and nothing leaves the school.</span>
              </span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Africa&apos;s Talking username">
                <input className={inputClass} value={smsForm.africas_talking_username} onChange={(e) => setSmsForm({ ...smsForm, africas_talking_username: e.target.value })} disabled={!canEdit} autoComplete="off" />
              </Field>
              <Field label="Sender ID">
                <input className={inputClass} maxLength={20} value={smsForm.africas_talking_sender_id} onChange={(e) => setSmsForm({ ...smsForm, africas_talking_sender_id: e.target.value })} placeholder="DRIVESCHOOL" disabled={!canEdit} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="API key">
                  <input className={inputClass} type="password" value={smsForm.africas_talking_api_key} onChange={(e) => setSmsForm({ ...smsForm, africas_talking_api_key: e.target.value })} disabled={!canEdit} autoComplete="new-password" />
                </Field>
                <p className="theme-subtext mt-1 text-xs">Create a key in Africa&apos;s Talking → SMS → API keys. A saved key shows masked; leave it unchanged to keep it.</p>
              </div>
            </div>
            <div className="grid gap-4 border-t border-[var(--theme-border)] pt-4 sm:grid-cols-2">
              <Field label="Reminder hours before a lesson">
                <input className={inputClass} type="number" min="1" max="168" value={smsForm.reminder_hours} onChange={(e) => setSmsForm({ ...smsForm, reminder_hours: e.target.value })} disabled={!canEdit} />
              </Field>
              <label className="flex items-start gap-2 self-end text-sm">
                <input type="checkbox" className="mt-1" checked={smsForm.queue_reminders} onChange={(e) => setSmsForm({ ...smsForm, queue_reminders: e.target.checked })} disabled={!canEdit} />
                <span>
                  <span className="theme-heading font-medium">Queue lesson reminders</span>
                  <span className="theme-subtext mt-0.5 block text-xs">Automatic reminders are created for upcoming lessons.</span>
                </span>
              </label>
            </div>
            <MessagingIssues issues={status.issues} />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--theme-border)] pt-4">
              <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={sendQueued} disabled={!canEdit || busy === "queue" || queuedCount === 0}>
                {busy === "queue" ? "Sending…" : `Send queued (${queuedCount})`}
              </button>
              <button className={primaryButtonClass} type="submit" disabled={!canEdit || busy === "sms"}>{busy === "sms" ? "Saving…" : "Save SMS settings"}</button>
            </div>
          </form>
          <form className="mt-4 rounded-xl border border-[var(--theme-border)] p-3" onSubmit={sendTestSms}>
            <p className="theme-heading text-xs font-semibold uppercase tracking-wide">Send a test SMS</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-end">
              <Field label="Phone"><input className={inputClass} value={smsTest.phone} onChange={(e) => setSmsTest({ ...smsTest, phone: e.target.value })} placeholder="07xx xxx xxx" disabled={!canEdit} /></Field>
              <Field label="Message (optional)"><input className={inputClass} value={smsTest.message} onChange={(e) => setSmsTest({ ...smsTest, message: e.target.value })} placeholder="CentrixERP test" disabled={!canEdit} /></Field>
              <button className="theme-secondary-btn h-[38px] rounded-lg px-3 text-sm font-medium" type="submit" disabled={!canEdit || !status.sms_ready || !smsTest.phone || busy === "sms-test"}>
                {busy === "sms-test" ? "Sending…" : "Send test"}
              </button>
            </div>
          </form>
        </Card>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="theme-heading text-sm font-semibold">Email</h2>
              <p className="theme-subtext mt-1 text-xs">Receipts and notices sent by email use this From address and, when enabled, your own SMTP server.</p>
            </div>
            <MessagingStatusPill ready={status.email_ready} />
          </div>
          <form className="mt-4 space-y-4" onSubmit={saveEmail}>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={emailForm.email_enabled} onChange={(e) => setEmailForm({ ...emailForm, email_enabled: e.target.checked })} disabled={!canEdit} />
              <span>
                <span className="theme-heading font-medium">Send email</span>
                <span className="theme-subtext mt-0.5 block text-xs">Email notices are delivered when a From address and transport are available.</span>
              </span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From name"><input className={inputClass} value={emailForm.email_from_name} onChange={(e) => setEmailForm({ ...emailForm, email_from_name: e.target.value })} disabled={!canEdit} /></Field>
              <Field label="From address"><input className={inputClass} type="email" value={emailForm.email_from_address} onChange={(e) => setEmailForm({ ...emailForm, email_from_address: e.target.value })} placeholder="school@example.com" disabled={!canEdit} /></Field>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={emailForm.smtp_enabled} onChange={(e) => setEmailForm({ ...emailForm, smtp_enabled: e.target.checked })} disabled={!canEdit} />
              <span>
                <span className="theme-heading font-medium">Use my own SMTP server</span>
                <span className="theme-subtext mt-0.5 block text-xs">When off, the server-wide mail transport is used.</span>
              </span>
            </label>
            {emailForm.smtp_enabled ? (
              <div className="grid gap-4 border-t border-[var(--theme-border)] pt-4 sm:grid-cols-2">
                <Field label="SMTP host"><input className={inputClass} value={emailForm.smtp_host} onChange={(e) => setEmailForm({ ...emailForm, smtp_host: e.target.value })} placeholder="smtp.example.com" disabled={!canEdit} /></Field>
                <Field label="Port"><input className={inputClass} type="number" min="1" max="65535" value={emailForm.smtp_port} onChange={(e) => setEmailForm({ ...emailForm, smtp_port: e.target.value })} disabled={!canEdit} /></Field>
                <Field label="Username"><input className={inputClass} value={emailForm.smtp_username} onChange={(e) => setEmailForm({ ...emailForm, smtp_username: e.target.value })} autoComplete="off" disabled={!canEdit} /></Field>
                <Field label="Password"><input className={inputClass} type="password" value={emailForm.smtp_password} onChange={(e) => setEmailForm({ ...emailForm, smtp_password: e.target.value })} autoComplete="new-password" disabled={!canEdit} /></Field>
                <Field label="Encryption">
                  <DrivingSelect value={emailForm.smtp_encryption} onChange={(e) => setEmailForm({ ...emailForm, smtp_encryption: e.target.value })} options={[{ value: "tls", label: "STARTTLS (587)" }, { value: "ssl", label: "SSL (465)" }, { value: "none", label: "None" }]} />
                </Field>
              </div>
            ) : null}
            <MessagingIssues issues={status.email_issues} />
            <div className="flex justify-end border-t border-[var(--theme-border)] pt-4">
              <button className={primaryButtonClass} type="submit" disabled={!canEdit || busy === "email"}>{busy === "email" ? "Saving…" : "Save email settings"}</button>
            </div>
          </form>
          <form className="mt-4 rounded-xl border border-[var(--theme-border)] p-3" onSubmit={sendTestEmail}>
            <p className="theme-heading text-xs font-semibold uppercase tracking-wide">Send a test email</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <Field label="Email address"><input className={inputClass} type="email" value={emailTest} onChange={(e) => setEmailTest(e.target.value)} placeholder="you@example.com" disabled={!canEdit} /></Field>
              <button className="theme-secondary-btn h-[38px] rounded-lg px-3 text-sm font-medium" type="submit" disabled={!canEdit || !status.email_ready || !emailTest || busy === "email-test"}>
                {busy === "email-test" ? "Sending…" : "Send test"}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

const SETTINGS_TAB_ITEMS = [
  { key: "profile", label: "School profile", detail: "Identity, tools and snapshot", icon: "building" },
  { key: "messaging", label: "SMS & email", detail: "Providers, reminders and delivery", icon: "chat-dots" },
  { key: "payments", label: "M-Pesa payments", detail: "Collection setup and receipts", icon: "phone" },
  { key: "access", label: "Access & audit", detail: "Branches, users, roles and history", icon: "shield-lock" },
];

function SettingsRail({ tab, onSelect }) {
  return (
    <nav role="tablist" aria-label="Settings" className="flex gap-1 overflow-x-auto rounded-2xl border border-[var(--theme-border)] p-1 xl:sticky xl:top-4 xl:flex-col xl:overflow-visible xl:self-start">
      {SETTINGS_TAB_ITEMS.map((item) => {
        const active = tab === item.key;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            className={`flex min-w-[190px] items-start gap-3 rounded-xl px-3 py-2.5 text-left transition xl:min-w-0 ${active ? "theme-primary-btn" : "theme-subtext hover:bg-[var(--theme-border)]/40"}`}
            onClick={() => onSelect(item.key)}
          >
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-black/10" : "bg-[var(--theme-border)]/40"}`} aria-hidden>
              <i className={`bi bi-${item.icon}`} />
            </span>
            <span className="min-w-0">
              <span className={`block truncate text-sm font-semibold ${active ? "" : "theme-heading"}`}>{item.label}</span>
              <span className={`mt-0.5 block text-[11px] ${active ? "opacity-80" : "theme-subtext"}`}>{item.detail}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function SettingsInfoTile({ icon, label, value }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--theme-border)] px-3 py-2.5">
      <i className={`bi bi-${icon} theme-subtext mt-0.5 shrink-0`} aria-hidden />
      <div className="min-w-0">
        <p className="theme-subtext text-[11px] uppercase tracking-wide">{label}</p>
        <p className="theme-heading truncate text-sm font-medium" title={String(value || "")}>{value || "—"}</p>
      </div>
    </div>
  );
}

function SettingsChannelRow({ icon, title, detail, ready, action, onAction }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--theme-border)] px-3 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${ready ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-700"}`} aria-hidden>
          <i className={`bi bi-${icon}`} />
        </span>
        <div className="min-w-0">
          <p className="theme-heading text-sm font-semibold">{title}</p>
          <p className="theme-subtext mt-0.5 text-xs">{detail}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden />
          {ready ? "Ready" : "Needs setup"}
        </span>
        {action ? (
          <button type="button" className="theme-link text-sm font-medium" onClick={onAction}>{action}</button>
        ) : null}
      </div>
    </div>
  );
}

function ProfilePanel({ saved, profileForm, setProfileForm, saveProfile, busy, canEdit, canManageCompany, onTab, hasPermission }) {
  const org = saved?.organization || {};
  const counts = saved?.counts || {};
  const payrollSnapshot = saved?.payroll_snapshot || {};
  const messaging = saved?.messaging_status || {};
  const mpesa = saved?.mpesa_status || {};

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-semibold text-white shadow-sm"
              style={{ backgroundColor: org.primary_color || "#4f46e5" }}
              aria-hidden
            >
              {String(org.name || "S").trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="theme-subtext text-[11px] font-medium uppercase tracking-wide">Registered organization</p>
              <h2 className="theme-heading truncate text-lg font-semibold">{org.name || "Driving school"}</h2>
              <p className="theme-subtext mt-0.5 text-xs">Company code {org.code || "—"}</p>
            </div>
          </div>
          {canManageCompany ? (
            <AppNavLink href="/admin/company" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Edit organization profile</AppNavLink>
          ) : null}
        </div>
        <p className="theme-subtext mt-3 text-xs">
          The school name, logo and contact details come from the registered organization, so receipts, messages and reports always match the company profile.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SettingsInfoTile icon="telephone" label="Primary phone" value={org.phone} />
          <SettingsInfoTile icon="envelope" label="Email" value={org.email} />
          <SettingsInfoTile icon="geo-alt" label="Address" value={org.address} />
          <SettingsInfoTile icon="postcard" label="PIN" value={org.pin} />
          <SettingsInfoTile icon="receipt" label="VAT number" value={org.vat_regno} />
          <SettingsInfoTile icon="diagram-3" label="Active branches" value={counts.branches} />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="theme-heading text-sm font-semibold">School snapshot</h2>
          <p className="theme-subtext mt-1 text-xs">Live counts across the school right now.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              ["Students", counts.students, "mortarboard", "/driving-school/students", "driving.students.view"],
              ["Staff", counts.staff, "people", "/driving-school/staff", "driving.staff.view"],
              ["Instructors", counts.instructors, "person-badge", "/driving-school/instructors", "driving.instructors.view"],
              ["Vehicles", counts.vehicles, "car-front", "/driving-school/vehicles", "driving.vehicles.view"],
              ["Branches", counts.branches, "diagram-3", "/driving-school/branches", "driving.branches.view"],
            ].filter(([, , , , permission]) => hasPermission(permission)).map(([label, value, icon, href]) => (
              <AppNavLink key={label} href={href} className="rounded-xl border border-[var(--theme-border)] px-3 py-2 hover:border-[var(--theme-primary)]">
                <span className="theme-subtext flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
                  <i className={`bi bi-${icon}`} aria-hidden />
                  {label}
                </span>
                <span className="theme-heading mt-1 block text-lg font-semibold tabular-nums">{value ?? 0}</span>
              </AppNavLink>
            ))}
          </div>
          <div className="mt-3 rounded-xl border border-[var(--theme-border)] px-3 py-2 text-xs">
            <p className="theme-subtext">
              This month: <strong className="theme-heading">{payrollSnapshot.attendance_records ?? 0}</strong> attendance records ·
              <strong className="theme-heading"> {payrollSnapshot.pay_items ?? 0}</strong> pay adjustments
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {hasPermission("driving.staff.view") ? <AppNavLink href="/driving-school/staff/attendance" className="theme-link text-xs font-medium">Staff attendance</AppNavLink> : null}
              {hasPermission("driving.payroll.view") ? <AppNavLink href="/driving-school/staff/salaries" className="theme-link text-xs font-medium">Payroll run</AppNavLink> : null}
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="theme-heading text-sm font-semibold">Delivery & payments</h2>
          <p className="theme-subtext mt-1 text-xs">Jump straight to the channel that needs attention.</p>
          <div className="mt-3 space-y-2">
            <SettingsChannelRow icon="chat-dots" title="SMS" detail={messaging.sms_ready ? "Africa's Talking is ready" : "Reminders queue until SMS is ready"} ready={Boolean(messaging.sms_ready)} action="Configure" onAction={() => onTab("messaging")} />
            <SettingsChannelRow icon="envelope" title="Email" detail={messaging.email_ready ? "Email notices are ready" : "Recipients need a working From address"} ready={Boolean(messaging.email_ready)} action="Configure" onAction={() => onTab("messaging")} />
            <SettingsChannelRow icon="phone" title="M-Pesa" detail={mpesa.ready ? "Provider connection is ready" : "Fee callbacks are not matched automatically yet"} ready={Boolean(mpesa.ready)} action="Configure" onAction={() => onTab("payments")} />
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="theme-heading text-sm font-semibold">Tools for this school</h2>
            <p className="theme-subtext mt-1 text-xs">Switch off a tool to hide it from the sidebar for everyone at this school. Saved tools apply immediately.</p>
          </div>
        </div>
        <form onSubmit={saveProfile} className="mt-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {DRIVING_FEATURE_FIELDS.map(([key, label, detail]) => (
              <label key={key} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${profileForm.features[key] !== false ? "border-emerald-200 bg-emerald-50/40" : "border-[var(--theme-border)]"}`}>
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={profileForm.features[key] !== false}
                  onChange={(e) => setProfileForm((current) => ({ ...current, features: { ...current.features, [key]: e.target.checked } }))}
                  disabled={!canEdit}
                />
                <span className="min-w-0">
                  <span className="theme-heading block font-medium">{label}</span>
                  <span className="theme-subtext mt-0.5 block text-xs">{detail}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex justify-end border-t border-[var(--theme-border)] pt-4">
            <button className={primaryButtonClass} type="submit" disabled={!canEdit || busy === "profile"}>
              {busy === "profile" ? "Saving…" : "Save school tools"}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function PaymentsPanel({ saved, paymentsForm, setPaymentsForm, savePayments, busy, canEdit, overview, overviewLoading, hasFeesAccess, hasPermission }) {
  const mpesa = saved?.mpesa_status || {};
  const collections = overview?.collections || [];
  const thisMonth = collections[collections.length - 1] || {};
  const outstanding = (overview?.aging || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const unconfirmed = (overview?.mpesa || []).filter((row) => !row.provider_confirmed).length;
  const ready = Boolean(mpesa.ready);
  const envLabel = mpesa.env === "live" ? "Live" : "Sandbox";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="M-Pesa acceptance" value={paymentsForm.mpesa_enabled ? "On" : "Off"} hint={paymentsForm.mpesa_enabled ? "Students can pay by M-Pesa" : "Hidden as a payment method"} icon="phone" tone={paymentsForm.mpesa_enabled ? "emerald" : "amber"} />
        <Stat label="Provider connection" value={ready ? "Ready" : "Incomplete"} hint={envLabel} icon="plug" tone={ready ? "emerald" : "amber"} />
        <Stat label="Collected this month" value={money(thisMonth.collected ?? 0)} hint={thisMonth.label || "Fees"} icon="cash-stack" tone="violet" />
        <Stat label="Open fee balance" value={money(outstanding)} hint={`${unconfirmed} M-Pesa reference${unconfirmed === 1 ? "" : "s"} to confirm`} icon="exclamation-circle" tone="amber" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="theme-heading text-sm font-semibold">School payment preferences</h2>
              <p className="theme-subtext mt-1 text-xs">These fields appear on receipts and tell staff where to pay. The Safaricom credentials live in Administration → M-Pesa settings.</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${paymentsForm.mpesa_enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
              {paymentsForm.mpesa_enabled ? "Accepting M-Pesa" : "M-Pesa off"}
            </span>
          </div>
          <form className="mt-4 space-y-4" onSubmit={savePayments}>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={paymentsForm.mpesa_enabled} onChange={(e) => setPaymentsForm({ ...paymentsForm, mpesa_enabled: e.target.checked })} disabled={!canEdit} />
              <span>
                <span className="theme-heading font-medium">Accept M-Pesa for fees</span>
                <span className="theme-subtext mt-0.5 block text-xs">Staff can record M-Pesa receipts on invoices and students see the paybill on fee reminders.</span>
              </span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Paybill / till"><input className={inputClass} maxLength={40} value={paymentsForm.mpesa_paybill} onChange={(e) => setPaymentsForm({ ...paymentsForm, mpesa_paybill: e.target.value })} placeholder="600000" disabled={!canEdit} /></Field>
              <Field label="Shortcode"><input className={inputClass} maxLength={40} value={paymentsForm.mpesa_shortcode} onChange={(e) => setPaymentsForm({ ...paymentsForm, mpesa_shortcode: e.target.value })} placeholder="174379" disabled={!canEdit} /></Field>
            </div>
            <Field label="Environment">
              <DrivingSelect value={paymentsForm.mpesa_environment} onChange={(e) => setPaymentsForm({ ...paymentsForm, mpesa_environment: e.target.value })} options={[{ value: "sandbox", label: "Sandbox" }, { value: "production", label: "Live" }]} />
            </Field>
            <div className="flex justify-end border-t border-[var(--theme-border)] pt-4">
              <button className={primaryButtonClass} type="submit" disabled={!canEdit || busy === "payments"}>{busy === "payments" ? "Saving…" : "Save payment settings"}</button>
            </div>
          </form>
        </Card>

        <Card className="h-max">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="theme-heading text-sm font-semibold">Safaricom connection</h2>
              <p className="theme-subtext mt-1 text-xs">Read-only status of the organization M-Pesa configuration used to confirm callbacks.</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden />
              {ready ? "Ready" : "Needs setup"}
            </span>
          </div>
          <div className="mt-3 grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--theme-border)] px-3 py-2">
              <span className="theme-subtext text-xs">Environment</span><span className="theme-heading font-medium">{envLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--theme-border)] px-3 py-2">
              <span className="theme-subtext text-xs">Provider shortcode</span><span className="theme-heading font-medium">{mpesa.shortcode || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--theme-border)] px-3 py-2">
              <span className="theme-subtext text-xs">STK push</span><span className="theme-heading font-medium">{mpesa.stk_push_enabled ? "Enabled" : "Off"}</span>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--theme-border)] px-3 py-2">
              <span className="theme-subtext text-xs">C2B reconciliation</span><span className="theme-heading font-medium">{mpesa.c2b_reconciliation_enabled ? "Enabled" : "Off"}</span>
            </div>
          </div>
          {mpesa.issues?.length ? <MessagingIssues issues={mpesa.issues} /> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {hasFeesAccess ? <AppNavLink href="/driving-school/payments" className={primaryButtonClass}>Open fee collection</AppNavLink> : null}
            <AppNavLink href="/admin/mpesa-settings" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">M-Pesa settings</AppNavLink>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="theme-heading text-sm font-semibold">Recent M-Pesa receipts</h2>
            <p className="theme-subtext mt-1 text-xs">References recorded by staff. Confirmed rows matched a Safaricom callback.</p>
          </div>
          {overviewLoading ? <span className="theme-subtext text-xs">Loading…</span> : null}
        </div>
        <div className="mt-3">
          <DataTable
            empty={hasFeesAccess ? "No M-Pesa receipts recorded yet." : "You need fee view access to see receipts."}
            rows={overview?.mpesa || []}
            columns={[
              { key: "student", label: "Student", render: (row) => <PersonName name={row.student || "—"} detail={row.invoice || ""} /> },
              { key: "amount", label: "Amount", render: (row) => money(row.amount) },
              { key: "reference", label: "Reference", render: (row) => row.reference || "—" },
              { key: "received_on", label: "Received", render: (row) => shortDate(row.received_on) },
              { key: "confirmed", label: "Confirmed", render: (row) => <StatusBadge value={row.provider_confirmed ? "confirmed" : "pending"} /> },
            ]}
          />
        </div>
      </Card>

      <Card>
        <h2 className="theme-heading text-sm font-semibold">How fee collection works</h2>
        <ol className="theme-subtext mt-2 grid gap-2 text-xs sm:grid-cols-3">
          <li className="rounded-xl border border-[var(--theme-border)] px-3 py-2"><strong className="theme-heading block text-sm">1. Invoice the student</strong>Raise a fee invoice from the student profile or Payments screen.</li>
          <li className="rounded-xl border border-[var(--theme-border)] px-3 py-2"><strong className="theme-heading block text-sm">2. Receive the money</strong>Record cash, bank or M-Pesa. An invoice closes automatically when the balance reaches zero.</li>
          <li className="rounded-xl border border-[var(--theme-border)] px-3 py-2"><strong className="theme-heading block text-sm">3. Reconcile callbacks</strong>When the provider is ready, Safaricom callbacks confirm M-Pesa receipts and flag mismatches.</li>
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          {hasFeesAccess ? <AppNavLink href="/driving-school/payments" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Fees & payments</AppNavLink> : null}
          {hasPermission("driving.courses.view") ? <AppNavLink href="/driving-school/courses" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Course fees</AppNavLink> : null}
        </div>
      </Card>
    </div>
  );
}

export function SettingsScreen({ embedded = false }) {
  const { refreshCapabilities, hasPermission, isOrgAdmin } = useAuth();
  useTabTitle(tabSectionTitle("Settings", "Driving"));
  const canEdit = hasPermission("driving.settings.edit");
  const canManageCompany = Boolean(isOrgAdmin?.()) || hasPermission("admin.company.view");
  const [tab, setTab] = useState("profile");
  const { data, reload } = useLoad(() => drivingGet("/settings"), "settings");
  const [profileForm, setProfileForm] = useState({
    features: { vehicles: true, theory: true, assessments: true, fees: true, expenses: true },
  });
  const [paymentsForm, setPaymentsForm] = useState({
    mpesa_enabled: false,
    mpesa_paybill: "",
    mpesa_shortcode: "",
    mpesa_environment: "sandbox",
  });
  const [busy, setBusy] = useState("");
  const canViewFees = hasPermission("driving.fees.view");
  const overviewLoad = useLoad(
    () => (tab === "payments" && canViewFees ? drivingGet("/fees/overview") : Promise.resolve(null)),
    `settings-fees:${tab}:${canViewFees}`,
  );

  useEffect(() => {
    const saved = data?.data;
    if (!saved) return;
    setProfileForm({
      features: {
        vehicles: saved.features?.vehicles !== false,
        theory: saved.features?.theory !== false,
        assessments: saved.features?.assessments !== false,
        fees: saved.features?.fees !== false,
        expenses: saved.features?.expenses !== false,
      },
    });
    setPaymentsForm({
      mpesa_enabled: Boolean(saved.mpesa_enabled),
      mpesa_paybill: saved.mpesa_paybill || "",
      mpesa_shortcode: saved.mpesa_shortcode || "",
      mpesa_environment: saved.mpesa_environment || "sandbox",
    });
  }, [data]);

  async function saveProfile(event) {
    event.preventDefault();
    if (!canEdit) return;
    setBusy("profile");
    try {
      const res = await drivingSend("/settings", "PUT", { features: profileForm.features });
      notifySuccess(res.message || "School tools saved.");
      await refreshCapabilities({ force: true });
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save the school tools.");
    } finally {
      setBusy("");
    }
  }

  async function savePayments(event) {
    event.preventDefault();
    if (!canEdit) return;
    setBusy("payments");
    try {
      const res = await drivingSend("/settings", "PUT", {
        mpesa_enabled: paymentsForm.mpesa_enabled,
        mpesa_paybill: paymentsForm.mpesa_paybill || null,
        mpesa_shortcode: paymentsForm.mpesa_shortcode || null,
        mpesa_environment: paymentsForm.mpesa_environment,
      });
      notifySuccess(res.message || "Payment settings saved.");
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save payment settings.");
    } finally {
      setBusy("");
    }
  }

  const saved = data?.data;
  const accessLinks = [
    hasPermission("driving.branches.view") && { icon: "diagram-3", title: "Branches", detail: "Locations, managers and branch scoping.", href: "/driving-school/branches" },
    hasPermission("driving.users.view") && { icon: "people", title: "Users", detail: "Staff accounts that can sign in here.", href: "/driving-school/users" },
    hasPermission("driving.roles.view") && { icon: "shield-lock", title: "Roles & permissions", detail: "What each role can view and change.", href: "/driving-school/roles" },
    { icon: "clock-history", title: "Audit trail", detail: "Every recorded change across the school.", href: "/driving-school/audit" },
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      {embedded ? null : <PageTitle title="Settings" subtitle="Identity, tools, delivery channels, payments and access — organized so each change has a clear home." />}
      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <SettingsRail tab={tab} onSelect={setTab} />
        <div className="min-w-0">
          {!canEdit ? (
            <p className="theme-subtext mb-3 text-sm">You can view these settings. Ask a school administrator for edit rights to change them.</p>
          ) : null}

          {tab === "profile" ? (
            <div role="tabpanel">
              <ProfilePanel
                saved={saved}
                profileForm={profileForm}
                setProfileForm={setProfileForm}
                saveProfile={saveProfile}
                busy={busy}
                canEdit={canEdit}
                canManageCompany={canManageCompany}
                onTab={setTab}
                hasPermission={hasPermission}
              />
            </div>
          ) : null}

          {tab === "messaging" ? (
            <div role="tabpanel" className="space-y-4">
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="theme-heading text-sm font-semibold">SMS & email delivery</h2>
                    <p className="theme-subtext mt-1 text-xs">Lesson reminders, receipts and announcements leave through these channels. Each channel has its own readiness check.</p>
                  </div>
                  <AppNavLink href="/driving-school/notifications" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Notification log</AppNavLink>
                </div>
              </Card>
              <MessagingPanel />
            </div>
          ) : null}

          {tab === "payments" ? (
            <div role="tabpanel">
              <PaymentsPanel
                saved={saved}
                paymentsForm={paymentsForm}
                setPaymentsForm={setPaymentsForm}
                savePayments={savePayments}
                busy={busy}
                canEdit={canEdit}
                overview={overviewLoad.data?.data}
                overviewLoading={canViewFees && !overviewLoad.data && !overviewLoad.error}
                hasFeesAccess={canViewFees}
                hasPermission={hasPermission}
              />
            </div>
          ) : null}

          {tab === "access" ? (
            <div role="tabpanel" className="space-y-4">
              <Card>
                <h2 className="theme-heading text-sm font-semibold">Access & audit</h2>
                <p className="theme-subtext mt-1 text-xs">Branches decide what each person can see. Roles decide what they can do. The audit trail records every change.</p>
              </Card>
              <div className="grid gap-4 sm:grid-cols-2">
                {accessLinks.map((item) => (
                  <AppNavLink key={item.title} href={item.href} className="theme-panel flex items-start gap-3 rounded-2xl border p-4 shadow-sm hover:border-[var(--theme-primary)]">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600" aria-hidden>
                      <i className={`bi bi-${item.icon} text-base`} />
                    </span>
                    <span className="min-w-0">
                      <span className="theme-heading block font-semibold">{item.title}</span>
                      <span className="theme-subtext mt-0.5 block text-xs">{item.detail}</span>
                    </span>
                  </AppNavLink>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function currentMonthValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value) {
  const [year, month] = String(value || "").split("-");
  if (!year || !month) return "—";
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-KE", { month: "long", year: "numeric" });
}

const EMPLOYMENT_TYPES = [
  { value: "permanent", label: "Permanent" },
  { value: "contract", label: "Contract" },
  { value: "casual", label: "Casual" },
  { value: "intern", label: "Intern" },
];

const EMPLOYMENT_STATUSES = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "terminated", label: "Terminated" },
  { value: "retired", label: "Retired" },
];

const SALARY_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "mpesa", label: "M-Pesa" },
  { value: "bank", label: "Bank" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

function StaffFormDialog({ employee, branches, showBranchSelect, onClose, onSaved }) {
  const editing = Boolean(employee?.id);
  const [form, setForm] = useState(() => ({
    full_name: employee?.full_name || "",
    phone: employee?.phone || "",
    email: employee?.email || "",
    job_title: employee?.job_title || "",
    employment_type: employee?.employment_type || "permanent",
    employment_status: employee?.employment_status || "active",
    hire_date: employee?.hire_date ? String(employee.hire_date).slice(0, 10) : "",
    base_salary: employee?.base_salary ?? "",
    monthly_allowance: employee?.monthly_allowance ?? "",
    pays_sha: employee?.pays_sha !== false,
    pays_nssf: employee?.pays_nssf !== false,
    pays_housing_levy: employee?.pays_housing_levy !== false,
    pays_paye: employee?.pays_paye !== false,
    branch_id: employee?.branch_id != null ? String(employee.branch_id) : "",
    is_active: employee?.is_active !== false,
  }));
  const [busy, setBusy] = useState(false);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const body = {
        ...form,
        base_salary: form.base_salary === "" ? 0 : Number(form.base_salary),
        monthly_allowance: form.monthly_allowance === "" ? 0 : Number(form.monthly_allowance),
        pays_sha: form.pays_sha,
        pays_nssf: form.pays_nssf,
        pays_housing_levy: form.pays_housing_levy,
        pays_paye: form.pays_paye,
        hire_date: form.hire_date || null,
      };
      if (form.branch_id) body.branch_id = Number(form.branch_id);
      const res = editing
        ? await drivingSend(`/staff/${employee.id}`, "PUT", body)
        : await drivingSend("/staff", "POST", body);
      notifySuccess(res.message || "Staff member saved.");
      onSaved();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save this staff member.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Editor open title={editing ? "Edit staff member" : "Add staff member"} onClose={onClose} wide>
      <form onSubmit={save}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><input className={inputClass} required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
          <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Email"><input className={inputClass} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Job title"><input className={inputClass} value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} placeholder="Instructor, receptionist…" /></Field>
          <Field label="Employment type">
            <DrivingSelect value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })} options={EMPLOYMENT_TYPES} />
          </Field>
          <Field label="Employment status">
            <DrivingSelect value={form.employment_status} onChange={(e) => setForm({ ...form, employment_status: e.target.value })} options={EMPLOYMENT_STATUSES} />
          </Field>
          <Field label="Hire date"><input className={inputClass} type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></Field>
          <BranchField value={form.branch_id} onChange={(value) => setForm({ ...form, branch_id: value })} branches={branches} show={showBranchSelect} />
          <Field label="Base salary (KSh / month)"><input className={inputClass} type="number" min="0" step="0.01" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} /></Field>
          <Field label="Monthly allowance (KSh)"><input className={inputClass} type="number" min="0" step="0.01" value={form.monthly_allowance} onChange={(e) => setForm({ ...form, monthly_allowance: e.target.value })} /></Field>
          <div className="sm:col-span-2">
            <p className="theme-heading mb-2 text-sm font-medium">Statutory deductions</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["pays_sha", "SHIF"],
                ["pays_nssf", "NSSF"],
                ["pays_housing_levy", "Housing levy"],
                ["pays_paye", "PAYE"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-1" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            <span>Active — inactive staff stay on record but are not counted in the payroll.</span>
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
          <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>Cancel</button>
          <button className={primaryButtonClass} type="submit" disabled={busy}>{busy ? "Saving…" : "Save staff member"}</button>
        </div>
      </form>
    </Editor>
  );
}

const ATTENDANCE_STATUS_OPTIONS = [
  { value: "unmarked", label: "Not marked" },
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "leave", label: "On leave" },
  { value: "half_day", label: "Half day" },
  { value: "rest", label: "Rest day" },
];

const PAY_ITEM_TYPES = [
  { value: "overtime", label: "Overtime pay" },
  { value: "commission", label: "Commission" },
  { value: "bonus", label: "Bonus" },
  { value: "advance", label: "Cash advance" },
  { value: "deduction", label: "Other deduction" },
];

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function ManualAttendanceDialog({ date, rows, onClose, onSaved }) {
  const [form, setForm] = useState({ date: date || todayIso(), status: "present", check_in: "08:00", check_out: "17:00", notes: "" });
  const [selected, setSelected] = useState(() => new Set(rows.map((row) => row.id)));
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const offDay = ["absent", "leave", "rest"].includes(form.status);
  const visible = rows.filter((row) => {
    if (!query.trim()) return true;
    return [row.full_name, row.staff_number, row.job_title].join(" ").toLowerCase().includes(query.trim().toLowerCase());
  });

  function toggle(id) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save(event) {
    event.preventDefault();
    if (!selected.size) {
      notifyError("Select at least one employee.");
      return;
    }
    setBusy(true);
    try {
      const res = await drivingSend("/staff/attendance/day", "POST", {
        date: form.date,
        entries: rows.filter((row) => selected.has(row.id)).map((row) => ({
          staff_id: row.id,
          status: form.status,
          check_in: offDay ? null : (form.check_in || null),
          check_out: offDay ? null : (form.check_out || null),
          notes: form.notes || null,
        })),
      });
      notifySuccess(res.message || "Attendance saved.");
      onSaved();
      onClose();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save attendance.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Editor open title="Add manual attendance" onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date"><input className={inputClass} type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Status">
            <DrivingSelect value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={ATTENDANCE_STATUS_OPTIONS.filter((option) => option.value !== "unmarked")} />
          </Field>
          <Field label="Clock in"><input className={inputClass} type="time" value={form.check_in} disabled={offDay} onChange={(e) => setForm({ ...form, check_in: e.target.value })} /></Field>
          <Field label="Clock out"><input className={inputClass} type="time" value={form.check_out} disabled={offDay} onChange={(e) => setForm({ ...form, check_out: e.target.value })} /></Field>
          <div className="sm:col-span-2">
            <Field label="Notes"><input className={inputClass} maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional note for this day" /></Field>
          </div>
        </div>
        <p className="theme-subtext text-xs">Hours are calculated from the clock times. Absent, leave and rest days ignore times.</p>

        <div className="rounded-xl border border-[var(--theme-border)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="theme-heading text-sm font-semibold">Employees ({selected.size} selected)</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="theme-link text-xs font-medium" onClick={() => setSelected(new Set(visible.map((row) => row.id)))}>Select shown</button>
              <button type="button" className="theme-link text-xs font-medium" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          </div>
          <div className="mt-2">
            <SearchField value={query} onChange={setQuery} placeholder="Search employees" />
          </div>
          <div className="mt-2 max-h-64 divide-y divide-[var(--theme-border)] overflow-y-auto rounded-lg border border-[var(--theme-border)]">
            {visible.length ? visible.map((row) => (
              <label key={row.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--theme-border)]/30">
                <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                <span className="min-w-0 flex-1">
                  <PersonName name={row.full_name} detail={[row.staff_number, row.job_title].filter(Boolean).join(" · ")} />
                </span>
                {row.branch_name ? <span className="theme-subtext text-xs">{row.branch_name}</span> : null}
              </label>
            )) : <p className="theme-subtext px-3 py-4 text-center text-xs">No employees match this search.</p>}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
          <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>Cancel</button>
          <button className={primaryButtonClass} type="submit" disabled={busy || !selected.size}>{busy ? "Saving…" : `Save for ${selected.size} employee${selected.size === 1 ? "" : "s"}`}</button>
        </div>
      </form>
    </Editor>
  );
}

export function StaffAttendanceScreen() {
  const { hasPermission } = useAuth();
  useTabTitle(tabSectionTitle("Staff attendance", "Driving"));
  const { branches, showBranchSelect } = useDrivingBranches();
  const [date, setDate] = useState(todayIso);
  const [branchFilter, setBranchFilter] = useState("");
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const canMark = hasPermission("driving.staff.create") || hasPermission("driving.staff.edit");
  const canViewSalary = hasPermission("driving.payroll.view");
  const { data, error, reload } = useLoad(
    () => drivingGet("/staff/attendance", { date, branch_id: branchFilter || undefined }),
    `staff-attendance|${date}|${branchFilter}`,
  );
  const rows = rowsOf(data);
  const summary = data?.summary || {};
  const monthSummary = data?.month_summary || [];
  const monthByStaff = Object.fromEntries(monthSummary.map((row) => [row.id, row]));

  useEffect(() => {
    setDraft(Object.fromEntries(rowsOf(data).map((row) => [row.id, {
      status: row.status || "unmarked",
      check_in: row.check_in || "",
      check_out: row.check_out || "",
      hours_worked: row.hours_worked != null ? String(row.hours_worked) : "",
      overtime_hours: Number(row.overtime_hours) > 0 ? String(row.overtime_hours) : "",
      notes: row.notes || "",
    }])));
  }, [data]);

  const marked = rows.filter((row) => (draft[row.id]?.status || "unmarked") !== "unmarked");

  function patch(staffId, changes) {
    setDraft((current) => ({ ...current, [staffId]: { ...(current[staffId] || {}), ...changes } }));
  }

  function setStatus(staffId, status) {
    const offDay = ["absent", "leave", "rest"].includes(status);
    patch(staffId, { status, ...(offDay ? { check_in: "", check_out: "", hours_worked: "" } : {}) });
  }

  function markAllPresent() {
    setDraft((current) => Object.fromEntries(rows.map((row) => {
      const entry = current[row.id] || {};
      return [row.id, { ...entry, status: entry.status && entry.status !== "unmarked" ? entry.status : "present" }];
    })));
  }

  async function saveDay() {
    if (!marked.length) {
      notifyError("Mark at least one employee before saving.");
      return;
    }
    setBusy(true);
    try {
      const res = await drivingSend("/staff/attendance/day", "POST", {
        date,
        entries: marked.map((row) => ({
          staff_id: row.id,
          status: draft[row.id].status,
          check_in: ["absent", "leave", "rest"].includes(draft[row.id].status) ? null : (draft[row.id].check_in || null),
          check_out: ["absent", "leave", "rest"].includes(draft[row.id].status) ? null : (draft[row.id].check_out || null),
          hours_worked: draft[row.id].hours_worked === "" ? null : Number(draft[row.id].hours_worked),
          overtime_hours: draft[row.id].overtime_hours === "" ? 0 : Number(draft[row.id].overtime_hours),
          notes: draft[row.id].notes || null,
        })),
      });
      notifySuccess(res.message || "Attendance saved.");
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save attendance.");
    } finally {
      setBusy(false);
    }
  }

  async function syncDevices() {
    setSyncBusy(true);
    try {
      const res = await drivingSend("/staff/attendance/sync-devices", "POST", { date });
      notifySuccess(res.message || "Device attendance imported.");
      if (res.skipped?.length) {
        notifyError(`${res.skipped.length} employee(s) skipped: ${res.skipped[0].reason}`);
      }
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not import device attendance.");
    } finally {
      setSyncBusy(false);
    }
  }

  return (
    <div>
      <ScreenHeader
        title="Staff attendance"
        subtitle="Record attendance manually, import clock-in device punches, then save. Days marked here feed the monthly payroll run."
      >
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Work date"><input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value || todayIso())} /></Field>
          <BranchFilter value={branchFilter} onChange={setBranchFilter} branches={branches} show={showBranchSelect} />
        </div>
      </ScreenHeader>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="On roster" value={summary.staff_count ?? rows.length} hint={monthLabel(String(date).slice(0, 7))} icon="people" tone="indigo" />
        <Stat label="Present" value={summary.present ?? 0} icon="check-circle" tone="emerald" />
        <Stat label="Absent" value={summary.absent ?? 0} icon="x-circle" tone="rose" />
        <Stat label="On leave" value={summary.leave ?? 0} icon="calendar-week" tone="sky" />
        <Stat label="Half day / rest" value={(summary.half_day ?? 0) + (summary.rest ?? 0)} icon="clock" tone="amber" />
        <Stat label="Overtime hours" value={Number(summary.overtime_hours ?? 0).toFixed(1)} hint="Saved for this date" icon="stopwatch" tone="violet" />
      </div>

      {canMark ? (
        <Toolbar>
          <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={() => setManualOpen(true)} disabled={!rows.length}>Add manual attendance</button>
          <button type="button" className="theme-secondary-btn inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium" onClick={syncDevices} disabled={syncBusy || !rows.length}>
            <i className={`bi bi-${syncBusy ? "arrow-repeat" : "fingerprint"}`} aria-hidden />
            {syncBusy ? "Importing…" : "Import from clock-in device"}
          </button>
          <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={markAllPresent}>Mark all present</button>
          <span className="theme-subtext text-xs">{marked.length} of {rows.length} marked</span>
          <span className="flex-1" />
          <button type="button" className={primaryButtonClass} disabled={busy || !rows.length} onClick={saveDay}>{busy ? "Saving…" : "Save attendance"}</button>
        </Toolbar>
      ) : (
        <p className="theme-subtext mb-3 text-sm">You can view attendance. Ask for employee edit rights to mark days.</p>
      )}
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      {!rows.length && !error ? (
        <Card className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="theme-heading text-sm font-semibold">No employees on this roster yet</p>
              <p className="theme-subtext mt-1 text-xs">Register Driving School employees with their salary and deductions first, then mark their attendance here or import it from a clock-in device.</p>
            </div>
            <AppNavLink href="/driving-school/staff" className={primaryButtonClass}>Go to Employees</AppNavLink>
          </div>
        </Card>
      ) : null}

      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="theme-heading text-sm font-semibold">Daily register · {shortDate(date)}</h2>
            <p className="theme-subtext mt-0.5 text-xs">Set status and clock times, or import device punches. Hours are calculated automatically when both times are set.</p>
          </div>
        </div>
        <DataTable
          empty="No active staff on this roster."
          rows={rows}
          columns={[
            { key: "full_name", label: "Employee", render: (row) => <PersonName name={row.full_name} detail={[row.staff_number, row.job_title].filter(Boolean).join(" · ")} /> },
            ...(showBranchSelect ? [{ key: "branch_name", label: "Branch", render: (row) => row.branch_name || "—" }] : []),
            {
              key: "status",
              label: "Status",
              render: (row) => (
                <div style={{ minWidth: 140 }}>
                  <DrivingSelect
                    value={draft[row.id]?.status || "unmarked"}
                    onChange={(e) => setStatus(row.id, e.target.value)}
                    options={ATTENDANCE_STATUS_OPTIONS}
                    disabled={!canMark}
                  />
                </div>
              ),
            },
            {
              key: "check_in",
              label: "Clock in",
              render: (row) => {
                const entry = draft[row.id] || {};
                const offDay = ["absent", "leave", "rest"].includes(entry.status);
                return <input className={inputClass} style={{ maxWidth: 120 }} type="time" value={entry.check_in || ""} disabled={!canMark || offDay} onChange={(e) => patch(row.id, { check_in: e.target.value })} />;
              },
            },
            {
              key: "check_out",
              label: "Clock out",
              render: (row) => {
                const entry = draft[row.id] || {};
                const offDay = ["absent", "leave", "rest"].includes(entry.status);
                return <input className={inputClass} style={{ maxWidth: 120 }} type="time" value={entry.check_out || ""} disabled={!canMark || offDay} onChange={(e) => patch(row.id, { check_out: e.target.value })} />;
              },
            },
            {
              key: "hours_worked",
              label: "Hours",
              render: (row) => {
                const entry = draft[row.id] || {};
                const offDay = ["absent", "leave", "rest"].includes(entry.status);
                return <input className={inputClass} style={{ maxWidth: 85 }} type="number" min="0" max="24" step="0.5" value={entry.hours_worked ?? ""} placeholder="auto" disabled={!canMark || offDay} onChange={(e) => patch(row.id, { hours_worked: e.target.value })} />;
              },
            },
            {
              key: "overtime_hours",
              label: "OT hours",
              render: (row) => {
                const entry = draft[row.id] || {};
                const offDay = ["absent", "leave", "rest"].includes(entry.status);
                return <input className={inputClass} style={{ maxWidth: 85 }} type="number" min="0" max="24" step="0.5" value={entry.overtime_hours ?? ""} placeholder="0" disabled={!canMark || offDay} onChange={(e) => patch(row.id, { overtime_hours: e.target.value })} />;
              },
            },
            {
              key: "source",
              label: "Source",
              render: (row) => {
                if (!row.attendance_id) return <span className="theme-subtext text-xs">—</span>;
                const device = row.source === "clock_device";
                return (
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${device ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-700"}`} title={row.device_identifier || undefined}>
                    <i className={`bi bi-${device ? "fingerprint" : "pencil-square"}`} aria-hidden />
                    {device ? "Device" : "Manual"}
                  </span>
                );
              },
            },
            {
              key: "month",
              label: "This month",
              render: (row) => {
                const month = monthByStaff[row.id] || {};
                return <span className="theme-subtext text-xs">{month.days_recorded ?? 0} day(s) · {month.present ?? 0} present · {month.absent ?? 0} absent · {Number(month.overtime_hours ?? 0).toFixed(1)} OT h</span>;
              },
            },
          ]}
        />
      </Card>

      {canViewSalary ? (
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="theme-heading text-sm font-semibold">Month summary</h2>
            <span className="theme-subtext text-xs">{monthLabel(String(date).slice(0, 7))} · feeds the salary run</span>
          </div>
          <DataTable
            empty="No attendance recorded this month."
            rows={monthSummary.filter((row) => row.days_recorded > 0)}
            columns={[
              { key: "full_name", label: "Employee", render: (row) => <PersonName name={row.full_name} detail={row.staff_number} /> },
              ...(showBranchSelect ? [{ key: "branch_name", label: "Branch", render: (row) => row.branch_name || "—" }] : []),
              { key: "days_recorded", label: "Days", render: (row) => row.days_recorded ?? 0 },
              { key: "present", label: "Present", render: (row) => row.present ?? 0 },
              { key: "absent", label: "Absent", render: (row) => row.absent ?? 0 },
              { key: "leave", label: "Leave", render: (row) => row.leave ?? 0 },
              { key: "half_day", label: "Half days", render: (row) => row.half_day ?? 0 },
              { key: "overtime_hours", label: "OT hours", render: (row) => Number(row.overtime_hours ?? 0).toFixed(1) },
            ]}
          />
        </Card>
      ) : null}

      {manualOpen ? (
        <ManualAttendanceDialog
          date={date}
          rows={rows}
          onClose={() => setManualOpen(false)}
          onSaved={reload}
        />
      ) : null}
    </div>
  );
}

function SalaryDialog({ employee, period, onClose, onSaved }) {
  const { hasPermission } = useAuth();
  const canPay = hasPermission("driving.payroll.create");
  const canDelete = hasPermission("driving.payroll.delete");
  const [selectedPeriod, setSelectedPeriod] = useState(period || currentMonthValue());
  const { data, error, reload } = useLoad(
    () => drivingGet(`/staff/${employee.id}/salary-payments`, { period: selectedPeriod }),
    `salary|${employee.id}|${selectedPeriod}`,
  );
  const payments = rowsOf(data);
  const summary = data?.summary || {};
  const run = data?.run;
  const canRecordPayment = canPay && run?.status === "approved";
  const canAdjust = hasPermission("driving.payroll.create");
  const canDeleteItem = hasPermission("driving.payroll.delete");
  const [form, setForm] = useState(() => ({
    amount: Number(employee.balance_this_period) > 0 ? String(employee.balance_this_period) : "",
    method: "cash",
    reference: "",
    paid_at: "",
    notes: "",
  }));
  const [busy, setBusy] = useState(false);
  const [itemForm, setItemForm] = useState({ type: "overtime", amount: "", hours: "", description: "" });
  const [itemBusy, setItemBusy] = useState(false);
  const payItems = data?.pay_items || [];
  const itemTotals = data?.pay_item_totals || {};
  const attendance = data?.attendance || {};
  const locked = Boolean(data?.locked);

  async function addItem(event) {
    event.preventDefault();
    setItemBusy(true);
    try {
      const res = await drivingSend(`/staff/${employee.id}/pay-items`, "POST", {
        period: selectedPeriod,
        type: itemForm.type,
        amount: Number(itemForm.amount),
        hours: itemForm.hours === "" ? null : Number(itemForm.hours),
        description: itemForm.description || null,
      });
      notifySuccess(res.message || "Pay item added.");
      setItemForm({ type: itemForm.type, amount: "", hours: "", description: "" });
      reload();
      onSaved();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not add this pay item.");
    } finally {
      setItemBusy(false);
    }
  }

  async function removeItem(item) {
    if (!window.confirm(`Remove the ${money(item.amount)} ${item.label.toLowerCase()}?`)) return;
    setItemBusy(true);
    try {
      await drivingSend(`/pay-items/${item.id}`, "DELETE");
      notifySuccess("Pay item removed.");
      reload();
      onSaved();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not remove this pay item.");
    } finally {
      setItemBusy(false);
    }
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const res = await drivingSend(`/staff/${employee.id}/salary-payments`, "POST", {
        period: selectedPeriod,
        amount: Number(form.amount),
        method: form.method,
        reference: form.reference || null,
        paid_at: form.paid_at || undefined,
        notes: form.notes || null,
      });
      notifySuccess(res.message || "Salary payment recorded.");
      setForm({ amount: "", method: form.method, reference: "", paid_at: "", notes: "" });
      reload();
      onSaved();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not record the salary payment.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(payment) {
    if (!window.confirm(`Delete the ${money(payment.amount)} payment for ${monthLabel(payment.period)}?`)) return;
    try {
      await drivingSend(`/salary-payments/${payment.id}`, "DELETE");
      notifySuccess("Salary payment deleted.");
      reload();
      onSaved();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not delete this payment.");
    }
  }

  return (
    <Editor open title={`Salary · ${employee.full_name}`} onClose={onClose} wide>
      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Gross" value={money(summary.gross_total ?? employee.gross_pay)} icon="wallet2" tone="indigo" />
        <Stat label="Deductions" value={money(summary.deductions_total ?? employee.deductions)} icon="dash-circle" tone="amber" />
        <Stat label="Net salary" value={money(summary.payroll_total ?? employee.salary_due)} icon="cash-stack" tone="violet" />
        <Stat label="Paid" value={money(summary.paid_total ?? employee.paid_this_period)} icon="check-circle" tone="emerald" />
        <Stat label="Balance" value={money(summary.outstanding_total ?? employee.balance_this_period)} icon="exclamation-circle" tone="amber" />
        <Card>
          <Field label="Salary month"><input className={inputClass} type="month" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} /></Field>
        </Card>
      </div>
      {data?.line ? (
        <Card className="mb-4">
          <h2 className="theme-heading mb-3 text-sm font-semibold">Statutory deduction breakdown</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="SHIF" value={money(data.line.shif)} />
            <Stat label="NSSF" value={money(data.line.nssf)} />
            <Stat label="Housing levy" value={money(data.line.housing_levy)} />
            <Stat label="PAYE" value={money(data.line.paye)} />
          </div>
        </Card>
      ) : null}
      <Card className="mb-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="theme-heading text-sm font-semibold">Pay adjustments · {monthLabel(selectedPeriod)}</h2>
            <p className="theme-subtext mt-1 text-xs">Overtime, commissions, bonuses, cash advances and other deductions applied to this month&apos;s gross pay.</p>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${locked ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
            {locked ? "Payroll generated — locked" : "Open for adjustments"}
          </span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Overtime pay" value={money(itemTotals.overtime_pay ?? 0)} icon="stopwatch" tone="sky" />
          <Stat label="Commissions & bonuses" value={money(itemTotals.commissions ?? 0)} icon="award" tone="emerald" />
          <Stat label="Cash advances" value={money(itemTotals.cash_advance ?? 0)} icon="cash-coin" tone="amber" />
          <Stat label="Other deductions" value={money(itemTotals.other_deductions ?? 0)} icon="dash-circle" tone="rose" />
        </div>
        <p className="theme-subtext mt-2 text-xs">
          Attendance this month: {attendance.days_recorded ?? 0} day(s) recorded · {attendance.present ?? 0} present · {attendance.absent ?? 0} absent · {attendance.leave ?? 0} on leave · {Number(attendance.overtime_hours ?? 0).toFixed(1)} OT hours
        </p>
        {canAdjust && !locked ? (
          <form onSubmit={addItem} className="mt-3 rounded-xl border border-[var(--theme-border)] p-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Type">
                <DrivingSelect value={itemForm.type} onChange={(e) => setItemForm({ ...itemForm, type: e.target.value })} options={PAY_ITEM_TYPES} />
              </Field>
              <Field label="Amount (KSh)"><input className={inputClass} required type="number" min="0.01" step="0.01" value={itemForm.amount} onChange={(e) => setItemForm({ ...itemForm, amount: e.target.value })} /></Field>
              <Field label={itemForm.type === "overtime" ? "Overtime hours" : "Hours (optional)"}>
                <input className={inputClass} type="number" min="0" step="0.25" value={itemForm.hours} onChange={(e) => setItemForm({ ...itemForm, hours: e.target.value })} placeholder={itemForm.type === "overtime" ? "e.g. 4" : ""} />
              </Field>
              <Field label="Description"><input className={inputClass} maxLength={200} value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} placeholder="Reason or note" /></Field>
            </div>
            <div className="mt-3 flex justify-end">
              <button className={primaryButtonClass} type="submit" disabled={itemBusy || !itemForm.amount}>{itemBusy ? "Adding…" : "Add pay item"}</button>
            </div>
          </form>
        ) : null}
        {locked ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            This month&apos;s payroll has been generated, so adjustments are locked. Reopen the run from the salary register if the payroll must be corrected.
          </p>
        ) : null}
        <div className="mt-3">
          <DataTable
            empty="No overtime, commission, advance or deduction recorded for this month."
            rows={payItems}
            columns={[
              { key: "label", label: "Type", render: (row) => <span className="theme-heading font-medium">{row.label}</span> },
              { key: "description", label: "Details", render: (row) => <span className="theme-subtext text-xs">{row.description || "—"}{row.hours != null ? ` · ${row.hours} h` : ""}</span> },
              { key: "amount", label: "Amount", render: (row) => money(row.amount) },
              { key: "applied", label: "Status", render: (row) => <StatusBadge value={row.applied ? "applied" : "pending"} /> },
              ...((canAdjust || canDeleteItem) ? [{
                key: "actions",
                label: "",
                render: (row) => row.applied
                  ? <span className="theme-subtext text-xs">In payroll</span>
                  : <button type="button" className="theme-link text-sm font-medium text-red-600" onClick={() => removeItem(row)} disabled={itemBusy}>Remove</button>,
              }] : []),
            ]}
          />
        </div>
      </Card>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {run?.status === "draft" ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This month&apos;s payroll is a draft. It must be approved before payments can be recorded.
        </p>
      ) : null}
      {run?.status === "paid" ? (
        <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          This payroll run is fully paid and locked against further payment changes.
        </p>
      ) : null}
      {!run ? (
        <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Generate and approve the school payroll for this month before recording salary payments.
        </p>
      ) : null}
      {canRecordPayment ? (
        <form onSubmit={save} className="mb-4 rounded-xl border border-[var(--theme-border)] p-4">
          <p className="theme-heading mb-3 text-sm font-semibold">Record salary payment</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount (KSh)"><input className={inputClass} required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder={String(summary.outstanding_total ?? "")} /></Field>
            <Field label="Method">
              <DrivingSelect value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} options={SALARY_METHODS} />
            </Field>
            <Field label="Reference"><input className={inputClass} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="M-Pesa code or voucher" /></Field>
            <Field label="Paid on"><input className={inputClass} type="date" value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} /></Field>
            <Field label="Notes"><input className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
          <div className="mt-3 flex justify-end">
            <button className={primaryButtonClass} type="submit" disabled={busy || !form.amount}>{busy ? "Recording…" : "Record payment"}</button>
          </div>
        </form>
      ) : null}
      <Card>
        <DataTable
          empty={`No salary payments for ${monthLabel(selectedPeriod)}.`}
          rows={payments}
          columns={[
            { key: "paid_at", label: "Paid", render: (row) => shortDate(row.paid_at) },
            { key: "period", label: "For month", render: (row) => monthLabel(row.period) },
            { key: "amount", label: "Amount", render: (row) => money(row.amount) },
            { key: "method", label: "Method", render: (row) => <span className="capitalize">{row.method}</span> },
            { key: "reference", label: "Reference", render: (row) => row.reference || "—" },
            ...(canDelete ? [{
              key: "actions",
              label: "",
              render: (row) => row.can_delete
                ? <button type="button" className="theme-link text-sm font-medium text-red-600" onClick={() => remove(row)}>Delete</button>
                : <span className="theme-subtext text-xs">Locked</span>,
            }] : []),
          ]}
        />
      </Card>
    </Editor>
  );
}

export function StaffScreen({ view } = {}) {
  const { hasPermission, isOrgWide } = useAuth();
  const salaryView = view === "salaries";
  useTabTitle(tabSectionTitle(salaryView ? "Payroll run" : "Employees", "Driving"));
  const { branches, showBranchSelect } = useDrivingBranches();
  const [period, setPeriod] = useState(currentMonthValue());
  const [branchFilter, setBranchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [query, setQuery] = useState("");
  const { data, error, reload } = useLoad(
    () => drivingGet("/staff", { period, branch_id: branchFilter || undefined }),
    `staff|${period}|${branchFilter}`,
  );
  const canViewSalary = hasPermission("driving.payroll.view");
  const payroll = useLoad(
    () => (canViewSalary ? drivingGet("/payroll/summary", { period, branch_id: branchFilter || undefined }) : Promise.resolve(null)),
    `payroll-summary|${period}|${branchFilter}|${canViewSalary}`,
  );
  const payrollHistory = useLoad(
    () => (canViewSalary ? drivingGet("/payroll/runs") : Promise.resolve([])),
    `payroll-history|${canViewSalary}`,
  );
  const rows = rowsOf(data);
  const summary = data?.summary || {};
  const branchBreakdown = payroll.data?.by_branch || [];
  const [editor, setEditor] = useState(null);
  const [payEditor, setPayEditor] = useState(null);
  const canCreate = hasPermission("driving.staff.create");
  const canEdit = hasPermission("driving.staff.edit");
  const canDelete = hasPermission("driving.staff.delete");
  const canGeneratePayroll = hasPermission("driving.payroll.create") && isOrgWide();
  const canApprovePayroll = hasPermission("driving.payroll.approve") && isOrgWide();
  const payrollRun = payroll.data?.run;
  const payrollStaffCount = payroll.data?.active_staff_count ?? payroll.data?.staff_count ?? 0;
  const eligibleCount = payroll.data?.eligible_count ?? payrollStaffCount;
  const noEmployees = payrollStaffCount === 0;
  const noEligible = !noEmployees && eligibleCount === 0;
  const [payrollBusy, setPayrollBusy] = useState(false);

  async function generatePayroll() {
    if (payrollBusy) return;
    if (!payroll.data) {
      notifyError("Employee details are still loading. Reload the page and try again.");
      return;
    }
    if (eligibleCount === 0) {
      notifyError(noEmployees
        ? "Add at least one employee with a monthly salary before generating payroll."
        : "No employee is eligible for this month. Set them to Active with a base salary and check the hire date.");
      return;
    }
    if (!window.confirm(`Generate the school payroll for ${monthLabel(period)}? This snapshots each eligible staff member's salary, attendance summary and pay adjustments, then applies statutory deductions.`)) return;
    setPayrollBusy(true);
    try {
      const result = await drivingSend("/payroll/generate", "POST", { period });
      notifySuccess(result.message || "Driving School payroll generated.");
      reload();
      payroll.reload();
      payrollHistory.reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not generate the school payroll.");
    } finally {
      setPayrollBusy(false);
    }
  }

  async function approvePayroll() {
    if (!payrollRun?.id || !window.confirm(`Approve the payroll for ${monthLabel(period)}? Payments will be enabled after approval.`)) return;
    setPayrollBusy(true);
    try {
      const result = await drivingSend(`/payroll/runs/${payrollRun.id}/approve`, "POST", {});
      notifySuccess(result.message || "Driving School payroll approved.");
      reload();
      payroll.reload();
      payrollHistory.reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not approve the school payroll.");
    } finally {
      setPayrollBusy(false);
    }
  }

  const list = rows.filter((row) => {
    if (statusFilter && String(row.employment_status || "") !== statusFilter) return false;
    if (outstandingOnly && !(Number(row.balance_this_period) > 0)) return false;
    if (!query.trim()) return true;
    const haystack = [row.full_name, row.phone, row.email, row.employee_code, row.job_title].join(" ").toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  async function removeStaff(row) {
    if (!window.confirm(`Remove ${row.full_name} from staff? This cannot be undone.`)) return;
    try {
      await drivingSend(`/staff/${row.id}`, "DELETE");
      notifySuccess("Staff member removed.");
      reload();
      payroll.reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not remove this staff member.");
    }
  }

  const columns = [
    { key: "full_name", label: "Employee", render: (row) => <PersonName name={row.full_name} detail={row.employee_code} /> },
    { key: "role", label: "Role", render: (row) => row.job_title || "—" },
    ...(showBranchSelect ? [{ key: "branch", label: "Branch", render: (row) => row.branch_name || "—" }] : []),
    ...(!salaryView ? [
      { key: "phone", label: "Phone", render: (row) => row.phone || "—" },
      { key: "employment", label: "Type", render: (row) => <span className="capitalize">{row.employment_type || "—"}</span> },
    ] : []),
    ...(!salaryView && canViewSalary ? [
      {
        key: "registered_salary",
        label: "Registered salary",
        render: (row) => (
          <span className="block">
            <span className="theme-heading font-medium">{money((Number(row.base_salary) || 0) + (Number(row.monthly_allowance) || 0))}</span>
            <span className="theme-subtext block text-[11px]">{money(row.base_salary)} base{Number(row.monthly_allowance) > 0 ? ` + ${money(row.monthly_allowance)} allowance` : ""}</span>
          </span>
        ),
      },
      {
        key: "statutory",
        label: "Deductions",
        render: (row) => {
          const on = [row.pays_sha !== false && "SHIF", row.pays_nssf !== false && "NSSF", row.pays_housing_levy !== false && "Housing", row.pays_paye !== false && "PAYE"].filter(Boolean);
          return <span className="theme-subtext text-xs">{on.length ? on.join(" · ") : "None"}</span>;
        },
      },
    ] : []),
    ...(salaryView && canViewSalary ? [
      { key: "salary_due", label: "Net salary", render: (row) => money(row.salary_due) },
      {
        key: "adjustments",
        label: "Adjustments",
        render: (row) => {
          const earned = Number(row.overtime_pay || 0) + Number(row.commissions || 0);
          const withheld = Number(row.cash_advance || 0) + Number(row.other_deductions || 0);
          if (!earned && !withheld) return <span className="theme-subtext">—</span>;
          return <span className="text-xs">+{money(earned)} / −{money(withheld)}</span>;
        },
      },
      { key: "paid_this_period", label: "Paid", render: (row) => money(row.paid_this_period) },
      { key: "balance_this_period", label: "Balance", render: (row) => <span className={Number(row.balance_this_period) > 0 ? "font-semibold text-amber-700" : ""}>{money(row.balance_this_period)}</span> },
    ] : []),
    { key: "employment_status", label: "Status", render: (row) => <StatusBadge value={row.is_active === false ? "inactive" : row.employment_status} /> },
    ...((canViewSalary || canEdit || canDelete) ? [{
      key: "actions",
      label: "",
      render: (row) => (
        <span className="flex flex-wrap gap-3">
          {salaryView && canViewSalary ? (
            <button type="button" className="theme-link text-sm font-medium" onClick={() => setPayEditor(row)}>
              {Number(row.balance_this_period) > 0 ? "Pay" : "Salary"}
            </button>
          ) : null}
          {canEdit ? <button type="button" className="theme-link text-sm font-medium" onClick={() => setEditor(row)}>Edit</button> : null}
          {canDelete ? <button type="button" className="theme-link text-sm font-medium text-red-600" onClick={() => removeStaff(row)}>Remove</button> : null}
        </span>
      ),
    }] : []),
  ];

  const runStatus = payrollRun?.status;
  const runLabel = runStatus === "draft" ? "Draft" : runStatus === "approved" ? "Approved" : runStatus === "paid" ? "Paid" : "Not generated";
  const runHint = runStatus === "draft"
    ? "Review the lines below, then approve to enable payments."
    : runStatus === "approved"
      ? "Approved — record each employee's payment from the lines below."
      : runStatus === "paid"
        ? "Fully paid and locked for this month."
        : noEmployees
          ? "Add your first employee under Employees, then generate this month's run."
          : noEligible
            ? "Employees exist but none are eligible — they need Active status and a base salary."
            : "Registered employees and their salary settings are ready. Generate the run to snapshot this month.";
  const runTone = runStatus === "draft" ? "bg-amber-50 text-amber-800" : runStatus ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700";

  return (
    <div>
      <ScreenHeader
        title={salaryView ? "Payroll run" : "Employees & Salaries"}
        subtitle={salaryView
          ? "Run the monthly payroll: generate the run, approve it, then record payments. Employees, salaries and deductions are maintained under Employees."
          : "Register Driving School employees with their salary, allowances and statutory deductions. Monthly runs happen on the Payroll run page."}
      >
        {!salaryView && canCreate ? (
          <button type="button" className={primaryButtonClass} onClick={() => setEditor({})}>Add staff member</button>
        ) : null}
      </ScreenHeader>

      {salaryView && payroll.error ? (
        <Card className="mb-4 border-red-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-red-700">{payroll.error}</p>
            <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={payroll.reload}>Retry</button>
          </div>
        </Card>
      ) : null}

      {salaryView && payroll.data && !payrollRun && (noEmployees || noEligible) ? (
        <Card className="mb-4 border-amber-200 bg-amber-50">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <i className="bi bi-exclamation-circle" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="theme-heading text-sm font-semibold">
                  {noEmployees ? "No employees to run payroll for yet" : "No employee is eligible for this month"}
                </p>
                <p className="theme-subtext mt-1 text-xs">
                  {noEmployees
                    ? "Payroll snapshots each employee's salary, statutory deductions and attendance. Add your first employee, then generate this month's run."
                    : "Eligible employees must be Active, have a base salary above zero, and a hire date on or before the end of this month."}
                </p>
              </div>
            </div>
            <AppNavLink href="/driving-school/staff" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">
              {noEmployees ? "Add employees" : "Review employees"}
            </AppNavLink>
          </div>
        </Card>
      ) : null}

      {salaryView ? (
        <Card className="mb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="theme-subtext text-[11px] font-medium uppercase tracking-wide">Payroll run</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 className="theme-heading text-lg font-semibold">{monthLabel(period)}</h2>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${runTone}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${runStatus === "draft" ? "bg-amber-500" : runStatus ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden />
                  {runLabel}
                </span>
              </div>
              <p className="theme-subtext mt-1 text-xs">{runHint}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!payrollRun && canGeneratePayroll ? (
                <button type="button" className={primaryButtonClass} disabled={payrollBusy} onClick={generatePayroll}>
                  {payrollBusy ? "Generating…" : "Generate payroll"}
                </button>
              ) : null}
              {runStatus === "draft" && canApprovePayroll ? (
                <button type="button" className={primaryButtonClass} disabled={payrollBusy} onClick={approvePayroll}>
                  {payrollBusy ? "Approving…" : "Approve payroll"}
                </button>
              ) : null}
              {!payrollRun && noEmployees ? (
                <AppNavLink href="/driving-school/staff" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Register employees</AppNavLink>
              ) : null}
              <AppNavLink href="/driving-school/staff/attendance" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Attendance & OT</AppNavLink>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Gross", payroll.data?.gross_total, "wallet2"],
              ["Statutory deductions", payroll.data?.deductions_total, "dash-circle"],
              ["Paid", summary.paid_total, "check-circle"],
              ["Still to pay", summary.outstanding_total, "exclamation-circle"],
            ].map(([label, value, icon]) => (
              <div key={label} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--theme-border)] px-3 py-2">
                <span className="theme-subtext flex items-center gap-1.5 text-xs"><i className={`bi bi-${icon}`} aria-hidden />{label}</span>
                <span className="theme-heading text-sm font-semibold tabular-nums">{money(value ?? 0)}</span>
              </div>
            ))}
          </div>
          <ol className="theme-subtext mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["1", "Employees registered", `${summary.staff_count ?? 0} active on payroll`],
              ["2", "Attendance & adjustments", "Mark days, overtime, advances"],
              ["3", "Generate run", runStatus ? monthLabel(period) : "Snapshot salaries and deductions"],
              ["4", "Approve & pay", runStatus === "paid" ? "Complete" : `${money(summary.outstanding_total ?? 0)} outstanding`],
            ].map(([step, title, detail]) => (
              <li key={step} className="rounded-xl border border-[var(--theme-border)] px-3 py-2">
                <span className="theme-heading block text-xs font-semibold">{step}. {title}</span>
                <span className="block">{detail}</span>
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {!salaryView ? (
        <Card className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="theme-heading text-sm font-semibold">Driving School employment</p>
              <p className="theme-subtext text-xs">Driving staff and fixed salaries are kept separate from general HR. Instructor pay per completed lesson remains a different compensation type.</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--theme-border)] pt-3">
            <div className="min-w-0">
              <p className="theme-heading text-sm font-semibold">Instructor lesson pay</p>
              <p className="theme-subtext text-xs">Calculated from completed lessons and each instructor&apos;s per-lesson rate — separate from monthly salary.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <AppNavLink href="/driving-school/instructors" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Instructor pay</AppNavLink>
              <AppNavLink href="/driving-school/reports/instructor_performance" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Performance</AppNavLink>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Staff" value={summary.staff_count ?? 0} hint={salaryView ? "In this run" : "On record"} icon="people" tone="indigo" />
        <Stat label="Gross payroll" value={money(payroll.data?.gross_total ?? 0)} hint={monthLabel(period)} icon="wallet2" tone="sky" />
        <Stat label="Net payroll" value={money(payroll.data?.payroll_total ?? 0)} hint={monthLabel(period)} icon="cash-stack" tone="violet" />
        <Stat label="Outstanding" value={money(summary.outstanding_total ?? 0)} hint="Still to pay this month" icon="exclamation-circle" tone="amber" />
      </div>

      {canViewSalary && rowsOf(payrollHistory.data).length > 0 ? (
        <Card className="mb-4">
          <h2 className="theme-heading mb-3 text-sm font-semibold">Payroll history</h2>
          <DataTable
            rows={rowsOf(payrollHistory.data)}
            columns={[
              { key: "period", label: "Month", render: (row) => monthLabel(row.period) },
              { key: "status", label: "Status", render: (row) => <span className="capitalize">{row.status}</span> },
              { key: "employee_count", label: "Staff", render: (row) => row.employee_count ?? "—" },
              { key: "gross_total", label: "Gross", render: (row) => row.gross_total == null ? "—" : money(row.gross_total) },
              { key: "deductions_total", label: "Deductions", render: (row) => row.deductions_total == null ? "—" : money(row.deductions_total) },
              { key: "net_total", label: "Net", render: (row) => row.net_total == null ? "—" : money(row.net_total) },
            ]}
          />
        </Card>
      ) : null}

      {canViewSalary && branchBreakdown.length > 1 ? (
        <Card className="mb-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="theme-heading text-sm font-semibold">Payroll by branch</h2>
            <span className="theme-subtext text-xs">{monthLabel(payroll.data?.period || period)}</span>
          </div>
          <DataTable
            rows={branchBreakdown}
            columns={[
              { key: "branch_name", label: "Branch", render: (row) => row.branch_name || "—" },
              { key: "staff_count", label: "Staff", render: (row) => row.staff_count ?? 0 },
              { key: "payroll_total", label: "Payroll", render: (row) => money(row.payroll_total ?? 0) },
              { key: "paid_total", label: "Paid", render: (row) => money(row.paid_total ?? 0) },
              { key: "outstanding_total", label: "Outstanding", render: (row) => <span className={Number(row.outstanding_total) > 0 ? "font-semibold text-amber-700" : ""}>{money(row.outstanding_total ?? 0)}</span> },
            ]}
          />
        </Card>
      ) : null}

      <Toolbar>
        <SearchField value={query} onChange={setQuery} placeholder="Search staff" />
        <input className={inputClass} style={{ maxWidth: 180 }} type="month" value={period} onChange={(e) => setPeriod(e.target.value || currentMonthValue())} aria-label="Salary month" />
        <div style={{ width: 160 }}>
          <DrivingSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[{ value: "", label: "All statuses" }, ...EMPLOYMENT_STATUSES]}
          />
        </div>
        <BranchFilter value={branchFilter} onChange={setBranchFilter} branches={branches} show={showBranchSelect} />
        {salaryView && canViewSalary ? (
          <label className="theme-subtext flex items-center gap-2 text-sm">
            <input type="checkbox" checked={outstandingOnly} onChange={(e) => setOutstandingOnly(e.target.checked)} />
            Outstanding only
          </label>
        ) : null}
      </Toolbar>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <Card>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="theme-heading text-sm font-semibold">{salaryView ? (payrollRun ? "Payroll lines" : "Payroll preview") : "Employees"}</h2>
            <p className="theme-subtext mt-0.5 text-xs">
              {salaryView
                ? (payrollRun ? `Locked snapshot for ${monthLabel(period)}. Payments are recorded per employee.` : "Current registered salaries and adjustments — generate the run to snapshot them.")
                : "Employees and the salary details that feed the payroll run."}
            </p>
          </div>
          <span className="theme-subtext text-xs">{list.length} employee{list.length === 1 ? "" : "s"}</span>
        </div>
        <DataTable columns={columns} rows={list} empty={salaryView ? "No employees in this payroll run." : rows.length === 0 ? "No employees registered yet. Add a staff member so they can be included in payroll." : "No staff match these filters."} />
      </Card>
      {editor ? (
        <StaffFormDialog
          employee={editor}
          branches={branches}
          showBranchSelect={showBranchSelect}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); reload(); payroll.reload(); }}
        />
      ) : null}
      {payEditor ? (
        <SalaryDialog
          employee={payEditor}
          period={period}
          onClose={() => setPayEditor(null)}
          onSaved={() => { reload(); payroll.reload(); payrollHistory.reload(); }}
        />
      ) : null}
    </div>
  );
}
