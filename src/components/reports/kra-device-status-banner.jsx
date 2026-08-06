"use client";

import Link from "next/link";
import { isKraDeviceConfigured, isKraFiscalizationActive } from "@/lib/finance-settings";
import { OrgSettingsPlatformHint } from "@/components/admin/org-settings-platform-hint";

export function KraDeviceStatusBanner({
  capabilities,
  deviceStatus = null,
  settingsHref = null,
}) {
  const kraConfigured = isKraDeviceConfigured(capabilities?.module_settings, capabilities);
  const kraFiscalizationActive = isKraFiscalizationActive(
    capabilities?.module_settings,
    capabilities,
  );

  if (kraConfigured) {
    return (
      <p
        className={`rounded-lg border px-3 py-2 text-sm ${
          !kraFiscalizationActive
            ? "border-slate-200 bg-slate-50 text-slate-800"
            : deviceStatus?.reachable
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        KRA device is <strong>configured</strong>
        {deviceStatus?.device_ip ? ` (${deviceStatus.device_ip})` : ""}.
        {kraFiscalizationActive ? (
          <>
            {" "}
            Sales fiscalization is <strong>on</strong>.
          </>
        ) : (
          <>
            {" "}
            Sales fiscalization is <strong>off</strong> — new sales will not call the device.
          </>
        )}
        {deviceStatus?.bypass_above_amount ? (
          <>
            {" "}
            Orders at or above KES {Number(deviceStatus.bypass_above_amount).toLocaleString()} bypass KRA.
          </>
        ) : null}
        {deviceStatus?.message ? ` ${deviceStatus.message}` : ""}
        {deviceStatus?.test_mode ? " Test mode is on." : null}
      </p>
    );
  }

  return (
    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
      KRA device is <strong>not configured</strong>. Set it up under{" "}
      {settingsHref ? (
        <Link href={settingsHref} className="font-medium text-[#185FA5] hover:underline">
          Organization settings → Finance
        </Link>
      ) : (
        <OrgSettingsPlatformHint area="Organization settings → Finance" />
      )}{" "}
      (device IP, serial, PIN) before checkout can submit fiscal receipts.
    </p>
  );
}
