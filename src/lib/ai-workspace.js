/** Module-scoped AI conversation starters (match active workspace). */

export const AI_WORKSPACE_STARTERS = {
  backoffice: [
    "Help me create a new product",
    "Create a sales order for a customer",
    "Which products are low on stock?",
    "Where do I record a stock receipt (GRN)?",
    "How do I create a purchase order (LPO)?",
    "Who are our top debtors?",
    "Where is the sales dashboard?",
  ],
  accounting: [
    "How do I post a journal entry?",
    "Where are accounts receivable?",
    "Record a partial payment for a customer invoice",
    "How do I add an expense?",
    "Which financial reports are available?",
    "Explain the chart of accounts",
  ],
  hr: [
    "How do I add a new employee?",
    "Where do I manage departments?",
    "How does payroll work?",
    "Where is attendance recorded?",
    "How do I run a payroll report?",
    "Where are leave requests?",
  ],
  distribution: [
    "How do I dispatch orders to a trip?",
    "Where do I assign a driver to an order?",
    "How do I record proof of delivery?",
    "Where are delivery routes managed?",
    "Which orders are ready for dispatch today?",
    "Where is the mobile route sales report?",
  ],
  admin: [
    "How do I add a new user?",
    "Where are roles and permissions?",
    "How do I configure sales settings?",
    "Where is the AI assistant configured?",
    "How do I manage branches?",
    "Which modules are enabled?",
  ],
  pos: [
    "How do I open a till session?",
    "How do I hold an order?",
    "Where is price check?",
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
    accounting: "Accounting",
    hr: "Human Resources",
    distribution: "Distribution",
    admin: "Administration",
    pos: "External POS",
  };

  return labels[workspaceId] ?? "Backoffice";
}
