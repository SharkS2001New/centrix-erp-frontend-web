"use client";

import { useSearchParams } from "next/navigation";
import SubscribePage from "../../subscribe/page";

export default function SubscribeModalPage() {
  const searchParams = useSearchParams();
  const locked = searchParams.get("locked") === "1";

  return <SubscribePage presentation={locked ? "page" : "modal"} locked={locked} />;
}
