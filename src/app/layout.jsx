import { DM_Sans } from "next/font/google";
import { Providers } from "./providers";
import { themeInitScript } from "@/lib/theme-init-script";
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
    <html lang="en" className={`${dmSans.variable} h-full light`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="theme-body h-full overflow-hidden font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
