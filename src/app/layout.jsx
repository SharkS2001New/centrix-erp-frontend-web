import Script from "next/script";
import { DM_Sans } from "next/font/google";
import { Providers } from "./providers";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata = {
  title: "POS / ERP",
  description: "ERP frontend for POS-ERP-API",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${dmSans.variable} h-full dark`}
      suppressHydrationWarning
    >
      <body className="theme-body h-full overflow-hidden font-sans antialiased">
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
