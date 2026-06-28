import { PosShell } from "@/components/layout/pos-shell";

export const metadata = {
  title: "Centrix POS",
  description: "Centrix ERP point of sale",
  manifest: "/pos.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Centrix POS",
    statusBarStyle: "black-translucent",
  },
};

export default function PosLayout({ children }) {
  return <PosShell>{children}</PosShell>;
}
