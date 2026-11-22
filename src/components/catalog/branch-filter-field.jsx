"use client";

import { useEffect, useRef } from "react";
import { Field, FilterSelect } from "@/components/catalog/catalog-shared";
import { useTabPaneActive } from "@/contexts/tab-pane-activity-context";
import { useBranchScope } from "@/hooks/use-branch-scope";
import { useGlobalBranchId } from "@/hooks/use-global-branch-id";

export function BranchFilterField({ value, onChange, branches = [], allLabel = "All branches" }) {
  const { showBranchFilter } = useBranchScope();
  const globalBranchId = useGlobalBranchId();
  const { isActive } = useTabPaneActive();
  const manuallyChanged = useRef(false);
  const previousGlobalBranchId = useRef(globalBranchId);
  const options = [
    { value: "", label: allLabel },
    ...branches.map((branch) => ({
      value: String(branch.id),
      label: branch.branch_name ?? `Branch #${branch.id}`,
    })),
  ];

  useEffect(() => {
    if (!isActive) return;
    const globalBranchChanged = previousGlobalBranchId.current !== globalBranchId;
    previousGlobalBranchId.current = globalBranchId;
    if (globalBranchChanged) manuallyChanged.current = false;
    if (manuallyChanged.current) return;
    if (!globalBranchId && !globalBranchChanged) return;
    if ((value ?? "") !== globalBranchId) onChange(globalBranchId);
  }, [globalBranchId, isActive, onChange, value]);

  if (!showBranchFilter) return null;

  return (
    <Field label="Branch">
      <FilterSelect
        value={value ?? ""}
        onChange={(e) => {
          manuallyChanged.current = true;
          onChange(e.target.value);
        }}
        options={options}
      />
    </Field>
  );
}
