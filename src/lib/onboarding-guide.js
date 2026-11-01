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

export function isEligibleForMonthlyCustomerDemo(organization, license) {
  return organization?.registration_source === "self_registered"
    && license?.billing_cycle === "monthly"
    && license?.status === "active"
    && license?.is_trial !== true
    && Number(license?.plan_id) > 0
    && Number(license?.renewal_amount) > 0;
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
