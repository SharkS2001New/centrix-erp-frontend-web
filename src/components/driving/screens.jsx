"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { ApiError, apiFetchBlob, apiRequest } from "@/lib/api";
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
import { FilterSelect, FormDrawer, PaginationBar, SearchableSelect } from "@/components/catalog/catalog-shared";
import { HrTimePickerField } from "@/components/hr/hr-time-picker";
import { RecordFormActions, RecordFormDialog, useRecordExit } from "@/components/record-form-page";
import { ServiceReceiptDialog } from "@/components/service-receipt-dialog";
import { buildDrivingFeeReceipt } from "@/lib/service-receipt";
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
  const { branches, showBranchSelect } = useDrivingBranches();
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
  const { branches, showBranchSelect } = useDrivingBranches();
  const { data, error, reload } = useLoad(() => drivingGet(`/students/${studentId}`), `student:${studentId}`);
  const [downloadingCertificate, setDownloadingCertificate] = useState(false);
  const [tab, setTab] = useState("overview");
  const [sellingCredit, setSellingCredit] = useState(false);
  const [savingCredit, setSavingCredit] = useState(false);
  const [creditForm, setCreditForm] = useState({ lesson_type: "practical", quantity: 5, unit_price: "", notes: "" });
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
          ["documents", "Documents"],
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
            {enrolments.length === 0 ? <Empty>No enrolments yet. Register the student with a course to generate fees.</Empty> : enrolments.map((row) => {
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
            <AppNavLink href="/driving-school/students/new" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Register & enrol</AppNavLink>
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
                <AppNavLink href="/driving-school/notifications" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Send reminder</AppNavLink>
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
                  { key: "invoice_number", label: "Invoice", render: (row) => row.invoice_number },
                  { key: "method", label: "Method", render: (row) => <span className="capitalize">{row.method || "—"}</span> },
                  { key: "reference", label: "Reference", render: (row) => row.reference || "—" },
                  { key: "amount", label: "Amount", render: (row) => money(row.amount) },
                  { key: "refunded", label: "Refunded", render: (row) => (row.refunded ? money(row.refunded) : "—") },
                  { key: "confirmed", label: "Confirmed", render: (row) => <StatusBadge value={row.provider_confirmed ? "confirmed" : "recorded"} /> },
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
        <Card>
          <h2 className="theme-heading font-semibold">Documents</h2>
          <p className="theme-subtext mt-1 text-xs">Course completion certificate and the enrolment record for this student.</p>
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

function CourseListScreen() {
  const { user } = useAuth();
  const { branches, showBranchSelect } = useDrivingBranches();
  const isAdmin = Boolean(user?.is_admin || user?.is_super_admin);
  const { data, error } = useLoad(() => fetchDrivingCoursesCached().then((rows) => ({ data: rows })), "courses");
  const courses = rowsOf(data);
  const packageRows = courses.flatMap((course) => {
    const packages = course.packages || [];
    if (packages.length === 0) {
      return [{ id: `course-${course.id}`, name: "Standard", price: course.price, practical_lessons: course.practical_lessons, theory_lessons: course.theory_lessons, course }];
    }
    return packages.map((item) => ({ ...item, course }));
  });
  return (
    <div>
      <ScreenHeader title="Courses & theory" subtitle="A course is the licence class. Packages are the prices and lesson counts a student chooses when they register.">
        {isAdmin ? (
          <>
            <AppNavLink href="/driving-school/courses/package" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium">Add package</AppNavLink>
            <AppNavLink href="/driving-school/courses/new" className={primaryButtonClass}>Add course</AppNavLink>
          </>
        ) : null}
      </ScreenHeader>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {courses.length === 0 ? (
        <Card><Empty>No courses yet. Add a course to start enrolling students.</Empty></Card>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {courses.map((course) => {
              const prices = (course.packages || []).map((item) => Number(item.price) || 0);
              const from = prices.length ? Math.min(...prices) : Number(course.price) || 0;
              return (
                <Card key={course.id} className="flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-lg bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">{course.code || "Course"}</span>
                    <span className="theme-subtext text-xs">{(course.packages || []).length || 1} package{(course.packages || []).length === 1 ? "" : "s"}</span>
                  </div>
                  <p className="theme-heading mt-3 font-semibold">{course.name}</p>
                  <p className="theme-subtext text-xs">{course.licence_category || "Licence class"}</p>
                  <div className="mt-3 flex gap-4 border-t border-[var(--theme-border)] pt-3 text-xs">
                    <span><strong className="theme-heading">{course.practical_lessons ?? "—"}</strong> practical</span>
                    <span><strong className="theme-heading">{course.theory_lessons ?? "—"}</strong> theory</span>
                  </div>
                  <p className="theme-heading mt-3 text-lg font-semibold">{money(from)}</p>
                  <p className="theme-subtext text-xs">Starting price</p>
                  <AppNavLink href={`/driving-school/courses/${course.id}`} className="theme-heading mt-3 inline-flex items-center gap-1 text-xs font-medium hover:underline">
                    Open course <i className="bi bi-arrow-right" aria-hidden />
                  </AppNavLink>
                </Card>
              );
            })}
          </div>
          <Card>
            <h2 className="theme-heading mb-1 font-semibold">Course details</h2>
            <p className="theme-subtext mb-3 text-xs">Every package, its lesson counts and price.</p>
            <DataTable
              empty="No packages yet."
              rows={packageRows}
              columns={[
                { key: "course", label: "Course", render: (row) => <AppNavLink href={`/driving-school/courses/${row.course.id}`} className="hover:underline"><PersonName name={row.course.name} detail={row.course.code} /></AppNavLink> },
                { key: "package", label: "Package", render: (row) => row.name },
                { key: "practical", label: "Practical", render: (row) => row.practical_lessons ?? "—" },
                { key: "theory", label: "Theory", render: (row) => row.theory_lessons ?? "—" },
                { key: "price", label: "Price", render: (row) => money(row.price) },
                ...(showBranchSelect ? [{ key: "branch", label: "Branch", render: (row) => (row.course.branch_id == null ? "All branches" : branchNameOf(branches, row.course.branch_id)) }] : []),
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
}

const COURSE_RESOURCE_KINDS = [
  { value: "material", label: "Training material", short: "Materials", icon: "journal-text", tone: "bg-indigo-50 text-indigo-700" },
  { value: "road_sign", label: "Road sign & rules", short: "Road signs", icon: "signpost-split", tone: "bg-amber-50 text-amber-700" },
  { value: "video", label: "Video lesson", short: "Videos", icon: "play-btn", tone: "bg-rose-50 text-rose-700" },
  { value: "quiz", label: "Online quiz", short: "Quizzes", icon: "patch-question", tone: "bg-emerald-50 text-emerald-700" },
];

function resourceKind(value) {
  return COURSE_RESOURCE_KINDS.find((item) => item.value === value) || COURSE_RESOURCE_KINDS[0];
}

function CourseDetailScreen({ courseId }) {
  const { user, hasPermission } = useAuth();
  const canEdit = Boolean(user?.is_admin || user?.is_super_admin || hasPermission("driving.courses.edit"));
  const [tab, setTab] = useState("library");
  const [kindFilter, setKindFilter] = useState("");
  const [tick, setTick] = useState(0);
  const [form, setForm] = useState({ kind: "material", title: "", summary: "", url: "", body: "", duration_minutes: "" });
  const { data: courseData, error: courseError } = useLoad(() => fetchDrivingCoursesCached().then((rows) => ({ data: rows })), "course-detail-courses");
  const { data: resourceData, error: resourceError } = useLoad(
    () => drivingGet(`/courses/${courseId}/resources`),
    `course-resources|${courseId}|${tick}`,
  );
  const course = rowsOf(courseData).find((row) => Number(row.id) === courseId) || null;
  const resources = rowsOf(resourceData);
  const packages = course?.packages?.length ? course.packages : course ? [{ id: `course-${course.id}`, name: "Standard", price: course.price, theory_lessons: course.theory_lessons, practical_lessons: course.practical_lessons }] : [];
  const visible = kindFilter ? resources.filter((row) => row.kind === kindFilter) : resources;
  const counts = Object.fromEntries(COURSE_RESOURCE_KINDS.map((item) => [item.value, resources.filter((row) => row.kind === item.value).length]));
  const tabs = [
    { value: "library", label: `Theory library (${resources.length})` },
    { value: "overview", label: "Overview & packages" },
    { value: "requirements", label: "Completion requirements" },
  ];

  async function addResource(event) {
    event.preventDefault();
    if (!form.title.trim()) {
      notifyError("Give the resource a title.");
      return;
    }
    try {
      await drivingSend(`/courses/${courseId}/resources`, "POST", {
        kind: form.kind,
        title: form.title.trim(),
        summary: form.summary.trim() || null,
        url: form.url.trim() || null,
        body: form.body.trim() || null,
        duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
      });
      notifySuccess("Theory resource added to the course.");
      setForm({ kind: form.kind, title: "", summary: "", url: "", body: "", duration_minutes: "" });
      setTick((value) => value + 1);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save the resource.");
    }
  }

  async function removeResource(row) {
    if (!window.confirm(`Remove “${row.title}” from this course?`)) return;
    try {
      await drivingSend(`/course-resources/${row.id}`, "DELETE");
      notifySuccess("Resource removed.");
      setTick((value) => value + 1);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not remove the resource.");
    }
  }

  if (!course) {
    return (
      <div>
        <ScreenHeader title="Course" subtitle="Course packages, theory materials and completion requirements.">
          <AppNavLink href="/driving-school/courses" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium">Back to courses</AppNavLink>
        </ScreenHeader>
        <Card><Empty>{courseError || (courseData == null ? "Loading course…" : "This course could not be found.")}</Empty></Card>
      </div>
    );
  }

  return (
    <div>
      <ScreenHeader title={course.name} subtitle={`${course.code} · ${course.licence_category || "Licence class"}`}>
        <AppNavLink href="/driving-school/courses" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium">Back to courses</AppNavLink>
        <AppNavLink href="/driving-school/assessments/new" className={primaryButtonClass}>Record assessment</AppNavLink>
      </ScreenHeader>
      {resourceError ? <p className="mb-3 text-sm text-red-600">{resourceError}</p> : null}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Packages" value={packages.length} hint="Price options" icon="box-seam" />
        <Stat label="Practical lessons" value={course.practical_lessons ?? 0} hint={`${course.lesson_minutes || 60} min each`} icon="car-front" tone="sky" />
        <Stat label="Theory lessons" value={course.theory_lessons ?? 0} hint="Classroom and quizzes" icon="book" tone="violet" />
        <Stat label="Theory resources" value={resources.length} hint="Materials, signs, videos" icon="collection" tone="emerald" />
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

      {tab === "library" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="theme-heading font-semibold">Theory library</h2>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" className={`rounded-full border px-2.5 py-1 text-xs font-medium ${kindFilter === "" ? "border-[var(--theme-primary)] text-[var(--theme-primary)]" : "border-[var(--theme-border)] theme-subtext"}`} onClick={() => setKindFilter("")}>All {resources.length}</button>
                {COURSE_RESOURCE_KINDS.map((item) => (
                  <button key={item.value} type="button" className={`rounded-full border px-2.5 py-1 text-xs font-medium ${kindFilter === item.value ? "border-[var(--theme-primary)] text-[var(--theme-primary)]" : "border-[var(--theme-border)] theme-subtext"}`} onClick={() => setKindFilter(item.value)}>
                    {item.short} {counts[item.value]}
                  </button>
                ))}
              </div>
            </div>
            <p className="theme-subtext mt-1 text-xs">Materials, road signs, video lessons and quizzes students work through alongside practical lessons.</p>
            {visible.length === 0 ? (
              <Empty>No resources in this view. Add training material so students can revise theory before their checks.</Empty>
            ) : (
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
                          <button type="button" className="theme-subtext text-xs hover:text-red-600" onClick={() => void removeResource(row)}>Remove</button>
                        ) : null}
                      </div>
                      <p className="theme-heading mt-2 text-sm font-semibold">{row.title}</p>
                      <p className="theme-subtext text-[11px] uppercase tracking-wide">{kind.label}{row.duration_minutes ? ` · ${row.duration_minutes} min` : ""}</p>
                      {row.summary ? <p className="theme-subtext mt-1 line-clamp-2 text-xs">{row.summary}</p> : null}
                      {row.body ? <p className="theme-subtext mt-1 line-clamp-3 whitespace-pre-line text-xs">{row.body}</p> : null}
                      {row.url ? (
                        <a href={row.url} target="_blank" rel="noreferrer" className="theme-heading mt-2 inline-flex items-center gap-1 text-xs font-medium hover:underline">
                          Open resource <i className="bi bi-box-arrow-up-right" aria-hidden />
                        </a>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          {canEdit ? (
            <Card>
              <h2 className="theme-heading font-semibold">Add to the library</h2>
              <p className="theme-subtext mt-1 text-xs">Attach notes, a link to a video or road-sign reference, or quiz instructions.</p>
              <form onSubmit={addResource} className="mt-3 space-y-3">
                <Field label="Kind">
                  <DrivingSelect value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} options={COURSE_RESOURCE_KINDS.map((item) => ({ value: item.value, label: item.label }))} />
                </Field>
                <Field label="Title"><input className={inputClass} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Highway code — junctions" /></Field>
                <Field label="Short summary"><input className={inputClass} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="What students should take from this" /></Field>
                <Field label="Link (optional)"><input className={inputClass} type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" /></Field>
                <Field label="Reading time (minutes)"><input className={inputClass} type="number" min="1" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} /></Field>
                <Field label="Notes"><textarea className={`${inputClass} h-24 resize-y py-2`} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Key points, rules or quiz questions" /></Field>
                <button type="submit" className={primaryButtonClass}>Add resource</button>
              </form>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "overview" ? (
        <Card>
          <h2 className="theme-heading font-semibold">Overview & packages</h2>
          {course.description ? <p className="theme-subtext mt-1 text-sm">{course.description}</p> : null}
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
      ) : null}

      {tab === "requirements" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="theme-heading font-semibold">Lesson requirements</h2>
            <p className="theme-subtext mt-1 text-xs">The course counts used when a student registers, and when completion is checked.</p>
            <dl className="mt-3 space-y-2 text-sm">
              <DetailRow label="Practical lessons required">{String(course.practical_lessons ?? 0)}</DetailRow>
              <DetailRow label="Theory lessons required">{String(course.theory_lessons ?? 0)}</DetailRow>
              <DetailRow label="Lesson length">{`${course.lesson_minutes || 60} minutes`}</DetailRow>
              <DetailRow label="Instalments">{course.instalment_count ? `${course.instalment_count} payments` : "One payment"}</DetailRow>
            </dl>
          </Card>
          <Card>
            <h2 className="theme-heading font-semibold">Examination requirements</h2>
            <p className="theme-subtext mt-1 text-xs">A student is test ready once the course lessons are near complete and both checks are passed.</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-start gap-2"><i className="bi bi-1-circle theme-heading mt-0.5" aria-hidden /><span><strong className="theme-heading">Theory check passed.</strong> <span className="theme-subtext">At least one passed theory assessment, such as the highway code quiz.</span></span></li>
              <li className="flex items-start gap-2"><i className="bi bi-2-circle theme-heading mt-0.5" aria-hidden /><span><strong className="theme-heading">Practical check passed.</strong> <span className="theme-subtext">An instructor-signed practical assessment.</span></span></li>
              <li className="flex items-start gap-2"><i className="bi bi-3-circle theme-heading mt-0.5" aria-hidden /><span><strong className="theme-heading">Lessons at 80% or the course completed.</strong> <span className="theme-subtext">Progress is tracked from completed lessons against the package.</span></span></li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <AppNavLink href="/driving-school/assessments/new" className={primaryButtonClass}>Record assessment</AppNavLink>
              <AppNavLink href="/driving-school/assessments" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium">View examinations</AppNavLink>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
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

function AssessmentFormScreen() {
  const { exitTo } = useRecordExit("Record assessment");
  const { branches, showBranchSelect } = useDrivingBranches();
  const [branchFilter, setBranchFilter] = useState("");
  const students = useLoad(
    () => drivingGet("/students", { status: "active", lean: 1, per_page: 100, branch_id: branchFilter || undefined }),
    `assessment-form-students|${branchFilter}`,
  ).data;
  const [form, setForm] = useState({ student_id: "", kind: "practical", instructor_id: "", title: "School practical check", score: "", max_score: 100, comments: "", assessed_on: "" });
  const instructorLoad = useLoad(() => fetchDrivingInstructorsCached().then((rows) => ({ data: rows })), "assessment-instructors");
  const instructors = rowsOf(instructorLoad.data);
  async function save(event) {
    event.preventDefault();
    try {
      const res = await drivingSend("/assessments", "POST", {
        ...form,
        student_id: Number(form.student_id),
        instructor_id: form.instructor_id ? Number(form.instructor_id) : null,
        score: Number(form.score),
        max_score: Number(form.max_score) || 100,
        comments: form.comments.trim() || null,
      });
      notifySuccess(res.message || "Assessment saved.");
      exitTo("/driving-school/assessments");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save the assessment.");
    }
  }
  return (
    <RecordFormDialog title="Record an assessment" backHref="/driving-school/assessments">
      <form onSubmit={save}>
        <p className="theme-subtext mb-4 text-sm">This is an internal school check. It is not an official licensing result.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <BranchField value={branchFilter} onChange={(value) => { setBranchFilter(value); setForm((current) => ({ ...current, student_id: "" })); }} branches={branches} show={showBranchSelect} allowAll />
          <Field label="Student">
            <DrivingSelect required value={form.student_id} placeholder="Choose a student" onChange={(e) => setForm({ ...form, student_id: e.target.value })} options={[{ value: "", label: "Choose a student" }, ...rowsOf(students).map((row) => ({ value: String(row.id), label: row.full_name }))]} />
          </Field>
          <Field label="Kind">
            <DrivingSelect value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} options={[{ value: "practical", label: "Practical" }, { value: "theory", label: "Theory" }, { value: "mock", label: "Mock examination" }]} />
          </Field>
          <Field label="Instructor (optional)">
            <DrivingSelect value={form.instructor_id} placeholder="No instructor" onChange={(e) => setForm({ ...form, instructor_id: e.target.value })} options={[{ value: "", label: "No instructor" }, ...instructors.map((row) => ({ value: String(row.id), label: row.full_name }))]} />
          </Field>
          <Field label="Title"><input className={inputClass} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Score"><input className={inputClass} required type="number" min="0" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} /></Field>
          <Field label="Maximum score"><input className={inputClass} required type="number" min="1" value={form.max_score} onChange={(e) => setForm({ ...form, max_score: e.target.value })} /></Field>
          <Field label="Date"><input className={inputClass} required type="date" value={form.assessed_on} onChange={(e) => setForm({ ...form, assessed_on: e.target.value })} /></Field>
          <Field label="Instructor remarks"><textarea className={`${inputClass} h-20 resize-y py-2`} maxLength={2000} placeholder="Notes for the student's file" value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} /></Field>
        </div>
        <RecordFormActions backHref="/driving-school/assessments" submitLabel="Save assessment" />
        </form>
    </RecordFormDialog>
  );
}

export function AssessmentsScreen() {
  const pathname = usePathname();
  return (
    <>
      <AssessmentListScreen />
      {pathname.endsWith("/assessments/new") ? <AssessmentFormScreen /> : null}
    </>
  );
}

function AssessmentCalendar({ assessments, month, onShift }) {
  const grid = monthGrid(month);
  const end = grid.end;
  const byDay = {};
  for (const row of assessments) {
    const key = String(row.assessed_on || "").slice(0, 10);
    if (!key) continue;
    byDay[key] = (byDay[key] || 0) + 1;
  }
  const days = [];
  for (let iso = grid.start; iso <= end; iso = shiftIsoDay(iso, 1)) {
    days.push({ iso, dayNumber: new Date(`${iso}T00:00:00`).getDate(), inMonth: iso.slice(0, 7) === month.slice(0, 7), count: byDay[iso] || 0 });
  }
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="theme-heading font-semibold">Examination calendar</h2>
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
        {days.map((day) => (
          <div
            key={day.iso}
            className={`min-h-[52px] rounded-lg border p-1 ${day.count ? "border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_6%,transparent)]" : "border-[var(--theme-border)]"} ${day.inMonth ? "" : "opacity-50"}`}
          >
            <span className="theme-heading block text-xs font-semibold tabular-nums">{day.dayNumber}</span>
            {day.count ? <span className="mt-1 inline-flex rounded-full bg-[var(--theme-primary)] px-1.5 text-[10px] font-semibold text-white">{day.count}</span> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

function AssessmentListScreen() {
  const { branches, showBranchSelect } = useDrivingBranches();
  const [branchFilter, setBranchFilter] = useState("");
  const [month, setMonth] = useState(todayDate);
  const { data, error } = useLoad(() => drivingGet("/assessments", { branch_id: branchFilter || undefined }), `assessments|${branchFilter}`);
  const { data: studentData } = useLoad(
    () => drivingGet("/students", { status: "active", branch_id: branchFilter || undefined, per_page: 100 }),
    `assessments-students|${branchFilter}`,
  );
  const { data: examData, reload: reloadExams } = useLoad(
    () => drivingGet("/exams", { branch_id: branchFilter || undefined }),
    `exams|${branchFilter}`,
  );
  const examPayload = examData?.data && !Array.isArray(examData.data) ? examData.data : {};
  const upcomingExams = Array.isArray(examPayload.upcoming) ? examPayload.upcoming : [];
  const recentExams = Array.isArray(examPayload.recent) ? examPayload.recent : [];
  const [examForm, setExamForm] = useState(null);
  const [savingExam, setSavingExam] = useState(false);
  const activeStudents = rowsOf(studentData);
  function openExamForm() {
    setExamForm({ student_id: "", kind: "practical", scheduled_on: todayDate(), scheduled_time: "", location: "", notes: "" });
  }
  async function saveExam(event) {
    event.preventDefault();
    setSavingExam(true);
    try {
      const res = await drivingSend("/exams", "POST", { ...examForm, student_id: Number(examForm.student_id) });
      notifySuccess(res.message || "Examination booked.");
      setExamForm(null);
      reloadExams();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not book the examination.");
    } finally {
      setSavingExam(false);
    }
  }
  async function markExam(row, status) {
    try {
      await drivingSend(`/exams/${row.id}`, "PATCH", { status });
      notifySuccess(`Examination marked ${status}.`);
      reloadExams();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not update the examination.");
    }
  }
  const assessments = rowsOf(data);
  const recent = [...assessments]
    .sort((a, b) => String(b.assessed_on || "").localeCompare(String(a.assessed_on || "")))
    .slice(0, 6);
  const passRate = assessments.length ? Math.round((assessments.filter((row) => row.passed).length / assessments.length) * 100) : 0;
  const mockCount = assessments.filter((row) => row.kind === "mock").length;
  const readiness = useMemo(() => {
    const byStudent = new Map();
    for (const row of assessments) {
      const key = Number(row.student_id);
      if (!byStudent.has(key)) byStudent.set(key, []);
      byStudent.get(key).push(row);
    }
    const rank = { "Test ready": 3, Graduated: 3, "Theory passed · practical in progress": 2, "In training": 1 };
    return rowsOf(studentData)
      .map((student) => {
        const enrolment = (student.enrolments || []).find((row) => row.status === "active") || (student.enrolments || [])[0] || null;
        const state = examReadiness(student, enrolment, byStudent.get(Number(student.id)) || []);
        return { student, enrolment, ...state };
      })
      .sort((a, b) => (rank[b.label] || 0) - (rank[a.label] || 0));
  }, [assessments, studentData]);
  const readyCount = readiness.filter((row) => row.testReady).length;
  return (
    <div>
      <ScreenHeader title="Examinations" subtitle="Internal school checks. They are not official government licensing results. Record results as they happen and review them by month.">
        <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium" onClick={openExamForm}>Register examination</button>
        <AppNavLink href="/driving-school/assessments/new" className={primaryButtonClass}>Record assessment</AppNavLink>
      </ScreenHeader>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {showBranchSelect ? (
        <Toolbar>
          <BranchFilter value={branchFilter} onChange={setBranchFilter} branches={branches} show />
        </Toolbar>
      ) : null}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Assessments recorded" value={assessments.length} hint="In this branch view" icon="clipboard-check" />
        <Stat label="Pass rate" value={`${passRate}%`} hint={`${assessments.filter((row) => row.passed).length} passed`} icon="patch-check" tone="emerald" />
        <Stat label="Test ready" value={readyCount} hint="Theory and practical passed" icon="mortarboard" tone="sky" />
        <Stat label="Mock examinations" value={mockCount} hint="Practice runs recorded" icon="pencil-square" tone="amber" />
      </div>
      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <AssessmentCalendar assessments={assessments} month={month} onShift={(step) => setMonth((current) => shiftIsoMonth(current, step))} />
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between gap-2">
              <h2 className="theme-heading font-semibold">Upcoming examinations</h2>
              <span className="theme-subtext text-xs tabular-nums">{upcomingExams.length} booked</span>
            </div>
            <p className="theme-subtext mt-1 text-xs">Theory, practical and mock examinations booked for this branch.</p>
            {upcomingExams.length === 0 ? (
              <Empty>No examinations booked. Use Register examination to add one.</Empty>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--theme-border)]">
                {upcomingExams.slice(0, 6).map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="theme-heading block truncate text-sm font-medium">{row.student?.full_name || "Student"}</span>
                      <span className="theme-subtext block truncate text-xs capitalize">
                        {row.kind === "mock" ? "Mock exam" : row.kind} · {shortDate(row.scheduled_on)}
                        {row.scheduled_time ? ` · ${row.scheduled_time}` : ""}
                        {row.location ? ` · ${row.location}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <button type="button" className="theme-secondary-btn rounded px-2 py-1 text-[11px] font-medium" onClick={() => markExam(row, "passed")}>Passed</button>
                      <button type="button" className="theme-secondary-btn rounded px-2 py-1 text-[11px] font-medium" onClick={() => markExam(row, "failed")}>Failed</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {recentExams.length ? (
              <ul className="mt-3 space-y-1 border-t border-[var(--theme-border)] pt-2">
                {recentExams.slice(0, 3).map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="theme-subtext truncate">{row.student?.full_name || "Student"} · {shortDate(row.scheduled_on)}</span>
                    <StatusBadge value={row.status} />
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
          <Card>
            <h2 className="theme-heading font-semibold">Recent assessments</h2>
            <p className="theme-subtext mt-1 text-xs">Latest recorded checks, newest first.</p>
            {recent.length === 0 ? (
              <Empty>No assessments yet. Record a check to see it here.</Empty>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--theme-border)]">
                {recent.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="theme-heading block truncate text-sm font-medium">{row.student?.full_name || "Student"}</span>
                      <span className="theme-subtext block truncate text-xs capitalize">{row.kind === "mock" ? "Mock exam" : row.kind} · {row.title || "Assessment"}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="theme-subtext text-xs tabular-nums">{shortDate(row.assessed_on)}</span>
                      <StatusBadge value={row.passed ? "passed" : "failed"} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <div className="flex items-center justify-between gap-2">
              <h2 className="theme-heading font-semibold">Examination readiness</h2>
              <span className="theme-subtext text-xs tabular-nums">{readyCount} ready</span>
            </div>
            <p className="theme-subtext mt-1 text-xs">Active students ranked by theory and practical checks against course progress.</p>
            {readiness.length === 0 ? (
              <Empty>No active students to assess.</Empty>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--theme-border)]">
                {readiness.slice(0, 8).map((row) => (
                  <li key={row.student.id} className="flex items-center justify-between gap-3 py-2.5">
                    <AppNavLink href={`/driving-school/students/${row.student.id}`} className="min-w-0">
                      <span className="theme-heading block truncate text-sm font-medium">{row.student.full_name}</span>
                      <span className="theme-subtext block truncate text-xs">{row.enrolment?.course?.name || row.student.student_number} · {row.pct}% lessons</span>
                    </AppNavLink>
                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${row.tone}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${row.dot}`} aria-hidden />
                      {row.label}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <Card>
        <h2 className="theme-heading mb-3 font-semibold">All assessments</h2>
        <DataTable
          empty="No assessments yet."
          rows={assessments}
          columns={[
            { key: "student", label: "Student", render: (row) => <PersonName name={row.student?.full_name || "Student"} detail={row.student?.student_number} /> },
            ...(showBranchSelect ? [{ key: "branch", label: "Branch", render: (row) => branchNameOf(branches, row.branch_id ?? row.student?.branch_id) }] : []),
            { key: "title", label: "Check", render: (row) => row.title },
            { key: "kind", label: "Kind", render: (row) => <span className="capitalize">{row.kind === "mock" ? "Mock exam" : row.kind}</span> },
            { key: "instructor", label: "Instructor", render: (row) => row.instructor?.full_name || "—" },
            { key: "score", label: "Score", render: (row) => `${row.score}/${row.max_score}` },
            { key: "result", label: "Result", render: (row) => <StatusBadge value={row.passed ? "passed" : "failed"} /> },
            { key: "comments", label: "Remarks", render: (row) => (row.comments ? <span className="theme-subtext line-clamp-2 max-w-xs text-xs">{row.comments}</span> : "—") },
            { key: "date", label: "Date", render: (row) => shortDate(row.assessed_on) },
          ]}
        />
      </Card>
      {examForm ? (
        <RecordFormDialog title="Register examination" backHref="/driving-school/assessments">
          <form onSubmit={saveExam}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Student">
                <DrivingSelect required value={examForm.student_id} placeholder="Choose a student" onChange={(event) => setExamForm({ ...examForm, student_id: event.target.value })} options={[{ value: "", label: "Choose a student" }, ...activeStudents.map((student) => ({ value: String(student.id), label: `${student.full_name} · ${student.student_number}` }))]} />
              </Field>
              <Field label="Examination type">
                <DrivingSelect value={examForm.kind} onChange={(event) => setExamForm({ ...examForm, kind: event.target.value })} options={[{ value: "theory", label: "Theory" }, { value: "practical", label: "Practical" }, { value: "mock", label: "Mock exam" }]} />
              </Field>
              <Field label="Date">
                <input className={inputClass} required type="date" min={todayDate()} value={examForm.scheduled_on} onChange={(event) => setExamForm({ ...examForm, scheduled_on: event.target.value })} />
              </Field>
              <Field label="Time (optional)">
                <input className={inputClass} type="time" value={examForm.scheduled_time} onChange={(event) => setExamForm({ ...examForm, scheduled_time: event.target.value })} />
              </Field>
              <Field label="Location">
                <input className={inputClass} value={examForm.location} onChange={(event) => setExamForm({ ...examForm, location: event.target.value })} placeholder="Test centre or school" />
              </Field>
              <Field label="Notes">
                <input className={inputClass} value={examForm.notes} onChange={(event) => setExamForm({ ...examForm, notes: event.target.value })} placeholder="Optional" />
              </Field>
            </div>
            <RecordFormActions backHref="/driving-school/assessments" submitLabel={savingExam ? "Booking…" : "Book examination"} />
          </form>
        </RecordFormDialog>
      ) : null}
    </div>
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
  revenue: {
    label: "Receipts",
    columns: [["received_on", "Date"], ["amount", "Amount"], ["method", "Method"], ["reference", "Reference"]],
    money: ["amount"],
  },
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
  const groups = [
    {
      title: "Money",
      items: ["revenue", "outstanding", "expenses"],
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
      <ScreenHeader title="Reports & analytics" subtitle="Each report opens on its own page with a date range, branch filter, charts, and Excel, PDF, and CSV export.">
        <AppNavLink href="/driving-school/notifications" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Outreach & messages</AppNavLink>
      </ScreenHeader>
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
  revenue: { icon: "wallet2", tone: "bg-emerald-50 text-emerald-700", blurb: "Every receipt in the period, with method and reference." },
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

function OutreachComposeDialog({ ready, onClose, onSaved }) {
  const { data } = useLoad(
    () => drivingGet("/students", { per_page: 200, status: "active" }),
    "outreach-students",
  );
  const students = rowsOf(data);
  const [audience, setAudience] = useState("student");
  const [studentId, setStudentId] = useState("");
  const [message, setMessage] = useState("");
  const [sendNow, setSendNow] = useState(ready);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const res = await drivingSend("/notifications", "POST", {
        audience,
        student_id: audience === "student" ? Number(studentId) : undefined,
        message,
        send_now: sendNow && ready,
      });
      notifySuccess(res.message || "Message queued.");
      onSaved();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not queue this message.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Editor open title="Compose SMS" onClose={onClose} wide>
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
                options={students.map((student) => ({ value: String(student.id), label: `${student.full_name}${student.phone ? ` · ${student.phone}` : ""}` }))}
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
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={sendNow} onChange={(e) => setSendNow(e.target.checked)} disabled={!ready} />
          <span>
            <span className="theme-heading font-medium">Send immediately through Africa&apos;s Talking</span>
            <span className="theme-subtext mt-0.5 block text-xs">{ready ? "Messages leave the school as soon as you submit." : "Connect Africa's Talking under Settings → SMS & email to send now. Until then messages stay queued."}</span>
          </span>
        </label>
        <div className="flex justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
          <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={onClose}>Cancel</button>
          <button className={primaryButtonClass} type="submit" disabled={busy || !message.trim() || (audience === "student" && !studentId)}>
            {busy ? "Queueing…" : sendNow && ready ? "Send now" : "Queue message"}
          </button>
        </div>
      </form>
    </Editor>
  );
}

export function NotificationsScreen() {
  const { hasPermission } = useAuth();
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
                <span className="theme-subtext mt-0.5 block text-xs">When off, messages queue in Outreach and nothing leaves the school.</span>
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
  { key: "profile", label: "School profile", icon: "building" },
  { key: "messaging", label: "SMS & email", icon: "chat-dots" },
  { key: "payments", label: "M-Pesa payments", icon: "phone" },
  { key: "access", label: "Access & audit", icon: "shield-lock" },
];

export function SettingsScreen({ embedded = false }) {
  const { refreshCapabilities, hasPermission } = useAuth();
  const canEdit = hasPermission("driving.settings.edit");
  const [tab, setTab] = useState("profile");
  const { data, reload } = useLoad(() => drivingGet("/settings"), "settings");
  const [profileForm, setProfileForm] = useState({
    school_name: "",
    features: { vehicles: true, theory: true, assessments: true, fees: true, expenses: true },
  });
  const [paymentsForm, setPaymentsForm] = useState({
    mpesa_enabled: false,
    mpesa_paybill: "",
    mpesa_shortcode: "",
    mpesa_environment: "sandbox",
  });
  const [busy, setBusy] = useState("");

  useEffect(() => {
    const saved = data?.data;
    if (!saved) return;
    setProfileForm({
      school_name: saved.school_name || "",
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
      const res = await drivingSend("/settings", "PUT", {
        school_name: profileForm.school_name,
        features: profileForm.features,
      });
      notifySuccess(res.message || "School profile saved.");
      await refreshCapabilities({ force: true });
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save the school profile.");
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

  const accessLinks = [
    hasPermission("driving.branches.view") && { icon: "diagram-3", title: "Branches", detail: "Locations, managers and branch scoping.", href: "/driving-school/branches" },
    hasPermission("driving.users.view") && { icon: "people", title: "Users", detail: "Staff accounts that can sign in here.", href: "/driving-school/users" },
    hasPermission("driving.roles.view") && { icon: "shield-lock", title: "Roles & permissions", detail: "What each role can view and change.", href: "/driving-school/roles" },
    { icon: "clock-history", title: "Audit trail", detail: "Every recorded change across the school.", href: "/driving-school/audit" },
  ].filter(Boolean);
  return (
    <div className="space-y-4">
      {embedded ? null : <PageTitle title="Settings" subtitle="School profile, messaging, payments and access — each saved on its own tab." />}
      <div role="tablist" aria-label="Settings" className="flex flex-wrap gap-1 rounded-xl border border-[var(--theme-border)] p-1">
        {SETTINGS_TAB_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${tab === item.key ? "theme-primary-btn" : "theme-subtext hover:bg-[var(--theme-border)]/40"}`}
            onClick={() => setTab(item.key)}
          >
            <i className={`bi bi-${item.icon}`} aria-hidden />
            {item.label}
          </button>
        ))}
      </div>

      {!canEdit ? (
        <p className="theme-subtext text-sm">You can view these settings. Ask a school administrator for edit rights to change them.</p>
      ) : null}

      {tab === "profile" ? (
        <div role="tabpanel" className="grid gap-4 xl:grid-cols-2">
          <FormCard title="School profile" hint="The name shown to staff and on messages sent from this school." submitLabel={busy === "profile" ? "Saving…" : "Save school profile"} onSubmit={saveProfile}>
            <Field label="School name"><input className={inputClass} value={profileForm.school_name} onChange={(e) => setProfileForm({ ...profileForm, school_name: e.target.value })} disabled={!canEdit} /></Field>
          </FormCard>
          <FormCard title="Tools for this school" hint="Switch off a tool to hide it from the sidebar for everyone on this school." submitLabel={busy === "profile" ? "Saving…" : "Save tools"} onSubmit={saveProfile}>
            {DRIVING_FEATURE_FIELDS.map(([key, label, detail]) => (
              <label key={key} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={profileForm.features[key] !== false}
                  onChange={(e) => setProfileForm((current) => ({ ...current, features: { ...current.features, [key]: e.target.checked } }))}
                  disabled={!canEdit}
                />
                <span>
                  <span className="theme-heading font-medium">{label}</span>
                  <span className="theme-subtext mt-0.5 block text-xs">{detail}</span>
                </span>
              </label>
            ))}
          </FormCard>
        </div>
      ) : null}

      {tab === "messaging" ? <div role="tabpanel"><MessagingPanel /></div> : null}

      {tab === "payments" ? (
        <div role="tabpanel" className="grid gap-4 xl:grid-cols-2">
          <FormCard title="M-Pesa" hint="Staff-recorded references are receipts. A configured paybill lets future callbacks match payments automatically." submitLabel={busy === "payments" ? "Saving…" : "Save payment settings"} onSubmit={savePayments}>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={paymentsForm.mpesa_enabled} onChange={(e) => setPaymentsForm({ ...paymentsForm, mpesa_enabled: e.target.checked })} disabled={!canEdit} />
              <span>Accept M-Pesa as a fee payment method.</span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Paybill / till"><input className={inputClass} maxLength={40} value={paymentsForm.mpesa_paybill} onChange={(e) => setPaymentsForm({ ...paymentsForm, mpesa_paybill: e.target.value })} placeholder="600000" disabled={!canEdit} /></Field>
              <Field label="Shortcode"><input className={inputClass} maxLength={40} value={paymentsForm.mpesa_shortcode} onChange={(e) => setPaymentsForm({ ...paymentsForm, mpesa_shortcode: e.target.value })} placeholder="174379" disabled={!canEdit} /></Field>
            </div>
            <Field label="Environment">
              <DrivingSelect value={paymentsForm.mpesa_environment} onChange={(e) => setPaymentsForm({ ...paymentsForm, mpesa_environment: e.target.value })} options={[{ value: "sandbox", label: "Sandbox" }, { value: "production", label: "Live" }]} />
            </Field>
          </FormCard>
          <Card className="h-max">
            <h2 className="theme-heading text-sm font-semibold">Fee collection</h2>
            <p className="theme-subtext mt-1 text-xs">Invoice students, take payments and issue receipts from the payments screen. Outstanding balances follow each student.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {hasPermission("driving.fees.view") ? <AppNavLink href="/driving-school/payments" className={primaryButtonClass}>Open payments</AppNavLink> : null}
              {hasPermission("driving.courses.view") ? <AppNavLink href="/driving-school/courses" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Course fees</AppNavLink> : null}
            </div>
          </Card>
        </div>
      ) : null}

      {tab === "access" ? (
        <div role="tabpanel" className="grid gap-4 sm:grid-cols-2">
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
      ) : null}
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
  const [form, setForm] = useState(() => ({
    amount: Number(employee.balance_this_period) > 0 ? String(employee.balance_this_period) : "",
    method: "cash",
    reference: "",
    paid_at: "",
    notes: "",
  }));
  const [busy, setBusy] = useState(false);

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
      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Salary due" value={money(summary.payroll_total ?? employee.salary_due)} icon="wallet2" tone="indigo" />
        <Stat label="Paid" value={money(summary.paid_total ?? employee.paid_this_period)} icon="check-circle" tone="emerald" />
        <Stat label="Balance" value={money(summary.outstanding_total ?? employee.balance_this_period)} icon="exclamation-circle" tone="amber" />
        <Card>
          <Field label="Salary month"><input className={inputClass} type="month" value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} /></Field>
        </Card>
      </div>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {canPay ? (
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
              render: (row) => <button type="button" className="theme-link text-sm font-medium text-red-600" onClick={() => remove(row)}>Delete</button>,
            }] : []),
          ]}
        />
      </Card>
    </Editor>
  );
}

export function StaffScreen({ view } = {}) {
  const { hasPermission } = useAuth();
  const { branches, showBranchSelect } = useDrivingBranches();
  const salaryView = view === "salaries";
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
  const rows = rowsOf(data);
  const summary = data?.summary || {};
  const branchBreakdown = payroll.data?.by_branch || [];
  const [editor, setEditor] = useState(null);
  const [payEditor, setPayEditor] = useState(null);
  const canCreate = hasPermission("driving.staff.create");
  const canEdit = hasPermission("driving.staff.edit");
  const canDelete = hasPermission("driving.staff.delete");

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
    ...(canViewSalary ? [
      { key: "salary_due", label: "Salary due", render: (row) => money(row.salary_due) },
      { key: "paid_this_period", label: "Paid", render: (row) => money(row.paid_this_period) },
      { key: "balance_this_period", label: "Balance", render: (row) => <span className={Number(row.balance_this_period) > 0 ? "font-semibold text-amber-700" : ""}>{money(row.balance_this_period)}</span> },
    ] : []),
    { key: "employment_status", label: "Status", render: (row) => <StatusBadge value={row.is_active === false ? "inactive" : row.employment_status} /> },
    ...((canViewSalary || canEdit || canDelete) ? [{
      key: "actions",
      label: "",
      render: (row) => (
        <span className="flex flex-wrap gap-3">
          {canViewSalary ? (
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

  return (
    <div>
      <ScreenHeader
        title={salaryView ? "Salary register" : "Employees & Salaries"}
        subtitle={salaryView
          ? "Monthly salary due, paid and still outstanding for each employee. Payments post to the payroll ledger and are audited."
          : "Employees of the driving school and their monthly salary. Departments, shifts, leave and bank details stay in Centrix HR."}
      >
        {!salaryView && canCreate ? <button type="button" className={primaryButtonClass} onClick={() => setEditor({})}>Add employee</button> : null}
      </ScreenHeader>

      {!salaryView ? (
        <Card className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="theme-heading text-sm font-semibold">Centrix HR</p>
              <p className="theme-subtext text-xs">Departments, shifts, leave, documents and bank details stay in HR. Staff records here are scoped to this school.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <AppNavLink href="/hr" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Open HR</AppNavLink>
              <AppNavLink href="/hr/payroll" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Payroll runs</AppNavLink>
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
        <Stat label="Staff" value={summary.staff_count ?? 0} hint="On record" icon="people" tone="indigo" />
        <Stat label="Payroll" value={money(summary.payroll_total ?? 0)} hint={monthLabel(period)} icon="wallet2" tone="sky" />
        <Stat label="Paid" value={money(summary.paid_total ?? 0)} hint={monthLabel(period)} icon="check-circle" tone="emerald" />
        <Stat label="Outstanding" value={money(summary.outstanding_total ?? 0)} hint="Still to pay this month" icon="exclamation-circle" tone="amber" />
      </div>

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
        {canViewSalary ? (
          <label className="theme-subtext flex items-center gap-2 text-sm">
            <input type="checkbox" checked={outstandingOnly} onChange={(e) => setOutstandingOnly(e.target.checked)} />
            Outstanding only
          </label>
        ) : null}
      </Toolbar>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <Card>
        <DataTable columns={columns} rows={list} empty="No staff match these filters." />
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
          onSaved={() => { reload(); payroll.reload(); }}
        />
      ) : null}
    </div>
  );
}
