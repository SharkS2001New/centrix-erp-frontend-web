"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { AdminApiProvider } from "@/contexts/admin-api-context";

function ScreenFallback() {
  return <p className="theme-subtext text-sm">Loading…</p>;
}

const DrivingDashboard = dynamic(
  () => import("@/components/driving/screens").then((m) => m.DrivingDashboard),
  { loading: ScreenFallback },
);
const StudentsScreen = dynamic(
  () => import("@/components/driving/screens").then((m) => m.StudentsScreen),
  { loading: ScreenFallback },
);
const CoursesScreen = dynamic(
  () => import("@/components/driving/screens").then((m) => m.CoursesScreen),
  { loading: ScreenFallback },
);
const ScheduleScreen = dynamic(
  () => import("@/components/driving/screens").then((m) => m.ScheduleScreen),
  { loading: ScreenFallback },
);
const InstructorsScreen = dynamic(
  () => import("@/components/driving/screens").then((m) => m.InstructorsScreen),
  { loading: ScreenFallback },
);
const VehiclesScreen = dynamic(
  () => import("@/components/driving/screens").then((m) => m.VehiclesScreen),
  { loading: ScreenFallback },
);
const AttendanceScreen = dynamic(
  () => import("@/components/driving/screens").then((m) => m.AttendanceScreen),
  { loading: ScreenFallback },
);
const AssessmentsScreen = dynamic(
  () => import("@/components/driving/screens").then((m) => m.AssessmentsScreen),
  { loading: ScreenFallback },
);
const PaymentsScreen = dynamic(
  () => import("@/components/driving/screens").then((m) => m.PaymentsScreen),
  { loading: ScreenFallback },
);
const ExpensesScreen = dynamic(
  () => import("@/components/driving/screens").then((m) => m.ExpensesScreen),
  { loading: ScreenFallback },
);
const ReportsScreen = dynamic(
  () => import("@/components/driving/screens").then((m) => m.ReportsScreen),
  { loading: ScreenFallback },
);
const NotificationsScreen = dynamic(
  () => import("@/components/driving/screens").then((m) => m.NotificationsScreen),
  { loading: ScreenFallback },
);
const StaffScreen = dynamic(
  () => import("@/components/driving/screens").then((m) => m.StaffScreen),
  { loading: ScreenFallback },
);
const StaffAttendanceScreen = dynamic(
  () => import("@/components/driving/screens").then((m) => m.StaffAttendanceScreen),
  { loading: ScreenFallback },
);
const SettingsScreen = dynamic(
  () => import("@/components/driving/screens").then((m) => m.SettingsScreen),
  { loading: ScreenFallback },
);
const AdminUsersScreen = dynamic(
  () => import("@/components/tab-screens/admin-users").then((m) => m.AdminUsersScreen),
  { loading: ScreenFallback },
);
const AdminRolesScreen = dynamic(
  () => import("@/components/tab-screens/admin-roles").then((m) => m.AdminRolesScreen),
  { loading: ScreenFallback },
);
const AdminAuditScreen = dynamic(
  () => import("@/components/tab-screens/admin-audit").then((m) => m.AdminAuditScreen),
  { loading: ScreenFallback },
);
const DrivingBranchesScreen = dynamic(
  () => import("@/components/driving/branches-screen").then((m) => m.DrivingBranchesScreen),
  { loading: ScreenFallback },
);

export default function DrivingSchoolPage() {
  const params = useParams();
  const section = Array.isArray(params.section) ? params.section[0] : params.section;

  switch (section) {
    case "students":
      return <StudentsScreen />;
    case "courses":
      return <CoursesScreen />;
    case "schedule":
      return <ScheduleScreen />;
    case "instructors":
      return <InstructorsScreen />;
    case "vehicles":
      return <VehiclesScreen />;
    case "attendance":
      return <AttendanceScreen mode={Array.isArray(params.section) ? params.section[1] : undefined} />;
    case "assessments":
      return <AssessmentsScreen />;
    case "payments":
      return <PaymentsScreen />;
    case "expenses":
      return <ExpensesScreen />;
    case "reports":
      return <ReportsScreen reportKey={Array.isArray(params.section) ? params.section[1] : undefined} />;
    case "notifications":
      return <NotificationsScreen />;
    case "staff":
      if (Array.isArray(params.section) && params.section[1] === "attendance") {
        return <StaffAttendanceScreen />;
      }
      return <StaffScreen view={Array.isArray(params.section) ? params.section[1] : undefined} />;
    case "branches":
      return (
        <DrivingAdminSection permission="driving.branches.view">
          <DrivingBranchesScreen />
        </DrivingAdminSection>
      );
    case "users":
      return (
        <DrivingAdminSection permission="driving.users.view">
          <AdminUsersScreen basePath="/driving-school" />
        </DrivingAdminSection>
      );
    case "roles":
      return (
        <DrivingAdminSection permission="driving.roles.view">
          <AdminRolesScreen basePath="/driving-school" />
        </DrivingAdminSection>
      );
    case "settings":
      return (
        <DrivingAdminSection permission="driving.settings.view">
          <SettingsScreen />
        </DrivingAdminSection>
      );
    case "audit":
      return (
        <DrivingAdminSection permission="driving.settings.view">
          <AdminAuditScreen basePath="/driving-school" />
        </DrivingAdminSection>
      );
    default:
      return <DrivingDashboard />;
  }
}

function DrivingAdminSection({ permission, children }) {
  const { hasPermission, isOrgAdmin } = useAuth();
  const allowed = isOrgAdmin() || hasPermission(permission);

  if (!allowed) {
    return <p className="theme-subtext text-sm">You do not have permission to open this section. Ask a school administrator to grant it to your role.</p>;
  }

  return <AdminApiProvider apiPrefix="/driving-school">{children}</AdminApiProvider>;
}
