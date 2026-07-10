/** Admin guide for roles, permissions, and approval workflows. */

export const PERMISSIONS_DEPLOY_CHECKLIST = [
  "After upgrading Centrix or changing the permission registry, run: php artisan erp:permissions-sync",
  "Review Admin → Roles and confirm each approver role has the correct Approve permissions.",
  "Discount approvers need Administration → Discount approvals → Approve (legacy: Sales → Order actions → Approve).",
  "Org administrators see all module features in the UI, but approval actions still require explicit role permissions.",
  "Ask staff to sign out and back in after role changes so capabilities reload.",
];

export const RBAC_GUIDE_PARTS = [
  {
    id: "overview",
    title: "Roles & permissions",
    summary: "How Centrix decides what each user can see and do.",
    bullets: [
      "Every user has one role. Roles bundle feature permissions (view, create, edit, approve, delete).",
      "Capabilities on login expand manage aliases — e.g. Sales manage includes order approve for navigation, but approval API checks role-assigned permissions.",
      "Org administrator (is_admin) unlocks all modules in the UI; approvals still need explicit Approve permissions on the role unless your policy grants them.",
      "Use Admin → Users to assign roles; Admin → Roles to edit permission matrices.",
    ],
  },
  {
    id: "approvals",
    title: "Approval permissions",
    summary: "Who can approve discount, cancellation, HR, inventory, and accounting requests.",
    bullets: [
      "Discounts — Administration → Discount approvals → Approve (or legacy Sales → Order actions → Approve).",
      "Order cancellations — Sales → Order actions → Approve or Sales manage.",
      "Leave — HR → Leave → Approve or HR manage.",
      "Payroll runs — HR → Payroll runs → Approve or HR manage.",
      "Cash advances — HR → Cash advances → Approve or HR manage.",
      "LPOs — Purchasing → Purchase orders (LPO) → Approve.",
      "Supplier returns — Purchasing manage.",
      "Customer returns — Sales manage.",
      "Stock adjustments, transfers, damage — Inventory manage (when approval workflow is on).",
      "Stock take completion — Inventory → Stock take → Approve or Inventory manage.",
      "Journal entries — Accounting → Journal entries → Approve or Accounting manage.",
      "Expenses — Accounting manage.",
    ],
    tip: "Enable discount approval under Organization settings → Sales → Prices & discounts. Other workflows live under Manager approvals; configure bell alerts under Messaging.",
  },
  {
    id: "deploy",
    title: "After deploy or upgrade",
    summary: "Keep permissions in sync across environments.",
    bullets: PERMISSIONS_DEPLOY_CHECKLIST,
  },
];
