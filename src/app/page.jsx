"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { hasAuthSession } from "@/lib/auth-storage";
import { useAuth } from "@/contexts/auth-context";
import { buildAccessContext, resolveHomePath, resolveTillFloatNavFlag } from "@/lib/access-control";

export default function HomePage() {
  const router = useRouter();
  const { user, organization, capabilities, isSuperAdmin } = useAuth();

  useEffect(() => {
    if (!hasAuthSession()) {
      router.replace("/login");
      return;
    }
    const ctx = buildAccessContext({
      user,
      organization,
      capabilities,
      requireTillFloat: resolveTillFloatNavFlag(capabilities),
      isSuperAdmin,
    });
    router.replace(resolveHomePath(ctx));
  }, [capabilities, isSuperAdmin, organization, router, user]);

  return (
    <div className="flex min-h-screen items-center justify-center text-slate-400">
      Redirecting…
    </div>
  );
}
