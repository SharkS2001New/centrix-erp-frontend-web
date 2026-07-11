"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { apiRequest, ApiError } from "@/lib/api";
import { PasswordInput } from "@/components/auth/password-input";
import { Field, PrimaryButton, SECONDARY_BTN_CLASS, inputClassName } from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";

async function copyText(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * User-based 2FA setup under My profile: email OTP or Google Authenticator.
 */
export function ProfileTwoFactorSection() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [totpSetup, setTotpSetup] = useState(null);
  const [totpQrDataUrl, setTotpQrDataUrl] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [mode, setMode] = useState(null); // email_confirm | totp_confirm | disable | null

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/auth/2fa");
      setStatus(res);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load 2FA status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const otpauthUrl = totpSetup?.otpauth_url;
    if (!otpauthUrl) {
      setTotpQrDataUrl("");
      return undefined;
    }

    (async () => {
      try {
        const dataUrl = await QRCode.toDataURL(otpauthUrl, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 220,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        if (!cancelled) setTotpQrDataUrl(dataUrl);
      } catch {
        if (!cancelled) setTotpQrDataUrl("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [totpSetup?.otpauth_url]);

  async function beginEmail() {
    setBusy(true);
    try {
      await apiRequest("/auth/2fa/email/begin", { method: "POST", body: {} });
      setMode("email_confirm");
      setEmailCode("");
      notifySuccess("Verification code sent to your email.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not start email 2FA.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEmail(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiRequest("/auth/2fa/email/confirm", {
        method: "POST",
        body: { code: emailCode.trim() },
      });
      setStatus(res.two_factor ?? res);
      setMode(null);
      setEmailCode("");
      notifySuccess("Email two-factor authentication enabled.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Invalid code.");
    } finally {
      setBusy(false);
    }
  }

  async function beginTotp() {
    setBusy(true);
    try {
      const res = await apiRequest("/auth/2fa/totp/begin", { method: "POST", body: {} });
      setTotpSetup(res);
      setMode("totp_confirm");
      setTotpCode("");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not start authenticator setup.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmTotp(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiRequest("/auth/2fa/totp/confirm", {
        method: "POST",
        body: { code: totpCode.trim() },
      });
      setStatus(res.two_factor ?? res);
      setMode(null);
      setTotpSetup(null);
      setTotpQrDataUrl("");
      setTotpCode("");
      notifySuccess("Authenticator two-factor authentication enabled.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Invalid authenticator code.");
    } finally {
      setBusy(false);
    }
  }

  async function disable(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiRequest("/auth/2fa/disable", {
        method: "POST",
        body: { password: disablePassword },
      });
      setStatus(res.two_factor ?? res);
      setMode(null);
      setDisablePassword("");
      notifySuccess("Two-factor authentication disabled.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not disable 2FA.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopySecret() {
    const ok = await copyText(totpSetup?.secret);
    if (ok) notifySuccess("Secret key copied.");
    else notifyError("Could not copy the secret key.");
  }

  async function handleCopyOtpauth() {
    const ok = await copyText(totpSetup?.otpauth_url);
    if (ok) notifySuccess("Authenticator link copied.");
    else notifyError("Could not copy the authenticator link.");
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading two-factor settings…</p>;
  }

  const available = true;
  const allowed = status?.allowed_methods ?? ["email", "totp"];
  const enabled = Boolean(status?.enabled);

  return (
    <section className="theme-panel space-y-4 rounded-xl border p-5 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Two-factor authentication</h2>
        <p className="mt-1 text-xs text-slate-500">
          Protect your own account with email or Google Authenticator when signing in. You enable or
          disable this yourself. Email codes are sent from the platform email set by the Centrix
          super admin.
        </p>
      </div>

      {enabled ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-900">
          Enabled via{" "}
          <strong>{status.method === "totp" ? "Google Authenticator" : "Email"}</strong>.
        </div>
      ) : null}

      {mode === null && available && !enabled ? (
        <div className="flex flex-wrap gap-2">
          {allowed.includes("email") ? (
            <button
              type="button"
              className={SECONDARY_BTN_CLASS}
              disabled={busy || !status?.has_email || !status?.email_verified}
              onClick={() => void beginEmail()}
            >
              Enable email 2FA
            </button>
          ) : null}
          {allowed.includes("totp") ? (
            <button type="button" className={SECONDARY_BTN_CLASS} disabled={busy} onClick={() => void beginTotp()}>
              Enable Google Authenticator
            </button>
          ) : null}
          {allowed.includes("email") && !status?.has_email ? (
            <p className="w-full text-xs text-slate-500">
              Save an email on your profile and verify it before enabling email 2FA.
            </p>
          ) : null}
          {allowed.includes("email") && status?.has_email && !status?.email_verified ? (
            <p className="w-full text-xs text-slate-500">
              Verify your email address in the Account section above before enabling email 2FA.
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === null && enabled ? (
        <button type="button" className={SECONDARY_BTN_CLASS} disabled={busy} onClick={() => setMode("disable")}>
          Disable 2FA
        </button>
      ) : null}

      {mode === "email_confirm" ? (
        <form onSubmit={(e) => void confirmEmail(e)} className="space-y-3">
          <Field label="Email verification code">
            <input
              className={inputClassName()}
              value={emailCode}
              onChange={(e) => setEmailCode(e.target.value)}
              placeholder="6-digit code"
              autoComplete="one-time-code"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton type="submit" showIcon={false} disabled={busy || !emailCode.trim()}>
              {busy ? "Confirming…" : "Confirm email 2FA"}
            </PrimaryButton>
            <button type="button" className={SECONDARY_BTN_CLASS} disabled={busy} onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {mode === "totp_confirm" && totpSetup ? (
        <form onSubmit={(e) => void confirmTotp(e)} className="space-y-4">
          <p className="text-sm text-slate-600">
            Scan the QR code with Google Authenticator (or any TOTP app). If you cannot scan, copy the
            secret key and add it manually, then enter the 6-digit code from the app.
          </p>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="mx-auto flex h-[236px] w-[236px] items-center justify-center rounded-xl border border-slate-200 bg-white p-2 shadow-sm sm:mx-0">
              {totpQrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={totpQrDataUrl}
                  alt="QR code for Google Authenticator"
                  width={220}
                  height={220}
                  className="h-[220px] w-[220px]"
                />
              ) : (
                <p className="px-4 text-center text-xs text-slate-500">Generating QR code…</p>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">Secret key</p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="block min-w-0 flex-1 break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900">
                    {totpSetup.secret}
                  </code>
                  <button
                    type="button"
                    className={SECONDARY_BTN_CLASS}
                    onClick={() => void handleCopySecret()}
                  >
                    Copy key
                  </button>
                </div>
              </div>

              {totpSetup.otpauth_url ? (
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-600">Authenticator setup link</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="block min-w-0 flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600">
                      {totpSetup.otpauth_url}
                    </code>
                    <button
                      type="button"
                      className={SECONDARY_BTN_CLASS}
                      onClick={() => void handleCopyOtpauth()}
                    >
                      Copy link
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <Field label="Authenticator code">
            <input
              className={inputClassName()}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              placeholder="6-digit code from the app"
              autoComplete="one-time-code"
              inputMode="numeric"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton type="submit" showIcon={false} disabled={busy || !totpCode.trim()}>
              {busy ? "Confirming…" : "Confirm authenticator"}
            </PrimaryButton>
            <button
              type="button"
              className={SECONDARY_BTN_CLASS}
              disabled={busy}
              onClick={() => {
                setMode(null);
                setTotpSetup(null);
                setTotpQrDataUrl("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {mode === "disable" ? (
        <form onSubmit={(e) => void disable(e)} className="space-y-3">
          <Field label="Current password">
            <PasswordInput
              className={inputClassName()}
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton type="submit" showIcon={false} disabled={busy || !disablePassword}>
              {busy ? "Disabling…" : "Disable 2FA"}
            </PrimaryButton>
            <button type="button" className={SECONDARY_BTN_CLASS} disabled={busy} onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
