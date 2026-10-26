#!/usr/bin/env node
// Validates the shop catalog data in prisma/catalog/ before it is seeded.
//   node prisma/catalog/validate.cjs                     check every products/*.json file
//   node prisma/catalog/validate.cjs products/home.json  check one file
//   add --check-images to also confirm every image URL answers 200
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const args = process.argv.slice(2);
const checkImages = args.includes("--check-images");
const tree = JSON.parse(fs.readFileSync(path.join(DIR, "categories.json"), "utf8"));
const suppliers = new Set(JSON.parse(fs.readFileSync(path.join(DIR, "suppliers.json"), "utf8")).map((s) => s.key));
// trending.json: the ranked "Trending now" products. The seed imports them even past the 20-per-file limit.
const trending = JSON.parse(fs.readFileSync(path.join(DIR, "trending.json"), "utf8")).products.map((t) => t.sku);
const trendingSkus = new Set(trending);
const topBySlug = new Map(tree.map((t) => [t.slug, t]));

const IMAGE_RE = /^https:\/\/images\.unsplash\.com\/photo-\d+-[0-9a-f]+\?w=900&q=80&auto=format&fit=crop$/;
const SKU_RE = /^OLZ-[A-Z]{3}-\d{3}$/;
// Trademarks that must not appear in titles or descriptions (we sell unbranded goods)
const BRANDS = /\b(apple|iphone|ipad|airpods?|macbook|samsung|galaxy|sony|playstation|ps[345]|xbox|nintendo|nike|adidas|puma|reebok|lego|barbie|disney|marvel|pok[eé]mon|gucci|louis vuitton|chanel|rolex|casio|dyson|bosch|makita|dewalt|gopro|canon|nikon|fitbit|garmin|tesla|temu|dhgate|amazon|ikea|philips|xiaomi|huawei|logitech|razer|yamaha|fender|gibson|crayola|hello kitty)\b/i;

const files = args.filter((a) => !a.startsWith("--"));
const targets = files.length
  ? files.map((f) => path.resolve(DIR, f))
  : fs.readdirSync(path.join(DIR, "products")).filter((f) => f.endsWith(".json")).map((f) => path.join(DIR, "products", f));

const errors = [];
const warnings = [];
const skus = new Map();
const allImages = new Map();
let productCount = 0;

for (const file of targets) {
  const rel = path.relative(DIR, file);
  const topSlug = path.basename(file, ".json");
  const top = topBySlug.get(topSlug);
  if (!top) { errors.push(`${rel}: file name must be a top-level category slug`); continue; }
  const allowed = new Set([top.slug, ...top.children.map((c) => c.slug)]);
  let products;
  try { products = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { errors.push(`${rel}: invalid JSON (${e.message})`); continue; }
  if (!Array.isArray(products)) { errors.push(`${rel}: must be a JSON array`); continue; }
  if (products.length < 20) warnings.push(`${rel}: ${products.length} products (expected 20)`);
  const skipped = products.slice(20).filter((p) => !trendingSkus.has(p && p.sku)).length;
  if (skipped) warnings.push(`${rel}: ${skipped} product(s) after the first 20 are not in trending.json, so the seed skips them by default`);
  const usedCats = new Set();
  products.forEach((p, i) => {
    const at = `${rel}[${i}] ${p && p.sku ? p.sku : ""}`.trim();
    const err = (m) => errors.push(`${at}: ${m}`);
    if (!p || typeof p !== "object") return err("not an object");
    productCount++;
    if (!SKU_RE.test(p.sku || "")) err(`sku "${p.sku}" must look like OLZ-ABC-001`);
    else if (skus.has(p.sku)) err(`duplicate sku (also in ${skus.get(p.sku)})`);
    else skus.set(p.sku, rel);
    if (typeof p.title !== "string" || p.title.length < 5 || p.title.length > 90) err("title must be 5–90 characters");
    if (!allowed.has(p.category)) err(`category "${p.category}" is not ${top.slug} or one of its subcategories`);
    else usedCats.add(p.category);
    if (!suppliers.has(p.supplier)) err(`unknown supplier "${p.supplier}"`);
    if (typeof p.description !== "string" || p.description.length < 40 || p.description.length > 1500) err("description must be 40–1500 characters");
    const text = `${p.title || ""} ${p.description || ""}`;
    const brand = text.match(BRANDS);
    if (brand) err(`mentions a brand/trademark: "${brand[0]}"`);
    if (/best[- ]?sell|#1|sold\s+\d|\d+\s*k\+?\s*sold|bestseller|top[- ]rated|\d(\.\d)?\s*stars?/i.test(text)) err("no sales/rating claims (best seller, sold counts, stars)");
    if (!Array.isArray(p.images) || p.images.length < 1 || p.images.length > 4) err("images: 1–4 URLs");
    else p.images.forEach((u) => {
      if (!IMAGE_RE.test(u)) err(`image URL format: ${u}`);
      if (allImages.has(u) && allImages.get(u) !== at) warnings.push(`${at}: image also used by ${allImages.get(u)}`);
      else allImages.set(u, at);
    });
    if (!Number.isInteger(p.price) || p.price < 100 || p.price > 200000) err("price: integer cents 100–200000");
    if (p.compareAtPrice !== null && (!Number.isInteger(p.compareAtPrice) || p.compareAtPrice <= p.price || p.compareAtPrice > p.price * 3)) err("compareAtPrice: null, or integer cents above price and at most 3× price");
    if (!Number.isInteger(p.costPrice) || p.costPrice >= p.price || p.costPrice < p.price * 0.15) err("costPrice: integer cents, below price and at least 15% of it");
    if (!Array.isArray(p.variants) || p.variants.length < 1 || p.variants.length > 8) err("variants: 1–8 entries");
    else {
      const names = new Set();
      p.variants.forEach((v) => {
        if (!v || typeof v.name !== "string" || !v.name.trim()) err("variant needs a name");
        else if (names.has(v.name)) err(`duplicate variant "${v.name}"`);
        else names.add(v.name);
        if (!Number.isInteger(v && v.stock) || v.stock < 0) err(`variant "${v && v.name}": stock must be an integer ≥ 0`);
      });
    }
    if (!Number.isInteger(p.shippingDaysMin) || !Number.isInteger(p.shippingDaysMax) || p.shippingDaysMin < 1 || p.shippingDaysMax > 15 || p.shippingDaysMin > p.shippingDaysMax) err("shippingDaysMin/Max: integers 1–15, min ≤ max");
    if (!Number.isInteger(p.weightGrams) || p.weightGrams < 10 || p.weightGrams > 50000) err("weightGrams: integer 10–50000");
    if (typeof p.featured !== "boolean") err("featured must be true or false");
  });
  const subs = top.children.length;
  if (usedCats.size < Math.min(subs, 8)) warnings.push(`${rel}: products cover only ${usedCats.size} of ${subs} subcategories`);
}

if (trendingSkus.size !== trending.length) errors.push("trending.json: a SKU is listed more than once");
if (trending.length > 20) errors.push(`trending.json: ${trending.length} products (at most 20)`);
// SKUs are only all known when every product file was checked
if (!files.length) for (const sku of trending) if (!skus.has(sku)) errors.push(`trending.json: unknown sku ${sku}`);

async function headAll(urls) {
  const bad = [];
  let i = 0;
  async function worker() {
    while (i < urls.length) {
      const u = urls[i++].replace("w=900", "w=64");
      try {
        const r = await fetch(u, { method: "HEAD" });
        if (r.status !== 200) bad.push(`${r.status} ${u}`);
      } catch (e) {
        bad.push(`ERR ${u}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  return bad;
}

(async () => {
  if (checkImages) {
    const bad = await headAll([...allImages.keys()]);
    bad.forEach((b) => errors.push(`image not reachable: ${b}`));
  }
  console.log(`${targets.length} file(s), ${productCount} products, ${allImages.size} distinct images`);
  warnings.forEach((w) => console.log(`WARN  ${w}`));
  errors.forEach((e) => console.log(`ERROR ${e}`));
  console.log(errors.length ? `FAILED with ${errors.length} error(s)` : "OK");
  process.exitCode = errors.length ? 1 : 0; // (not process.exit: avoids a libuv assert on Windows while sockets close)
})();
