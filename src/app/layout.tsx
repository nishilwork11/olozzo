import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { CookieBanner } from "@/components/CookieBanner";
import { OPEN_STORE_ENABLED } from "@/lib/features";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = OPEN_STORE_ENABLED
  ? {
      title: {
        default: "olozzo — Start your dropshipping business in Europe",
        template: "%s · olozzo",
      },
      description:
        "olozzo is the all-in-one dropshipping commerce platform for Europe. Launch a store, import products from verified EU suppliers, take payments with Stripe & Mollie and let suppliers ship to your customers.",
    }
  : {
      title: {
        default: "olozzo — Shop online with fast EU delivery",
        template: "%s · olozzo",
      },
      description:
        "Shop products for every day at olozzo. Shipped from European warehouses to all 27 EU countries, with secure checkout and 14-day returns.",
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
