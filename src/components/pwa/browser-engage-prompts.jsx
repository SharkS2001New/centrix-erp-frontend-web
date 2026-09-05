"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { PRODUCT_SHORT_NAME } from "@/lib/branding";
import { notifySuccess, notifyError } from "@/lib/notify";
import {
  PWA_INSTALL_DISMISS_KEY,
  PWA_NOTIF_DISMISS_KEY,
  browserNotificationPermission,
  canRequestBrowserNotifications,
  dismissPrompt,
  isIosSafari,
  isPromptDismissed,
  isStandaloneDisplay,
  registerCentrixServiceWorker,
  showBrowserNotification,
} from "@/lib/pwa-engage";

function CloseButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute right-1.5 top-1.5 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M6 6l12 12M18 6L6 18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

function EngageCard({ icon, title, subtitle, actionLabel, actionIcon, onAction, onDismiss, busy }) {
  return (
    <div className="relative flex w-[min(100vw-2rem,360px)] items-center gap-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] px-3 py-2.5 pr-8 shadow-lg shadow-slate-900/10">
      <CloseButton onClick={onDismiss} label={`Dismiss ${title}`} />
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#185FA5] p-1.5">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--theme-text)]">{title}</p>
        <p className="truncate text-xs text-[var(--theme-text-muted)]">{subtitle}</p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onAction}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#185FA5] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#154a86] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {actionIcon}
        {actionLabel}
      </button>
    </div>
  );
}

function CentrixMarkIcon() {
  return (
    <Image
      src="/branding/centrix-mark.png"
      alt=""
      width={28}
      height={28}
      className="h-7 w-7 object-contain"
      unoptimized
    />
  );
}

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className="text-white">
      <path
        d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4v10m0 0 4-4m-4 4-4-4M5 18h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Top-right floating cards: Install Centrix + Turn on notifications.
 * Mount once in Providers (covers ERP + POS shells).
 */
export function BrowserEngagePrompts() {
  const [ready, setReady] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);
  const [notifBusy, setNotifBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await registerCentrixServiceWorker();
      if (cancelled) return;

      const standalone = isStandaloneDisplay();
      const installDismissed = isPromptDismissed(PWA_INSTALL_DISMISS_KEY);
      const notifDismissed = isPromptDismissed(PWA_NOTIF_DISMISS_KEY);

      if (!standalone && !installDismissed && isIosSafari()) {
        setShowIosHint(true);
      }

      if (!notifDismissed && canRequestBrowserNotifications()) {
        setShowNotif(true);
      }

      setReady(true);
    })();

    function onBeforeInstall(event) {
      event.preventDefault();
      setDeferredPrompt(event);
      if (!isStandaloneDisplay() && !isPromptDismissed(PWA_INSTALL_DISMISS_KEY)) {
        setShowInstall(true);
        setShowIosHint(false);
      }
    }

    function onInstalled() {
      setDeferredPrompt(null);
      setShowInstall(false);
      setShowIosHint(false);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismissInstall = useCallback(() => {
    dismissPrompt(PWA_INSTALL_DISMISS_KEY);
    setShowInstall(false);
    setShowIosHint(false);
  }, []);

  const dismissNotif = useCallback(() => {
    dismissPrompt(PWA_NOTIF_DISMISS_KEY);
    setShowNotif(false);
  }, []);

  const handleInstall = useCallback(async () => {
    if (showIosHint && !deferredPrompt) {
      notifySuccess("On iPhone/iPad: tap Share → Add to Home Screen.");
      return;
    }
    if (!deferredPrompt) return;
    setInstallBusy(true);
    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setShowInstall(false);
      if (choice?.outcome === "accepted") {
        dismissPrompt(PWA_INSTALL_DISMISS_KEY);
        notifySuccess(`${PRODUCT_SHORT_NAME} installed.`);
      } else {
        dismissPrompt(PWA_INSTALL_DISMISS_KEY);
      }
    } catch {
      notifyError("Could not open the install dialog. Try the browser menu → Install app.");
    } finally {
      setInstallBusy(false);
    }
  }, [deferredPrompt, showIosHint]);

  const handleEnableNotifications = useCallback(async () => {
    if (typeof Notification === "undefined") {
      notifyError("This browser does not support notifications.");
      setShowNotif(false);
      return;
    }
    setNotifBusy(true);
    try {
      await registerCentrixServiceWorker();
      const result = await Notification.requestPermission();
      if (result === "granted") {
        dismissPrompt(PWA_NOTIF_DISMISS_KEY);
        setShowNotif(false);
        notifySuccess("Notifications enabled.");
        void showBrowserNotification({
          title: `${PRODUCT_SHORT_NAME} is ready`,
          body: "You will get alerts even when this tab is in the background.",
          url: "/notifications",
          tag: "centrix-notif-welcome",
        });
      } else if (result === "denied") {
        dismissPrompt(PWA_NOTIF_DISMISS_KEY);
        setShowNotif(false);
        notifyError("Notifications blocked. Enable them in your browser site settings.");
      } else {
        // default — user dismissed OS dialog without choosing
        setShowNotif(browserNotificationPermission() === "default");
      }
    } catch {
      notifyError("Could not request notification permission.");
    } finally {
      setNotifBusy(false);
    }
  }, []);

  if (!ready) return null;

  const installVisible = showInstall || showIosHint;
  if (!installVisible && !showNotif) return null;

  return (
    <div
      className="pointer-events-none fixed right-4 top-16 z-[70] flex flex-col gap-2 sm:top-4"
      aria-live="polite"
    >
      {installVisible ? (
        <div className="pointer-events-auto">
          <EngageCard
            icon={
              showInstall ? (
                <CentrixMarkIcon />
              ) : (
                <span className="text-lg font-bold text-white">{PRODUCT_SHORT_NAME.slice(0, 1)}</span>
              )
            }
            title={`Install ${PRODUCT_SHORT_NAME}`}
            subtitle={
              showIosHint && !showInstall
                ? "Add to Home Screen for full-screen access."
                : "Quicker, full-screen access."
            }
            actionLabel={installBusy ? "…" : "Install"}
            actionIcon={installBusy ? null : <DownloadIcon />}
            onAction={() => void handleInstall()}
            onDismiss={dismissInstall}
            busy={installBusy}
          />
        </div>
      ) : null}

      {showNotif ? (
        <div className="pointer-events-auto">
          <EngageCard
            icon={<BellIcon />}
            title="Turn on notifications"
            subtitle="Get notified, even with this tab closed."
            actionLabel={notifBusy ? "…" : "Enable"}
            actionIcon={null}
            onAction={() => void handleEnableNotifications()}
            onDismiss={dismissNotif}
            busy={notifBusy}
          />
        </div>
      ) : null}
    </div>
  );
}
