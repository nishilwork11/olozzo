import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/ui";
import { OPEN_STORE_ENABLED } from "@/lib/features";

const PANEL = OPEN_STORE_ENABLED
  ? {
      title: ["Sell to 450 million customers", "without holding stock."],
      points: [
        "Import products from verified EU suppliers in one click",
        "Suppliers ship directly to your customers in 2–6 days",
        "Stripe & Mollie payments: cards, SEPA, iDEAL, Bancontact, Klarna",
        "VAT calculated automatically for all 27 EU countries",
      ],
    }
  : {
      title: ["Great products,", "delivered across Europe."],
      points: [
        "Shipped from European warehouses, most orders arrive in 2–6 days",
        "Track every order from your account",
        "14-day returns, requested online in a few clicks",
        "Pay with cards, SEPA, iDEAL, Bancontact or Klarna",
      ],
    };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-ink-950 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.35),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(163,230,53,0.18),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-center px-16 text-white">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-300">Built for Europe</p>
          <h2 className="mt-4 text-4xl font-bold leading-tight">
            {PANEL.title[0]}
            <br /> {PANEL.title[1]}
          </h2>
          <ul className="mt-10 space-y-4 text-ink-200">
            {PANEL.points.map((t) => (
              <li key={t} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 shrink-0 text-brand-400" size={20} />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
