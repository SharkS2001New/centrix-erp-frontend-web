"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { ApiError, apiRequest } from "@/lib/api";
import { drivingGet, drivingSend } from "@/lib/driving/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { Card, DrivingSelect, Empty, Field, FormCard, FormSection, MarkPad, PageTitle, Stat, inputClass, money } from "@/components/driving/ui";

function useLoad(loader, key) {
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError("");
    loaderRef.current()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load this page.");
      });
    return () => {
      cancelled = true;
    };
  }, [key, tick]);
  return { data, error, reload: () => setTick((n) => n + 1) };
}

function rowsOf(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

export function DrivingDashboard() {
  const { data, error } = useLoad(() => drivingGet("/dashboard"), "dashboard");
  const dash = data?.data;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!dash) return <p className="text-sm theme-subtext">Loading the school…</p>;
  return (
    <div>
      <PageTitle title="Good day" subtitle="Live figures for this driving school. Collected money is receipts, not profit." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active students" value={dash.active_students} />
        <Stat label="New registrations" value={dash.new_students} />
        <Stat label="Lessons today" value={dash.lessons_today} />
        <Stat label="Lessons completed" value={dash.lessons_completed} />
        <Stat label="Available instructors" value={dash.instructors_available} />
        <Stat label="Available vehicles" value={dash.vehicles_available} />
        <Stat label="Collected today" value={money(dash.revenue_collected_today)} hint="Receipts minus refunds today" />
        <Stat label="Outstanding fees" value={money(dash.outstanding_balances)} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="theme-heading font-semibold">Receipts, last 14 days</h2>
          {dash.revenue_trend?.length ? (
            <ul className="mt-3 space-y-2">
              {dash.revenue_trend.map((row) => (
                <li key={row.day} className="flex items-center gap-3 text-sm">
                  <span className="w-24 theme-subtext">{row.day}</span>
                  <span className="h-2 rounded-full bg-[var(--theme-primary)]" style={{ width: `${Math.min(100, row.collected / 100)}%` }} />
                  <span>{money(row.collected)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No receipts in this period yet.</Empty>
          )}
        </Card>
        <Card>
          <h2 className="theme-heading font-semibold">Upcoming lessons</h2>
          {dash.upcoming_lessons?.length ? (
            <ul className="mt-3 divide-y text-sm">
              {dash.upcoming_lessons.map((lesson) => (
                <li key={lesson.id} className="flex justify-between py-2">
                  <span>{lesson.student?.full_name} · {lesson.lesson_type}</span>
                  <span className="theme-subtext">{String(lesson.starts_at).replace("T", " ").slice(0, 16)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No lessons are booked ahead.</Empty>
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
  const [form, setForm] = useState(EMPTY_STUDENT);
  const { data, error, reload } = useLoad(() => drivingGet("/students"), "students");
  const courseLoad = useLoad(() => drivingGet("/courses"), "student-courses");
  const instructorLoad = useLoad(() => drivingGet("/instructors"), "student-instructors");
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
      setForm(EMPTY_STUDENT);
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not register the student.");
    }
  }

  const students = rowsOf(data);
  return (
    <div>
      <PageTitle title="Students" subtitle="Register the student, then choose the course and package they are joining. The school assigns the registration number." />
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <FormCard title="Set up a student" hint="Name, phone, course, and package are required. Identity and emergency details stay on the student record." submitLabel="Register and enrol" onSubmit={save}>
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
        <FormSection title="Emergency contact" />
        <Field label="Name"><input className={inputClass} value={form.emergency_name} onChange={(e) => setField("emergency_name", e.target.value)} /></Field>
        <Field label="Phone"><input className={inputClass} value={form.emergency_phone} onChange={(e) => setField("emergency_phone", e.target.value)} /></Field>
        <FormSection title="Course and package" />
        <Field label="Course">
          <DrivingSelect value={form.course_id} placeholder="Choose a course" onChange={(e) => setForm((current) => ({ ...current, course_id: e.target.value, package_id: "" }))} options={[{ value: "", label: "Choose a course" }, ...courses.map((course) => ({ value: String(course.id), label: `${course.code} · ${course.name}` }))]} />
        </Field>
        <Field label="Package">
          <DrivingSelect value={form.package_id} placeholder={form.course_id ? "Choose a package" : "Choose a course first"} onChange={(e) => setField("package_id", e.target.value)} options={[{ value: "", label: form.course_id ? "Choose a package" : "Choose a course first" }, ...packages.map((item) => ({ value: String(item.id), label: `${item.name} · ${money(item.price)} · ${item.practical_lessons} practical` }))]} />
        </Field>
        <Field label="Preferred instructor">
          <DrivingSelect value={form.preferred_instructor_id} placeholder="No preference" onChange={(e) => setField("preferred_instructor_id", e.target.value)} options={[{ value: "", label: "No preference" }, ...instructors.map((row) => ({ value: String(row.id), label: row.full_name }))]} />
        </Field>
        <Field label="Notes"><input className={inputClass} value={form.notes} onChange={(e) => setField("notes", e.target.value)} /></Field>
      </FormCard>
      <Card>
        {students.length === 0 ? <Empty>No students yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="theme-subtext"><tr><th className="py-2 pr-3">Number</th><th className="pr-3">Name</th><th className="pr-3">Phone</th><th className="pr-3">Course</th><th className="pr-3">Package</th><th className="pr-3">Status</th><th>Outstanding</th></tr></thead>
              <tbody>
                {students.map((student) => {
                  const enrolment = activeEnrolment(student);
                  return (
                    <tr key={student.id} className="border-t border-[var(--theme-border)]">
                      <td className="py-2 pr-3">{student.student_number}</td>
                      <td className="pr-3">{student.full_name}</td>
                      <td className="pr-3">{student.phone}</td>
                      <td className="pr-3">{enrolment?.course?.name || "—"}</td>
                      <td className="pr-3">{enrolment?.package?.name || "—"}</td>
                      <td className="pr-3">{student.status}</td>
                      <td>{money(student.outstanding)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export function CoursesScreen() {
  const [form, setForm] = useState({ code: "", name: "", licence_category: "", price: "", practical_lessons: 10, theory_lessons: 8 });
  const [pkg, setPkg] = useState({ course_id: "", name: "", price: "", registration_fee: "", practical_lessons: 10, theory_lessons: 8 });
  const { data, error, reload } = useLoad(() => drivingGet("/courses"), "courses");
  async function save(event) {
    event.preventDefault();
    try {
      await drivingSend("/courses", "POST", { ...form, price: Number(form.price) || 0 });
      notifySuccess("Course saved with a Standard package.");
      setForm({ code: "", name: "", licence_category: "", price: "", practical_lessons: 10, theory_lessons: 8 });
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save the course.");
    }
  }
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
      setPkg({ course_id: pkg.course_id, name: "", price: "", registration_fee: "", practical_lessons: 10, theory_lessons: 8 });
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save the package.");
    }
  }
  const courses = rowsOf(data);
  return (
    <div>
      <PageTitle title="Courses & packages" subtitle="A course is the licence class. Packages are the prices and lesson counts a student chooses when they register." />
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <FormCard title="New course" hint="Saving also creates a Standard package from the price and lesson counts below." submitLabel="Save course" onSubmit={save}>
        <Field label="Code"><input className={inputClass} required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
        <Field label="Name"><input className={inputClass} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Licence category"><input className={inputClass} placeholder="Class B — light vehicle" value={form.licence_category} onChange={(e) => setForm({ ...form, licence_category: e.target.value })} /></Field>
        <Field label="Standard package price (KSh)"><input className={inputClass} required type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
        <Field label="Practical lessons"><input className={inputClass} type="number" min="0" value={form.practical_lessons} onChange={(e) => setForm({ ...form, practical_lessons: Number(e.target.value) })} /></Field>
        <Field label="Theory lessons"><input className={inputClass} type="number" min="0" value={form.theory_lessons} onChange={(e) => setForm({ ...form, theory_lessons: Number(e.target.value) })} /></Field>
      </FormCard>
      <FormCard title="Another package" hint="Use this for a second price, such as weekend lessons or extra practical hours." submitLabel="Save package" onSubmit={savePackage}>
        <Field label="Course">
          <DrivingSelect value={pkg.course_id} placeholder="Choose a course" onChange={(e) => setPkg({ ...pkg, course_id: e.target.value })} options={[{ value: "", label: "Choose a course" }, ...courses.map((course) => ({ value: String(course.id), label: `${course.code} · ${course.name}` }))]} />
        </Field>
        <Field label="Package name"><input className={inputClass} required value={pkg.name} onChange={(e) => setPkg({ ...pkg, name: e.target.value })} placeholder="Weekend" /></Field>
        <Field label="Price (KSh)"><input className={inputClass} required type="number" min="0" value={pkg.price} onChange={(e) => setPkg({ ...pkg, price: e.target.value })} /></Field>
        <Field label="Registration fee (KSh)"><input className={inputClass} type="number" min="0" value={pkg.registration_fee} onChange={(e) => setPkg({ ...pkg, registration_fee: e.target.value })} /></Field>
        <Field label="Practical lessons"><input className={inputClass} type="number" min="0" value={pkg.practical_lessons} onChange={(e) => setPkg({ ...pkg, practical_lessons: Number(e.target.value) })} /></Field>
        <Field label="Theory lessons"><input className={inputClass} type="number" min="0" value={pkg.theory_lessons} onChange={(e) => setPkg({ ...pkg, theory_lessons: Number(e.target.value) })} /></Field>
      </FormCard>
      <Card>
        {courses.length === 0 ? <Empty>No courses yet.</Empty> : (
          <ul className="divide-y text-sm">
            {courses.map((course) => (
              <li key={course.id} className="py-3">
                <p className="font-medium">{course.code} · {course.name}</p>
                {(course.packages || []).length === 0 ? <p className="theme-subtext mt-1">No packages yet.</p> : (
                  <ul className="theme-subtext mt-1 space-y-1">
                    {course.packages.map((item) => (
                      <li key={item.id}>{item.name} · {money(item.price)} · {item.practical_lessons} practical · {item.theory_lessons} theory</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function ScheduleScreen() {
  const { data, error, reload } = useLoad(() => drivingGet("/lessons"), "lessons");
  const students = useLoad(() => drivingGet("/students"), "schedule-students").data;
  const instructors = useLoad(() => drivingGet("/instructors"), "schedule-instructors").data;
  const vehicles = useLoad(() => drivingGet("/vehicles"), "schedule-vehicles").data;
  const [form, setForm] = useState({ student_id: "", instructor_id: "", vehicle_id: "", lesson_type: "practical", starts_at: "", duration_minutes: 60, location: "" });
  async function save(event) {
    event.preventDefault();
    try {
      await drivingSend("/lessons", "POST", {
        ...form,
        student_id: Number(form.student_id),
        instructor_id: Number(form.instructor_id),
        vehicle_id: form.vehicle_id ? Number(form.vehicle_id) : null,
        starts_at: form.starts_at,
      });
      notifySuccess("Lesson booked.");
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not book the lesson.");
    }
  }
  const lessons = rowsOf(data);
  return (
    <div>
      <PageTitle title="Lesson scheduling" subtitle="The server refuses a booking that overlaps the same student, instructor, or vehicle." />
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <FormCard title="Book a lesson" hint="The school refuses a time that overlaps the same student, instructor, or vehicle." submitLabel="Book lesson" onSubmit={save}>
        <Field label="Student">
          <DrivingSelect required value={form.student_id} placeholder="Choose a student" onChange={(e) => setForm({ ...form, student_id: e.target.value })} options={[{ value: "", label: "Choose a student" }, ...rowsOf(students).map((row) => ({ value: String(row.id), label: row.full_name }))]} />
        </Field>
        <Field label="Instructor">
          <DrivingSelect required value={form.instructor_id} placeholder="Choose an instructor" onChange={(e) => setForm({ ...form, instructor_id: e.target.value })} options={[{ value: "", label: "Choose an instructor" }, ...rowsOf(instructors).map((row) => ({ value: String(row.id), label: row.full_name }))]} />
        </Field>
        <Field label="Type">
          <DrivingSelect value={form.lesson_type} onChange={(e) => setForm({ ...form, lesson_type: e.target.value })} options={[{ value: "practical", label: "Practical" }, { value: "theory", label: "Theory" }]} />
        </Field>
        <Field label="Vehicle">
          <DrivingSelect value={form.vehicle_id} placeholder="No vehicle" onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })} options={[{ value: "", label: "No vehicle" }, ...rowsOf(vehicles).map((row) => ({ value: String(row.id), label: row.registration_number }))]} />
        </Field>
        <Field label="Starts"><input className={inputClass} required type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></Field>
        <Field label="Duration (minutes)"><input className={inputClass} type="number" min="15" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} /></Field>
        <Field label="Location"><input className={inputClass} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Yard, route, or classroom" /></Field>
      </FormCard>
      <Card>
        {lessons.length === 0 ? <Empty>No lessons booked.</Empty> : (
          <ul className="divide-y text-sm">
            {lessons.map((lesson) => (
              <li key={lesson.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{lesson.student?.full_name} · {lesson.lesson_type} · {lesson.instructor?.full_name}</span>
                <span className="theme-subtext">{String(lesson.starts_at).replace("T", " ").slice(0, 16)} · {lesson.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function DirectoryScreen({ title, subtitle, path, fields, columns }) {
  const [form, setForm] = useState(() => Object.fromEntries(fields.map((field) => [field.name, field.default ?? ""])));
  const { data, error, reload } = useLoad(() => drivingGet(path), path);
  async function save(event) {
    event.preventDefault();
    const body = { ...form };
    for (const field of fields) {
      if (field.type === "number" && body[field.name] !== "") body[field.name] = Number(body[field.name]);
    }
    try {
      await drivingSend(path, "POST", body);
      notifySuccess("Saved.");
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save.");
    }
  }
  const list = rowsOf(data);
  return (
    <div>
      <PageTitle title={title} subtitle={subtitle} />
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <FormCard title={`Add ${title.toLowerCase()}`} submitLabel="Save" onSubmit={save}>
        {fields.map((field) => (
          <Field key={field.name} label={field.label}>
            <input className={inputClass} required={field.required} type={field.type || "text"} value={form[field.name]} onChange={(e) => setForm({ ...form, [field.name]: e.target.value })} />
          </Field>
        ))}
      </FormCard>
      <Card>
        {list.length === 0 ? <Empty>Nothing saved yet.</Empty> : (
          <ul className="divide-y text-sm">
            {list.map((row) => (
              <li key={row.id} className="flex justify-between py-2">
                <span>{columns.map((col) => row[col]).filter(Boolean).join(" · ")}</span>
                {row.status ? <span className="theme-subtext">{row.status}</span> : null}
              </li>
            ))}
          </ul>
        )}
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
      fields={[
        { name: "full_name", label: "Name", required: true },
        { name: "phone", label: "Phone" },
        { name: "lesson_pay", label: "Pay per lesson (KSh)", type: "number" },
      ]}
      columns={["instructor_number", "full_name", "phone"]}
    />
  );
}

export function VehiclesScreen() {
  return (
    <DirectoryScreen
      title="Vehicles"
      subtitle="A vehicle marked maintenance or inactive cannot be booked."
      path="/vehicles"
      fields={[
        { name: "registration_number", label: "Registration", required: true },
        { name: "make", label: "Make" },
        { name: "model", label: "Model" },
      ]}
      columns={["registration_number", "make", "model"]}
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
  const studentLoad = useLoad(() => drivingGet("/students", { status: "active", per_page: 100 }), "attendance-students");
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
      <PageTitle title="Attendance" subtitle="Check a student in when they arrive and out when they leave. A signature or thumb mark is optional." />
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <FormCard
        title={direction === "in" ? "Check in" : "Check out"}
        hint={selected ? `${selected.full_name} is ${last?.direction === "in" ? `in since ${visitClock(last.recorded_at)}` : "not currently in"}.` : "Choose a student from the list, then record arrival or departure."}
        submitLabel={direction === "in" ? "Check in" : "Check out"}
        onSubmit={save}
      >
        <Field label="Date"><input className={inputClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Student">
          <DrivingSelect value={studentId} placeholder="Choose a student" onChange={(e) => chooseStudent(e.target.value)} options={[{ value: "", label: "Choose a student" }, ...students.map((student) => ({ value: String(student.id), label: `${student.student_number} · ${student.full_name}` }))]} />
        </Field>
        <Field label="Verification">
          <DrivingSelect value={verification} onChange={(e) => { setVerification(e.target.value); setMark(""); }} options={[{ value: "none", label: "No extra check" }, { value: "signature", label: "Signature" }, { value: "thumb", label: "Thumb mark" }]} />
        </Field>
        {verification === "signature" ? (
          <Field label="Signature">
            <MarkPad key="signature" onChange={setMark} />
          </Field>
        ) : null}
        {verification === "thumb" ? (
          <Field label="Thumb mark">
            <MarkPad key="thumb" onChange={setMark} />
          </Field>
        ) : null}
      </FormCard>
      <Card className="mb-5">
        <h2 className="theme-heading text-sm font-semibold">Students today</h2>
        {students.length === 0 ? <Empty>No active students yet.</Empty> : (
          <ul className="mt-3 divide-y text-sm">
            {students.map((student) => {
              const visit = latestVisit(logs, student.id);
              const inside = visit?.direction === "in";
              return (
                <li key={student.id}>
                  <button type="button" className="flex w-full items-center justify-between gap-3 py-2 text-left" onClick={() => chooseStudent(student.id)}>
                    <span>{student.full_name}</span>
                    <span className={inside ? "text-emerald-700" : "theme-subtext"}>{inside ? `In since ${visitClock(visit.recorded_at)}` : "Out"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="theme-heading text-sm font-semibold">Today’s record</h2>
        {logs.length === 0 ? <Empty>No one has been checked in on this date.</Empty> : (
          <ul className="mt-3 divide-y text-sm">
            {logs.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span>{row.student?.full_name || "Student"} · {row.direction === "in" ? "In" : "Out"} · {visitClock(row.recorded_at)}</span>
                <span className="flex items-center gap-2">
                  <span className="theme-subtext">{row.verification === "signature" ? "Signed" : row.verification === "thumb" ? "Thumb" : "No mark"}</span>
                  {row.mark ? (
                    <span
                      role="img"
                      aria-label="Attendance mark"
                      className="inline-block h-10 w-16 rounded border border-[var(--theme-border)] bg-white bg-contain bg-center bg-no-repeat"
                      style={{ backgroundImage: `url("${row.mark}")` }}
                    />
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function AssessmentsScreen() {
  const students = useLoad(() => drivingGet("/students"), "assessment-students").data;
  const { data, error, reload } = useLoad(() => drivingGet("/assessments"), "assessments");
  const [form, setForm] = useState({ student_id: "", kind: "practical", title: "School practical check", score: "", assessed_on: "" });
  async function save(event) {
    event.preventDefault();
    try {
      const res = await drivingSend("/assessments", "POST", { ...form, student_id: Number(form.student_id), score: Number(form.score) });
      notifySuccess(res.message || "Assessment saved.");
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save the assessment.");
    }
  }
  return (
    <div>
      <PageTitle title="Assessments & exams" subtitle="These are internal school checks. They are not official government licensing results." />
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <FormCard title="Record an assessment" hint="This is an internal school check. It is not an official licensing result." submitLabel="Save assessment" onSubmit={save}>
        <Field label="Student">
          <DrivingSelect required value={form.student_id} placeholder="Choose a student" onChange={(e) => setForm({ ...form, student_id: e.target.value })} options={[{ value: "", label: "Choose a student" }, ...rowsOf(students).map((row) => ({ value: String(row.id), label: row.full_name }))]} />
        </Field>
        <Field label="Kind">
          <DrivingSelect value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} options={[{ value: "practical", label: "Practical" }, { value: "theory", label: "Theory" }]} />
        </Field>
        <Field label="Title"><input className={inputClass} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Score"><input className={inputClass} required type="number" min="0" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} /></Field>
        <Field label="Date"><input className={inputClass} required type="date" value={form.assessed_on} onChange={(e) => setForm({ ...form, assessed_on: e.target.value })} /></Field>
      </FormCard>
      <Card>
        {rowsOf(data).length === 0 ? <Empty>No assessments yet.</Empty> : rowsOf(data).map((row) => (
          <p key={row.id} className="border-b border-[var(--theme-border)] py-2 text-sm">{row.title} · {row.score}/{row.max_score} · {row.passed ? "Pass" : "Needs more lessons"}</p>
        ))}
      </Card>
    </div>
  );
}

export function PaymentsScreen() {
  const { data, error, reload } = useLoad(() => drivingGet("/invoices"), "invoices");
  const [payment, setPayment] = useState({ invoice_id: "", amount: "", method: "cash", reference: "" });
  async function save(event) {
    event.preventDefault();
    try {
      const res = await drivingSend("/payments", "POST", { ...payment, invoice_id: Number(payment.invoice_id), amount: Number(payment.amount) });
      notifySuccess(res.message || "Payment recorded.");
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not record the payment.");
    }
  }
  return (
    <div>
      <PageTitle title="Payments & fees" subtitle="An M-Pesa reference recorded here is a staff receipt. It is not confirmed by Safaricom unless a configured callback matches it." />
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <FormCard title="Record a receipt" hint="An M-Pesa reference saved here is a staff receipt. It is not confirmed by Safaricom unless a configured callback matches it." submitLabel="Record receipt" onSubmit={save}>
        <Field label="Invoice">
          <DrivingSelect required value={payment.invoice_id} placeholder="Choose an invoice" onChange={(e) => setPayment({ ...payment, invoice_id: e.target.value })} options={[{ value: "", label: "Choose an invoice" }, ...rowsOf(data).map((row) => ({ value: String(row.id), label: `${row.invoice_number} · due ${money(row.outstanding)}` }))]} />
        </Field>
        <Field label="Amount (KSh)"><input className={inputClass} required type="number" min="0" step="0.01" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} /></Field>
        <Field label="Method">
          <DrivingSelect value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })} options={[{ value: "cash", label: "Cash" }, { value: "bank", label: "Bank" }, { value: "card", label: "Card" }, { value: "mpesa", label: "M-Pesa reference" }]} />
        </Field>
        <Field label="Reference"><input className={inputClass} value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} placeholder="Receipt or transaction code" /></Field>
      </FormCard>
      <Card>
        {rowsOf(data).length === 0 ? <Empty>Enrol a student on a priced course to create an invoice.</Empty> : rowsOf(data).map((row) => (
          <p key={row.id} className="border-b border-[var(--theme-border)] py-2 text-sm">{row.invoice_number} · {row.kind} · {money(row.amount)} · outstanding {money(row.outstanding)} · {row.status}</p>
        ))}
      </Card>
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
  const spec = DRIVING_REPORTS[report];
  const { data, error } = useLoad(
    () => drivingGet("/reports", { report, from, to }),
    `${report}:${from}:${to}`,
  );
  const rows = rowsOf(data);
  return (
    <div>
      <PageTitle title="Reports" subtitle={data?.note || "Receipts, enrolments, outstanding fees, lessons, vehicles, and expenses."} />
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(DRIVING_REPORTS).map(([key, item]) => (
          <button key={key} type="button" className={`rounded-full px-3 py-1.5 text-sm ${report === key ? "theme-primary-btn" : "theme-secondary-btn"}`} onClick={() => setReport(key)}>{item.label}</button>
        ))}
      </div>
      <Card className="mb-4 max-w-xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From"><input className={inputClass} type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input className={inputClass} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
      </Card>
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      <Card className="overflow-x-auto">
        {rows.length === 0 ? <Empty>No rows for this report.</Empty> : (
          <table className="w-full text-left text-sm">
            <thead className="theme-subtext">
              <tr>{spec.columns.map(([, label]) => <th key={label} className="py-2 pr-3 font-medium">{label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id || index} className="border-t border-[var(--theme-border)]">
                  {spec.columns.map(([key]) => <td key={key} className="py-2 pr-3">{reportCell(row, key, spec.money || [])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
