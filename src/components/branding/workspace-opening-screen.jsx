"use client";

import { CentrixLogoFull } from "@/components/branding/centrix-logo";

/** Full-screen splash shown while a workspace/module is opening (Google Cloud–style). */
export function WorkspaceOpeningScreen({ message = "Opening" }) {
  return (
    <div
      className="workspace-opening-screen fixed inset-0 z-[200] flex items-center justify-center bg-white dark:bg-[#1a1d21]"
      role="status"
      aria-live="polite"
      aria-label={`${message} application`}
    >
      <div className="flex flex-col items-center gap-5 px-6">
        <div className="workspace-opening-logo">
          <CentrixLogoFull />
        </div>
        <p className="workspace-opening-text m-0 text-[15px] font-normal text-slate-500 dark:text-slate-400">
          {message}…
        </p>
      </div>
    </div>
  );
}
