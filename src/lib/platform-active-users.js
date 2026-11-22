function sessionBranch(session) {
  const branchId = session?.branch_id ?? session?.branch?.id;
  const branchName =
    session?.branch_name ??
    session?.branch?.branch_name ??
    session?.branch?.name ??
    (branchId != null ? `Branch #${branchId}` : "Branch not identified");
  return {
    key: branchId != null ? `id:${branchId}` : `name:${branchName}`,
    name: branchName,
  };
}

export function groupActiveSessionsByBranch(organization, sessions = []) {
  const groupsByKey = new Map();
  for (const session of sessions) {
    const branch = sessionBranch(session);
    const group = groupsByKey.get(branch.key) ?? { ...branch, sessions: [] };
    group.sessions.push(session);
    groupsByKey.set(branch.key, group);
  }

  const groups = Array.from(groupsByKey.values());
  const reportedBranchCount = Number(
    organization?.branch_count ??
      organization?.branches?.length ??
      organization?.catalog?.branch_count ??
      0,
  );
  const hasMultipleBranches =
    organization?.multi_branch === true ||
    organization?.multi_branch === 1 ||
    reportedBranchCount > 1 ||
    groups.length > 1;

  return { groups, hasMultipleBranches };
}
