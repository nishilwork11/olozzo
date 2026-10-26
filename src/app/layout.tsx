import type { Metadata, Viewport } from "next";
import { Inter, Nunito } from "next/font/google";
import { Suspense } from "react";
import { CookieBanner } from "@/components/CookieBanner";
import { RouteLoader } from "@/components/RouteLoader";
import { OPEN_STORE_ENABLED } from "@/lib/features";
import { UI } from "@/lib/theme";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-sans", display: "swap" });
// The rounded face of the "lozzo" wordmark in the logo
const nunito = Nunito({ subsets: ["latin"], weight: "800", variable: "--font-logo", display: "swap" });

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

// Colours the browser bar on phones to match the charcoal top bar
export const viewport: Viewport = { themeColor: UI.ink };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${nunito.variable}`}>
      <body className="min-h-screen font-sans">
        {children}
        <CookieBanner />
        {/* reads the address (useSearchParams), so it needs its own Suspense boundary */}
        <Suspense fallback={null}>
          <RouteLoader />
        </Suspense>
      </body>
    </html>
  );
}
