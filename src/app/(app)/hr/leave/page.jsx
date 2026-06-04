"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { OrganizationLeaveSettingsEditor } from "@/components/hr/organization-leave-settings-editor";
import {
  KenyaLeavePolicyAside,
  LeaveAssignmentSection,
} from "@/components/hr/leave-assignment-section";
import { isAdminUser } from "@/components/hr/hr-shared";
import { useAuth } from "@/contexts/auth-context";

export default function HrLeavePage() {
  const { user } = useAuth();
  const isAdmin = isAdminUser(user);
  const [employees, setEmployees] = useState([]);
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);
  const [tab, setTab] = useState("assignments");

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
          ? "Configure organization leave defaults, then assign leave and off days per employee"
          : "View remaining balances and assign leave and off days by employee"
      }
    >
      {isAdmin ? (
        <div className="mb-6 inline-flex rounded-lg border border-slate-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setTab("settings")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === "settings"
                ? "bg-[#185FA5] text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Leave settings
          </button>
          <button
            type="button"
            onClick={() => setTab("assignments")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === "assignments"
                ? "bg-[#185FA5] text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Leave & off days by employee
          </button>
        </div>
      ) : null}

      {tab === "settings" && isAdmin ? (
        <div className="space-y-8">
          <KenyaLeavePolicyAside />
          <OrganizationLeaveSettingsEditor isAdmin={isAdmin} />
        </div>
      ) : (
        <LeaveAssignmentSection
          employees={employees}
          onAssignmentSaved={bumpBalances}
          balanceRefreshKey={balanceRefreshKey}
        />
      )}
    </CatalogPageShell>
  );
}
