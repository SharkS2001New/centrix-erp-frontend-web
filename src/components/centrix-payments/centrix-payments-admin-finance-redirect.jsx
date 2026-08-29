"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { resolveAdminFinanceRedirect } from "@/lib/centrix-payments-routes";

/**
 * Sends users to Centrix Payments when legacy Administration finance routes are opened
 * while the Centrix Payments application is enabled for the organization.
 */
export function CentrixPaymentsAdminFinanceRedirect({ adminPath, children }) {
  const router = useRouter();
  const { capabilities } = useAuth();
  const target = resolveAdminFinanceRedirect(adminPath, capabilities);

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (target) return null;
  return children;
}
