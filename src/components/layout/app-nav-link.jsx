"use client";

import Link from "next/link";
import { useTabWorkspace } from "@/contexts/tab-workspace-context";

/** Internal nav link — prefetch enabled; reuses an open tab when the destination is already open. */
export function AppNavLink({ href, prefetch = true, onClick, ...props }) {
  const { enabled, handleTabLinkClick } = useTabWorkspace();

  return (
    <Link
      href={href}
      prefetch={prefetch}
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
