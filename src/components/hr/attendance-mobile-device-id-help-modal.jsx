"use client";

import { FormModal } from "@/components/catalog/catalog-shared";

export function AttendanceMobileDeviceIdHelpModal({ open, onClose }) {
  return (
    <FormModal
      title="How to find the phone Device ID"
      open={open}
      onClose={onClose}
      onSubmit={onClose}
      submitLabel="Got it"
    >
      <div className="space-y-4 text-sm text-slate-700">
        <p>
          Each shared attendance phone gets a unique ID from the Centrix mobile app. Register that
          exact ID here so only authorized phones can mark attendance.
        </p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Install and open the <strong>Centrix</strong> app on the shared Android phone.
          </li>
          <li>
            Sign in with your organization code and complete attendance-phone setup if prompted.
          </li>
          <li>
            On the <strong>Attendance phone setup</strong> screen, copy the <strong>Device ID</strong>{" "}
            shown (tap copy if available).
          </li>
          <li>
            Paste it into <strong>Device ID</strong> when registering the phone below. It usually
            looks like <code className="rounded bg-slate-100 px-1">android:…</code> on Android or{" "}
            <code className="rounded bg-slate-100 px-1">ios:…</code> on iPhone.
          </li>
          <li>
            Select the branch this phone serves, save, then tap <strong>Refresh registration</strong>{" "}
            on the phone until it shows as authorized.
          </li>
        </ol>
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          The ID is tied to the physical phone. If you replace the handset, register the new Device
          ID and deactivate the old entry.
        </p>
      </div>
    </FormModal>
  );
}
