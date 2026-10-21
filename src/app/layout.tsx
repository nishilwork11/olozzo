import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { CookieBanner } from "@/components/CookieBanner";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "olozzo — Start your dropshipping business in Europe",
    template: "%s · olozzo",
  },
  description:
    "olozzo is the all-in-one dropshipping commerce platform for Europe. Launch a store, import products from verified EU suppliers, take payments with Stripe & Mollie and let suppliers ship to your customers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen font-sans">
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
