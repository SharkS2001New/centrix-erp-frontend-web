import { DM_Sans } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

import { APP_DESCRIPTION, APP_TITLE } from "@/lib/branding";

export const metadata = {
  title: APP_TITLE,
  description: APP_DESCRIPTION,
  appleWebApp: {
    capable: true,
    title: APP_TITLE,
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${dmSans.variable} h-full light`}
      suppressHydrationWarning
    >
      <body className="theme-body h-full overflow-hidden font-sans antialiased">
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(sessionStorage.getItem("pos_erp_screen_locked")==="1"){document.documentElement.classList.add("screen-locked");}}catch(e){}`,
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
