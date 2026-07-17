"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { createPasskeyCredential, webAuthnSupported } from "@/lib/webauthn";

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * GitHub-style passkey management under My profile.
 */
export function ProfilePasskeysSection() {
  const [passkeys, setPasskeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const supported = webAuthnSupported();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/auth/passkeys");
      setPasskeys(res.passkeys ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load passkeys.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addPasskey() {
    if (!supported) {
      notifyError("Passkeys need a secure browser (HTTPS or localhost) with fingerprint, Face ID, or a security key.");
      return;
    }
    setBusy(true);
    try {
      const begin = await apiRequest("/auth/passkeys/register/options", {
        method: "POST",
        body: { name: name.trim() || undefined },
      });
      const credential = await createPasskeyCredential(begin.options);
      const res = await apiRequest("/auth/passkeys/register", {
        method: "POST",
        body: {
          challenge_token: begin.challenge_token,
          credential,
          name: name.trim() || undefined,
        },
      });
      setPasskeys(res.passkeys ?? []);
      setName("");
      notifySuccess("Passkey added. You can use it to sign in like on GitHub.");
    } catch (e) {
      if (e?.name === "NotAllowedError") {
        notifyError("Passkey registration was cancelled.");
      } else {
        notifyError(e instanceof ApiError ? e.message : e?.message || "Could not add passkey.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function removePasskey(id) {
    setBusy(true);
    try {
      const res = await apiRequest(`/auth/passkeys/${id}`, { method: "DELETE" });
      setPasskeys(res.passkeys ?? []);
      notifySuccess("Passkey removed.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not remove passkey.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading passkeys…</p>;
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Passkeys</h3>
        <p className="mt-1 text-xs text-slate-500">
          Sign in with fingerprint, Face ID, Windows Hello, or a security key — same idea as GitHub.
          Passkeys skip the password (and 2FA code) because the device already verifies it is you.
        </p>
      </div>

      {!supported ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          This browser or device does not support passkeys. Use Chrome/Safari/Edge on HTTPS (or localhost).
        </p>
      ) : null}

      {passkeys.length === 0 ? (
        <p className="text-sm text-slate-500">No passkeys yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {passkeys.map((pk) => (
            <li key={pk.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <div>
                <p className="font-medium text-slate-800 dark:text-slate-100">{pk.name || "Passkey"}</p>
                <p className="text-xs text-slate-500">
                  Added {formatWhen(pk.created_at)}
                  {pk.last_used_at ? ` · Last used ${formatWhen(pk.last_used_at)}` : ""}
                  {pk.backup_status ? " · Synced" : ""}
                </p>
              </div>
              <button
                type="button"
                className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                disabled={busy}
                onClick={() => void removePasskey(pk.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Nickname (optional)">
          <input
            className={inputClassName()}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. MacBook Touch ID"
            disabled={busy || !supported}
          />
        </Field>
        <PrimaryButton type="button" showIcon={false} disabled={busy || !supported} onClick={() => void addPasskey()}>
          {busy ? "Waiting…" : "Add a passkey"}
        </PrimaryButton>
      </div>
    </div>
  );
}
