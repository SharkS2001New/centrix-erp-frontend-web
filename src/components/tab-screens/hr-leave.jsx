"use client";

import { useSearchParams } from "next/navigation";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { LEAVE_DAY_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { LeaveAssignmentSection } from "@/components/hr/leave-assignment-section";
import { isAdminUser } from "@/components/hr/hr-shared";
import { useAuth } from "@/contexts/auth-context";

export function HrLeaveScreen() {
  const searchParams = useSearchParams();
  const highlightLeaveDayId = searchParams.get("leave_day_id");
  const { user } = useAuth();
  const isAdmin = isAdminUser(user);

  return (
    <CatalogPageShell
      title="Leave applications"
      subtitle={
        isAdmin
          ? "Search an employee, submit leave with a reason, print the application, and approve pending requests."
          : "Search an employee and submit leave applications for administrator approval."
      }
      action={
        <CatalogListExport
          title="Leave days"
          apiPath="/employee-leave-days"
          columns={LEAVE_DAY_EXPORT_COLUMNS}
          getSearchParams={() => ({ per_page: 200 })}
        />
      }
    >
      <LeaveAssignmentSection highlightLeaveDayId={highlightLeaveDayId} />
    </CatalogPageShell>
  );
}
