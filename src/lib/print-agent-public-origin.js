/**
 * Resolve the public ERP origin for print-agent bootstrap scripts.
 * Behind reverse proxies, request.url often points at localhost:3000 instead of the live URL.
 */

function firstHeaderValue(value) {
  if (!value) return null;
  return value.split(",")[0]?.trim() || null;
}

function isInternalHost(hostOrOrigin) {
  const host = hostOrOrigin.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
  return (
    host.startsWith("localhost")
    || host.startsWith("127.")
    || host.endsWith(".internal")
    || host === "0.0.0.0"
  );
}

function originFromEnv() {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
  ];

  for (const raw of candidates) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    try {
      return new URL(trimmed).origin;
    } catch {
      // ignore invalid env values
    }
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`;
  }

  return null;
}

function allowedHostsFromRequest(request) {
  const hosts = new Set();
  for (const header of ["x-forwarded-host", "host"]) {
    const value = firstHeaderValue(request.headers.get(header));
    if (value) {
      hosts.add(value.toLowerCase());
    }
  }
  return hosts;
}

function originFromParam(param, request) {
  if (!param) return null;

  try {
    const parsed = new URL(param);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    const allowed = allowedHostsFromRequest(request);
    const serverLooksInternal = [...allowed].every(isInternalHost);

    if (
      allowed.size > 0
      && !serverLooksInternal
      && !allowed.has(parsed.host.toLowerCase())
    ) {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

function originFromForwardedHeaders(request) {
  const host = firstHeaderValue(request.headers.get("x-forwarded-host"))
    ?? firstHeaderValue(request.headers.get("host"));
  if (!host) return null;

  const proto = firstHeaderValue(request.headers.get("x-forwarded-proto"))
    ?? (process.env.NODE_ENV === "production" ? "https" : "http");

  return `${proto}://${host}`;
}

/**
 * @param {Request} request
 * @returns {string}
 */
export function resolvePrintAgentPublicOrigin(request) {
  const url = new URL(request.url);

  // Browser passes window.location.origin — most reliable on live deployments.
  const fromParam = originFromParam(url.searchParams.get("origin"), request);
  if (fromParam) return fromParam;

  const fromEnv = originFromEnv();
  if (fromEnv) return fromEnv;

  const fromForwarded = originFromForwardedHeaders(request);
  if (fromForwarded && !isInternalHost(fromForwarded)) {
    return fromForwarded;
  }

  if (fromForwarded) return fromForwarded;

  return url.origin;
}
