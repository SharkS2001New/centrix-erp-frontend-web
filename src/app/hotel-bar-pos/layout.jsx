import { HotelBarPosShell } from "@/components/layout/hotel-bar-pos-shell";

export const metadata = {
  title: "Hotel & Bar POS",
  description: "Centrix hospitality front POS",
};

export default function HotelBarPosLayout({ children }) {
  return <HotelBarPosShell>{children}</HotelBarPosShell>;
}
