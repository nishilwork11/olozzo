import Link from "next/link";
import { CornerDownRight, ExternalLink, Lock, Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { SubmitButton } from "@/components/client";
import { categoryIcon } from "@/components/shop/CategoryIcon";
import { Card, Flash, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { createCategory, deleteCategory, updateCategory } from "../actions";
import { deleteBlocker, isShopIcon } from "./helpers";

type Row = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  position: number;
  parentId: string | null;
  _count: { products: number; children: number };
};
type TreeRow = { row: Row; depth: number; parent: Row | null; total: number };

export default async function AdminCategories({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string; parent?: string }>;
}) {
  const { edit, parent, ...flash } = await searchParams;
  const rows: Row[] = await db.category.findMany({
    select: { id: true, name: true, slug: true, icon: true, position: true, parentId: true, _count: { select: { products: true, children: true } } },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });

  // Top-level categories in menu order, each followed by its subcategories
  const byId = new Map(rows.map((r) => [r.id, r]));
  const childrenOf = new Map<string, Row[]>();
  for (const r of rows) if (r.parentId && byId.has(r.parentId)) childrenOf.set(r.parentId, [...(childrenOf.get(r.parentId) ?? []), r]);
  const tree: TreeRow[] = [];
  const seen = new Set<string>();
  const visit = (row: Row, depth: number, parentRow: Row | null): number => {
    seen.add(row.id);
    const entry: TreeRow = { row, depth, parent: parentRow, total: row._count.products };
    tree.push(entry);
    for (const child of childrenOf.get(row.id) ?? []) if (!seen.has(child.id)) entry.total += visit(child, depth + 1, row);
    return entry.total;
  };
  for (const r of rows) if (!r.parentId || !byId.has(r.parentId)) visit(r, 0, null);
  for (const r of rows) if (!seen.has(r.id)) visit(r, 0, null); // a broken parent chain still shows up

  const topLevel = rows.filter((r) => !r.parentId);
  const editing = edit ? byId.get(edit) : undefined;
  const newParent = parent && byId.get(parent) && !byId.get(parent)!.parentId ? parent : undefined;
  const iconNames = [...new Set(rows.map((r) => r.icon).filter((i): i is string => !!i && isShopIcon(i)))].sort();
  const productCount = rows.reduce((sum, r) => sum + r._count.products, 0);
  const formHref = (query: string) => `/admin/categories?${query}#category-form`;

  return (
    <>
      <PageHeader
        title="Categories"
        description="The shop's two-level category tree (top-level categories and their subcategories), shared by suppliers, merchants and the storefront menu."
      />
      <Flash {...flash} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit p-5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          <div id="category-form" className="scroll-mt-24" />
          {editing ? (
            <>
              <h2 className="font-semibold">Edit category</h2>
              <p className="mt-0.5 text-xs text-ink-500">
                {editing.parentId ? `Subcategory of ${byId.get(editing.parentId)?.name ?? "another category"}` : "Top-level category"}
              </p>
              <form action={updateCategory.bind(null, editing.id)} className="mt-4 space-y-3">
                <CategoryFields category={editing} parents={topLevel} iconNames={iconNames} />
                <div className="flex gap-2 pt-1">
                  <SubmitButton className="btn btn-primary flex-1">Save changes</SubmitButton>
                  <Link href="/admin/categories" className="btn btn-secondary">
                    Cancel
                  </Link>
                </div>
              </form>
              <DeleteSection category={editing} />
            </>
          ) : (
            <>
              <h2 className="font-semibold">{newParent ? `New subcategory of ${byId.get(newParent)!.name}` : "New category"}</h2>
              <form action={createCategory} className="mt-4 space-y-3">
                <CategoryFields parents={topLevel} iconNames={iconNames} defaultParentId={newParent} />
                <SubmitButton className="btn btn-primary w-full">
                  <Plus size={16} aria-hidden="true" /> Add category
                </SubmitButton>
              </form>
            </>
          )}
        </Card>

        <Card className="overflow-x-auto lg:col-span-2">
          <p className="border-b border-ink-100 px-4 py-3 text-sm text-ink-500">
            {topLevel.length} top-level · {rows.length - topLevel.length} subcategories · {productCount} products
          </p>
          {rows.length === 0 ? (
            <p className="p-10 text-center text-sm text-ink-500">No categories yet. Add the first one with the form.</p>
          ) : (
            <table className="table-base">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Icon</th>
                  <th>Slug</th>
                  <th className="text-right">Position</th>
                  <th className="text-right">Products</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {tree.map(({ row, depth, parent: parentRow, total }) => {
                  const blocker = deleteBlocker(row._count.products, row._count.children);
                  const Icon = row.icon && isShopIcon(row.icon) ? categoryIcon(row.icon) : null;
                  return (
                    <tr key={row.id} className={row.id === editing?.id ? "bg-brand-50/70" : depth === 0 ? "bg-ink-50/40" : undefined}>
                      <td>
                        <div className="flex items-center gap-2" style={{ paddingLeft: depth ? `${depth * 1.25}rem` : undefined }}>
                          {depth > 0 && <CornerDownRight size={14} className="shrink-0 text-ink-300" aria-hidden="true" />}
                          <div className="min-w-0">
                            <p className={cn(depth === 0 ? "font-semibold text-ink-900" : "text-ink-800")}>
                              {parentRow && <span className="sr-only">{parentRow.name} › </span>}
                              {row.name}
                            </p>
                            {depth === 0 && row._count.children > 0 && (
                              <p className="text-xs text-ink-500">
                                {row._count.children} subcategor{row._count.children === 1 ? "y" : "ies"}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        {row.icon ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-ink-600">
                            {Icon ? (
                              <Icon size={16} className="text-brand-700" aria-hidden="true" />
                            ) : (
                              <TriangleAlert size={14} className="text-amber-600" aria-hidden="true" />
                            )}
                            <span className="font-mono">{row.icon}</span>
                            {!Icon && <span className="text-amber-700">(the shop shows a tag icon instead)</span>}
                          </span>
                        ) : (
                          <>
                            <span className="text-ink-300" aria-hidden="true">
                              —
                            </span>
                            <span className="sr-only">No icon</span>
                          </>
                        )}
                      </td>
                      <td>
                        <Link
                          href={`/c/${row.slug}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 font-mono text-xs text-ink-500 hover:text-ink-900 hover:underline"
                        >
                          {row.slug} <ExternalLink size={11} aria-hidden="true" />
                          <span className="sr-only">(opens the category page in a new tab)</span>
                        </Link>
                      </td>
                      <td className="text-right tabular-nums text-ink-600">{row.position}</td>
                      <td className="text-right tabular-nums">
                        {depth === 0 && row._count.children > 0 ? (
                          <>
                            <span className="font-medium">{total}</span>
                            <span className="block text-xs text-ink-500">{row._count.products ? `${row._count.products} directly` : "in subcategories"}</span>
                          </>
                        ) : (
                          row._count.products
                        )}
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          {!row.parentId && (
                            <Link href={formHref(`parent=${row.id}`)} className="btn btn-ghost btn-sm" title={`Add a subcategory to ${row.name}`}>
                              <Plus size={14} aria-hidden="true" />
                              <span className="sr-only">Add a subcategory to {row.name}</span>
                            </Link>
                          )}
                          <Link href={formHref(`edit=${row.id}`)} className="btn btn-ghost btn-sm" title={`Edit ${row.name}`}>
                            <Pencil size={14} aria-hidden="true" />
                            <span className="sr-only">Edit {row.name}</span>
                          </Link>
                          {blocker ? (
                            <span className="btn btn-sm cursor-help text-ink-300" title={`Can't be deleted while ${blocker}`}>
                              <Lock size={14} aria-hidden="true" />
                              <span className="sr-only">Can&apos;t be deleted while {blocker}</span>
                            </span>
                          ) : (
                            <form action={deleteCategory.bind(null, row.id)}>
                              <SubmitButton className="btn btn-ghost btn-sm text-red-600" confirm={`Delete the empty category “${row.name}”?`}>
                                <Trash2 size={14} aria-hidden="true" />
                                <span className="sr-only">Delete {row.name}</span>
                              </SubmitButton>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}

function CategoryFields({
  category,
  parents,
  iconNames,
  defaultParentId,
}: {
  category?: Row;
  parents: Row[];
  iconNames: string[];
  defaultParentId?: string;
}) {
  // Two levels only: a category with subcategories stays top level
  const mustStayTopLevel = !!category && category._count.children > 0;
  return (
    <>
      <div>
        <label className="label" htmlFor="category-name">
          Name
        </label>
        <input id="category-name" name="name" required minLength={2} maxLength={60} defaultValue={category?.name} placeholder="e.g. Pet Supplies" className="input" />
      </div>
      <div>
        <label className="label" htmlFor="category-parent">
          Parent
        </label>
        <select
          id="category-parent"
          name="parentId"
          defaultValue={category ? category.parentId ?? "" : defaultParentId ?? ""}
          disabled={mustStayTopLevel}
          aria-describedby={mustStayTopLevel ? "category-parent-hint" : undefined}
          className="input"
        >
          <option value="">None: a top-level category</option>
          {parents
            .filter((p) => p.id !== category?.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        {mustStayTopLevel && (
          <p id="category-parent-hint" className="mt-1 text-xs text-ink-500">
            It has subcategories, so it stays top level (categories have two levels).
          </p>
        )}
      </div>
      <div>
        <label className="label" htmlFor="category-slug">
          Slug <span className="font-normal text-ink-400">(optional)</span>
        </label>
        <input
          id="category-slug"
          name="slug"
          defaultValue={category?.slug}
          maxLength={60}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          placeholder="made from the name"
          aria-describedby="category-slug-hint"
          className="input font-mono text-xs"
        />
        <p id="category-slug-hint" className="mt-1 text-xs text-ink-500">
          Lowercase letters, numbers and hyphens, used in the category&apos;s web address{category ? ": changing it breaks old links" : ""}.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="category-icon">
            Icon
          </label>
          <input
            id="category-icon"
            name="icon"
            list="category-icon-names"
            defaultValue={category?.icon ?? ""}
            placeholder="e.g. Shirt"
            autoComplete="off"
            aria-describedby="category-icon-hint"
            className="input"
          />
          <datalist id="category-icon-names">
            {iconNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label" htmlFor="category-position">
            Position
          </label>
          <input
            id="category-position"
            name="position"
            type="number"
            min={0}
            max={9999}
            defaultValue={category?.position}
            placeholder="last"
            aria-describedby="category-position-hint"
            className="input"
          />
        </div>
      </div>
      <p className="text-xs text-ink-500">
        <span id="category-icon-hint">Icon: a lucide icon name, shown next to top-level categories in the shop menu. </span>
        <span id="category-position-hint">Position: order among its siblings, lowest first; empty puts it last.</span>
      </p>
    </>
  );
}

function DeleteSection({ category }: { category: Row }) {
  const blocker = deleteBlocker(category._count.products, category._count.children);
  return (
    <div className="mt-5 border-t border-ink-100 pt-4">
      {blocker ? (
        <p className="flex gap-2 text-xs text-ink-500">
          <Lock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Can&apos;t be deleted while {blocker}. Only empty categories can be deleted, so no product loses its category.
          </span>
        </p>
      ) : (
        <form action={deleteCategory.bind(null, category.id)}>
          <SubmitButton className="btn btn-danger btn-sm w-full" confirm={`Delete the empty category “${category.name}”?`}>
            <Trash2 size={14} aria-hidden="true" /> Delete category
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
