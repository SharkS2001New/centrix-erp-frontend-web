"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/api";
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
    target: "suppliers",
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

const MODULE_TIPS = [
  {
    title: "Platform administration",
    description: "Manage platform-wide settings, plans, payment integrations, and tenant support from the platform workspace.",
    target: "platform",
  },
  {
    title: "Your dashboard",
    description: "A quick look at revenue, invoices, and what needs your attention today.",
    target: "dashboard",
  },
  {
    title: "Products and services",
    description: "Create products, set selling prices, organize categories, and maintain units of measure.",
    target: "products",
  },
  {
    title: "Till operations",
    description: "Open a till session, record in-person sales, and balance cash at the end of the day.",
    target: "pos",
  },
  {
    title: "Pricing and tax",
    description: "Review tax rates and price changes so products are charged consistently.",
    target: "pricing_tax",
  },
  {
    title: "Sales and orders",
    description: "Track customer orders from creation through fulfilment, payment, and completion.",
    target: "sales_orders",
  },
  {
    title: "Shop debtors",
    description: "Review customer credit balances, follow up outstanding amounts, and record repayments.",
    target: "shop_debtors",
  },
  {
    title: "Field sales",
    description: "Coordinate field teams, assigned routes, and orders captured away from the till.",
    target: "field_sales",
  },
  {
    title: "After sales",
    description: "Handle returns and customer follow-ups while keeping the original sale easy to trace.",
    target: "after_sales",
  },
  {
    title: "Promotions and loyalty",
    description: "Configure promotions and customer rewards, then monitor their use during sales.",
    target: "promotions",
  },
  {
    title: "Customers",
    description: "Keep customer contacts and account activity together to support service and follow-up.",
    target: "customers",
  },
  {
    title: "Expenses",
    description: "Record business expenses with categories and supporting details for review and reporting.",
    target: "expenses",
  },
  {
    title: "Investors",
    description: "Maintain investor records and review the related contributions and account activity.",
    target: "investors",
  },
  {
    title: "Inventory",
    description: "Check stock on hand, investigate low-stock items, and keep product availability current.",
    target: "inventory",
  },
  {
    title: "Stock movements",
    description: "Trace stock transfers and adjustments to understand where inventory changed and why.",
    target: "stock_movements",
  },
  {
    title: "Suppliers and purchasing",
    description: "Maintain supplier details and use purchase workflows to replenish stock and track costs.",
    target: "suppliers",
  },
  {
    title: "Accounting and finance",
    description: "Review accounts, journals, and reconciliations to keep financial records complete.",
    target: "accounting",
  },
  {
    title: "People",
    description: "Set up employee profiles and organize your team before assigning HR workflows.",
    target: "hr_people",
  },
  {
    title: "Time and attendance",
    description: "Record attendance and review time entries to keep staff schedules and attendance accurate.",
    target: "hr_time_attendance",
  },
  {
    title: "Payroll",
    description: "Prepare payroll using employee pay details, then review the run before finalizing it.",
    target: "hr_payroll",
  },
  {
    title: "Performance",
    description: "Set performance goals and review progress to keep employee feedback and evaluations organized.",
    target: "hr_performance",
  },
  {
    title: "Fleet and routes",
    description: "Manage vehicles and routes, and monitor assignments that support distribution work.",
    target: "distribution_fleet",
  },
  {
    title: "Distribution orders",
    description: "Follow distribution orders through picking, dispatch, delivery, and completion.",
    target: "distribution_orders",
  },
  {
    title: "Distribution operations",
    description: "Coordinate day-to-day distribution tasks and check operational progress in one place.",
    target: "distribution_ops",
  },
  {
    title: "Reports",
    description: "Choose a report, set the relevant date range and filters, then export or share the results.",
    target: "reports",
  },
  {
    title: "Hospitality dashboard",
    description: "Review hospitality activity and use the dashboard to spot service or sales tasks needing attention.",
    target: "hospitality_dashboard",
  },
  {
    title: "Rooms and guests",
    description: "Manage room availability and guest details throughout the stay.",
    target: "hospitality_rooms",
  },
  {
    title: "Hospitality sales",
    description: "Record guest orders and payments, and follow hospitality sales through to settlement.",
    target: "hospitality_sales",
  },
  {
    title: "Hospitality operations",
    description: "Coordinate service tasks and monitor operational activity across the venue.",
    target: "hospitality_ops",
  },
  {
    title: "Menu and products",
    description: "Maintain menu items, prices, and product details used by hospitality sales.",
    target: "hospitality_catalogue",
  },
  {
    title: "Hospitality stock",
    description: "Receive stock and monitor ingredient or product levels used in hospitality operations.",
    target: "hospitality_stock",
  },
  {
    title: "Hospitality purchasing",
    description: "Manage supplier purchasing for the venue and keep incoming stock traceable.",
    target: "hospitality_purchasing",
  },
  {
    title: "Driving school",
    description: "Manage student activity and driving lesson workflows from the school workspace.",
    target: "driving_front",
  },
  {
    title: "Driving school people and vehicles",
    description: "Maintain instructor, learner, and vehicle details used to schedule lessons.",
    target: "driving_fleet",
  },
  {
    title: "Driving school fees and reports",
    description: "Track fee payments and use reports to review learner and school activity.",
    target: "driving_money",
  },
  {
    title: "SPA and Kinyozi",
    description: "Manage appointments, services, and customer sales for your salon or spa.",
    target: "spa",
  },
  {
    title: "Organization dashboard",
    description: "Review organization-level activity and use the admin workspace to manage operations.",
    target: "admin_dashboard",
  },
  {
    title: "Organization settings",
    description: "Keep organization details, business preferences, and operational settings up to date.",
    target: "admin_organization",
  },
  {
    title: "User management",
    description: "Invite users, assign roles, and grant only the permissions each person needs.",
    target: "admin_users",
  },
  {
    title: "Organization finance",
    description: "Review organization payment and finance settings, and check account activity.",
    target: "admin_finance",
  },
  {
    title: "Tax administration",
    description: "Review tax settings and compliance details before processing taxable transactions.",
    target: "admin_tax",
  },
  {
    title: "Need a hand?",
    description: "You can reopen this guide any time from Help in the top bar, or watch the optional product demo.",
    target: null,
  },
];

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

function getAvailableModuleTips() {
  return MODULE_TIPS.filter((item) =>
    item.target && document.querySelector(`[data-guide-target="${item.target}"]`),
  );
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
  const [videoEmbedUrl, setVideoEmbedUrl] = useState("");
  const [videoSettingsError, setVideoSettingsError] = useState("");
  const [selectedModuleTip, setSelectedModuleTip] = useState(null);
  const [availableModuleTips, setAvailableModuleTips] = useState([]);
  const storageKey = onboardingGuideStorageKey(user?.id, organization?.id);
  const choosingPlan =
    pathname === "/subscribe" ||
    pathname.startsWith("/subscribe/") ||
    pathname === "/billing" ||
    pathname.startsWith("/billing/");
  const step = selectedModuleTip || GUIDE_STEPS[stepIndex];

  const finishGuide = useCallback(() => {
    if (storageKey && view !== "chooser") saveGuideCompletion(storageKey);
    setOpen(false);
    setView("tips");
    setReturnToChooser(false);
    setSelectedModuleTip(null);
  }, [storageKey, view]);

  useEffect(() => {
    if (choosingPlan) {
      setOpen(false);
      return;
    }
    if (loading || !storageKey || isSuperAdmin?.()) return;
    if (!wasGuideCompleted(storageKey)) {
      setStepIndex(0);
      setSelectedModuleTip(null);
      setView("tips");
      setOpen(true);
    }
  }, [choosingPlan, isSuperAdmin, loading, storageKey]);

  useEffect(() => {
    function openGuide(event) {
      setStepIndex(0);
      setSelectedModuleTip(null);
      setView(event.detail === "tips" ? "modules" : "chooser");
      setAvailableModuleTips(getAvailableModuleTips());
      setReturnToChooser(false);
      setOpen(true);
    }

    window.addEventListener(OPEN_GUIDE_EVENT, openGuide);
    return () => window.removeEventListener(OPEN_GUIDE_EVENT, openGuide);
  }, []);

  useEffect(() => {
    let active = true;
    void apiRequest("/onboarding-guide/video", { token: null })
      .then((response) => {
        if (active) setVideoEmbedUrl(videoDemoEmbedUrl(response.video_embed_url) || "");
      })
      .catch(() => {
        if (active) setVideoSettingsError("Could not load the demo video setting. Please try again later.");
      });
    return () => {
      active = false;
    };
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

        const cardWidth = Math.min(420, window.innerWidth - 32);
        const cardHeight = Math.min(240, window.innerHeight - 32);
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
        className={`theme-modal absolute w-[min(420px,calc(100vw-32px))] overflow-hidden rounded-[18px] border border-slate-700/80 shadow-2xl ${
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
        <div className="p-5">
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
                    setSelectedModuleTip(null);
                    setAvailableModuleTips(getAvailableModuleTips());
                    setView("modules");
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
          ) : view === "modules" ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-primary)]">Usage tips</p>
              <h2 id="first-login-guide-title" className="theme-heading mt-1 text-lg font-semibold">
                Choose a module
              </h2>
              <p className="theme-subtext mt-1 text-sm">
                Select a module to see its own quick tip.
              </p>
              <div className="mt-4 grid max-h-[45vh] grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                {availableModuleTips.length ? availableModuleTips.map((item) => (
                  <button
                    key={item.target}
                    type="button"
                    onClick={() => {
                      setSelectedModuleTip(item);
                      setView("tips");
                    }}
                    className="theme-inset-panel rounded-lg border px-3 py-2 text-left text-sm font-medium hover:border-[var(--theme-primary)]"
                  >
                    {item.title}
                  </button>
                )) : (
                  <p className="theme-subtext col-span-full py-3 text-sm">
                    No module tips are available for this workspace.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setView("chooser")}
                className="theme-secondary-btn mt-4 rounded-lg px-3 py-2 text-sm font-semibold"
              >
                Back
              </button>
            </>
          ) : view === "demo" ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-primary)]">Video demo</p>
              <h2 id="first-login-guide-title" className="theme-heading mt-2 text-2xl font-semibold">
                See Centrix in action
              </h2>
              {videoEmbedUrl ? (
                <div className="mt-5 aspect-video overflow-hidden rounded-xl bg-black">
                  <iframe
                    src={videoEmbedUrl}
                    title="Centrix ERP product demo"
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>
              ) : (
                <p className="theme-panel theme-subtext mt-5 rounded-xl border p-4 text-sm leading-6">
                  {videoSettingsError || "The platform administrator hasn’t added a demo video yet. Add a YouTube link under Platform → AI training → Credentials."}
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
              {selectedModuleTip ? (
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-primary)]">
                  {selectedModuleTip.title} tip
                </p>
              ) : (
                <div className="flex items-center gap-2" aria-label={`Tip ${stepIndex + 1} of ${GUIDE_STEPS.length}`}>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-500/30">
                    <span
                      className="block h-full rounded-full bg-blue-400"
                      style={{ width: `${((stepIndex + 1) / GUIDE_STEPS.length) * 100}%` }}
                    />
                  </span>
                  <span className="theme-subtext text-xs">{stepIndex + 1}/{GUIDE_STEPS.length}</span>
                </div>
              )}
              <h2 id="first-login-guide-title" className="theme-heading mt-3 text-lg font-semibold">
                {step.title}
              </h2>
              <p className="theme-subtext mt-2 text-sm leading-5">{step.description}</p>
              {!selectedModuleTip && stepIndex === GUIDE_STEPS.length - 1 ? (
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
              {selectedModuleTip ? (
                <div className="mt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedModuleTip(null);
                      setView("modules");
                    }}
                    className="theme-secondary-btn inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    All module tips
                  </button>
                  <button
                    type="button"
                    onClick={finishGuide}
                    className="theme-primary-btn rounded-lg px-4 py-2 text-sm font-semibold"
                  >
                    Close
                  </button>
                </div>
              ) : (
              <div className="mt-4 flex items-center justify-between">
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
                      className="theme-secondary-btn inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold"
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
              )}
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
