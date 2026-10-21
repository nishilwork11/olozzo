import { Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { Card, Flash, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { createCategory, deleteCategory } from "../actions";

export default async function AdminCategories({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const flash = await searchParams;
  const categories = await db.category.findMany({ include: { _count: { select: { products: true } } }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Categories" description="Shared catalog taxonomy used by suppliers, merchants and storefront filters." />
      <Flash {...flash} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit p-5">
          <h2 className="font-semibold">New category</h2>
          <form action={createCategory} className="mt-4 space-y-3">
            <input name="name" required placeholder="e.g. Pet supplies" className="input" />
            <SubmitButton className="btn btn-primary w-full">Add category</SubmitButton>
          </form>
        </Card>
        <Card className="overflow-x-auto lg:col-span-2">
          <table className="table-base">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Products</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">{c.name}</td>
                  <td className="font-mono text-xs text-ink-500">{c.slug}</td>
                  <td>{c._count.products}</td>
                  <td className="text-right">
                    <form action={deleteCategory.bind(null, c.id)}>
                      <SubmitButton className="btn btn-ghost btn-sm text-red-600" confirm={`Delete “${c.name}”? Products keep existing but become uncategorised.`}>
                        <Trash2 size={14} />
                      </SubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
