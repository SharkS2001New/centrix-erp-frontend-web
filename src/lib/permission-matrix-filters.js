import {
  isDiscountApprovalNavEnabled,
  isOrderCancellationNavEnabled,
  isOrderExpiryNavEnabled,
} from "@/lib/platform-org-features";
import {
  getSalesOrderQueueWorkflow,
  workflowPipelineSteps,
} from "@/lib/order-workflow";
import { orderQueueFeatureKey } from "@/lib/order-queue-permissions";
import { isOrgMobileSalesEnabled } from "@/lib/sales-settings";

const QUEUE_EXCLUDED_STATUSES = new Set(["draft", "held", "cancelled", "expired"]);

/**
 * Order-queue feature keys that should appear in Admin → Roles / Users,
 * based on the org's enabled sales workflow + mobile / terminal queues.
 */
export function visibleOrderQueueFeatureKeys(capabilities) {
  const keys = new Set(["order_queue_all"]);
  const workflow = getSalesOrderQueueWorkflow(capabilities, "backend");

  for (const step of workflowPipelineSteps(workflow)) {
    if (QUEUE_EXCLUDED_STATUSES.has(step.key)) continue;
    keys.add(orderQueueFeatureKey(step.key));
  }

  if (isDiscountApprovalNavEnabled(capabilities)) {
    keys.add("order_queue_pending_approval");
    keys.add("order_queue_editable");
  }
  if (isOrderCancellationNavEnabled(capabilities)) {
    keys.add("order_queue_cancelled");
  }
  if (isOrderExpiryNavEnabled(capabilities)) {
    keys.add("order_queue_expired");
  }
  if (isOrgMobileSalesEnabled(capabilities)) {
    keys.add("order_queue_mobile");
  }

  return keys;
}

function featureKeyFromPermissionCode(code) {
  const text = String(code ?? "");
  const match = text.match(/^sales\.(order_queue_[a-z0-9_]+)\./i);
  return match ? match[1].toLowerCase() : null;
}

function permissionCodesForFeature(feature) {
  return (feature?.permissions ?? [])
    .map((perm) => perm?.code ?? perm?.permission_code ?? perm?.permission_name ?? perm?.name)
    .filter(Boolean)
    .map(String);
}

function isMobileSalesFeature(feature, groupModule = null) {
  const moduleKey = String(groupModule ?? feature?.module ?? "").toLowerCase();
  if (moduleKey === "mobile_sales" || moduleKey.startsWith("mobile_sales.")) return true;
  const key = String(feature?.key ?? "").toLowerCase();
  if (key.startsWith("mobile_") || key.includes("mobile_order")) return true;
  return permissionCodesForFeature(feature).some((code) =>
    code.toLowerCase().startsWith("mobile_sales."),
  );
}

function isOrderQueueFeature(feature) {
  const key = String(feature?.key ?? "").toLowerCase();
  if (key.startsWith("order_queue_")) return true;
  return permissionCodesForFeature(feature).some((code) => featureKeyFromPermissionCode(code));
}

function isNotificationsFeature(feature, groupModule = null) {
  const key = String(feature?.key ?? "").toLowerCase();
  if (key === "notifications" || key === "admin_notifications") return true;
  return permissionCodesForFeature(feature).some((code) => {
    const c = code.toLowerCase();
    return c === "admin.notifications.view" || c.startsWith("admin.notifications.");
  });
}

function keepFeature(feature, { visibleQueues, mobileEnabled }, groupModule = null) {
  if (isNotificationsFeature(feature, groupModule)) {
    return false;
  }

  if (isOrderQueueFeature(feature)) {
    const key = String(feature?.key ?? "").toLowerCase();
    if (key.startsWith("order_queue_")) return visibleQueues.has(key);
    const fromCode = permissionCodesForFeature(feature)
      .map(featureKeyFromPermissionCode)
      .find(Boolean);
    return fromCode ? visibleQueues.has(fromCode) : true;
  }

  if (isMobileSalesFeature(feature, groupModule)) {
    return mobileEnabled;
  }

  return true;
}

function filterPermissionGroup(group, options) {
  const features = (group?.features ?? []).filter((feature) =>
    keepFeature(feature, options, group?.module),
  );
  if (!features.length) return null;
  return { ...group, features };
}

/**
 * Strip workflow stages that are disabled for this org (e.g. Booked when the
 * pipeline is Unpaid / Partially paid / Paid only), and hide mobile_sales /
 * Mobile Orders queue rows until mobile orders are enabled.
 */
export function filterPermissionMatrixForCapabilities(
  { applications = [], groups = [] } = {},
  capabilities = null,
) {
  const options = {
    visibleQueues: visibleOrderQueueFeatureKeys(capabilities),
    mobileEnabled: isOrgMobileSalesEnabled(capabilities),
  };

  const nextApplications = (applications ?? [])
    .map((application) => {
      const modules = (application?.modules ?? [])
        .map((group) => filterPermissionGroup(group, options))
        .filter(Boolean);
      if (!modules.length) return null;
      return { ...application, modules };
    })
    .filter(Boolean);

  const nextGroups = (groups ?? [])
    .map((group) => filterPermissionGroup(group, options))
    .filter(Boolean);

  return {
    applications: nextApplications,
    groups: nextGroups,
  };
}
