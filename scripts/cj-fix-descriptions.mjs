// One-off: convert already-imported CJ product descriptions from HTML to clean text.
// New imports are already clean; this only fixes rows imported before the fix.
//
// Run:  node --env-file=.env --import tsx/esm scripts/cj-fix-descriptions.mjs
//   or: node --env-file=.env scripts/cj-fix-descriptions.mjs   (Prisma client is plain JS)

import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

function htmlToText(html) {
  return String(html || "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<\s*img[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#3[49];/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const looksHtml = (s) => /<\/?[a-z][\s\S]*>/i.test(s || "");

(async () => {
  const links = await db.cjProduct.findMany({ select: { productId: true } });
  const ids = links.map((l) => l.productId);
  if (!ids.length) { console.log("No imported CJ products found."); return; }

  let p = 0, sp = 0;
  for (const id of ids) {
    const product = await db.product.findUnique({ where: { id }, select: { description: true } });
    if (product && looksHtml(product.description)) {
      await db.product.update({ where: { id }, data: { description: htmlToText(product.description) || "" } });
      p++;
    }
    const storeProducts = await db.storeProduct.findMany({ where: { productId: id }, select: { id: true, description: true } });
    for (const s of storeProducts) {
      if (looksHtml(s.description)) {
        await db.storeProduct.update({ where: { id: s.id }, data: { description: htmlToText(s.description) || "" } });
        sp++;
      }
    }
  }
  console.log(`✅ Cleaned ${p} product(s) and ${sp} store product(s).`);
})()
  .catch((e) => { console.error("✖", e.message); process.exit(1); })
  .finally(() => db.$disconnect());
