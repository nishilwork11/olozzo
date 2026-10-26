import { categoryIcon } from "@/components/shop/CategoryIcon";

// What the shop draws for a missing or unknown icon name (src/components/shop/CategoryIcon.tsx)
const FALLBACK_ICON = categoryIcon(null);

/** Whether the shop's category menu can draw this lucide icon name (others fall back to a generic tag). */
export function isShopIcon(name: string): boolean {
  return categoryIcon(name) !== FALLBACK_ICON;
}

/** Why a category can't be deleted yet ("it still has 3 products and 2 subcategories"), or null when it can. */
export function deleteBlocker(products: number, children: number): string | null {
  const parts: string[] = [];
  if (products) parts.push(`${products} product${products === 1 ? "" : "s"}`);
  if (children) parts.push(`${children} subcategor${children === 1 ? "y" : "ies"}`);
  return parts.length ? `it still has ${parts.join(" and ")}` : null;
}
