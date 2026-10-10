"use client";

import { useParams } from "next/navigation";
import {
  AssessmentsScreen,
  AttendanceScreen,
  CoursesScreen,
  DrivingDashboard,
  ExistingListScreen,
  ExpensesScreen,
  InstructorsScreen,
  PaymentsScreen,
  ReportsScreen,
  ScheduleScreen,
  SettingsScreen,
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
      return <ExistingListScreen title="Branches" subtitle="Branches already belong to the organisation. A branch-limited user only sees their own branch in school records." path="/branches" label={(row) => row.branch_name || row.name || row.branch_code} />;
    case "users":
      return <ExistingListScreen title="Users & permissions" subtitle="Staff accounts and roles stay in Administration. Instructors only see their own lessons when their user is linked." path="/users" label={(row) => row.full_name || row.username || row.email} />;
    case "settings":
      return <SettingsScreen />;
    case "audit":
      return <ExistingListScreen title="Audit logs" subtitle="Student, booking, payment, and settings changes are recorded with the person, the record, and the time." path="/audit-logs" label={(row) => `${row.action} · ${row.table_name} · ${row.record_id}`} />;
    default:
      return <DrivingDashboard />;
  }
}
