"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth-storage";
import { useAuth } from "@/contexts/auth-context";
import { buildAccessContext, resolveHomePath } from "@/lib/access-control";

export default function HomePage() {
  const router = useRouter();
  const { user, organization, capabilities, loading, isSuperAdmin } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    const ctx = buildAccessContext({
      user,
      organization,
      capabilities,
      requireTillFloat: capabilities?.require_till_float,
      isSuperAdmin,
    });
    router.replace(resolveHomePath(ctx));
  }, [capabilities, isSuperAdmin, loading, organization, router, user]);

  return (
    <div className="flex min-h-screen items-center justify-center text-slate-400">
      Redirecting…
    </div>
  );
}
