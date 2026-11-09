"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { ApiError, apiRequest } from "@/lib/api";
import { drivingGet, drivingSend } from "@/lib/driving/api";
import {
  fetchDrivingCoursesCached,
  fetchDrivingInstructorsCached,
  fetchDrivingVehiclesCached,
  invalidateDrivingReference,
} from "@/lib/driving/reference-cache";
import { notifyError, notifySuccess } from "@/lib/notify";
import { AppNavLink } from "@/components/layout/app-nav-link";
import { FilterSelect, PaginationBar } from "@/components/catalog/catalog-shared";
import { RecordFormActions, RecordFormDialog, useRecordExit } from "@/components/record-form-page";
import { ServiceReceiptDialog } from "@/components/service-receipt-dialog";
import { buildDrivingFeeReceipt } from "@/lib/service-receipt";
import { Card, DataTable, DayBoard, DrivingSelect, Empty, Field, FormCard, FormSection, MarkPad, PageTitle, PersonName, ScreenHeader, SearchField, Sparkline, Stat, StatusBadge, Toolbar, inputClass, money, primaryButtonClass } from "@/components/driving/ui";

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

const QUICK_ACTIONS = [
  ["/driving-school/schedule", "Book lesson"],
  ["/driving-school/students", "Add student"],
  ["/driving-school/vehicles", "Add vehicle"],
  ["/driving-school/payments", "Take payment"],
];

export function DrivingDashboard() {
  const { user } = useAuth();
  const { data, error } = useLoad(() => drivingGet("/dashboard"), "dashboard");
  const dash = data?.data;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!dash) return <p className="text-sm theme-subtext">Loading the school…</p>;
  const schedule = dash.upcoming_lessons || [];
  const attention = dash.attention || {};
  return (
    <div className="space-y-4">
      <ScreenHeader title={`Good ${partOfDay()}, ${greetingName(user)}`} subtitle="Here's what is happening at the school today. Collected money is receipts, not profit." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Students" value={dash.active_students} hint="Active on the register" />
        <Stat label="Today's lessons" value={dash.lessons_today} />
        <Stat label="Completed" value={dash.lessons_completed} hint="Finished in this period" />
        <Stat label="Collected today" value={money(dash.revenue_collected_today)} hint="Receipts minus refunds" />
        <Stat label="Pending payments" value={money(dash.outstanding_balances)} />
      </div>
      {(attention.lessons_pending_today || attention.open_invoices || attention.vehicles_attention) ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <p className="theme-subtext text-xs">Still on today’s board</p>
            <p className="theme-heading mt-1 text-lg font-semibold tabular-nums">{attention.lessons_pending_today || 0}</p>
            <AppNavLink href="/driving-school/schedule" className="mt-2 inline-block text-sm font-medium text-[var(--theme-primary)]">Open schedule</AppNavLink>
          </Card>
          <Card>
            <p className="theme-subtext text-xs">Open fee invoices</p>
            <p className="theme-heading mt-1 text-lg font-semibold tabular-nums">{attention.open_invoices || 0}</p>
            <AppNavLink href="/driving-school/payments" className="mt-2 inline-block text-sm font-medium text-[var(--theme-primary)]">Collect fees</AppNavLink>
          </Card>
          <Card>
            <p className="theme-subtext text-xs">Vehicles needing attention</p>
            <p className="theme-heading mt-1 text-lg font-semibold tabular-nums">{attention.vehicles_attention || 0}</p>
            <AppNavLink href="/driving-school/vehicles" className="mt-2 inline-block text-sm font-medium text-[var(--theme-primary)]">Fleet</AppNavLink>
          </Card>
        </div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="theme-heading font-semibold">Receipts</h2>
            <span className="theme-subtext text-xs">Last 14 days</span>
          </div>
          <Sparkline points={dash.revenue_trend || []} />
        </Card>
        <Card className="xl:col-span-2">
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
                  <span className="theme-subtext shrink-0">{String(lesson.starts_at).replace("T", " ").slice(11, 16)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="theme-heading font-semibold">Quick actions</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {QUICK_ACTIONS.map(([href, label]) => (
              <AppNavLink key={href} href={href} className="theme-secondary-btn rounded-xl px-3 py-3 text-center text-sm font-medium">{label}</AppNavLink>
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
  id_document_type: "national_id",
  id_document_number: "",
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
  return (
    <>
      <StudentListScreen />
      {pathname.endsWith("/students/new") ? <StudentFormScreen /> : null}
    </>
  );
}

function StudentFormScreen() {
  const { exitTo } = useRecordExit("Add student");
  const [form, setForm] = useState(EMPTY_STUDENT);
  const courseLoad = useLoad(() => fetchDrivingCoursesCached().then((rows) => ({ data: rows })), "student-form-courses");
  const instructorLoad = useLoad(() => fetchDrivingInstructorsCached().then((rows) => ({ data: rows })), "student-form-instructors");
  const courses = rowsOf(courseLoad.data).filter((course) => course.is_active !== false);
  const instructors = rowsOf(instructorLoad.data);
  const packages = courses.find((course) => String(course.id) === String(form.course_id))?.packages || [];

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
    for (const key of ["email", "id_document_number", "date_of_birth", "address", "emergency_name", "emergency_phone", "notes"]) {
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
            <Field label="Full name"><input className={inputClass} required value={form.full_name} onChange={(e) => setField("full_name", e.target.value)} /></Field>
            <Field label="Phone"><input className={inputClass} required value={form.phone} onChange={(e) => setField("phone", e.target.value)} /></Field>
            <Field label="Email"><input className={inputClass} type="email" value={form.email} onChange={(e) => setField("email", e.target.value)} /></Field>
            <Field label="Identity document">
              <DrivingSelect value={form.id_document_type} onChange={(e) => setField("id_document_type", e.target.value)} options={[{ value: "national_id", label: "National ID" }, { value: "passport", label: "Passport" }, { value: "birth_certificate", label: "Birth certificate" }]} />
            </Field>
            <Field label="Document number"><input className={inputClass} value={form.id_document_number} onChange={(e) => setField("id_document_number", e.target.value)} /></Field>
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
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query);
  const [courseFilter, setCourseFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const { data, error } = useLoad(
    () =>
      drivingGet("/students", {
        q: debouncedQuery.trim() || undefined,
        course_id: courseFilter || undefined,
        per_page: pageSize,
        page,
      }),
    `students:${debouncedQuery}|${courseFilter}|${page}|${pageSize}`,
  );
  const courseLoad = useLoad(() => fetchDrivingCoursesCached().then((rows) => ({ data: rows })), "student-courses");
  const courses = rowsOf(courseLoad.data).filter((course) => course.is_active !== false);
  const students = rowsOf(data);
  const total = Number(data?.total ?? students.length);
  const lastPage = Math.max(1, Number(data?.last_page ?? 1));

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, courseFilter, pageSize]);

  return (
    <div>
      <ScreenHeader title="Students" subtitle="The register shows who is enrolled. Add a student when you are ready to set up their course and package.">
        <AppNavLink href="/driving-school/students/new" className={primaryButtonClass}>Add student</AppNavLink>
      </ScreenHeader>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <Toolbar>
        <SearchField value={query} onChange={setQuery} placeholder="Search students" />
        <FilterSelect value={courseFilter} placeholder="All courses" onChange={(event) => setCourseFilter(event.target.value)} options={[{ value: "", label: "All courses" }, ...courses.map((course) => ({ value: String(course.id), label: course.name }))]} />
      </Toolbar>
      <Card>
        <DataTable
          empty="No students yet."
          rows={students}
          columns={[
            { key: "name", label: "Student", render: (student) => <PersonName name={student.full_name} detail={student.student_number} /> },
            { key: "phone", label: "Phone", render: (student) => student.phone },
            { key: "course", label: "Course", render: (student) => activeEnrolment(student)?.course?.name || "—" },
            { key: "package", label: "Package", render: (student) => activeEnrolment(student)?.package?.name || "—" },
            {
              key: "progress",
              label: "Progress",
              render: (student) => {
                const enrolment = activeEnrolment(student);
                if (!enrolment) return "—";
                const done = Number(enrolment.lessons_completed || 0);
                const need = Number(enrolment.lessons_required || 0);
                return need > 0 ? `${done}/${need}` : String(done);
              },
            },
            { key: "status", label: "Status", render: (student) => <StatusBadge value={student.status} /> },
            { key: "outstanding", label: "Outstanding", render: (student) => money(student.outstanding) },
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

export function CoursesScreen() {
  const pathname = usePathname();
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
  const [form, setForm] = useState({ code: "", name: "", licence_category: "", price: "", practical_lessons: 10, theory_lessons: 8 });
  async function save(event) {
    event.preventDefault();
    try {
      await drivingSend("/courses", "POST", { ...form, price: Number(form.price) || 0 });
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
  const { data, error } = useLoad(() => fetchDrivingCoursesCached().then((rows) => ({ data: rows })), "courses");
  const courses = rowsOf(data);
  return (
    <div>
      <ScreenHeader title="Courses & packages" subtitle="A course is the licence class. Packages are the prices and lesson counts a student chooses when they register.">
        <AppNavLink href="/driving-school/courses/package" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium">Add package</AppNavLink>
        <AppNavLink href="/driving-school/courses/new" className={primaryButtonClass}>Add course</AppNavLink>
      </ScreenHeader>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <Card>
        <DataTable
          empty="No courses yet."
          rows={courses}
          columns={[
            { key: "course", label: "Course", render: (course) => <PersonName name={course.name} detail={course.code} /> },
            { key: "licence", label: "Licence", render: (course) => course.licence_category || "—" },
            { key: "packages", label: "Packages", render: (course) => (course.packages || []).map((item) => item.name).join(", ") || "—" },
            { key: "price", label: "From", render: (course) => {
              const prices = (course.packages || []).map((item) => Number(item.price) || 0);
              return money(prices.length ? Math.min(...prices) : Number(course.price) || 0);
            } },
          ]}
        />
      </Card>
    </div>
  );
}

function shiftDate(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function LessonFormScreen() {
  const { exitTo } = useRecordExit("Book lesson");
  const [studentQuery, setStudentQuery] = useState("");
  const debouncedStudentQuery = useDebouncedValue(studentQuery);
  const [form, setForm] = useState({ student_id: "", instructor_id: "", vehicle_id: "", lesson_type: "practical", starts_at: "", duration_minutes: 60, location: "" });
  const studentLoad = useLoad(
    () =>
      drivingGet("/students", {
        status: "active",
        lean: 1,
        per_page: 50,
        q: debouncedStudentQuery.trim() || undefined,
      }),
    `lesson-form-students:${debouncedStudentQuery}`,
  );
  const instructorLoad = useLoad(() => fetchDrivingInstructorsCached().then((rows) => ({ data: rows })), "lesson-form-instructors");
  const vehicleLoad = useLoad(() => fetchDrivingVehiclesCached().then((rows) => ({ data: rows })), "lesson-form-vehicles");
  const students = rowsOf(studentLoad.data);
  const instructors = rowsOf(instructorLoad.data).filter((row) => row.status !== "inactive");
  const vehicles = rowsOf(vehicleLoad.data).filter((row) => row.status === "available" || !row.status);
  const visibleStudents = students;
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
    <RecordFormDialog title="Book a lesson" backHref="/driving-school/schedule">
      <form onSubmit={save}>
        <div className="grid gap-4 md:grid-cols-2">
    <div>
            <FormSection title="Select student" />
            <div className="mt-3">
              <SearchField value={studentQuery} onChange={setStudentQuery} placeholder="Search students" />
            </div>
            <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
              {visibleStudents.length === 0 ? <Empty>No students match.</Empty> : visibleStudents.map((student) => {
                const selected = String(form.student_id) === String(student.id);
                return (
                  <button key={student.id} type="button" className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left ${selected ? "border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_8%,transparent)]" : "border-[var(--theme-border)]"}`} onClick={() => setForm({ ...form, student_id: String(student.id) })}>
                    <PersonName name={student.full_name} detail={student.phone || student.student_number} />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <FormSection title="Lesson details" />
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

function ScheduleListScreen() {
  const [date, setDate] = useState(todayDate);
  const [busyLessonId, setBusyLessonId] = useState(null);
  const { data, error, reload } = useLoad(() => drivingGet("/lessons", { from: date, to: date }), `lessons:${date}`);
  const instructorLoad = useLoad(() => fetchDrivingInstructorsCached().then((rows) => ({ data: rows })), "schedule-instructors");
  const instructors = rowsOf(instructorLoad.data);
  const lessons = rowsOf(data);

  async function updateLessonStatus(lesson, status) {
    setBusyLessonId(lesson.id);
    try {
      await drivingSend(`/lessons/${lesson.id}`, "PUT", {
        status,
        attendance: status === "completed" ? "present" : status === "no_show" ? "absent" : undefined,
      });
      notifySuccess(
        status === "completed" ? "Lesson marked complete." : status === "no_show" ? "Marked no-show." : "Lesson cancelled.",
      );
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not update the lesson.");
    } finally {
      setBusyLessonId(null);
    }
  }

  return (
    <div>
      <ScreenHeader title="Appointments & schedule" subtitle="Lessons for the day, arranged by instructor. Mark Done, No-show, or Cancel on the board. Overlaps for the same student, instructor, or vehicle are refused.">
        <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm" onClick={() => setDate((current) => shiftDate(current, -1))}>Previous</button>
        <input className={`${inputClass} w-40`} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <button type="button" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm" onClick={() => setDate((current) => shiftDate(current, 1))}>Next</button>
        <AppNavLink href="/driving-school/schedule/new" className={primaryButtonClass}>Book lesson</AppNavLink>
      </ScreenHeader>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <Card>
        {lessons.length === 0 && instructors.length === 0 ? (
          <Empty>No lessons booked for this day.</Empty>
        ) : (
          <DayBoard
            lessons={lessons}
            instructors={instructors}
            busyLessonId={busyLessonId}
            onLessonAction={(lesson, status) => void updateLessonStatus(lesson, status)}
          />
        )}
      </Card>
    </div>
  );
}

function prettyLabel(name) {
  return name.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function DirectoryScreen({ title, subtitle, path, fields, columns, person = false, addLabel }) {
  const pathname = usePathname();
  const createHref = `/driving-school${path}/new`;
  return (
    <>
      <DirectoryListScreen title={title} subtitle={subtitle} path={path} fields={fields} columns={columns} person={person} addLabel={addLabel} createHref={createHref} />
      {pathname === createHref ? <DirectoryFormScreen title={addLabel || `Add ${title.replace(/s$/, "").toLowerCase()}`} path={path} fields={fields} backHref={`/driving-school${path}`} /> : null}
    </>
  );
}

function DirectoryFormScreen({ title, path, fields, backHref }) {
  const { exitTo } = useRecordExit(title);
  const [form, setForm] = useState(() => Object.fromEntries(fields.map((field) => [field.name, field.default ?? ""])));
  async function save(event) {
    event.preventDefault();
    const body = { ...form };
    for (const field of fields) {
      if (field.type === "number" && body[field.name] !== "") body[field.name] = Number(body[field.name]);
    }
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

function DirectoryListScreen({ title, subtitle, path, columns, person = false, addLabel, createHref }) {
  const [query, setQuery] = useState("");
  const { data, error } = useLoad(() => drivingGet(path), path);
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
  return (
    <div>
      <ScreenHeader title={title} subtitle={subtitle}>
        <AppNavLink href={createHref} className={primaryButtonClass}>{addLabel || `Add ${title.replace(/s$/, "").toLowerCase()}`}</AppNavLink>
      </ScreenHeader>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <Toolbar>
        <SearchField value={query} onChange={setQuery} placeholder={`Search ${title.toLowerCase()}`} />
      </Toolbar>
      <Card>
        <DataTable columns={tableColumns} rows={list} empty="Nothing saved yet." />
      </Card>
    </div>
  );
}

export function InstructorsScreen() {
  return (
    <DirectoryScreen
      title="Instructors"
      subtitle="Lesson pay is a calculated rate. It is not money already paid to the instructor."
      path="/instructors"
      person
      addLabel="Add instructor"
      fields={[
        { name: "full_name", label: "Name", required: true },
        { name: "phone", label: "Phone" },
        { name: "licence_info", label: "Licence" },
        { name: "lesson_pay", label: "Pay per lesson (KSh)", type: "number" },
      ]}
      columns={["full_name", "phone", "licence_info", "status"]}
    />
  );
}

export function VehiclesScreen() {
  return (
    <DirectoryScreen
      title="Vehicles"
      subtitle="A vehicle marked maintenance or inactive cannot be booked."
      path="/vehicles"
      addLabel="Add vehicle"
      fields={[
        { name: "registration_number", label: "Registration", required: true },
        { name: "make", label: "Make" },
        { name: "model", label: "Model" },
        { name: "year", label: "Year", type: "number" },
      ]}
      columns={["registration_number", "make", "model", "year", "status"]}
    />
  );
}

function latestVisit(logs, studentId) {
  const rows = logs.filter((row) => String(row.student_id) === String(studentId));
  return rows.length ? rows[rows.length - 1] : null;
}

function visitClock(value) {
  return String(value || "").replace("T", " ").slice(11, 16);
}

export function AttendanceScreen() {
  const [date, setDate] = useState(todayDate);
  const [studentId, setStudentId] = useState("");
  const [verification, setVerification] = useState("none");
  const [mark, setMark] = useState("");
  const { data, error, reload } = useLoad(() => drivingGet("/attendance", { date }), `attendance:${date}`);
  const studentLoad = useLoad(
    () => drivingGet("/students", { status: "active", lean: 1, per_page: 100 }),
    "attendance-students",
  );
  const students = rowsOf(studentLoad.data);
  const logs = rowsOf(data);
  const selected = students.find((student) => String(student.id) === String(studentId)) || null;
  const last = selected ? latestVisit(logs, selected.id) : null;
  const direction = last?.direction === "in" ? "out" : "in";

  function chooseStudent(id) {
    setStudentId(String(id));
    setVerification("none");
    setMark("");
  }

  async function save(event) {
    event.preventDefault();
    if (!studentId) {
      notifyError("Choose a student.");
      return;
    }
    if (verification !== "none" && !mark) {
      notifyError(verification === "thumb" ? "Draw the thumb mark, or choose no extra check." : "Draw the signature, or choose no extra check.");
      return;
    }
    try {
      await drivingSend("/attendance", "POST", {
        student_id: Number(studentId),
        direction,
        verification,
        ...(verification !== "none" ? { mark } : {}),
      });
      notifySuccess(direction === "in" ? "Checked in." : "Checked out.");
      setVerification("none");
      setMark("");
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save attendance.");
    }
  }

  return (
    <div>
      <ScreenHeader title="Attendance" subtitle="Check a student in when they arrive and out when they leave. A signature or thumb mark is optional.">
        <input className={`${inputClass} w-40`} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </ScreenHeader>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
          <DataTable
            empty="No active students yet."
            rows={students}
            columns={[
              { key: "student", label: "Student", render: (student) => <PersonName name={student.full_name} detail={student.student_number} /> },
              { key: "state", label: "Today", render: (student) => {
                const visit = latestVisit(logs, student.id);
                return <StatusBadge value={visit?.direction === "in" ? "in" : "out"} />;
              } },
              { key: "time", label: "Last mark", render: (student) => {
                const visit = latestVisit(logs, student.id);
                return visit ? visitClock(visit.recorded_at) : "—";
              } },
              { key: "action", label: "", render: (student) => (
                <button type="button" className="theme-secondary-btn rounded-lg px-3 py-1.5 text-xs font-medium" onClick={() => chooseStudent(student.id)}>
                  {latestVisit(logs, student.id)?.direction === "in" ? "Check out" : "Check in"}
                </button>
              ) },
            ]}
          />
        </Card>
        <Card>
          <FormCard
            bare
            title={direction === "in" ? "Check in" : "Check out"}
            hint={selected ? `${selected.full_name} is ${last?.direction === "in" ? `in since ${visitClock(last.recorded_at)}` : "not currently in"}.` : "Choose a student from the register."}
            submitLabel={direction === "in" ? "Check in" : "Check out"}
            onSubmit={save}
          >
            <Field label="Student">
              <DrivingSelect value={studentId} placeholder="Choose a student" onChange={(e) => chooseStudent(e.target.value)} options={[{ value: "", label: "Choose a student" }, ...students.map((student) => ({ value: String(student.id), label: `${student.student_number} · ${student.full_name}` }))]} />
            </Field>
            <Field label="Verification">
              <DrivingSelect value={verification} onChange={(e) => { setVerification(e.target.value); setMark(""); }} options={[{ value: "none", label: "No extra check" }, { value: "signature", label: "Signature" }, { value: "thumb", label: "Thumb mark" }]} />
            </Field>
            {verification === "signature" ? <Field label="Signature"><MarkPad key="signature" onChange={setMark} /></Field> : null}
            {verification === "thumb" ? <Field label="Thumb mark"><MarkPad key="thumb" onChange={setMark} /></Field> : null}
          </FormCard>
          <h2 className="theme-heading mt-6 text-sm font-semibold">Today’s record</h2>
          {logs.length === 0 ? <Empty>No one has been checked in on this date.</Empty> : (
            <ul className="mt-2 divide-y divide-[var(--theme-border)] text-sm">
              {logs.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                  <span>{row.student?.full_name || "Student"} · {visitClock(row.recorded_at)}</span>
                  <StatusBadge value={row.direction} />
                </li>
              ))}
            </ul>
          )}
      </Card>
      </div>
    </div>
  );
}

function AssessmentFormScreen() {
  const { exitTo } = useRecordExit("Record assessment");
  const students = useLoad(
    () => drivingGet("/students", { status: "active", lean: 1, per_page: 100 }),
    "assessment-form-students",
  ).data;
  const [form, setForm] = useState({ student_id: "", kind: "practical", title: "School practical check", score: "", assessed_on: "" });
  async function save(event) {
    event.preventDefault();
    try {
      const res = await drivingSend("/assessments", "POST", { ...form, student_id: Number(form.student_id), score: Number(form.score) });
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
          <Field label="Student">
            <DrivingSelect required value={form.student_id} placeholder="Choose a student" onChange={(e) => setForm({ ...form, student_id: e.target.value })} options={[{ value: "", label: "Choose a student" }, ...rowsOf(students).map((row) => ({ value: String(row.id), label: row.full_name }))]} />
          </Field>
          <Field label="Kind">
            <DrivingSelect value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} options={[{ value: "practical", label: "Practical" }, { value: "theory", label: "Theory" }]} />
          </Field>
          <Field label="Title"><input className={inputClass} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Score"><input className={inputClass} required type="number" min="0" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} /></Field>
          <Field label="Date"><input className={inputClass} required type="date" value={form.assessed_on} onChange={(e) => setForm({ ...form, assessed_on: e.target.value })} /></Field>
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

function AssessmentListScreen() {
  const { data, error } = useLoad(() => drivingGet("/assessments"), "assessments");
  const assessments = rowsOf(data);
  return (
    <div>
      <ScreenHeader title="Assessments" subtitle="Internal school checks. They are not official government licensing results.">
        <AppNavLink href="/driving-school/assessments/new" className={primaryButtonClass}>Record assessment</AppNavLink>
      </ScreenHeader>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <Card>
        <DataTable
          empty="No assessments yet."
          rows={assessments}
          columns={[
            { key: "title", label: "Check", render: (row) => row.title },
            { key: "kind", label: "Kind", render: (row) => <span className="capitalize">{row.kind}</span> },
            { key: "score", label: "Score", render: (row) => `${row.score}/${row.max_score}` },
            { key: "result", label: "Result", render: (row) => <StatusBadge value={row.passed ? "completed" : "open"} /> },
            { key: "date", label: "Date", render: (row) => String(row.assessed_on || "").slice(0, 10) },
          ]}
        />
      </Card>
    </div>
  );
}

function PaymentFormScreen() {
  const { exitTo } = useRecordExit("Record payment");
  const { organization } = useAuth();
  const { data } = useLoad(() => drivingGet("/invoices"), "payment-form-invoices");
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
  const { data, error } = useLoad(() => drivingGet("/invoices"), "invoices");
  const [paper, setPaper] = useState("a4");
  const [slip, setSlip] = useState(null);
  const invoices = rowsOf(data);
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
        <AppNavLink href="/driving-school/payments/new" className={primaryButtonClass}>Record payment</AppNavLink>
      </ScreenHeader>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <Card>
        <DataTable
          empty="Enrol a student on a priced course to create an invoice."
          rows={invoices}
          columns={[
            { key: "invoice", label: "Invoice", render: (row) => row.invoice_number },
            { key: "kind", label: "Type", render: (row) => <span className="capitalize">{row.kind}</span> },
            { key: "amount", label: "Amount", render: (row) => money(row.amount) },
            { key: "outstanding", label: "Outstanding", render: (row) => money(row.outstanding) },
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
    columns: [["invoice_number", "Invoice"], ["outstanding", "Outstanding"], ["status", "Status"]],
    money: ["outstanding"],
  },
  lessons: {
    label: "Lessons",
    columns: [["starts_at", "Starts"], ["lesson_type", "Type"], ["attendance", "Attendance"], ["status", "Status"]],
  },
  vehicles: {
    label: "Vehicles",
    columns: [["registration_number", "Registration"], ["make", "Make"], ["model", "Model"], ["status", "Status"]],
  },
  expenses: {
    label: "Expenses",
    columns: [["spent_on", "Date"], ["category", "Category"], ["amount", "Amount"]],
    money: ["amount"],
  },
};

function reportCell(row, key, moneyKeys) {
  const value = row?.[key];
  if (value == null || value === "") return "—";
  if (moneyKeys.includes(key)) return money(value);
  return String(value).replace("T", " ").slice(0, 16);
}

export function ReportsScreen() {
  const [report, setReport] = useState("revenue");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayDate);
  const [appliedFrom, setAppliedFrom] = useState(monthStart);
  const [appliedTo, setAppliedTo] = useState(todayDate);
  const [appliedReport, setAppliedReport] = useState("revenue");
  const spec = DRIVING_REPORTS[appliedReport];
  const { data, error } = useLoad(
    () => drivingGet("/reports", { report: appliedReport, from: appliedFrom, to: appliedTo }),
    `${appliedReport}:${appliedFrom}:${appliedTo}`,
  );
  const rows = rowsOf(data);
  const moneyKeys = spec.money || [];
  const totals = moneyKeys.map((key) => rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0));
  return (
    <div>
      <ScreenHeader title="Reports" subtitle={data?.note || "Receipts, enrolments, outstanding fees, lessons, vehicles, and expenses."} />
      <Toolbar>
        <input className="theme-input theme-input-focus h-[38px] w-auto min-w-[10.5rem] rounded-lg border px-3 py-2 text-sm outline-none" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} aria-label="From" />
        <input className="theme-input theme-input-focus h-[38px] w-auto min-w-[10.5rem] rounded-lg border px-3 py-2 text-sm outline-none" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} aria-label="To" />
        <button
          type="button"
          className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium"
          onClick={() => {
            setAppliedFrom(from);
            setAppliedTo(to);
            setAppliedReport(report);
          }}
        >
          Filter
        </button>
      </Toolbar>
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(DRIVING_REPORTS).map(([key, item]) => (
          <button
            key={key}
            type="button"
            className={`rounded-full px-3 py-1.5 text-sm ${report === key ? "theme-primary-btn" : "theme-secondary-btn"}`}
            onClick={() => {
              setReport(key);
              setAppliedReport(key);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {moneyKeys.length > 0 ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Stat label={spec.label} value={money(totals[0] || 0)} hint={`${rows.length} rows`} />
        </div>
      ) : null}
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <Card>
        <DataTable
          empty="No rows for this report."
          rows={rows}
          columns={spec.columns.map(([key, label]) => ({
            key,
            label,
            render: (row) => {
              if (key === "status") return <StatusBadge value={row.status} />;
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

const DRIVING_FEATURE_FIELDS = [
  ["vehicles", "Vehicles", "Fleet records and vehicle assignment on lessons."],
  ["theory", "Theory lessons", "Theory as a lesson and assessment type."],
  ["assessments", "Assessments", "Internal practical and theory checks."],
  ["fees", "Fees & receipts", "Invoices and fee collection."],
  ["expenses", "Expenses", "Operating costs, kept separate from collected fees."],
];

export function SettingsScreen({ embedded = false }) {
  const { refreshCapabilities } = useAuth();
  const { data, reload } = useLoad(() => drivingGet("/settings"), "settings");
  const [form, setForm] = useState({
    school_name: "",
    reminder_hours: 24,
    sms_enabled: false,
    features: { vehicles: true, theory: true, assessments: true, fees: true, expenses: true },
  });
  useEffect(() => {
    if (!data?.data) return;
    const saved = data.data;
    setForm({
      school_name: saved.school_name || "",
      reminder_hours: saved.reminder_hours || 24,
      sms_enabled: Boolean(saved.sms_enabled),
      features: {
        vehicles: saved.features?.vehicles !== false,
        theory: saved.features?.theory !== false,
        assessments: saved.features?.assessments !== false,
        fees: saved.features?.fees !== false,
        expenses: saved.features?.expenses !== false,
      },
    });
  }, [data]);
  async function save(event) {
    event.preventDefault();
    try {
      const res = await drivingSend("/settings", "PUT", {
        school_name: form.school_name,
        reminder_hours: Number(form.reminder_hours) || 24,
        sms_enabled: form.sms_enabled,
        features: form.features,
      });
      notifySuccess(res.message || "Settings saved.");
      await refreshCapabilities({ force: true });
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save settings.");
    }
  }
  return (
    <div>
      {embedded ? null : <PageTitle title="Driving School" subtitle="School name, lesson reminders, and the tools this school uses." />}
      <FormCard title="School" hint="Branches, users, and the audit trail stay on their Administration pages. Reminders stay queued until a messaging provider is connected." submitLabel="Save school settings" onSubmit={save}>
          <Field label="School name"><input className={inputClass} value={form.school_name} onChange={(e) => setForm({ ...form, school_name: e.target.value })} /></Field>
        <Field label="Reminder hours before a lesson"><input className={inputClass} type="number" min="1" max="168" value={form.reminder_hours} onChange={(e) => setForm({ ...form, reminder_hours: e.target.value })} /></Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={form.sms_enabled} onChange={(e) => setForm({ ...form, sms_enabled: e.target.checked })} />
          <span>Queue SMS reminders. Messages are not sent until a provider is connected.</span>
        </label>
        <fieldset className="space-y-3 border-t border-[var(--theme-border)] pt-4">
          <legend className="theme-heading text-sm font-semibold">Tools for this school</legend>
          {DRIVING_FEATURE_FIELDS.map(([key, label, detail]) => (
            <label key={key} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.features[key] !== false}
                onChange={(e) => setForm((current) => ({ ...current, features: { ...current.features, [key]: e.target.checked } }))}
              />
              <span>
                <span className="theme-heading font-medium">{label}</span>
                <span className="theme-subtext mt-0.5 block text-xs">{detail}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </FormCard>
    </div>
  );
}
