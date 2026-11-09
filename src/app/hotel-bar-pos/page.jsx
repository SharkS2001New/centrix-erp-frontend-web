"use client";

import dynamic from "next/dynamic";

const HotelBarPosScreen = dynamic(
  () =>
    import("@/components/hospitality/hotel-bar-pos-screen").then((m) => ({
      default: m.HotelBarPosScreen,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-300">
        Loading Hotel POS…
      </div>
    ),
  },
);

export default function HotelBarPosPage() {
  return <HotelBarPosScreen />;
}
