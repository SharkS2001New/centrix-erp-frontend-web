"use client";

import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useTabTitle } from "@/contexts/tab-workspace-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { tabSectionTitle } from "@/hooks/use-tab-form-exit";
import { ApiError } from "@/lib/api";
import { drivingGet, drivingSend } from "@/lib/driving/api";
import { invalidateDrivingReference } from "@/lib/driving/reference-cache";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";
import { AppNavLink } from "@/components/layout/app-nav-link";
import {
  BarChart,
  Card,
  DataTable,
  DrivingSelect,
  Editor,
  Field,
  FormCard,
  FormSection,
  PersonName,
  ScreenHeader,
  Stat,
  StatusBadge,
  Toolbar,
  inputClass,
  money,
  primaryButtonClass,
} from "@/components/driving/ui";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "month", label: "This month" },
  { value: "30d", label: "Last 30 days" },
  { value: "year", label: "This year" },
];

const EMPTY_FORM = {
  name: "",
  code: "",
  phone: "",
  email: "",
  address: "",
  manager_staff_id: "",
  is_active: true,
};

function isoDay(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function periodRange(period) {
  const today = new Date();
  const to = isoDay(today);
  if (period === "today") return { from: to, to };
  if (period === "30d") {
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    return { from: isoDay(start), to };
  }
  if (period === "year") return { from: `${today.getFullYear()}-01-01`, to };
  return { from: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`, to };
}

function rowsOf(payload) {
  if (!payload) return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

function isOrgWide(user) {
  return Boolean(user?.is_admin || user?.is_super_admin) || (user?.access_scope ?? "org") !== "branch";
}

function shortDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

function DetailRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="theme-subtext shrink-0 text-xs uppercase tracking-wide">{label}</dt>
      <dd className="theme-heading min-w-0 text-right text-sm">{children ?? "—"}</dd>
    </div>
  );
}

function staffName(staff) {
  return staff?.full_name || `${staff?.first_name ?? ""} ${staff?.last_name ?? ""}`.trim() || staff?.staff_number || "Staff";
}

export function DrivingBranchesScreen() {
  const { user, hasPermission } = useAuth();
  const confirm = useConfirm();
  useTabTitle(tabSectionTitle("Branches", "Driving"));

  const orgWide = isOrgWide(user);
  const isAdmin = Boolean(user?.is_admin || user?.is_super_admin);
  const canCreate = isAdmin || hasPermission("driving.branches.create");
  const canEdit = isAdmin || hasPermission("driving.branches.edit");
  const canDelete = isAdmin || hasPermission("driving.branches.delete");

  const [period, setPeriod] = useState("month");
  const [query, setQuery] = useState("");
  const [focusBranch, setFocusBranch] = useState("");
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  const [viewBranch, setViewBranch] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState([]);
  const [staffLoaded, setStaffLoaded] = useState(false);

  const range = useMemo(() => periodRange(period), [period]);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await drivingGet("/branches/performance", { from: range.from, to: range.to });
      setPayload(response?.data ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load branch performance.");
    }
  }, [range.from, range.to]);

  useTabAwareDataLoad(load, {
    depsKey: `${range.from}|${range.to}|${tick}`,
    hasData: payload != null,
  });

  const reload = useCallback(() => setTick((value) => value + 1), []);

  const branches = useMemo(() => payload?.branches ?? [], [payload]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return branches.filter((branch) => {
      if (focusBranch && String(branch.id) !== focusBranch) return false;
      if (!term) return true;
      return `${branch.name} ${branch.code ?? ""} ${branch.manager_name ?? ""} ${branch.phone ?? ""}`
        .toLowerCase()
        .includes(term);
    });
  }, [branches, query, focusBranch]);

  const visibleTotals = useMemo(
    () =>
      visible.reduce(
        (acc, branch) => {
          acc.branches += 1;
          if (branch.is_active) acc.active_branches += 1;
          for (const key of ["active_students", "enrolments", "lessons", "completed_lessons", "instructors", "vehicles", "vehicles_available", "compliance_due"]) {
            acc[key] += Number(branch[key]) || 0;
          }
          acc.collected += Number(branch.collected) || 0;
          acc.outstanding += Number(branch.outstanding) || 0;
          return acc;
        },
        { branches: 0, active_branches: 0, active_students: 0, enrolments: 0, lessons: 0, completed_lessons: 0, instructors: 0, vehicles: 0, vehicles_available: 0, compliance_due: 0, collected: 0, outstanding: 0 },
      ),
    [visible],
  );

  const collectionsChart = useMemo(
    () =>
      visible
        .filter((branch) => Number(branch.collected) > 0)
        .map((branch) => ({ label: branch.code || branch.name, value: Number(branch.collected) })),
    [visible],
  );

  async function ensureStaff() {
    if (staffLoaded) return;
    setStaffLoaded(true);
    try {
      const response = await drivingGet("/staff", { per_page: 200 });
      setStaff(rowsOf(response).filter((person) => person.is_active !== false));
    } catch {
      setStaff([]);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDrawerOpen(true);
    void ensureStaff();
  }

  function openEdit(branch) {
    setViewBranch(null);
    setEditing(branch);
    setForm({
      name: branch.name ?? "",
      code: branch.code ?? "",
      phone: branch.phone ?? "",
      email: branch.email ?? "",
      address: branch.address ?? "",
      manager_staff_id: branch.manager_staff_id ? String(branch.manager_staff_id) : "",
      is_active: branch.is_active !== false,
    });
    setDrawerOpen(true);
    void ensureStaff();
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    if (!form.name.trim()) {
      notifyError("Branch name is required.");
      return;
    }
    setSaving(true);
    const body = {
      branch_name: form.name.trim(),
      branch_code: form.code.trim() || null,
      branch_phone: form.phone.trim() || null,
      branch_email: form.email.trim() || null,
      branch_address: form.address.trim() || null,
      branch_type: editing?.branch_type ?? "retail",
      manager_employee_id: null,
      manager_staff_id: form.manager_staff_id ? Number(form.manager_staff_id) : null,
      is_active: form.is_active,
    };
    try {
      if (editing) {
        await drivingSend(`/branches/${editing.id}`, "PUT", body);
        notifySuccess(`"${body.branch_name}" updated`);
      } else {
        await drivingSend("/branches", "POST", body);
        notifySuccess(`"${body.branch_name}" added`);
      }
      setDrawerOpen(false);
      invalidateDrivingReference("branches");
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save the branch.");
    } finally {
      setSaving(false);
    }
  }

  async function removeBranch(branch) {
    const ok = await confirm({
      title: "Delete branch",
      message: `Delete "${branch.name}"? The branch can only be deleted when no users are assigned to it.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await drivingSend(`/branches/${branch.id}`, "DELETE");
      if (viewBranch?.id === branch.id) setViewBranch(null);
      invalidateDrivingReference("branches");
      notifySuccess(`"${branch.name}" deleted`);
      reload();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not delete the branch.");
    }
  }

  function canManage(branch) {
    if (!canEdit) return false;
    return orgWide || String(branch.id) === String(user?.branch_id);
  }

  const managerOptions = useMemo(() => {
    const options = staff.map((person) => ({
      value: String(person.id),
      label: `${staffName(person)}${person.staff_number ? ` · ${person.staff_number}` : ""}`,
    }));
    if (form.manager_staff_id && !options.some((option) => option.value === form.manager_staff_id)) {
      options.unshift({ value: form.manager_staff_id, label: editing?.manager_name || "Current manager" });
    }
    return options;
  }, [staff, form.manager_staff_id, editing]);

  return (
    <div>
      <ScreenHeader
        title="Branches"
        subtitle={
          orgWide
            ? "Every branch on one page: how each one is doing today and this period, plus the place to add or update a branch."
            : "Your branch profile and performance. An organisation-wide manager can add and compare every branch."
        }
      >
        {orgWide && canCreate ? (
          <button type="button" className={primaryButtonClass} onClick={openCreate}>
            Add branch
          </button>
        ) : null}
      </ScreenHeader>

      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

      <Toolbar>
        <DrivingSelect value={period} onChange={(event) => setPeriod(event.target.value)} options={PERIODS} placeholder="Period" />
        {orgWide && branches.length > 1 ? (
          <DrivingSelect
            value={focusBranch}
            onChange={(event) => setFocusBranch(event.target.value)}
            options={[{ value: "", label: "All branches" }, ...branches.map((branch) => ({ value: String(branch.id), label: branch.name }))]}
            placeholder="All branches"
          />
        ) : null}
        <input
          className={`${inputClass} sm:max-w-xs`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search branch, manager, or phone"
        />
        <span className="theme-subtext text-xs">
          {payload?.from ? `${shortDate(payload.from)} – ${shortDate(payload.to)}` : ""}
        </span>
      </Toolbar>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Branches" value={visibleTotals.branches} hint={`${visibleTotals.active_branches} active`} icon="diagram-3" tone="indigo" />
        <Stat label="Active students" value={visibleTotals.active_students ?? 0} hint={`${visibleTotals.enrolments ?? 0} new enrolments`} icon="people" tone="sky" />
        <Stat label="Lessons" value={visibleTotals.lessons ?? 0} hint={`${visibleTotals.completed_lessons ?? 0} completed`} icon="calendar-check" tone="violet" />
        <Stat label="Collected" value={money(visibleTotals.collected ?? 0)} hint="Receipts in this period" icon="wallet2" tone="emerald" />
        <Stat label="Outstanding" value={money(visibleTotals.outstanding ?? 0)} hint="Open fee balances" icon="receipt" tone="amber" />
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="theme-heading font-semibold">Branch performance</h2>
          <span className="theme-subtext text-xs">{focusBranch ? "One branch" : "All branches"} · same period as the cards</span>
        </div>
        <DataTable
          empty="No branches match this view."
          rows={visible}
          columns={[
            { key: "name", label: "Branch", render: (branch) => <PersonName name={branch.name} detail={branch.code} /> },
            { key: "manager_name", label: "Manager", render: (branch) => branch.manager_name || "—" },
            { key: "active_students", label: "Students" },
            { key: "enrolments", label: "Enrolments" },
            { key: "lessons", label: "Lessons", render: (branch) => `${branch.completed_lessons}/${branch.lessons}` },
            { key: "instructors", label: "Instructors" },
            {
              key: "fleet",
              label: "Fleet",
              render: (branch) => (
                <span>
                  {branch.vehicles_available}/{branch.vehicles} ready
                  {branch.compliance_due ? <span className="ml-1 text-amber-700">· {branch.compliance_due} due</span> : null}
                </span>
              ),
            },
            { key: "collected", label: "Collected", render: (branch) => money(branch.collected) },
            { key: "outstanding", label: "Outstanding", render: (branch) => money(branch.outstanding) },
            { key: "is_active", label: "Status", render: (branch) => <StatusBadge value={branch.is_active ? "active" : "inactive"} /> },
            {
              key: "actions",
              label: "",
              render: (branch) => (
                <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                  <button type="button" className="text-sm font-medium text-[var(--theme-primary)]" onClick={() => setViewBranch(branch)}>
                    View
                  </button>
                  {canManage(branch) ? (
                    <button type="button" className="text-sm font-medium text-[var(--theme-primary)]" onClick={() => openEdit(branch)}>
                      Edit
                    </button>
                  ) : null}
                  {canDelete && (orgWide || String(branch.id) === String(user?.branch_id)) ? (
                    <button type="button" className="text-sm font-medium text-red-600" onClick={() => void removeBranch(branch)}>
                      Delete
                    </button>
                  ) : null}
                </div>
              ),
            },
          ]}
        />
      </Card>

      {collectionsChart.length > 1 ? (
        <Card className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="theme-heading font-semibold">Collections by branch</h2>
            <span className="theme-subtext text-xs">{shortDate(payload?.from)} – {shortDate(payload?.to)}</span>
          </div>
          <BarChart points={collectionsChart} format={money} />
        </Card>
      ) : null}

      <Editor open={drawerOpen} title={editing ? `Edit ${editing.name}` : "Add branch"} onClose={() => setDrawerOpen(false)}>
        <FormCard
          bare
          onSubmit={save}
          onCancel={() => setDrawerOpen(false)}
          submitLabel={saving ? "Saving…" : editing ? "Save branch" : "Add branch"}
        >
          <FormSection title="Branch contact" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Branch name">
              <input className={inputClass} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </Field>
            <Field label="Branch code">
              <input className={inputClass} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="Optional" />
            </Field>
            <Field label="Phone">
              <input className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </Field>
            <Field label="Email">
              <input className={inputClass} type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </Field>
          </div>
          <Field label="Address">
            <textarea
              className={`${inputClass} h-auto min-h-[72px] py-2`}
              value={form.address}
              onChange={(event) => setForm({ ...form, address: event.target.value })}
            />
          </Field>
          <FormSection title="Accountability" />
          <Field label="Branch manager">
            <DrivingSelect
              value={form.manager_staff_id}
              onChange={(event) => setForm({ ...form, manager_staff_id: event.target.value })}
              options={managerOptions}
              placeholder={staffLoaded && staff.length === 0 ? "No staff list available" : "Choose a staff member"}
            />
          </Field>
          <p className="theme-subtext text-xs">
            {staffLoaded && staff.length === 0
              ? "No Driving School staff available to pick from. Add staff under Staff, or ask for Staff access."
              : "Managers come from Driving School staff. Staff access is managed from Staff, and who can sign in from Users."}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
            <span className="theme-heading">Branch is active</span>
          </label>
        </FormCard>
      </Editor>

      <Editor open={Boolean(viewBranch)} title={viewBranch?.name ?? "Branch"} onClose={() => setViewBranch(null)} wide>
        {viewBranch ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Active students" value={viewBranch.active_students} icon="people" tone="sky" />
              <Stat label="Lessons" value={viewBranch.lessons} hint={`${viewBranch.completed_lessons} completed`} icon="calendar-check" tone="violet" />
              <Stat label="Collected" value={money(viewBranch.collected)} icon="wallet2" tone="emerald" />
              <Stat label="Outstanding" value={money(viewBranch.outstanding)} icon="receipt" tone="amber" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <h3 className="theme-heading font-semibold">Branch details</h3>
                <dl className="mt-2 divide-y divide-[var(--theme-border)]">
                  <DetailRow label="Code">{viewBranch.code || "—"}</DetailRow>
                  <DetailRow label="Manager">{viewBranch.manager_name || "—"}</DetailRow>
                  <DetailRow label="Phone">{viewBranch.phone || "—"}</DetailRow>
                  <DetailRow label="Email">{viewBranch.email || "—"}</DetailRow>
                  <DetailRow label="Address">{viewBranch.address || "—"}</DetailRow>
                  <DetailRow label="Status"><StatusBadge value={viewBranch.is_active ? "active" : "inactive"} /></DetailRow>
                </dl>
              </Card>
              <Card>
                <h3 className="theme-heading font-semibold">This period</h3>
                <dl className="mt-2 divide-y divide-[var(--theme-border)]">
                  <DetailRow label="New enrolments">{viewBranch.enrolments}</DetailRow>
                  <DetailRow label="Instructors">{viewBranch.instructors}</DetailRow>
                  <DetailRow label="Fleet">{`${viewBranch.vehicles_available}/${viewBranch.vehicles} ready`}</DetailRow>
                  <DetailRow label="Compliance due">{viewBranch.compliance_due || "None"}</DetailRow>
                  <DetailRow label="Period">{`${shortDate(payload?.from)} – ${shortDate(payload?.to)}`}</DetailRow>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <AppNavLink href="/driving-school/students" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Students</AppNavLink>
                  <AppNavLink href="/driving-school/schedule" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Schedule</AppNavLink>
                  <AppNavLink href="/driving-school/payments" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Payments</AppNavLink>
                  <AppNavLink href="/driving-school/reports" className="theme-secondary-btn rounded-lg px-3 py-2 text-sm font-medium">Reports</AppNavLink>
                </div>
                <p className="theme-subtext mt-2 text-xs">Each screen has its own branch filter, so open one and pick this branch there.</p>
              </Card>
            </div>
          </div>
        ) : null}
      </Editor>
    </div>
  );
}
