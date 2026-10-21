import { SubmitButton } from "@/components/client";
import { Card, Field, Flash, PageHeader, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { EU_COUNTRIES } from "@/lib/eu";
import { saveProfile } from "../actions";

export default async function SupplierProfile({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const flash = await searchParams;
  const user = await requireUser(["SUPPLIER"]);
  const supplier = await db.supplier.findUnique({ where: { userId: user.id } });

  return (
    <>
      <PageHeader
        title={supplier ? "Company profile" : "Set up your supplier profile"}
        description="Merchants see this information when choosing products. Your VAT ID is used for B2B invoicing."
        actions={supplier ? <StatusBadge status={supplier.status} /> : undefined}
      />
      <Flash {...flash} />
      <Card className="max-w-3xl p-6">
        <form action={saveProfile} className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" htmlFor="companyName">
            <input id="companyName" name="companyName" defaultValue={supplier?.companyName} required className="input" />
          </Field>
          <Field label="Ships from" htmlFor="country">
            <select id="country" name="country" defaultValue={supplier?.country ?? "DE"} className="input">
              {EU_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="EU VAT ID" htmlFor="vatNumber" hint="Verified via VIES before approval">
            <input id="vatNumber" name="vatNumber" defaultValue={supplier?.vatNumber ?? ""} placeholder="DE123456789" className="input font-mono" />
          </Field>
          <Field label="Processing time (days)" htmlFor="processingDays" hint="Time from order to dispatch">
            <input id="processingDays" name="processingDays" type="number" min={0} max={14} defaultValue={supplier?.processingDays ?? 2} className="input" />
          </Field>
          <Field label="Website" htmlFor="website" className="sm:col-span-2">
            <input id="website" name="website" type="url" defaultValue={supplier?.website ?? ""} placeholder="https://" className="input" />
          </Field>
          <Field label="About your company" htmlFor="description" className="sm:col-span-2">
            <textarea id="description" name="description" rows={4} defaultValue={supplier?.description ?? ""} className="input" />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton className="btn btn-primary">{supplier ? "Save profile" : "Submit for approval"}</SubmitButton>
          </div>
        </form>
      </Card>
    </>
  );
}
