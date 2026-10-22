"use client";

import { use } from "react";
import { PlatformMarketingBlogFormScreen } from "@/components/platform/platform-marketing-blog-form-screen";

export default function PlatformMarketingBlogEditPage({ params }) {
  const resolved = use(params);
  const id = Number(resolved?.id);
  return <PlatformMarketingBlogFormScreen blogId={Number.isFinite(id) ? id : null} />;
}
