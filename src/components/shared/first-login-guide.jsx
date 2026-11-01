"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { onboardingGuideStorageKey, videoDemoEmbedUrl } from "@/lib/onboarding-guide";

const GUIDE_STEPS = [
  {
    title: "Start from your dashboard",
    description: "Use the dashboard to see your organisation at a glance and find the work areas available to your account.",
    href: "/dashboard",
    action: "Open dashboard",
  },
  {
    title: "Set up your products",
    description: "Add the products or services you sell, then keep prices and stock details up to date.",
    href: "/products",
    action: "Open products",
  },
  {
    title: "Record your first sale",
    description: "Use the sales workspace to create orders, take payments, and issue receipts.",
    href: "/sales",
    action: "Open sales",
  },
  {
    title: "Review reports and keep learning",
    description: "Check reports regularly to understand sales and organisation activity. You can reopen this guide any time from the top bar.",
    href: "/reports",
    action: "Open reports",
  },
];

const VIDEO_EMBED_URL = videoDemoEmbedUrl(process.env.NEXT_PUBLIC_ONBOARDING_DEMO_VIDEO_URL);
const OPEN_GUIDE_EVENT = "centrix:open-product-guide";

function wasGuideCompleted(key) {
  try {
    return window.localStorage.getItem(key) === "complete";
  } catch {
    return false;
  }
}

function saveGuideCompletion(key) {
  try {
    window.localStorage.setItem(key, "complete");
  } catch {
    // Keep the guide usable if browser storage is disabled.
  }
}

export function FirstLoginGuide() {
  const { user, organization, loading, isSuperAdmin } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [view, setView] = useState("tips");
  const [returnToChooser, setReturnToChooser] = useState(false);
  const storageKey = onboardingGuideStorageKey(user?.id, organization?.id);
  const choosingPlan =
    pathname === "/subscribe" ||
    pathname.startsWith("/subscribe/") ||
    pathname === "/billing" ||
    pathname.startsWith("/billing/");

  const finishGuide = useCallback(() => {
    if (storageKey && view !== "chooser") saveGuideCompletion(storageKey);
    setOpen(false);
    setView("tips");
    setReturnToChooser(false);
  }, [storageKey, view]);

  useEffect(() => {
    if (choosingPlan) {
      setOpen(false);
      return;
    }
    if (loading || !storageKey || isSuperAdmin?.()) return;
    if (!wasGuideCompleted(storageKey)) {
      setStepIndex(0);
      setView("tips");
      setOpen(true);
    }
  }, [choosingPlan, isSuperAdmin, loading, storageKey]);

  useEffect(() => {
    function openGuide(event) {
      setStepIndex(0);
      setView(event.detail === "tips" ? "tips" : "chooser");
      setReturnToChooser(false);
      setOpen(true);
    }

    window.addEventListener(OPEN_GUIDE_EVENT, openGuide);
    return () => window.removeEventListener(OPEN_GUIDE_EVENT, openGuide);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") finishGuide();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [finishGuide, open]);

  if (!open) return null;

  const step = GUIDE_STEPS[stepIndex];
  const displayName = String(user?.full_name ?? "").trim().split(/\s+/)[0];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <section
        className="theme-modal relative w-full max-w-xl overflow-hidden rounded-2xl border shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-login-guide-title"
      >
        <button
          type="button"
          onClick={finishGuide}
          className="theme-subtext absolute right-4 top-4 rounded-lg p-2 hover:bg-[var(--theme-hover)]"
          aria-label="Close system guide"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="p-6 sm:p-8">
          {view === "chooser" ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-primary)]">Help & guidance</p>
              <h2 id="first-login-guide-title" className="theme-heading mt-2 text-2xl font-semibold">
                What would you like help with?
              </h2>
              <p className="theme-subtext mt-2 text-sm">
                Watch a quick product demo or open step-by-step usage tips. You can close this any time.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setReturnToChooser(true);
                    setView("demo");
                  }}
                  className="theme-inset-panel flex items-start gap-3 rounded-xl border p-4 text-left hover:border-[var(--theme-primary)]"
                >
                  <Play className="mt-0.5 h-5 w-5 shrink-0 text-[var(--theme-primary)]" />
                  <span>
                    <span className="theme-heading block text-sm font-semibold">View Demo</span>
                    <span className="theme-subtext mt-1 block text-xs">See an overview of Centrix ERP.</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStepIndex(0);
                    setView("tips");
                  }}
                  className="theme-inset-panel flex items-start gap-3 rounded-xl border p-4 text-left hover:border-[var(--theme-primary)]"
                >
                  <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-[var(--theme-primary)]" />
                  <span>
                    <span className="theme-heading block text-sm font-semibold">Show Usage Tips</span>
                    <span className="theme-subtext mt-1 block text-xs">Follow the main steps for getting started.</span>
                  </span>
                </button>
              </div>
              <div className="mt-8 flex justify-end border-t border-[var(--theme-border)] pt-4">
                <button
                  type="button"
                  onClick={finishGuide}
                  className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-semibold"
                >
                  Close
                </button>
              </div>
            </>
          ) : view === "demo" ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-primary)]">Video demo</p>
              <h2 id="first-login-guide-title" className="theme-heading mt-2 text-2xl font-semibold">
                See Centrix in action
              </h2>
              {VIDEO_EMBED_URL ? (
                <div className="mt-5 aspect-video overflow-hidden rounded-xl bg-black">
                  <iframe
                    src={VIDEO_EMBED_URL}
                    title="Centrix ERP product demo"
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>
              ) : (
                <p className="theme-panel theme-subtext mt-5 rounded-xl border p-4 text-sm leading-6">
                  A demo video hasn’t been added yet. Set the
                  {" "}<code className="font-mono">NEXT_PUBLIC_ONBOARDING_DEMO_VIDEO_URL</code>
                  {" "}environment variable to a YouTube or Vimeo video, then rebuild the frontend.
                </p>
              )}
              <button
                type="button"
                onClick={() => setView(returnToChooser ? "chooser" : "tips")}
                className="theme-secondary-btn mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-[var(--theme-primary)]">
                <BookOpen className="h-5 w-5" aria-hidden />
                <p className="text-xs font-semibold uppercase tracking-wider">Getting started</p>
              </div>
              <h2 id="first-login-guide-title" className="theme-heading mt-3 text-2xl font-semibold">
                {displayName ? `Welcome, ${displayName}` : "Welcome to Centrix ERP"}
              </h2>
              <p className="theme-subtext mt-2 text-sm">
                Follow these steps to get comfortable with your organisation’s workspace.
              </p>
              <div className="mt-6 flex gap-1.5" aria-label={`Step ${stepIndex + 1} of ${GUIDE_STEPS.length}`}>
                {GUIDE_STEPS.map((item, index) => (
                  <span
                    key={item.title}
                    className={`h-1.5 flex-1 rounded-full ${index <= stepIndex ? "bg-[var(--theme-primary)]" : "bg-[var(--theme-border)]"}`}
                  />
                ))}
              </div>
              <p className="theme-subtext mt-5 text-xs font-medium">
                STEP {stepIndex + 1} OF {GUIDE_STEPS.length}
              </p>
              <h3 className="theme-heading mt-2 text-lg font-semibold">{step.title}</h3>
              <p className="theme-subtext mt-2 text-sm leading-6">{step.description}</p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href={step.href}
                  onClick={finishGuide}
                  className="theme-primary-btn inline-flex rounded-lg px-4 py-2.5 text-sm font-semibold"
                >
                  {step.action}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setReturnToChooser(false);
                    setView("demo");
                  }}
                  className="theme-secondary-btn inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold"
                >
                  <Play className="h-4 w-4" />
                  View Demo
                </button>
              </div>
              <div className="mt-8 flex items-center justify-between border-t border-[var(--theme-border)] pt-4">
                <button
                  type="button"
                  onClick={finishGuide}
                  className="theme-subtext rounded-lg px-2 py-2 text-sm hover:text-[var(--theme-text)]"
                >
                  Skip guide
                </button>
                <div className="flex gap-2">
                  {stepIndex > 0 ? (
                    <button
                      type="button"
                      onClick={() => setStepIndex((index) => index - 1)}
                      className="theme-secondary-btn inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Back
                    </button>
                  ) : null}
                  {stepIndex < GUIDE_STEPS.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => setStepIndex((index) => index + 1)}
                      className="theme-primary-btn inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-semibold"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={finishGuide}
                      className="theme-primary-btn rounded-lg px-4 py-2 text-sm font-semibold"
                    >
                      Finish
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export function openFirstLoginGuide(view = "chooser") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_GUIDE_EVENT, { detail: view }));
  }
}
