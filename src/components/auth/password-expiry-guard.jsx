"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { hasAuthSession } from "@/lib/auth-storage";
import { buildAccessContext, resolveTillFloatNavFlag } from "@/lib/access-control";
import { navigateAfterAuthSessionReady } from "@/lib/post-auth-navigation";
import { shouldPromptPasswordExpiry, isPasswordExpiryForced } from "@/lib/security-settings";
import { PasswordExpiryPromptModal } from "@/components/auth/password-expiry-prompt-modal";

const CHANGE_PASSWORD_PATH = "/change-password";
const PROFILE_PATH = "/profile";

export function PasswordExpiryGuard({ children }) {
  const { user, organization, capabilities, loading, passwordExpiry, skipPasswordExpiry, switchWorkspace } =
    useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [promptOpen, setPromptOpen] = useState(false);
  const [skipBusy, setSkipBusy] = useState(false);
  const wasPasswordLockedRef = useRef(false);

  const mustChange = Boolean(user?.must_change_password);
  const expiryForced = isPasswordExpiryForced(user, passwordExpiry);
  const canPrompt = shouldPromptPasswordExpiry(user, passwordExpiry);
  const onChangePasswordPage = pathname === CHANGE_PASSWORD_PATH;
  const onProfilePage = pathname === PROFILE_PATH;
  const passwordLocked = mustChange || expiryForced;

  useEffect(() => {
    if (loading || !hasAuthSession()) return;

    if (mustChange && !onChangePasswordPage && !onProfilePage) {
      router.replace(CHANGE_PASSWORD_PATH);
      return;
    }

    if (expiryForced && !onChangePasswordPage && !onProfilePage) {
      router.replace(`${CHANGE_PASSWORD_PATH}?reason=expired`);
    }
  }, [expiryForced, loading, mustChange, onChangePasswordPage, onProfilePage, router]);

  useEffect(() => {
    if (loading || !hasAuthSession()) return;

    if (wasPasswordLockedRef.current && !passwordLocked && onProfilePage && capabilities) {
      const ctx = buildAccessContext({
        user: { ...user, must_change_password: false },
        organization,
        capabilities,
        requireTillFloat: resolveTillFloatNavFlag(capabilities),
      });
      void navigateAfterAuthSessionReady(ctx, capabilities, router, {
        switchWorkspace,
        afterPasswordLock: true,
      });
    }

    wasPasswordLockedRef.current = passwordLocked;
  }, [
    capabilities,
    loading,
    onProfilePage,
    organization,
    passwordLocked,
    router,
    switchWorkspace,
    user,
  ]);

  useEffect(() => {
    if (
      loading ||
      !hasAuthSession() ||
      onChangePasswordPage ||
      onProfilePage ||
      mustChange ||
      expiryForced
    ) {
      setPromptOpen(false);
      return;
    }
    setPromptOpen(canPrompt);
  }, [canPrompt, expiryForced, loading, mustChange, onChangePasswordPage, onProfilePage]);

  async function handleSkip() {
    setSkipBusy(true);
    try {
      await skipPasswordExpiry();
      setPromptOpen(false);
    } finally {
      setSkipBusy(false);
    }
  }

  function handleUpdateNow() {
    setPromptOpen(false);
    router.push(`${CHANGE_PASSWORD_PATH}?reason=expired`);
  }

  if (!loading && passwordLocked && !onChangePasswordPage && !onProfilePage) {
    return null;
  }

  return (
    <>
      {children}
      <PasswordExpiryPromptModal
        open={promptOpen}
        busy={skipBusy}
        passwordExpiry={passwordExpiry}
        onSkip={handleSkip}
        onUpdateLater={handleSkip}
        onUpdateNow={handleUpdateNow}
      />
    </>
  );
}
