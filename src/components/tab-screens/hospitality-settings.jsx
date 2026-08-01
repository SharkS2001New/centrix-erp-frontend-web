"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy hospitality settings path → Administration Hotel settings. */
export function HospitalitySettingsScreen() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/hotel-settings");
  }, [router]);
  return null;
}
