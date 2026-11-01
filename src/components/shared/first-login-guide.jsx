"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/api";
import {
  isEligibleForMonthlyCustomerDemo,
  onboardingDemoStorageKey,
  onboardingGuideStorageKey,
  guideCardPosition,
  readOnboardingDemoStatus,
  saveOnboardingDemoStatus,
  videoDemoEmbedUrl,
} from "@/lib/onboarding-guide";

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
  const seen = new Set();
  return Array.from(document.querySelectorAll('[data-guide-target^="sidebar:"]'))
    .filter((element) => {
      const target = element.dataset.guideTarget;
      const bounds = element.getBoundingClientRect();
      if (!target || seen.has(target) || bounds.width <= 0 || bounds.height <= 0
        || bounds.right <= 0 || bounds.left >= window.innerWidth) {
        return false;
      }
      seen.add(target);
      return true;
    })
    .map((element) => {
      const title = element.dataset.guideTitle || element.textContent.trim();
      const sectionTip = MODULE_TIPS.find((tip) => tip.target === element.dataset.guideSection);
      return {
        target: element.dataset.guideTarget,
        title,
        description: element.dataset.guideDescription
          || sectionTip?.description
          || `Open ${title} to review its tools and manage related records for your organization.`,
      };
    });
}

function scrollGuideTargetIntoView(target) {
  let ancestor = target.parentElement;
  while (ancestor && ancestor !== document.body) {
    const overflowY = window.getComputedStyle(ancestor).overflowY;
    if (/(auto|scroll|overlay)/.test(overflowY) && ancestor.scrollHeight > ancestor.clientHeight) {
      const bounds = ancestor.getBoundingClientRect();
      const visibleTop = bounds.top + ancestor.clientTop;
      const visibleBottom = visibleTop + ancestor.clientHeight;
      const targetBounds = target.getBoundingClientRect();
      if (targetBounds.top < visibleTop + 12 || targetBounds.bottom > visibleBottom - 12) {
        ancestor.scrollTo({
          top: ancestor.scrollTop + targetBounds.top + targetBounds.height / 2
            - (visibleTop + ancestor.clientHeight / 2),
          behavior: "smooth",
        });
      }
      return;
    }
    ancestor = ancestor.parentElement;
  }

  const bounds = target.getBoundingClientRect();
  if (bounds.top < 12 || bounds.bottom > window.innerHeight - 12) {
    target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }
}

function findGuideTarget(step) {
  if (!step?.target) return null;
  return Array.from(document.querySelectorAll(`[data-guide-target="${step.target}"]`))
    .find((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.width > 0
        && bounds.height > 0
        && bounds.right > 0
        && bounds.left < window.innerWidth;
    }) ?? null;
}

export function FirstLoginGuide() {
  const { user, organization, organizationLicense, loading, isSuperAdmin } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [view, setView] = useState("tips");
  const [targetRect, setTargetRect] = useState(null);
  const [cardPosition, setCardPosition] = useState(null);
  const [videoEmbedUrl, setVideoEmbedUrl] = useState("");
  const [videoSettingsError, setVideoSettingsError] = useState("");
  const [availableModuleTips, setAvailableModuleTips] = useState([]);
  const storageKey = onboardingGuideStorageKey(user?.id, organization?.id);
  const demoKey = onboardingDemoStorageKey(user?.id, organization?.id);
  const [demoStatus, setDemoStatus] = useState(null);
  const eligibleForDemo = isEligibleForMonthlyCustomerDemo(organization, organizationLicense);
  const choosingPlan =
    pathname === "/subscribe" ||
    pathname.startsWith("/subscribe/") ||
    pathname === "/billing" ||
    pathname.startsWith("/billing/");
  const step = availableModuleTips[stepIndex];

  const finishGuide = useCallback(() => {
    if (storageKey) saveGuideCompletion(storageKey);
    setOpen(false);
    setAvailableModuleTips([]);
  }, [storageKey]);

  useEffect(() => {
    if (choosingPlan) {
      setOpen(false);
      return;
    }
    if (loading || !storageKey || isSuperAdmin?.()) return;
    const currentDemoStatus = readOnboardingDemoStatus(demoKey);
    setDemoStatus(currentDemoStatus);
    if (!wasGuideCompleted(storageKey)) {
      setAvailableModuleTips(getAvailableModuleTips());
      setStepIndex(0);
      setView("tips");
      setOpen(true);
    }
  }, [choosingPlan, demoKey, isSuperAdmin, loading, storageKey]);

  useEffect(() => {
    function openGuide(event) {
      if (event.detail !== "tips" && (!eligibleForDemo || demoStatus === "watched")) return;
      setStepIndex(0);
      setAvailableModuleTips(getAvailableModuleTips());
      setView(event.detail === "tips" ? "tips" : "demo");
      setOpen(true);
    }

    window.addEventListener(OPEN_GUIDE_EVENT, openGuide);
    return () => window.removeEventListener(OPEN_GUIDE_EVENT, openGuide);
  }, [demoStatus, eligibleForDemo]);

  const watchLater = useCallback(() => {
    saveOnboardingDemoStatus(demoKey, "later");
    setDemoStatus("later");
    setOpen(false);
  }, [demoKey]);

  const markDemoWatched = useCallback(() => {
    saveOnboardingDemoStatus(demoKey, "watched");
    setDemoStatus("watched");
    setOpen(false);
  }, [demoKey]);

  const closeGuide = useCallback(() => {
    if (view === "demo") {
      watchLater();
      return;
    }
    finishGuide();
  }, [finishGuide, view, watchLater]);

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
      if (event.key === "Escape") closeGuide();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeGuide, open]);

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
        const target = findGuideTarget(step);
        const rect = target?.getBoundingClientRect();
        const nextRect = rect && rect.width > 0 && rect.height > 0
          ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          : null;
        setTargetRect(nextRect);

        setCardPosition(nextRect
          ? guideCardPosition(nextRect, window.innerWidth, window.innerHeight)
          : null);
      });
    };

    scrollGuideTargetIntoView(findGuideTarget(step));
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
        className={`theme-modal absolute w-[min(380px,calc(100vw-32px))] overflow-hidden rounded-[18px] border border-slate-700/80 shadow-2xl ${
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
        <div className="p-5">
          {view === "demo" ? (
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
                  {videoSettingsError || "The platform administrator hasn’t added a demo video yet. Add a YouTube or Vimeo link under Platform → AI training → Credentials."}
                </p>
              )}
              <div className="mt-5 flex justify-between gap-2">
                <button
                  type="button"
                  onClick={watchLater}
                  className="rounded-md border border-red-500/60 bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Watch later
                </button>
                {videoEmbedUrl ? (
                  <button
                    type="button"
                    onClick={markDemoWatched}
                    className="theme-primary-btn rounded-md px-2.5 py-1 text-xs font-semibold"
                  >
                    I’ve watched
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              {step ? (
                <div className="flex items-center gap-2" aria-label={`Tip ${stepIndex + 1} of ${availableModuleTips.length}`}>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-500/30">
                    <span
                      className="block h-full rounded-full bg-blue-400"
                      style={{ width: `${((stepIndex + 1) / availableModuleTips.length) * 100}%` }}
                    />
                  </span>
                  <span className="theme-subtext text-xs">{stepIndex + 1}/{availableModuleTips.length}</span>
                </div>
              ) : null}
              {step ? (
                <>
                  <h2 id="first-login-guide-title" className="theme-heading mt-3 text-lg font-semibold">
                    {step.title}
                  </h2>
                  <p className="theme-subtext mt-2 text-sm leading-5">{step.description}</p>
                </>
              ) : (
                <p className="theme-subtext mt-3 text-sm">
                  No module tips are available in this workspace.
                </p>
              )}
              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={finishGuide}
                  className="rounded-md border border-red-500/60 bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Close
                </button>
                <div className="flex gap-1.5">
                  {stepIndex > 0 ? (
                    <button
                      type="button"
                      onClick={() => setStepIndex((index) => index - 1)}
                      className="theme-secondary-btn inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Back
                    </button>
                  ) : null}
                  {stepIndex < availableModuleTips.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => setStepIndex((index) => index + 1)}
                      className="theme-primary-btn inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export function openFirstLoginGuide(view = "demo") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_GUIDE_EVENT, { detail: view }));
  }
}
