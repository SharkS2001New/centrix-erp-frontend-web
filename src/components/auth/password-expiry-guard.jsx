"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { hasAuthSession } from "@/lib/auth-storage";
import {
  isPasswordExpiryForced,
  shouldPromptPasswordExpiry,
} from "@/lib/security-settings";
import { PasswordExpiryPromptModal } from "@/components/auth/password-expiry-prompt-modal";

const CHANGE_PASSWORD_PATH = "/change-password";

export function PasswordExpiryGuard({ children }) {
  const { user, loading, passwordExpiry, skipPasswordExpiry } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [promptOpen, setPromptOpen] = useState(false);
  const [skipBusy, setSkipBusy] = useState(false);

  const forced = isPasswordExpiryForced(user, passwordExpiry);
  const canPrompt = shouldPromptPasswordExpiry(user, passwordExpiry);
  const onChangePasswordPage = pathname === CHANGE_PASSWORD_PATH;

  useEffect(() => {
    if (loading || !hasAuthSession()) return;

    if (user?.must_change_password && !onChangePasswordPage) {
      router.replace(CHANGE_PASSWORD_PATH);
      return;
    }

    if (forced && !onChangePasswordPage) {
      router.replace(`${CHANGE_PASSWORD_PATH}?reason=expired`);
    }
  }, [forced, loading, onChangePasswordPage, router, user?.must_change_password]);

  useEffect(() => {
    if (loading || !hasAuthSession() || onChangePasswordPage || forced) {
      setPromptOpen(false);
      return;
    }
    setPromptOpen(canPrompt);
  }, [canPrompt, forced, loading, onChangePasswordPage]);

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

  if (!loading && (user?.must_change_password || forced) && !onChangePasswordPage) {
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
