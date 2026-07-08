const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "frame-src 'self' https://www.openstreetmap.org",
      "connect-src 'self' https: wss: ws: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* https://cloudflareinsights.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

if (process.env.NODE_ENV === "production") {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  });
}

const immutableAssetHeaders = [
  { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: immutableAssetHeaders,
      },
      {
        source: "/branding/:path*",
        headers: immutableAssetHeaders,
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      { source: "/pos/tills", destination: "/sales/till-management", permanent: false },
      { source: "/tills", destination: "/sales/till-management?tab=tills", permanent: false },
      { source: "/till-management", destination: "/sales/till-management", permanent: false },
      { source: "/reports/end-of-day", destination: "/sales/end-of-day", permanent: false },
      { source: "/reports/end-of-day-sales", destination: "/sales/end-of-day", permanent: false },
      { source: "/sales/end-of-day-sales", destination: "/sales/end-of-day", permanent: false },
      { source: "/sales/x-report", destination: "/sales/pos", permanent: false },
      { source: "/sales/z-report", destination: "/sales/till-management?tab=history", permanent: false },
      { source: "/sales/close-session", destination: "/sales/pos", permanent: false },
      { source: "/sales/active-session", destination: "/sales/pos", permanent: false },
      { source: "/settings", destination: "/admin", permanent: false },
      { source: "/users", destination: "/admin/users", permanent: false },
      { source: "/purchases", destination: "/lpo", permanent: false },
      { source: "/purchase-orders", destination: "/lpo", permanent: false },
      { source: "/finance/expenses", destination: "/expenses", permanent: false },
      { source: "/admin/organizations/new", destination: "/platform/organizations/new", permanent: false },
      { source: "/admin/organizations/:id", destination: "/platform/organizations/:id", permanent: false },
      { source: "/pos-login", destination: "/login", permanent: false },
      { source: "/orders/:id", destination: "/sales/orders/:id", permanent: false },
    ];
  },
};

export default nextConfig;
