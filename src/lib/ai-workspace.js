/** Module-scoped AI conversation starters (match active workspace). Keep short and varied. */

export const AI_WORKSPACE_STARTERS = {
  backoffice: [
    "Help",
    "Create a new product",
    "Which products are low on stock?",
    "Create a purchase order (LPO)",
    "Who are our top debtors?",
  ],
  hospitality_backoffice: [
    "Help",
    "Where is front desk check-in?",
    "How do I open a guest folio?",
    "How do I run night audit?",
    "Where is housekeeping?",
  ],
  hotel_bar_pos: [
    "Help",
    "How do I open a bar check?",
    "How do I room-charge a check to a folio?",
    "Where do I settle a hotel POS check?",
    "Where are held / unpaid checks?",
  ],
  accounting: [
    "Help",
    "How do I post a journal entry?",
    "How do I do bank reconciliation?",
    "How do I add an expense?",
    "Which financial reports are available?",
  ],
  hr: [
    "Help",
    "How do I add a new employee?",
    "How does payroll work?",
    "Where is attendance recorded?",
    "Where are leave requests?",
  ],
  distribution: [
    "Help",
    "How do I dispatch orders to a trip?",
    "How do I record proof of delivery?",
    "Where are delivery routes managed?",
    "Which orders are ready for dispatch today?",
  ],
  admin: [
    "Help",
    "How do I add a new user?",
    "Where are roles and permissions?",
    "How do I configure sales settings?",
    "Which modules are enabled?",
  ],
  pos: [
    "Help",
    "How do I open a till session?",
    "How do I hold an order?",
    "How do I reprint the last receipt?",
    "Explain checkout with M-Pesa",
  ],
};

export function aiStartersForWorkspace(workspaceId) {
  return AI_WORKSPACE_STARTERS[workspaceId] ?? AI_WORKSPACE_STARTERS.backoffice;
}

export function aiWorkspaceLabel(workspaceId, capabilities) {
  const fromApi = capabilities?.workspaces?.find((w) => w.id === workspaceId);
  if (fromApi?.label) return fromApi.label;

  const labels = {
    backoffice: "Backoffice",
    hospitality_backoffice: "Hotel Backoffice",
    hotel_bar_pos: "Hotel POS",
    accounting: "Accounting",
    hr: "Human Resources",
    distribution: "Distribution",
    admin: "Administration",
    pos: "External POS",
  };

  return labels[workspaceId] ?? "Backoffice";
}
