import { DM_Sans } from "next/font/google";
import { Providers } from "./providers";
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
    <html lang="en" className={`${dmSans.variable} h-full`}>
      <body className="h-full overflow-hidden bg-slate-950 font-sans text-slate-100 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
