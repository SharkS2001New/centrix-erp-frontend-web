export function onboardingGuideStorageKey(userId, organizationId) {
  if (!userId || !organizationId) return null;
  return `centrix_onboarding_v1:user:${encodeURIComponent(String(userId))}:org:${encodeURIComponent(String(organizationId))}`;
}

export function onboardingDemoStorageKey(userId, organizationId) {
  if (!userId || !organizationId) return null;
  return `centrix_demo_v1:user:${encodeURIComponent(String(userId))}:org:${encodeURIComponent(String(organizationId))}`;
}

export function readOnboardingDemoStatus(key) {
  if (!key || typeof window === "undefined") return null;
  try {
    const status = window.localStorage.getItem(key);
    return status === "watched" || status === "later" ? status : null;
  } catch {
    return null;
  }
}

export function saveOnboardingDemoStatus(key, status) {
  if (!key || typeof window === "undefined" || !["watched", "later"].includes(status)) return;
  try {
    window.localStorage.setItem(key, status);
  } catch {
    // Keep the demo available if browser storage is disabled.
  }
  window.dispatchEvent(new CustomEvent("centrix:onboarding-demo-status", { detail: { key, status } }));
}

/** Self-serve Instant trial or paid monthly self-registered customers see the product demo. */
export function isEligibleForMonthlyCustomerDemo(organization, license) {
  if (organization?.registration_source !== "self_registered") return false;
  if (license?.is_trial === true || license?.status === "trialing" || license?.access === "trial") {
    return true;
  }
  return license?.billing_cycle === "monthly"
    && license?.status === "active"
    && Number(license?.plan_id) > 0
    && Number(license?.renewal_amount) > 0;
}

export function isSelfServeTrialOrganization(organization, license) {
  if (organization?.registration_source !== "self_registered") return false;
  return Boolean(
    license?.is_trial === true
      || license?.status === "trialing"
      || license?.access === "trial",
  );
}

export function guideDescriptionForNavItem(item = {}) {
  const label = String(item.label ?? "").trim();
  const text = `${label} ${item.href ?? ""} ${item.section ?? ""} ${item.group ?? ""}`.toLowerCase();
  const descriptions = [
    [/unit[s ]+of measure|uom/, "Set up the units used to count, purchase, and sell products, including any unit conversions."],
    [/retail package|packaging|product pack/, "Define product pack sizes and selling formats so packaged quantities and prices stay consistent."],
    [/sales analytics/, "Compare sales totals and trends by date, product, customer, or salesperson to spot what is driving revenue."],
    [/inventory analytics/, "Track stock value, movement, and availability to identify items that need replenishment or investigation."],
    [/business summary|dashboard/, "Review key business figures and recent activity, then follow dashboard links to investigate changes."],
    [/report builder/, "Create reusable reports by choosing a dataset, columns, filters, and output format."],
    [/report/, "Choose the reporting period and filters, inspect the results, then export or share the report."],
    [/product|catalogue|item/, "Create and maintain product details, categories, prices, and stock-tracking settings."],
    [/inventory|stock/, "Review stock levels and stock activity, then investigate shortages, adjustments, or movements."],
    [/supplier|purchase|lpo|procurement/, "Manage suppliers and purchasing records, from supplier details through purchase orders and received goods."],
    [/customer/, "Maintain customer contact and account details, then use them to follow sales, balances, and service activity."],
    [/sales|order|quotation|invoice/, "Create and follow sales transactions, checking order status, customer details, and payment progress."],
    [/till|point of sale|\\bpos\\b/, "Open the selling workspace to process customer purchases, take payments, and manage till sessions."],
    [/pricing|tax|vat/, "Configure prices and tax rules used to calculate accurate totals on sales and purchases."],
    [/employee|people|staff|user management/, "Maintain staff profiles and access details used by your organization’s workflows."],
    [/payroll/, "Prepare payroll, review employee pay and deductions, and check the run before processing it."],
    [/attendance|time clock|leave/, "Record staff time and leave, then review attendance entries and exceptions."],
    [/transfer|movement/, "Track stock or operational transfers between locations and verify each movement’s status."],
    [/expense/, "Record and categorize business spending, attach supporting details, and review expenses for reporting."],
    [/account|finance|bank|reconciliation/, "Review financial activity, reconcile transactions, and keep account balances aligned."],
    [/report|analytics/, "Use the available filters to review this area’s business activity and compare results over time."],
  ];

  return descriptions.find(([pattern]) => pattern.test(text))?.[1]
    ?? `Use ${label || "this page"} to manage its records and review the actions available in this area.`;
}

export function guideCardPosition(rect, viewportWidth, viewportHeight, {
  width = 380,
  height = 220,
  gap = 14,
  padding = 16,
} = {}) {
  const maxWidth = Math.max(0, Math.min(width, viewportWidth - padding * 2));
  const rightSpace = viewportWidth - rect.x - rect.width - gap - padding;
  const leftSpace = rect.x - gap - padding;
  const side = rightSpace >= Math.min(maxWidth, 280) || rightSpace >= leftSpace ? "right" : "left";
  const availableWidth = side === "right" ? rightSpace : leftSpace;
  const cardWidth = Math.min(maxWidth, Math.max(Math.min(maxWidth, 280), availableWidth));
  const left = side === "right"
    ? rect.x + rect.width + gap
    : rect.x - gap - cardWidth;
  const cardHeight = Math.min(height, viewportHeight - padding * 2);

  return {
    left: Math.max(padding, Math.min(left, viewportWidth - cardWidth - padding)),
    top: Math.max(
      padding,
      Math.min(rect.y + rect.height / 2 - cardHeight / 2, viewportHeight - cardHeight - padding),
    ),
    width: cardWidth,
  };
}

export function videoDemoEmbedUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();
  let videoId = "";
  if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] ?? "";
  } else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
    videoId =
      url.searchParams.get("v") ??
      url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] ??
      "";
  } else if (host === "youtube-nocookie.com" || host === "www.youtube-nocookie.com") {
    videoId = url.pathname.match(/^\/embed\/([^/]+)/)?.[1] ?? "";
  }

  if (/^[\w-]{11}$/.test(videoId)) {
    return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
  }

  if (["vimeo.com", "www.vimeo.com"].includes(host)) {
    const vimeoId = url.pathname.match(/^\/(\d+)\/?$/)?.[1];
    if (vimeoId) return `https://player.vimeo.com/video/${vimeoId}`;
  }

  return null;
}
