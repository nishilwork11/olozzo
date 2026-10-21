import "server-only";
import { cache } from "react";
import { getCurrentUser } from "./auth";
import { db } from "./db";

/** Load a storefront by slug. Unpublished stores are visible only to their owner and admins. */
export const getStorefront = cache(async (slug: string) => {
  const store = await db.store.findUnique({ where: { slug } });
  if (!store) return null;
  if (store.published) return store;
  const user = await getCurrentUser();
  if (user && (user.role === "ADMIN" || user.id === store.ownerId)) return store;
  return null;
});

/** Estimated delivery window in business days, including supplier processing time. */
export function deliveryWindow(processingDays: number, min: number, max: number) {
  const add = (days: number) => {
    const d = new Date();
    let added = 0;
    while (added < days) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) added++;
    }
    return d;
  };
  const fmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return { from: fmt.format(add(processingDays + min)), to: fmt.format(add(processingDays + max)) };
}
