"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PLATFORM_AI_TRAINING_LINKS } from "@/lib/platform-ai-training-nav";

export function PlatformAiTrainingNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-[var(--theme-border)] pb-3">
      {PLATFORM_AI_TRAINING_LINKS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href || pathname === `${tab.href}/`
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-lg px-3 py-1.5 text-xs transition ${
              active ? "theme-tab-active" : "theme-tab-inactive"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function PlatformAiTrainingAlerts({ error, message, onDismissError, onDismissMessage }) {
  return (
    <>
      {error ? (
        <p className="theme-alert-error mb-4 rounded-lg px-4 py-3 text-sm">
          {error}
          {onDismissError ? (
            <button type="button" onClick={onDismissError} className="ml-2 underline">
              Dismiss
            </button>
          ) : null}
        </p>
      ) : null}
      {message ? (
        <p className="theme-alert-success mb-4 rounded-lg px-4 py-3 text-sm">
          {message}
          {onDismissMessage ? (
            <button type="button" onClick={onDismissMessage} className="ml-2 underline">
              Dismiss
            </button>
          ) : null}
        </p>
      ) : null}
    </>
  );
}
