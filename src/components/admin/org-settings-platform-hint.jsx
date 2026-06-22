import { ORG_SETTINGS_PLATFORM_MESSAGE } from "@/lib/org-settings-access";

/**
 * Inline hint when a feature depends on platform-managed organization settings.
 *
 * @param {{ area?: string, className?: string }} props
 */
export function OrgSettingsPlatformHint({ area = "Organization settings", className = "" }) {
  return (
    <span className={className}>
      <strong>{area}</strong> — {ORG_SETTINGS_PLATFORM_MESSAGE}
    </span>
  );
}
