"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Phone, MessageCircle } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import {
  isSelfServeTrialOrganization,
  onboardingDemoStorageKey,
  onboardingGuideStorageKey,
  readOnboardingDemoStatus,
} from "@/lib/onboarding-guide";

const DISMISS_KEY = "centrix_trial_support_dismissed";

function guideDone(userId, organizationId) {
  const tipsKey = onboardingGuideStorageKey(userId, organizationId);
  const demoKey = onboardingDemoStorageKey(userId, organizationId);
  let tipsComplete = false;
  try {
    tipsComplete = !tipsKey || window.localStorage.getItem(tipsKey) === "complete";
  } catch {
    tipsComplete = true;
  }
  const demoStatus = readOnboardingDemoStatus(demoKey);
  // "later" still means they left the demo overlay; support can show.
  const demoComplete = !demoKey || demoStatus === "watched" || demoStatus === "later";
  return tipsComplete && demoComplete;
}

function supportFromLicense(license) {
  const row = license?.trial_support;
  if (!row || typeof row !== "object") return null;
  const phone = String(row.phone || "").trim();
  const phoneHref = String(row.phone_href || "").trim() || (phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : "");
  const whatsappUrl = String(row.whatsapp_url || "").trim();
  if (!phoneHref && !whatsappUrl) return null;
  return { phone, phoneHref, whatsappUrl };
}

function defaultSupport() {
  return {
    phone: "+254 748 956 677",
    phoneHref: "tel:+254748956677",
    whatsappUrl:
      "https://wa.me/254748956677?text=" +
      encodeURIComponent("Hello, I need help with my CentrixERP free trial."),
  };
}

function dismissedKey(organizationId) {
  return `${DISMISS_KEY}:${organizationId || "org"}`;
}

export function TrialSupportContact() {
  const { user, organization, organizationLicense, loading, isSuperAdmin } = useAuth();
  const onTrial = isSelfServeTrialOrganization(organization, organizationLicense);
  const support = useMemo(
    () => supportFromLicense(organizationLicense) || defaultSupport(),
    [organizationLicense],
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [fabVisible, setFabVisible] = useState(false);
  const [readyAfterGuide, setReadyAfterGuide] = useState(false);

  useEffect(() => {
    if (loading || isSuperAdmin?.() || !onTrial || !organization?.id || !user?.id) {
      setModalOpen(false);
      setFabVisible(false);
      setReadyAfterGuide(false);
      return undefined;
    }

    const sync = () => {
      const afterGuide = guideDone(user.id, organization.id);
      setReadyAfterGuide(afterGuide);
      if (!afterGuide) {
        setModalOpen(false);
        return;
      }
      try {
        const dismissed = window.localStorage.getItem(dismissedKey(organization.id)) === "1";
        setModalOpen(!dismissed);
        setFabVisible(dismissed);
      } catch {
        setModalOpen(true);
        setFabVisible(false);
      }
    };

    sync();
    window.addEventListener("centrix:onboarding-demo-status", sync);
    window.addEventListener("centrix:onboarding-guide-status", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("centrix:onboarding-demo-status", sync);
      window.removeEventListener("centrix:onboarding-guide-status", sync);
      window.removeEventListener("storage", sync);
    };
  }, [isSuperAdmin, loading, onTrial, organization?.id, user?.id]);

  const closeModal = useCallback(() => {
    if (organization?.id) {
      try {
        window.localStorage.setItem(dismissedKey(organization.id), "1");
      } catch {
        /* ignore */
      }
    }
    setModalOpen(false);
    setFabVisible(true);
  }, [organization?.id]);

  if (!onTrial || isSuperAdmin?.() || !readyAfterGuide) return null;

  return (
    <>
      {modalOpen ? (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <section
            className="theme-modal w-full max-w-md rounded-2xl border p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trial-support-title"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--theme-primary)]">
              Instant trial support
            </p>
            <h2 id="trial-support-title" className="theme-heading mt-2 text-xl font-semibold">
              Need help while you test CentrixERP?
            </h2>
            <p className="theme-subtext mt-3 text-sm leading-6">
              Talk to support on WhatsApp or by phone while your free trial is active. We can help
              you set up products, tills, and your first sales.
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {support.whatsappUrl ? (
                <a
                  href={support.whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden />
                  WhatsApp
                </a>
              ) : null}
              {support.phoneHref ? (
                <a
                  href={support.phoneHref}
                  className="theme-secondary-btn inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold"
                >
                  <Phone className="h-4 w-4" aria-hidden />
                  Call {support.phone || "support"}
                </a>
              ) : null}
            </div>
            <button
              type="button"
              onClick={closeModal}
              className="mt-5 w-full rounded-md border border-slate-500/40 px-3 py-2 text-sm font-semibold theme-subtext hover:bg-slate-500/10"
            >
              Close
            </button>
          </section>
        </div>
      ) : null}

      {fabVisible ? (
        <div className="fixed bottom-5 right-5 z-[110] flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-emerald-700"
            aria-label="Contact support"
            title="Contact support"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Contact support
          </button>
        </div>
      ) : null}
    </>
  );
}
