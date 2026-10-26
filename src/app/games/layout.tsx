import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";

// Shared by the games hub and every game, so the header and footer stay put when switching games.
export default function GamesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="bg-gradient-to-b from-plum-50/70 via-white to-white">{children}</main>
      <SiteFooter />
    </>
  );
}
