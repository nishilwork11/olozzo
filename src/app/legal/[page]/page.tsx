import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";

// Template legal texts. Have them reviewed by a lawyer for your company and countries before launch.
const PAGES: Record<string, { title: string; sections: { h: string; p: string[] }[] }> = {
  imprint: {
    title: "Imprint (Impressum)",
    sections: [
      { h: "Service provider", p: ["olozzo Commerce GmbH (example)", "Musterstraße 1, 10115 Berlin, Germany", "Email: legal@olozzo.com"] },
      { h: "Company register", p: ["Registered at Amtsgericht Berlin-Charlottenburg, HRB 000000 (example)", "VAT ID: DE000000000 (example)", "Managing director: [Name]"] },
      { h: "EU online dispute resolution", p: ["The European Commission provides a platform for online dispute resolution (ODR). We are not obliged and not willing to participate in dispute resolution proceedings before a consumer arbitration board."] },
    ],
  },
  terms: {
    title: "Terms of Service",
    sections: [
      { h: "1. Scope", p: ["These terms govern the use of the olozzo platform by merchants, suppliers and customers. Each store on olozzo is operated by an independent merchant who is the seller of record for purchases made in that store."] },
      { h: "2. Merchants", p: ["Merchants are responsible for their store content, pricing, customer service, VAT registration (including the EU One-Stop-Shop where applicable) and compliance with consumer protection law in the countries they sell to."] },
      { h: "3. Suppliers", p: ["Suppliers guarantee that listed products are genuine, safe, CE-marked where required and compliant with EU product regulations (incl. GPSR). Suppliers must dispatch accepted orders within their stated processing time and provide tracking information."] },
      { h: "4. Fees", p: ["Merchants pay the monthly subscription of their chosen plan plus a transaction fee per paid order as shown on the pricing page. Fees are exclusive of VAT."] },
      { h: "5. Customers", p: ["Contracts of sale are concluded between the customer and the merchant operating the store. Prices include VAT of the destination country. Consumers have a 14-day right of withdrawal as described in our withdrawal policy."] },
      { h: "6. Governing law", p: ["German law applies, without prejudice to mandatory consumer protection provisions of the consumer's country of residence."] },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    sections: [
      { h: "Controller", p: ["olozzo Commerce GmbH (example), Musterstraße 1, 10115 Berlin, Germany — privacy@olozzo.com"] },
      { h: "What we process", p: ["Account data (name, email, password hash), order data (shipping address, items, payment status), and technical data required to run the service. Payment card data is processed exclusively by our payment providers (Stripe, Mollie) and never stored on our servers."] },
      { h: "Legal bases (Art. 6 GDPR)", p: ["Performance of a contract (orders, accounts), legal obligations (tax records, 10 years), legitimate interests (fraud prevention, security) and consent (marketing emails, analytics cookies)."] },
      { h: "Sharing", p: ["To fulfil an order we share the customer's name and shipping address with the merchant and the supplier who ships the parcel, and payment details with the payment provider. Data is hosted within the EU."] },
      { h: "Your rights", p: ["You have the right to access, rectify, erase, restrict and port your data and to object to processing. Signed-in users can download all their data and delete their account from Account → Privacy. You may also lodge a complaint with a supervisory authority."] },
    ],
  },
  withdrawal: {
    title: "Right of withdrawal & returns",
    sections: [
      { h: "Right of withdrawal", p: ["Consumers in the EU have the right to withdraw from a purchase within 14 days without giving any reason. The withdrawal period expires 14 days after the day on which you, or a third party indicated by you, acquired physical possession of the goods."] },
      { h: "How to withdraw", p: ["Sign in, open your order under Account → Orders and click “Request a return”, or send an unequivocal statement by email to the store's support address."] },
      { h: "Effects of withdrawal", p: ["We will reimburse all payments received from you, including the standard delivery costs, without undue delay and no later than 14 days from the day we are informed of your decision. We may withhold reimbursement until we have received the goods back or you have supplied proof of having sent them back."] },
      { h: "Exceptions", p: ["The right of withdrawal does not apply to sealed goods unsuitable for return for health or hygiene reasons once unsealed (e.g. opened cosmetics), or to goods made to the consumer's specifications."] },
    ],
  },
  cookies: {
    title: "Cookie Policy",
    sections: [
      { h: "Strictly necessary", p: ["olozzo_session — keeps you signed in (7 days). Shopping carts are stored in your browser's local storage. These are required for the service and do not need consent."] },
      { h: "Analytics (optional)", p: ["Only loaded after you click “Accept all” in the cookie banner. You can change your choice at any time by clearing your browser storage for this site."] },
    ],
  },
};

export async function generateMetadata({ params }: { params: Promise<{ page: string }> }): Promise<Metadata> {
  const { page } = await params;
  return { title: PAGES[page]?.title ?? "Legal" };
}

export default async function LegalPage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  const content = PAGES[page];
  if (!content) notFound();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <h1 className="text-4xl font-bold tracking-tight">{content.title}</h1>
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Template text — replace the example company details and have this page reviewed before going live.
        </p>
        <div className="mt-10 space-y-8">
          {content.sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-lg font-semibold">{s.h}</h2>
              {s.p.map((p) => (
                <p key={p} className="mt-2 text-ink-600">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
