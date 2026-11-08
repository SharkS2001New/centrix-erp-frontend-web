import { PosShell } from "@/components/layout/pos-shell";
import { DEFAULT_PWA_THEME_COLOR } from "@/lib/branding";

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

export const viewport = {
  themeColor: DEFAULT_PWA_THEME_COLOR,
  width: "device-width",
  initialScale: 1,
};

export default function PosLayout({ children }) {
  return <PosShell>{children}</PosShell>;
}
