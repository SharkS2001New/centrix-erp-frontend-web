"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { LEAVE_DAY_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { LeaveAssignmentSection } from "@/components/hr/leave-assignment-section";
import { isAdminUser } from "@/components/hr/hr-shared";
import { useAuth } from "@/contexts/auth-context";

export default function HrLeavePage() {
  const searchParams = useSearchParams();
  const highlightLeaveDayId = searchParams.get("leave_day_id");
  const { user } = useAuth();
  const isAdmin = isAdminUser(user);
  const [employees, setEmployees] = useState([]);
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiRequest("/employees", { searchParams: { per_page: 500 } })
      .then((res) => {
        if (!cancelled) setEmployees(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setEmployees([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function bumpBalances() {
    setBalanceRefreshKey((k) => k + 1);
  }

  return (
    <CatalogPageShell
      title="Leave & off days"
      subtitle={
        isAdmin
          ? "Assign leave and off days per employee. Organization leave defaults are configured under Administration → Settings → HR."
          : "View remaining balances and assign leave and off days by employee"
      }
      action={
        <CatalogListExport
          title="Leave days"
          apiPath="/employee-leave-days"
          columns={LEAVE_DAY_EXPORT_COLUMNS}
          totalCount={employees.length}
          getSearchParams={() => ({ per_page: 200 })}
        />
      }
    >
      <LeaveAssignmentSection
        employees={employees}
        onAssignmentSaved={bumpBalances}
        balanceRefreshKey={balanceRefreshKey}
        highlightLeaveDayId={highlightLeaveDayId}
      />
    </CatalogPageShell>
  );
}
