/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: "/pos", destination: "/sales/pos", permanent: false },
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
      { source: "/settings", destination: "/admin/settings", permanent: false },
      { source: "/users", destination: "/admin/users", permanent: false },
      { source: "/purchases", destination: "/lpo", permanent: false },
      { source: "/purchase-orders", destination: "/lpo", permanent: false },
      { source: "/finance/expenses", destination: "/expenses", permanent: false },
      { source: "/inventory/transfers", destination: "/inventory/transfers/new", permanent: false },
    ];
  },
};

export default nextConfig;
