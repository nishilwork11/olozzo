import type { Metadata } from "next";
import { FileUp } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { Card, CardHeader, Flash, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireSupplier } from "@/lib/supplier";
import { importCsv } from "../actions";

const SAMPLE = `title,description,category,sku,cost,rrp,shipping,stock,days_min,days_max,variants,image
"Bamboo Cutting Board Set","Set of 3 organic bamboo boards with juice groove. FSC certified.",Home & Living,BAMB-3,8.50,34.99,3.90,250,2,4,,https://example.com/board.jpg
"Linen Summer Shirt","Breathable 100% European linen shirt, relaxed fit.",Fashion,LIN-SH,14.00,54.99,3.50,120,3,6,S|M|L|XL,https://example.com/shirt-1.jpg|https://example.com/shirt-2.jpg`;

export const metadata: Metadata = { title: "CSV import · Supplier" };

export default async function SupplierImport({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const flash = await searchParams;
  await requireSupplier();
  const categories = await db.category.findMany({ orderBy: { name: "asc" } });

  return (
    <>
      <PageHeader title="CSV bulk import" description="Upload your whole wholesale catalog at once. Each row becomes a product." />
      <Flash {...flash} />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="h-fit p-6 lg:col-span-2">
          <form action={importCsv} className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-ink-300 px-6 py-10 text-center hover:border-brand-500 hover:bg-brand-50/40">
              <FileUp className="text-ink-400" size={28} />
              <span className="mt-3 text-sm font-medium">Choose a .csv file</span>
              <span className="text-xs text-ink-500">UTF-8, comma-separated, max 2 MB</span>
              <input type="file" name="file" accept=".csv,text/csv" required className="mt-4 text-xs" />
            </label>
            <SubmitButton className="btn btn-primary w-full" pendingText="Importing…">Import products</SubmitButton>
          </form>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader title="File format" />
          <div className="space-y-4 p-5 text-sm">
            <p className="text-ink-600">
              Required columns: <code className="rounded bg-ink-100 px-1">title</code>, <code className="rounded bg-ink-100 px-1">description</code>,{" "}
              <code className="rounded bg-ink-100 px-1">cost</code>, <code className="rounded bg-ink-100 px-1">rrp</code>,{" "}
              <code className="rounded bg-ink-100 px-1">stock</code>, <code className="rounded bg-ink-100 px-1">image</code>. Optional: category, sku, shipping,
              days_min, days_max, variants. Separate multiple images or variants with <code className="rounded bg-ink-100 px-1">|</code>.
            </p>
            <pre className="overflow-x-auto rounded-xl bg-ink-950 p-4 text-[11px] leading-relaxed text-ink-100">{SAMPLE}</pre>
            <p className="text-ink-600">
              Valid categories: {categories.map((c) => c.name).join(", ")}.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
