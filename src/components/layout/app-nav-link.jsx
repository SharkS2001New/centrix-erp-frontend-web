"use client";

import Link from "next/link";
import { useTabWorkspace } from "@/contexts/tab-workspace-context";

/**
 * Internal nav link. With tab workspace on, default prefetch off — route pages are
 * empty stubs and screens load via React.lazy, so prefetch only burns bandwidth.
 * Reuses an open tab when the destination is already open.
 */
export function AppNavLink({ href, prefetch, onClick, ...props }) {
  const { enabled, handleTabLinkClick } = useTabWorkspace();
  const shouldPrefetch = prefetch ?? !enabled;

  return (
    <Link
      href={href}
      prefetch={shouldPrefetch}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && enabled) {
          handleTabLinkClick(href, event);
        }
      }}
      {...props}
    />
  );
}
