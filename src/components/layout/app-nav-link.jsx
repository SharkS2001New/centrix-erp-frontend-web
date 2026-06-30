"use client";

import Link from "next/link";

/** Internal nav link — always prefetch static routes for faster transitions. */
export function AppNavLink({ href, prefetch = true, ...props }) {
  return <Link href={href} prefetch={prefetch} {...props} />;
}
