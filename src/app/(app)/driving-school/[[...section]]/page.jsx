"use client";

import { useEffect } from "react";
import { useParams, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useAppRouter } from "@/lib/use-app-router";
import { buildAccessContext, resolveTillFloatNavFlag } from "@/lib/access-control";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { openAppPathAcrossWorkspaces } from "@/lib/workspace-navigation";
import {
  AssessmentsScreen,
  AttendanceScreen,
  CoursesScreen,
  DrivingDashboard,
  ExpensesScreen,
  InstructorsScreen,
  PaymentsScreen,
  ReportsScreen,
  ScheduleScreen,
  StudentsScreen,
  VehiclesScreen,
} from "@/components/driving/screens";

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
      return <AttendanceScreen />;
    case "assessments":
      return <AssessmentsScreen />;
    case "payments":
      return <PaymentsScreen />;
    case "expenses":
      return <ExpensesScreen />;
    case "reports":
      return <ReportsScreen />;
    case "branches":
      return <AdminRedirect href="/admin/branches" label="Opening branches in Administration…" />;
    case "users":
      return <AdminRedirect href="/admin/users" label="Opening users in Administration…" />;
    case "settings":
      return <AdminRedirect href="/admin/driving-settings" label="Opening Driving School settings in Administration…" />;
    case "audit":
      return <AdminRedirect href="/admin/audit" label="Opening the audit trail in Administration…" />;
    default:
      return <DrivingDashboard />;
  }
}

function AdminRedirect({ href, label }) {
  const pathname = usePathname();
  const router = useAppRouter();
  const { user, organization, capabilities, isSuperAdmin, switchWorkspace } = useAuth();

  useEffect(() => {
    const ctx = buildAccessContext({
      user,
      organization,
      capabilities,
      requireTillFloat: resolveTillFloatNavFlag(capabilities),
      isSuperAdmin,
    });
    openAppPathAcrossWorkspaces({
      href,
      currentPathname: pathname,
      userId: user?.id,
      organizationId: organization?.id,
      capabilities,
      ctx,
      currentWorkspaceId: getStoredWorkspace(),
      switchWorkspace,
      router,
    }).catch(() => {
      router.replace("/admin");
    });
  }, [capabilities, href, isSuperAdmin, organization, pathname, router, switchWorkspace, user]);

  return <p className="theme-subtext text-sm">{label}</p>;
}
