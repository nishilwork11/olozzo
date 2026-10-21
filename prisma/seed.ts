/* Seed olozzo with a realistic European dropshipping demo. Run: npm run db:seed */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { vatFromGross, vatRateFor } from "../src/lib/eu";
import { planFor } from "../src/lib/plans";
import { endWith99, variantRetailPrice } from "../src/lib/pricing";

const db = new PrismaClient();
const PASSWORD = "Demo1234!";
const img = (id: string) => `https://images.unsplash.com/photo-${id}?w=900&q=80&auto=format&fit=crop`;

// Deterministic pseudo-random so every seed looks the same
let rngState = 42;
const rand = () => ((rngState = (rngState * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
const daysAgo = (d: number, h = 10) => {
  const date = new Date();
  date.setDate(date.getDate() - d);
  date.setHours(h, Math.floor(rand() * 59), 0, 0);
  return date;
};
const code = (n = 8) => Array.from({ length: n }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(rand() * 32)]).join("");

type SeedProduct = {
  key: string;
  supplier: "s1" | "s2" | "s3";
  category: string;
  title: string;
  description: string;
  images: string[];
  cost: number;
  suggested: number;
  shipping: number;
  days: [number, number];
  weight: number;
  variants: { name: string; cost?: number; stock: number }[];
};

const PRODUCTS: SeedProduct[] = [
  {
    key: "headphones", supplier: "s1", category: "electronics",
    title: "Aurora ANC Wireless Headphones",
    description: "Over-ear headphones with hybrid active noise cancelling, 40-hour battery life and USB-C fast charging. Soft memory-foam ear cushions and a foldable design make them perfect for commuting and travel. CE certified, 2-year EU warranty.",
    images: [img("1505740420928-5e560c06d30e"), img("1583394838336-acd977736f90")],
    cost: 3800, suggested: 8999, shipping: 390, days: [2, 4], weight: 320,
    variants: [{ name: "Matte Black", stock: 120 }, { name: "Pearl White", stock: 80 }],
  },
  {
    key: "earbuds", supplier: "s1", category: "electronics",
    title: "PulseBuds Pro True Wireless Earbuds",
    description: "Compact true wireless earbuds with Bluetooth 5.3, ENC microphones for crystal-clear calls, IPX5 sweat resistance and a pocket-sized charging case with 30 hours of total playtime.",
    images: [img("1590658268037-6bf12165a8df"), img("1585155770447-2f66e2a397b5")],
    cost: 1900, suggested: 4999, shipping: 290, days: [2, 4], weight: 90,
    variants: [{ name: "Snow White", stock: 150 }, { name: "Graphite", stock: 140 }],
  },
  {
    key: "speaker", supplier: "s1", category: "electronics",
    title: "Boom Mini Waterproof Speaker",
    description: "Portable Bluetooth speaker with deep bass, IP67 waterproofing and 12 hours of playtime. Pair two for stereo sound. Built-in strap for bikes and backpacks.",
    images: [img("1608043152269-423dbba4e7e1")],
    cost: 2400, suggested: 5999, shipping: 390, days: [2, 4], weight: 540,
    variants: [{ name: "Default", stock: 90 }],
  },
  {
    key: "smartwatch", supplier: "s1", category: "electronics",
    title: "Vita Smartwatch Fitness Tracker",
    description: "AMOLED smartwatch with heart-rate, SpO2 and sleep tracking, 100+ workout modes, GPS and 7-day battery. Works with iOS and Android. Available in two case sizes.",
    images: [img("1546868871-7041f2a55e12")],
    cost: 3200, suggested: 7999, shipping: 290, days: [2, 4], weight: 120,
    variants: [{ name: "41 mm", stock: 60 }, { name: "45 mm", cost: 3500, stock: 45 }],
  },
  {
    key: "camera", supplier: "s1", category: "electronics",
    title: "Snap Retro Instant Camera",
    description: "Point, shoot and print in seconds. Retro instant camera with automatic exposure, selfie mirror and built-in flash. Compatible with standard instant film packs.",
    images: [img("1526170375885-4d8ecf77b99f")],
    cost: 5200, suggested: 11999, shipping: 490, days: [2, 5], weight: 480,
    variants: [{ name: "Default", stock: 35 }],
  },
  {
    key: "rosewatch", supplier: "s2", category: "accessories",
    title: "Lumen Rose Gold Minimalist Watch",
    description: "Scandinavian-inspired minimalist watch with a rose gold stainless-steel case, sapphire-coated glass and an Italian leather strap. 3 ATM water resistant.",
    images: [img("1593998066526-65fcab3021a2")],
    cost: 2100, suggested: 6999, shipping: 350, days: [3, 6], weight: 150,
    variants: [{ name: "Default", stock: 70 }],
  },
  {
    key: "whitewatch", supplier: "s2", category: "accessories",
    title: "Classic White Dial Watch",
    description: "Timeless analogue watch with a clean white dial, Japanese quartz movement and interchangeable strap. A everyday essential that pairs with everything.",
    images: [img("1523275335684-37898b6baf30"), img("1524592094714-0f0654e20314")],
    cost: 1800, suggested: 5999, shipping: 350, days: [3, 6], weight: 140,
    variants: [{ name: "Default", stock: 55 }],
  },
  {
    key: "sunglasses", supplier: "s2", category: "accessories",
    title: "Riviera Polarised Sunglasses",
    description: "Polarised UV400 lenses in a lightweight acetate frame. Reduces glare on the water and the road. Comes with a recycled microfibre pouch.",
    images: [img("1572635196237-14b3f281503f")],
    cost: 700, suggested: 2999, shipping: 250, days: [3, 6], weight: 60,
    variants: [{ name: "Tortoise", stock: 200 }, { name: "Black", stock: 180 }],
  },
  {
    key: "tote", supplier: "s2", category: "fashion",
    title: "Organic Cotton Tote Bag",
    description: "GOTS-certified organic cotton tote with reinforced handles. Roomy enough for groceries, a laptop or a beach day. Made in Portugal.",
    images: [img("1544816155-12df9643f363")],
    cost: 400, suggested: 1999, shipping: 250, days: [3, 6], weight: 180,
    variants: [{ name: "Default", stock: 400 }],
  },
  {
    key: "sweatshirt", supplier: "s2", category: "fashion",
    title: "Essential Crewneck Sweatshirt",
    description: "Heavyweight 350 gsm brushed-back fleece in a relaxed fit. Ethically made in Portugal from 80% organic cotton and 20% recycled polyester.",
    images: [img("1620799140408-edc6dcb6d633")],
    cost: 1400, suggested: 4499, shipping: 350, days: [3, 6], weight: 520,
    variants: [{ name: "S", stock: 60 }, { name: "M", stock: 90 }, { name: "L", stock: 80 }, { name: "XL", cost: 1500, stock: 40 }],
  },
  {
    key: "backpack", supplier: "s2", category: "fashion",
    title: "Metro Commuter Backpack",
    description: "Water-repellent 22 L backpack with a padded 16\" laptop sleeve, hidden anti-theft pocket and luggage pass-through. Built for city life and weekend trips.",
    images: [img("1553062407-98eeb64c6a62")],
    cost: 2200, suggested: 6499, shipping: 390, days: [3, 6], weight: 900,
    variants: [{ name: "Default", stock: 75 }],
  },
  {
    key: "sneakers", supplier: "s2", category: "fashion",
    title: "Prism Chunky Retro Sneakers",
    description: "Statement retro runners with a cushioned chunky sole, breathable mesh and suede overlays. True to size (EU sizing).",
    images: [img("1560769629-975ec94e6a86"), img("1491553895911-0055eca6402d")],
    cost: 2900, suggested: 8999, shipping: 490, days: [3, 6], weight: 950,
    variants: ["38", "39", "40", "41", "42", "43", "44"].map((s) => ({ name: `EU ${s}`, stock: 25 })),
  },
  {
    key: "runners", supplier: "s2", category: "fashion",
    title: "Velocity Red Runners",
    description: "Lightweight everyday runners with a responsive foam midsole and knitted upper. A bold colour pop for any outfit.",
    images: [img("1542291026-7eec264c27ff")],
    cost: 3100, suggested: 9499, shipping: 490, days: [3, 6], weight: 800,
    variants: ["40", "41", "42", "43", "44"].map((s) => ({ name: `EU ${s}`, stock: 30 })),
  },
  {
    key: "sofa", supplier: "s2", category: "home",
    title: "Velvet Mid-Century 2-Seater Sofa",
    description: "Mid-century modern two-seater upholstered in soft-touch velvet with solid beech legs. Delivered flat-packed with tool-free assembly in under 15 minutes. W 150 × D 82 × H 84 cm.",
    images: [img("1567016432779-094069958ea5"), img("1555041469-a586c61ea9bc")],
    cost: 31000, suggested: 69900, shipping: 4900, days: [7, 12], weight: 38000,
    variants: [{ name: "Burnt Orange", stock: 8 }, { name: "Sage Green", stock: 6 }],
  },
  {
    key: "moisturiser", supplier: "s3", category: "beauty",
    title: "Hydra Daily Moisturiser 50 ml",
    description: "Lightweight daily moisturiser with hyaluronic acid and niacinamide. Fragrance-free, vegan and dermatologically tested. EU Cosmetics Regulation (EC) 1223/2009 compliant.",
    images: [img("1556228578-8c89e6adf883")],
    cost: 600, suggested: 2499, shipping: 290, days: [2, 5], weight: 110,
    variants: [{ name: "Default", stock: 300 }],
  },
  {
    key: "skincare", supplier: "s3", category: "beauty",
    title: "Glow Skincare Starter Kit",
    description: "Cleanser, serum and night cream — a complete three-step routine in a gift-ready recycled box. Suitable for all skin types.",
    images: [img("1571781926291-c477ebfd024b")],
    cost: 1500, suggested: 4999, shipping: 290, days: [2, 5], weight: 420,
    variants: [{ name: "Default", stock: 120 }],
  },
  {
    key: "parfum", supplier: "s3", category: "beauty",
    title: "Noir Eau de Parfum 50 ml",
    description: "A warm, woody fragrance with notes of bergamot, cedar and amber. Long-lasting eau de parfum made in Grasse, France.",
    images: [img("1585386959984-a4155224a1ad")],
    cost: 1200, suggested: 5499, shipping: 290, days: [2, 5], weight: 260,
    variants: [{ name: "Default", stock: 90 }],
  },
  {
    key: "yogamat", supplier: "s3", category: "sports",
    title: "Flow Eco Yoga Mat",
    description: "6 mm non-slip yoga mat made from natural tree rubber and recycled TPE. Includes a carry strap. 183 × 61 cm.",
    images: [img("1601925260368-ae2f83cf8b7f")],
    cost: 1100, suggested: 3999, shipping: 450, days: [2, 5], weight: 1600,
    variants: [{ name: "Teal", stock: 70 }, { name: "Charcoal", stock: 80 }, { name: "Plum", stock: 40 }],
  },
  {
    key: "bottle", supplier: "s3", category: "sports",
    title: "Thermo Steel Bottle 500 ml",
    description: "Double-wall vacuum-insulated stainless-steel bottle. Keeps drinks cold for 24 hours or hot for 12. BPA-free and leak-proof.",
    images: [img("1602143407151-7111542de6e8")],
    cost: 600, suggested: 2499, shipping: 290, days: [2, 5], weight: 340,
    variants: [{ name: "Forest Green", stock: 150 }, { name: "Midnight Black", stock: 160 }],
  },
];

const CUSTOMERS = [
  { name: "Max Müller", email: "customer@olozzo.com", line1: "Marienplatz 8", city: "München", postal: "80331", country: "DE" },
  { name: "Emma de Vries", email: "emma.devries@example.nl", line1: "Damrak 21", city: "Amsterdam", postal: "1012 LG", country: "NL" },
  { name: "Lucas Dubois", email: "lucas.dubois@example.fr", line1: "12 Rue de la République", city: "Lyon", postal: "69002", country: "FR" },
  { name: "Giulia Rossi", email: "giulia.rossi@example.it", line1: "Via Dante 7", city: "Milano", postal: "20121", country: "IT" },
  { name: "Mateo García", email: "mateo.garcia@example.es", line1: "Calle Mayor 15", city: "Madrid", postal: "28013", country: "ES" },
  { name: "Anna Kowalska", email: "anna.kowalska@example.pl", line1: "Rynek Główny 3", city: "Kraków", postal: "31-042", country: "PL" },
  { name: "Sofia Andersson", email: "sofia.andersson@example.se", line1: "Drottninggatan 50", city: "Stockholm", postal: "111 21", country: "SE" },
  { name: "Liam Murphy", email: "liam.murphy@example.ie", line1: "14 Grafton Street", city: "Dublin", postal: "D02 X285", country: "IE" },
  { name: "Jan Novák", email: "jan.novak@example.cz", line1: "Na Příkopě 10", city: "Praha", postal: "110 00", country: "CZ" },
  { name: "Laura Peeters", email: "laura.peeters@example.be", line1: "Meir 45", city: "Antwerpen", postal: "2000", country: "BE" },
];

const CARRIERS = [
  { name: "DHL", url: (t: string) => `https://www.dhl.com/de-en/home/tracking.html?tracking-id=${t}` },
  { name: "DPD", url: (t: string) => `https://tracking.dpd.de/status/en_US/parcel/${t}` },
  { name: "GLS", url: (t: string) => `https://gls-group.com/track/${t}` },
];

async function main() {
  console.log("🧹 Clearing database…");
  await db.auditLog.deleteMany();
  await db.returnRequest.deleteMany();
  await db.orderItem.deleteMany();
  await db.supplierOrder.deleteMany();
  await db.order.deleteMany();
  await db.discountCode.deleteMany();
  await db.storeProduct.deleteMany();
  await db.productVariant.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.supplier.deleteMany();
  await db.store.deleteMany();
  await db.user.deleteMany();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const user = (email: string, name: string, role: string) =>
    db.user.create({ data: { email, name, role, passwordHash } });

  console.log("👤 Users…");
  const admin = await user("admin@olozzo.com", "Olivia Admin", "ADMIN");
  const merchant = await user("merchant@olozzo.com", "Lena Fischer", "MERCHANT");
  const merchant2 = await user("merchant2@olozzo.com", "Sophie Martin", "MERCHANT");
  const sup1 = await user("supplier@olozzo.com", "Jonas Becker", "SUPPLIER");
  const sup2 = await user("supplier2@olozzo.com", "Inês Duarte", "SUPPLIER");
  const sup3 = await user("supplier3@olozzo.com", "Kasia Nowak", "SUPPLIER");
  const sup4 = await user("newsupplier@olozzo.com", "Luca Romano", "SUPPLIER");
  const customer = await user("customer@olozzo.com", "Max Müller", "CUSTOMER");

  console.log("🏷️  Categories…");
  const categoryData = [
    ["electronics", "Electronics"],
    ["fashion", "Fashion"],
    ["accessories", "Accessories"],
    ["home", "Home & Living"],
    ["beauty", "Beauty"],
    ["sports", "Sports & Outdoors"],
  ];
  const categories: Record<string, string> = {};
  for (const [slug, name] of categoryData) {
    categories[slug] = (await db.category.create({ data: { slug, name } })).id;
  }

  console.log("🏭 Suppliers…");
  const suppliers = {
    s1: await db.supplier.create({
      data: {
        userId: sup1.id, companyName: "Berlin Gadget Wholesale GmbH", country: "DE", vatNumber: "DE312456789",
        processingDays: 1, status: "APPROVED", website: "https://example.com/berlin-gadgets",
        description: "Consumer electronics wholesaler with a warehouse in Berlin. Same-day dispatch on orders before 14:00.",
      },
    }),
    s2: await db.supplier.create({
      data: {
        userId: sup2.id, companyName: "Lisboa Lifestyle Lda", country: "PT", vatNumber: "PT509876543",
        processingDays: 2, status: "APPROVED", website: "https://example.com/lisboa-lifestyle",
        description: "Fashion, accessories and home goods, ethically produced in Portugal.",
      },
    }),
    s3: await db.supplier.create({
      data: {
        userId: sup3.id, companyName: "Wisła Wellness Sp. z o.o.", country: "PL", vatNumber: "PL5272834561",
        processingDays: 2, status: "APPROVED",
        description: "EU-compliant beauty and fitness products shipped from our warehouse in Warsaw.",
      },
    }),
  };
  await db.supplier.create({
    data: {
      userId: sup4.id, companyName: "Milano Moda Srl", country: "IT", vatNumber: "IT01234567890",
      processingDays: 3, status: "PENDING", description: "Italian leather goods — application awaiting review.",
    },
  });

  console.log("📦 Supplier catalog…");
  const products: Record<string, Awaited<ReturnType<typeof db.product.create>> & { variants: { id: string; name: string; costPrice: number }[] }> = {};
  for (const p of PRODUCTS) {
    const skuBase = p.key.toUpperCase().slice(0, 6);
    const created = await db.product.create({
      data: {
        supplierId: suppliers[p.supplier].id,
        categoryId: categories[p.category],
        title: p.title,
        description: p.description,
        images: JSON.stringify(p.images),
        sku: `${p.supplier.toUpperCase()}-${skuBase}`,
        costPrice: p.cost,
        suggestedPrice: p.suggested,
        shippingCost: p.shipping,
        shippingDaysMin: p.days[0],
        shippingDaysMax: p.days[1],
        weightGrams: p.weight,
        variants: {
          create: p.variants.map((v, i) => ({
            name: v.name,
            sku: `${p.supplier.toUpperCase()}-${skuBase}-${i + 1}`,
            costPrice: v.cost ?? p.cost,
            stock: v.stock,
            position: i,
          })),
        },
      },
      include: { variants: { orderBy: { position: "asc" } } },
    });
    products[p.key] = created;
  }

  console.log("🏪 Stores…");
  const urbanNest = await db.store.create({
    data: {
      ownerId: merchant.id, name: "Urban Nest", slug: "urban-nest", country: "DE", plan: "GROWTH",
      tagline: "Everyday design, delivered across Europe",
      description: "Curated tech, fashion and home essentials — shipped from EU warehouses in 2–6 days with free returns.",
      accentColor: "#4f46e5", supportEmail: "hello@urban-nest.example", bannerUrl: img("1513694203232-719a280e022f"),
      shippingRate: 495, freeShippingOver: 6000, markupPercent: 150,
    },
  });
  const glowAndGo = await db.store.create({
    data: {
      ownerId: merchant2.id, name: "Glow & Go", slug: "glow-and-go", country: "FR", plan: "STARTER",
      tagline: "Clean beauty & active living",
      description: "Vegan skincare and eco-friendly fitness gear for your daily ritual. Shipped from within the EU.",
      accentColor: "#db2777", supportEmail: "bonjour@glowandgo.example", bannerUrl: img("1571781926291-c477ebfd024b"),
      shippingRate: 390, freeShippingOver: 4000, markupPercent: 180,
    },
  });

  const imports: { store: typeof urbanNest; keys: string[]; featured: string[]; sale: string[] }[] = [
    {
      store: urbanNest,
      keys: ["headphones", "earbuds", "speaker", "smartwatch", "camera", "rosewatch", "whitewatch", "sunglasses", "tote", "sweatshirt", "backpack", "sneakers", "runners", "sofa", "bottle"],
      featured: ["headphones", "sneakers", "sofa", "camera"],
      sale: ["headphones", "backpack", "sunglasses"],
    },
    {
      store: glowAndGo,
      keys: ["moisturiser", "skincare", "parfum", "yogamat", "bottle", "earbuds", "smartwatch", "tote"],
      featured: ["skincare", "yogamat", "parfum"],
      sale: ["skincare", "bottle"],
    },
  ];

  const storeProducts: Record<string, Record<string, { id: string; price: number }>> = {};
  for (const { store, keys, featured, sale } of imports) {
    storeProducts[store.id] = {};
    for (const key of keys) {
      const p = products[key];
      const sp = await db.storeProduct.create({
        data: {
          storeId: store.id,
          productId: p.id,
          title: p.title,
          slug: key === "bottle" ? "thermo-steel-bottle" : p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
          description: p.description,
          price: p.suggestedPrice,
          compareAtPrice: sale.includes(key) ? endWith99(Math.round(p.suggestedPrice * 1.3)) : null,
          featured: featured.includes(key),
        },
      });
      storeProducts[store.id][key] = { id: sp.id, price: sp.price };
    }
  }

  console.log("🎟️  Discount codes…");
  await db.discountCode.createMany({
    data: [
      { storeId: urbanNest.id, code: "WELCOME10", type: "PERCENT", value: 10 },
      { storeId: urbanNest.id, code: "SAVE5", type: "FIXED", value: 500, minSubtotal: 3000, maxUses: 500 },
      { storeId: glowAndGo.id, code: "GLOW15", type: "PERCENT", value: 15, minSubtotal: 3000 },
    ],
  });

  console.log("🧾 Orders…");
  type Plan = { store: typeof urbanNest; status: "DELIVERED" | "SHIPPED" | "PROCESSING" | "PENDING" | "REFUNDED"; days: number; lines: [string, number, number][] };
  // [productKey, variantIndex, quantity]
  const plans: Plan[] = [
    { store: urbanNest, status: "DELIVERED", days: 19, lines: [["headphones", 0, 1]] },
    { store: urbanNest, status: "DELIVERED", days: 17, lines: [["sneakers", 3, 1], ["tote", 0, 2]] },
    { store: urbanNest, status: "DELIVERED", days: 15, lines: [["camera", 0, 1]] },
    { store: urbanNest, status: "DELIVERED", days: 13, lines: [["backpack", 0, 1], ["bottle", 1, 1]] },
    { store: urbanNest, status: "REFUNDED", days: 12, lines: [["smartwatch", 1, 1]] },
    { store: urbanNest, status: "DELIVERED", days: 11, lines: [["sofa", 0, 1]] },
    { store: urbanNest, status: "DELIVERED", days: 9, lines: [["earbuds", 0, 2]] },
    { store: urbanNest, status: "SHIPPED", days: 7, lines: [["sweatshirt", 1, 2], ["sunglasses", 0, 1]] },
    { store: urbanNest, status: "SHIPPED", days: 5, lines: [["headphones", 1, 1], ["speaker", 0, 1]] },
    { store: urbanNest, status: "SHIPPED", days: 4, lines: [["runners", 2, 1]] },
    { store: urbanNest, status: "PROCESSING", days: 2, lines: [["rosewatch", 0, 1], ["tote", 0, 1]] },
    { store: urbanNest, status: "PROCESSING", days: 1, lines: [["camera", 0, 1], ["earbuds", 1, 1]] },
    { store: urbanNest, status: "PROCESSING", days: 0, lines: [["whitewatch", 0, 1]] },
    { store: urbanNest, status: "PENDING", days: 0, lines: [["sofa", 1, 1]] },
    { store: glowAndGo, status: "DELIVERED", days: 16, lines: [["skincare", 0, 1], ["moisturiser", 0, 2]] },
    { store: glowAndGo, status: "DELIVERED", days: 10, lines: [["yogamat", 0, 1], ["bottle", 0, 1]] },
    { store: glowAndGo, status: "SHIPPED", days: 6, lines: [["parfum", 0, 1]] },
    { store: glowAndGo, status: "SHIPPED", days: 3, lines: [["yogamat", 2, 1], ["skincare", 0, 1]] },
    { store: glowAndGo, status: "PROCESSING", days: 1, lines: [["moisturiser", 0, 3], ["tote", 0, 1]] },
    { store: glowAndGo, status: "PROCESSING", days: 0, lines: [["smartwatch", 0, 1], ["bottle", 1, 2]] },
  ];

  let customerIdx = 0;
  for (const plan of plans) {
    const c = CUSTOMERS[customerIdx++ % CUSTOMERS.length];
    const lines = plan.lines.map(([key, vIdx, qty]) => {
      const p = products[key];
      const v = p.variants[vIdx];
      const sp = storeProducts[plan.store.id][key];
      const unitPrice = variantRetailPrice(sp.price, p.costPrice, v.costPrice);
      return { p, v, sp, qty, unitPrice };
    });
    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    const shippingTotal = plan.store.freeShippingOver !== null && subtotal >= plan.store.freeShippingOver ? 0 : plan.store.shippingRate;
    const total = subtotal + shippingTotal;
    const vatRate = vatRateFor(c.country);
    const supplierShipping = new Map<string, number>();
    for (const l of lines) supplierShipping.set(l.p.supplierId, Math.max(supplierShipping.get(l.p.supplierId) ?? 0, l.p.shippingCost));
    const costTotal = lines.reduce((s, l) => s + l.v.costPrice * l.qty, 0) + [...supplierShipping.values()].reduce((a, b) => a + b, 0);
    const createdAt = daysAgo(plan.days, 8 + Math.floor(rand() * 12));
    const paid = plan.status !== "PENDING";

    const order = await db.order.create({
      data: {
        number: `OLZ-${code()}`,
        storeId: plan.store.id,
        customerId: c.email === customer.email ? customer.id : null,
        email: c.email, name: c.name, addressLine1: c.line1, city: c.city, postalCode: c.postal, country: c.country,
        status: plan.status,
        paymentStatus: plan.status === "PENDING" ? "UNPAID" : plan.status === "REFUNDED" ? "REFUNDED" : "PAID",
        paymentProvider: "demo",
        paymentRef: paid ? `demo_${code(10)}` : null,
        subtotal, shippingTotal, total, vatRate, vatTotal: vatFromGross(total, vatRate), costTotal,
        platformFee: Math.round(total * planFor(plan.store.plan).feeRate),
        createdAt, paidAt: paid ? createdAt : null,
        items: {
          create: lines.map((l) => ({
            storeProductId: l.sp.id, productId: l.p.id, variantId: l.v.id, supplierId: l.p.supplierId,
            title: l.p.title, variantName: l.v.name, image: JSON.parse(l.p.images)[0],
            quantity: l.qty, unitPrice: l.unitPrice, unitCost: l.v.costPrice, shippingCost: l.p.shippingCost,
          })),
        },
      },
      include: { items: true },
    });

    if (!paid) continue;

    const bySupplier = new Map<string, typeof order.items>();
    for (const item of order.items) bySupplier.set(item.supplierId, [...(bySupplier.get(item.supplierId) ?? []), item]);
    for (const [supplierId, items] of bySupplier) {
      const carrier = pick(CARRIERS);
      const tracking = `${carrier.name.slice(0, 2)}${Math.floor(rand() * 1e10).toString().padStart(10, "0")}`;
      const fStatus =
        plan.status === "DELIVERED" ? "DELIVERED" :
        plan.status === "SHIPPED" ? "SHIPPED" :
        plan.status === "REFUNDED" ? "CANCELLED" :
        plan.days === 0 ? "PENDING" : "ACCEPTED";
      const shipped = fStatus === "SHIPPED" || fStatus === "DELIVERED";
      const fulfillment = await db.supplierOrder.create({
        data: {
          orderId: order.id, supplierId, status: fStatus,
          itemsCost: items.reduce((s, i) => s + i.unitCost * i.quantity, 0),
          shippingCost: Math.max(...items.map((i) => i.shippingCost)),
          carrier: shipped ? carrier.name : null,
          trackingNumber: shipped ? tracking : null,
          trackingUrl: shipped ? carrier.url(tracking) : null,
          shippedAt: shipped ? daysAgo(Math.max(0, plan.days - 1)) : null,
          deliveredAt: fStatus === "DELIVERED" ? daysAgo(Math.max(0, plan.days - 4)) : null,
          createdAt,
        },
      });
      await db.orderItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { supplierOrderId: fulfillment.id } });
    }

    if (plan.status === "REFUNDED") {
      await db.returnRequest.create({
        data: { orderId: order.id, reason: "Changed my mind", details: "Ordered the wrong size, would like a refund.", status: "REFUNDED", resolution: "Refunded in full before dispatch." },
      });
    }
  }

  // One open return request for the merchant to handle
  const deliveredForReturn = await db.order.findFirst({ where: { storeId: urbanNest.id, status: "DELIVERED" }, orderBy: { createdAt: "desc" } });
  if (deliveredForReturn) {
    await db.returnRequest.create({
      data: { orderId: deliveredForReturn.id, reason: "Item not as described", details: "The colour is different from the photos." },
    });
  }

  await db.auditLog.createMany({
    data: [
      { userId: admin.id, action: "supplier.approved", entity: "Supplier", entityId: suppliers.s1.id, details: "Berlin Gadget Wholesale GmbH approved" },
      { userId: admin.id, action: "supplier.approved", entity: "Supplier", entityId: suppliers.s2.id, details: "Lisboa Lifestyle Lda approved" },
      { userId: admin.id, action: "supplier.approved", entity: "Supplier", entityId: suppliers.s3.id, details: "Wisła Wellness Sp. z o.o. approved" },
      { userId: merchant.id, action: "store.created", entity: "Store", entityId: urbanNest.id, details: "Urban Nest" },
      { userId: merchant2.id, action: "store.created", entity: "Store", entityId: glowAndGo.id, details: "Glow & Go" },
    ],
  });

  console.log("\n✅ Seed complete. Demo accounts (password for all: %s)", PASSWORD);
  console.table([
    { role: "Admin", email: "admin@olozzo.com" },
    { role: "Merchant (Urban Nest)", email: "merchant@olozzo.com" },
    { role: "Merchant (Glow & Go)", email: "merchant2@olozzo.com" },
    { role: "Supplier (DE electronics)", email: "supplier@olozzo.com" },
    { role: "Supplier (PT fashion/home)", email: "supplier2@olozzo.com" },
    { role: "Supplier (PL beauty/sport)", email: "supplier3@olozzo.com" },
    { role: "Supplier (pending approval)", email: "newsupplier@olozzo.com" },
    { role: "Customer", email: "customer@olozzo.com" },
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
