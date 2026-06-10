"use client";

const ACTION_LABELS = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  approve: "Approve",
};

export function PermissionMatrix({ matrix, assignedIds, onToggle }) {
  return (
    <div>
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">Module</th>
            {Object.values(ACTION_LABELS).map((label) => (
              <th key={label} className="px-3 py-2 text-center">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {matrix.map((row) => (
            <tr key={row.module}>
              <td className="px-3 py-2 font-medium text-slate-800">{row.label}</td>
              {Object.keys(ACTION_LABELS).map((action) => {
                const perm = row.cells[action];
                return (
                  <td key={action} className="px-3 py-2 text-center">
                    {perm ? (
                      <input
                        type="checkbox"
                        checked={assignedIds.has(perm.id)}
                        onChange={() => onToggle(perm.id)}
                        title={perm.permission_name}
                      />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {matrix.some((row) => row.extras.length > 0) ? (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Additional permissions
          </p>
          <div className="space-y-2">
            {matrix.flatMap((row) =>
              row.extras.map((perm) => (
                <label key={perm.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={assignedIds.has(perm.id)}
                    onChange={() => onToggle(perm.id)}
                  />
                  <span>
                    {row.label} — {perm.permission_name}
                  </span>
                </label>
              )),
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
