"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { onboardingGuideStorageKey, videoDemoEmbedUrl } from "@/lib/onboarding-guide";

const GUIDE_STEPS = [
  {
    title: "Your dashboard",
    description: "A quick look at revenue, invoices, and what needs your attention today.",
    target: "dashboard",
  },
  {
    title: "Your customers",
    description: "Keep customer details and account activity together so your team can serve them consistently.",
    target: "customers",
  },
  {
    title: "Products and services",
    description: "Set up the products or services you sell, including prices and stock details.",
    target: "products",
  },
  {
    title: "Record sales",
    description: "Use the sales workspace to create orders, record payments, and issue receipts.",
    target: "sales",
  },
  {
    title: "Purchasing and stock",
    description: "Manage purchasing activity and keep stock levels up to date as your business operates.",
    target: "purchases",
  },
  {
    title: "Reports",
    description: "Review reports to understand sales and organisation activity.",
    target: "reports",
  },
  {
    title: "Need a hand?",
    description: "You can reopen this guide any time from Help in the top bar, or watch the optional product demo.",
    target: null,
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
  const [targetRect, setTargetRect] = useState(null);
  const [cardPosition, setCardPosition] = useState(null);
  const storageKey = onboardingGuideStorageKey(user?.id, organization?.id);
  const choosingPlan =
    pathname === "/subscribe" ||
    pathname.startsWith("/subscribe/") ||
    pathname === "/billing" ||
    pathname.startsWith("/billing/");
  const step = GUIDE_STEPS[stepIndex];

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

  useEffect(() => {
    if (!open || view !== "tips") {
      setTargetRect(null);
      setCardPosition(null);
      return undefined;
    }

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = step?.target
          ? Array.from(document.querySelectorAll(`[data-guide-target="${step.target}"]`))
              .find((element) => {
                const bounds = element.getBoundingClientRect();
                return bounds.width > 0 && bounds.height > 0;
              })
          : null;
        const rect = target?.getBoundingClientRect();
        const nextRect = rect && rect.width > 0 && rect.height > 0
          ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          : null;
        setTargetRect(nextRect);

        const cardWidth = Math.min(600, window.innerWidth - 32);
        const cardHeight = Math.min(330, window.innerHeight - 32);
        let left = (window.innerWidth - cardWidth) / 2;
        let top = (window.innerHeight - cardHeight) / 2;
        if (nextRect && window.innerWidth >= 760) {
          const rightSide = nextRect.x + nextRect.width + 32;
          const leftSide = nextRect.x - cardWidth - 32;
          if (rightSide + cardWidth <= window.innerWidth - 16) {
            left = rightSide;
          } else if (leftSide >= 16) {
            left = leftSide;
          }
          top = nextRect.y + nextRect.height / 2 - cardHeight / 2;
        } else if (nextRect) {
          top = nextRect.y + nextRect.height + 24;
          if (top + cardHeight > window.innerHeight - 16) {
            top = nextRect.y - cardHeight - 24;
          }
        }
        setCardPosition({
          left: Math.max(16, Math.min(left, window.innerWidth - cardWidth - 16)),
          top: Math.max(16, Math.min(top, window.innerHeight - cardHeight - 16)),
          width: cardWidth,
        });
      });
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(document.documentElement);
    const mutationObserver = new MutationObserver(measure);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [open, step, view]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120]">
      {view === "tips" && targetRect ? (
        <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <mask id="product-guide-spotlight">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={targetRect.x - 6}
                y={targetRect.y - 6}
                width={targetRect.width + 12}
                height={targetRect.height + 12}
                rx="18"
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(2, 8, 20, 0.78)"
            mask="url(#product-guide-spotlight)"
          />
        </svg>
      ) : (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
      )}
      {view === "tips" && targetRect ? (
        <div
          className="pointer-events-none absolute rounded-[20px] ring-4 ring-blue-400/80 shadow-[0_0_34px_rgba(59,130,246,0.28)]"
          style={{
            left: targetRect.x - 6,
            top: targetRect.y - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
          aria-hidden="true"
        />
      ) : null}
      <section
        className={`theme-modal absolute w-[min(600px,calc(100vw-32px))] overflow-hidden rounded-[24px] border border-slate-700/80 shadow-2xl ${
          view === "tips" && cardPosition
            ? ""
            : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        }`}
        style={view === "tips" && cardPosition
          ? { left: cardPosition.left, top: cardPosition.top, width: cardPosition.width }
          : undefined}
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
              <div className="flex items-center gap-1.5" aria-label={`Step ${stepIndex + 1} of ${GUIDE_STEPS.length}`}>
                {GUIDE_STEPS.map((item, index) => (
                  <span
                    key={item.title}
                    className={`h-3 w-3 rounded-full transition-all ${
                      index === stepIndex
                        ? "w-8 bg-blue-400"
                        : index < stepIndex
                          ? "bg-blue-400/65"
                          : "bg-slate-500/60"
                    }`}
                  />
                ))}
              </div>
              <h2 id="first-login-guide-title" className="theme-heading mt-6 text-2xl font-semibold">
                {step.title}
              </h2>
              <p className="theme-subtext mt-3 text-base leading-7">{step.description}</p>
              {stepIndex === GUIDE_STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    setReturnToChooser(false);
                    setView("demo");
                  }}
                  className="theme-secondary-btn mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
                >
                  <Play className="h-4 w-4" />
                  View Demo
                </button>
              ) : null}
              <div className="mt-7 flex items-center justify-between">
                <button
                  type="button"
                  onClick={finishGuide}
                  className="theme-subtext rounded-lg px-1 py-2 text-sm font-semibold hover:text-[var(--theme-text)]"
                >
                  Skip
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
                      className="theme-primary-btn inline-flex items-center gap-1 rounded-xl px-5 py-2.5 text-base font-semibold"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={finishGuide}
                      className="theme-primary-btn rounded-xl px-5 py-2.5 text-base font-semibold"
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
