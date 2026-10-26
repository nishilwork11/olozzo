import "server-only";
import type { CategoryGroup } from "@/components/supplier/ProductForm";
import { db } from "@/lib/db";

const menuOrder = [{ position: "asc" as const }, { name: "asc" as const }];

/** Top-level categories in menu order with their subcategories, for the product form's category picker. */
export function getCategoryGroups(): Promise<CategoryGroup[]> {
  return db.category.findMany({
    where: { parentId: null },
    orderBy: menuOrder,
    select: { id: true, name: true, children: { select: { id: true, name: true }, orderBy: menuOrder } },
  });
}
