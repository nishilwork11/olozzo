// What each olozzo email says, as HTML and plain text. Built from plain data, with no server or database
// dependencies, so it can be unit-tested (templates.test.ts). Who gets which email and when: notify.ts.
// Sending, retries and the log: outbox.ts.
import { countryName } from "../eu";
import { formatMoney } from "../money";
import { UI } from "../theme";

export const EMAIL_KIND_LABELS = {
  order_confirmation: "Order confirmation",
  parcel_shipped: "Parcel shipped",
  payment_failed: "Payment failed",
  refund: "Refund",
  return_received: "Return received",
  return_resolved: "Return decision",
  supplier_new_order: "New order (supplier)",
  merchant_new_order: "New order (merchant)",
  merchant_return: "Return request (merchant)",
  admin_alert: "Admin alert",
} as const;

export type EmailKind = keyof typeof EMAIL_KIND_LABELS;

export type EmailContent = { subject: string; html: string; text: string };

/** Whose name and colour head the email: the store for customer emails, olozzo for staff emails. */
export type EmailBrand = { name: string; color: string };

export type EmailItem = { title: string; variantName: string; quantity: number; unitPrice: number };

export type EmailOrder = {
  number: string;
  createdAt: Date;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postalCode: string;
  country: string;
  items: EmailItem[];
  subtotal: number;
  discountCode: string | null;
  discountTotal: number;
  shippingTotal: number;
  vatRate: number;
  vatTotal: number;
  total: number;
};

export const PLATFORM_BRAND: EmailBrand = { name: "olozzo", color: UI.action };

const INK = UI.ink;
const MUTED = "#6B6265";
const LINE = "#EFE7E1";
const PAGE = "#FFF8F1";
const FONT = "font-family:Arial,Helvetica,sans-serif;";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/** A store's accent colour, if it is a plain hex colour; olozzo's otherwise. */
export function safeColor(color: string | null | undefined): string {
  return color && /^#(?:[0-9a-f]{3}){1,2}$/i.test(color) ? color : UI.action;
}

/** Dark text on light buttons, white text on dark ones. */
function textOn(hex: string): string {
  const full = hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join("")}` : hex;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? INK : "#FFFFFF";
}

/** The From header: the sender's name in front of the address in EMAIL_FROM (a bare address or "Name <address>"). */
export function formatFrom(name: string, from: string): string {
  const address = /<([^>]+)>/.exec(from)?.[1] ?? from.trim();
  const clean = name.replace(/["<>\r\n\\]/g, "").trim().slice(0, 60);
  if (!address) return clean; // EMAIL_FROM not set: nothing is sent, the name is only shown in the admin preview
  return clean ? `"${clean}" <${address}>` : address;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function variantSuffix(variantName: string): string {
  return variantName && variantName !== "Default" ? ` (${variantName})` : "";
}

// ── Blocks: each email is a list of these, rendered once as HTML and once as text ──

type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "note"; text: string }
  | { kind: "button"; href: string; label: string }
  | { kind: "link"; href: string; label: string }
  | { kind: "items"; title?: string; items: (Omit<EmailItem, "unitPrice"> & { unitPrice?: number })[] }
  | { kind: "rows"; rows: { label: string; value: string; strong?: boolean }[] }
  | { kind: "lines"; title: string; lines: string[]; boxed?: boolean };

function blockHtml(block: Block, color: string): string {
  switch (block.kind) {
    case "heading":
      return `<h2 style="margin:24px 0 8px;font-size:18px;line-height:1.3;color:${INK};">${escapeHtml(block.text)}</h2>`;
    case "paragraph":
      return `<p style="margin:0 0 14px;">${escapeHtml(block.text)}</p>`;
    case "note":
      return `<p style="margin:16px 0 0;font-size:13px;color:${MUTED};">${escapeHtml(block.text)}</p>`;
    case "button":
      return `<p style="margin:20px 0;"><a href="${escapeHtml(block.href)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:${color};color:${textOn(color)};font-weight:bold;text-decoration:none;">${escapeHtml(block.label)}</a></p>`;
    case "link":
      return `<p style="margin:0 0 8px;"><a href="${escapeHtml(block.href)}" style="color:${color};">${escapeHtml(block.label)}</a></p>`;
    case "items":
      return `${block.title ? `<p style="margin:16px 0 0;font-weight:bold;">${escapeHtml(block.title)}</p>` : ""}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;border-collapse:collapse;">${block.items
        .map(
          (i) =>
            `<tr><td style="padding:10px 0;border-bottom:1px solid ${LINE};"><strong>${escapeHtml(i.title)}</strong>${
              variantSuffix(i.variantName) ? `<br><span style="font-size:13px;color:${MUTED};">${escapeHtml(i.variantName)}</span>` : ""
            }</td><td style="padding:10px 0 10px 12px;border-bottom:1px solid ${LINE};white-space:nowrap;color:${MUTED};" align="right">× ${i.quantity}</td>${
              i.unitPrice === undefined
                ? ""
                : `<td style="padding:10px 0 10px 12px;border-bottom:1px solid ${LINE};white-space:nowrap;" align="right">${escapeHtml(formatMoney(i.unitPrice * i.quantity))}</td>`
            }</tr>`,
        )
        .join("")}</table>`;
    case "rows":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 14px;border-collapse:collapse;">${block.rows
        .map(
          (r) =>
            `<tr><td style="padding:4px 0;${r.strong ? `font-weight:bold;border-top:1px solid ${LINE};padding-top:8px;` : `color:${MUTED};`}">${escapeHtml(r.label)}</td><td style="padding:4px 0 4px 12px;${
              r.strong ? `font-weight:bold;border-top:1px solid ${LINE};padding-top:8px;` : ""
            }" align="right">${escapeHtml(r.value)}</td></tr>`,
        )
        .join("")}</table>`;
    case "lines":
      return `<div style="margin:8px 0 14px;${block.boxed ? `padding:12px 14px;border:1px solid ${LINE};border-radius:8px;font-size:13px;` : ""}"><p style="margin:0 0 4px;font-weight:bold;">${escapeHtml(block.title)}</p>${block.lines
        .map((l) => `<p style="margin:0;">${escapeHtml(l)}</p>`)
        .join("")}</div>`;
  }
}

function blockText(block: Block): string {
  switch (block.kind) {
    case "heading":
      return block.text.toUpperCase();
    case "paragraph":
    case "note":
      return block.text;
    case "button":
    case "link":
      return `${block.label}: ${block.href}`;
    case "items":
      return [
        ...(block.title ? [block.title] : []),
        ...block.items.map(
          (i) => `- ${i.quantity} × ${i.title}${variantSuffix(i.variantName)}${i.unitPrice === undefined ? "" : `  ${formatMoney(i.unitPrice * i.quantity)}`}`,
        ),
      ].join("\n");
    case "rows":
      return block.rows.map((r) => `${r.label}: ${r.value}`).join("\n");
    case "lines":
      return [block.title, ...block.lines].join("\n");
  }
}

function render(subject: string, brand: EmailBrand, blocks: Block[], footer: string[]): EmailContent {
  const color = safeColor(brand.color);
  const preheader = blocks.find((b): b is Extract<Block, { kind: "paragraph" }> => b.kind === "paragraph")?.text ?? "";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${PAGE};">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid ${LINE};border-radius:12px;">
<tr><td style="padding:18px 28px;border-bottom:3px solid ${color};${FONT}font-size:20px;font-weight:bold;color:${color};">${escapeHtml(brand.name)}</td></tr>
<tr><td style="padding:22px 28px 28px;${FONT}font-size:15px;line-height:1.55;color:${INK};">
${blocks.map((b) => blockHtml(b, color)).join("\n")}
</td></tr>
</table>
<p style="margin:16px 0 0;${FONT}font-size:12px;line-height:1.5;color:${MUTED};">${footer.map(escapeHtml).join("<br>")}</p>
</td></tr></table>
</body></html>`;
  const text = `${[brand.name, ...blocks.map(blockText)].join("\n\n")}\n\n--\n${footer.join("\n")}\n`;
  return { subject, html, text };
}

function customerFooter(storeName: string): string[] {
  return [storeName, "You receive this email because you placed an order. It is not a newsletter."];
}

const STAFF_FOOTER = ["olozzo", "An automatic notification from olozzo."];

function contactNote(supportEmail: string | null): Block[] {
  return supportEmail ? [{ kind: "note", text: `Questions? Reply to this email or write to ${supportEmail}.` }] : [];
}

function addressLines(o: Pick<EmailOrder, "name" | "addressLine1" | "addressLine2" | "postalCode" | "city" | "country">): string[] {
  return [o.name, o.addressLine1, ...(o.addressLine2 ? [o.addressLine2] : []), `${o.postalCode} ${o.city}`, countryName(o.country)];
}

// ── Customer emails ──

/**
 * The confirmation of the contract that EU law requires on a durable medium (Directive 2011/83/EU, art. 8(7)):
 * what was bought and for how much, who sells it, and the right of withdrawal with the model withdrawal form.
 */
export function orderConfirmationEmail(d: {
  brand: EmailBrand;
  order: EmailOrder;
  /** A bank payment (e.g. SEPA Direct Debit) was submitted but has not arrived yet */
  bankPaymentPending: boolean;
  /** How many suppliers ship the order, i.e. separate parcels */
  parcels: number;
  orderUrl: string;
  withdrawalUrl: string;
  termsUrl: string;
  supportEmail: string | null;
}): EmailContent {
  const { order: o } = d;
  const total = formatMoney(o.total);
  const subject = d.bankPaymentPending ? `Order ${o.number} received: waiting for your bank payment` : `Order ${o.number} confirmed`;
  const blocks: Block[] = [
    { kind: "heading", text: "Thank you for your order" },
    {
      kind: "paragraph",
      text: d.bankPaymentPending
        ? `Hi ${firstName(o.name)}, we have received your order ${o.number}. Your bank payment of ${total} is on its way; bank payments usually take a few business days. We will send your items as soon as it arrives.`
        : `Hi ${firstName(o.name)}, thank you for your order ${o.number}. We have received your payment of ${total} and your order is being prepared. You will get an email with tracking as soon as it ships.`,
    },
    ...(d.parcels > 1
      ? [{ kind: "paragraph" as const, text: `Your items ship from ${d.parcels} different warehouses, so they arrive in ${d.parcels} separate parcels, each with its own tracking.` }]
      : []),
    { kind: "button", href: d.orderUrl, label: "View your order" },
    { kind: "items", items: o.items },
    {
      kind: "rows",
      rows: [
        { label: "Subtotal", value: formatMoney(o.subtotal) },
        ...(o.discountTotal > 0 ? [{ label: `Discount${o.discountCode ? ` (${o.discountCode})` : ""}`, value: `−${formatMoney(o.discountTotal)}` }] : []),
        { label: "Shipping", value: o.shippingTotal > 0 ? formatMoney(o.shippingTotal) : "Free" },
        { label: "Total", value: total, strong: true },
        { label: `Includes VAT (${Number((o.vatRate * 100).toFixed(1))}%)`, value: formatMoney(o.vatTotal) },
      ],
    },
    { kind: "lines", title: "Shipping address", lines: addressLines(o) },
    {
      kind: "rows",
      rows: [
        { label: "Order date", value: o.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" }) },
        { label: "Payment", value: d.bankPaymentPending ? "Bank payment in progress" : "Paid" },
        { label: "Sold by", value: d.brand.name },
      ],
    },
    { kind: "heading", text: "Your right of withdrawal" },
    {
      kind: "paragraph",
      text: "You can withdraw from this purchase within 14 days of receiving the goods, without giving any reason. To withdraw, request a return on your order page, or send us a clear statement, for example with the model form below.",
    },
    { kind: "link", href: d.withdrawalUrl, label: "Withdrawal policy" },
    { kind: "link", href: d.termsUrl, label: "Terms of sale" },
    {
      kind: "lines",
      boxed: true,
      title: "Model withdrawal form",
      lines: [
        "(Complete and return this form only if you wish to withdraw from the contract.)",
        `To: ${d.brand.name}${d.supportEmail ? `, ${d.supportEmail}` : ""}`,
        "I/We (*) hereby give notice that I/We (*) withdraw from my/our (*) contract of sale of the following goods:",
        `Order number: ${o.number}`,
        "Ordered on (*) / received on (*):",
        "Name of consumer(s):",
        "Address of consumer(s):",
        "Signature of consumer(s) (only if this form is notified on paper):",
        "Date:",
        "(*) Delete as appropriate.",
      ],
    },
    ...contactNote(d.supportEmail),
  ];
  return render(subject, d.brand, blocks, customerFooter(d.brand.name));
}

export function parcelShippedEmail(d: {
  brand: EmailBrand;
  orderNumber: string;
  customerName: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string | null;
  items: Omit<EmailItem, "unitPrice">[];
  /** Parcels of this order shipped so far, this one included, out of all its parcels */
  shipped: number;
  parcels: number;
  /** The supplier corrected the tracking of a parcel already announced */
  isUpdate: boolean;
  orderUrl: string;
  supportEmail: string | null;
}): EmailContent {
  const n = d.orderNumber;
  const subject = d.isUpdate
    ? `New tracking for your order ${n}`
    : d.parcels > 1
      ? `Parcel ${d.shipped} of ${d.parcels} from order ${n} is on its way`
      : `Your order ${n} is on its way`;
  const what = d.parcels > 1 ? `parcel ${d.shipped} of ${d.parcels} from your order ${n}` : `your order ${n}`;
  const remaining = d.parcels - d.shipped;
  const blocks: Block[] = [
    { kind: "heading", text: d.isUpdate ? "Your tracking has changed" : "Your parcel is on its way" },
    {
      kind: "paragraph",
      text: d.isUpdate
        ? `Hi ${firstName(d.customerName)}, the tracking details of a parcel from your order ${n} have changed. Please use the new details below.`
        : `Hi ${firstName(d.customerName)}, good news: ${what} has been handed to ${d.carrier}.`,
    },
    {
      kind: "rows",
      rows: [
        { label: "Carrier", value: d.carrier },
        { label: "Tracking number", value: d.trackingNumber },
      ],
    },
    d.trackingUrl ? { kind: "button", href: d.trackingUrl, label: "Track your parcel" } : { kind: "button", href: d.orderUrl, label: "View your order" },
    { kind: "items", title: "In this parcel", items: d.items },
    ...(!d.isUpdate && remaining > 0
      ? [{ kind: "paragraph" as const, text: `${plural(remaining, "more parcel")} will follow. You will get an email with tracking for each.` }]
      : []),
    ...(d.trackingUrl ? [{ kind: "link" as const, href: d.orderUrl, label: "View your order" }] : []),
    ...contactNote(d.supportEmail),
  ];
  return render(subject, d.brand, blocks, customerFooter(d.brand.name));
}

/** Only sent for an order the customer was told about: a bank payment that was submitted, then refused. */
export function paymentFailedEmail(d: {
  brand: EmailBrand;
  orderNumber: string;
  customerName: string;
  total: number;
  shopUrl: string;
  supportEmail: string | null;
}): EmailContent {
  const blocks: Block[] = [
    { kind: "heading", text: "Your payment did not go through" },
    {
      kind: "paragraph",
      text: `Hi ${firstName(d.customerName)}, your bank did not complete the payment of ${formatMoney(d.total)} for order ${d.orderNumber}, so the order has been cancelled and nothing will be sent. You have not been charged for it.`,
    },
    { kind: "paragraph", text: "If you still want the items, you are welcome to order again, with a different payment method if you like." },
    { kind: "button", href: d.shopUrl, label: "Back to the shop" },
    ...contactNote(d.supportEmail),
  ];
  return render(`Payment for order ${d.orderNumber} did not go through`, d.brand, blocks, customerFooter(d.brand.name));
}

export function refundEmail(d: {
  brand: EmailBrand;
  orderNumber: string;
  customerName: string;
  /** The whole order, or for a partial refund the total refunded so far */
  amount: number;
  full: boolean;
  orderUrl: string;
  supportEmail: string | null;
}): EmailContent {
  const amount = formatMoney(d.amount);
  const blocks: Block[] = [
    { kind: "heading", text: d.full ? "Your order has been refunded" : "Part of your order has been refunded" },
    {
      kind: "paragraph",
      text: d.full
        ? `Hi ${firstName(d.customerName)}, we have refunded ${amount} for order ${d.orderNumber} to the payment method you used.`
        : `Hi ${firstName(d.customerName)}, we have refunded part of your order ${d.orderNumber}: ${amount} in total so far, to the payment method you used.`,
    },
    { kind: "paragraph", text: "Depending on your bank, it can take 5 to 10 business days to appear on your statement." },
    { kind: "button", href: d.orderUrl, label: "View your order" },
    ...contactNote(d.supportEmail),
  ];
  return render(`Refund for order ${d.orderNumber}`, d.brand, blocks, customerFooter(d.brand.name));
}

export function returnReceivedEmail(d: {
  brand: EmailBrand;
  orderNumber: string;
  customerName: string;
  reason: string;
  orderUrl: string;
  supportEmail: string | null;
}): EmailContent {
  const blocks: Block[] = [
    { kind: "heading", text: "We have received your return request" },
    {
      kind: "paragraph",
      text: `Hi ${firstName(d.customerName)}, we have received your request to return order ${d.orderNumber} (reason: ${d.reason}). The store will review it and email you the next steps.`,
    },
    { kind: "button", href: d.orderUrl, label: "View your order" },
    ...contactNote(d.supportEmail),
  ];
  return render(`Return request for order ${d.orderNumber} received`, d.brand, blocks, customerFooter(d.brand.name));
}

export function returnResolvedEmail(d: {
  brand: EmailBrand;
  orderNumber: string;
  customerName: string;
  approved: boolean;
  /** What the store wrote when deciding, e.g. the return address */
  message: string | null;
  orderUrl: string;
  supportEmail: string | null;
}): EmailContent {
  const hi = `Hi ${firstName(d.customerName)}`;
  const blocks: Block[] = [
    { kind: "heading", text: d.approved ? "Your return is approved" : "About your return request" },
    {
      kind: "paragraph",
      text: d.approved
        ? `${hi}, your return request for order ${d.orderNumber} has been approved. Please send the items back as described below. Your refund follows once they arrive.`
        : `${hi}, unfortunately the store could not accept your return request for order ${d.orderNumber}.`,
    },
    ...(d.message
      ? [{ kind: "lines" as const, boxed: true, title: "Message from the store", lines: d.message.split(/\r?\n/) }]
      : d.approved
        ? [{ kind: "paragraph" as const, text: "If you have not received the return address yet, reply to this email." }]
        : []),
    { kind: "button", href: d.orderUrl, label: "View your order" },
    ...contactNote(d.supportEmail),
  ];
  return render(
    d.approved ? `Your return for order ${d.orderNumber} is approved` : `About your return request for order ${d.orderNumber}`,
    d.brand,
    blocks,
    customerFooter(d.brand.name),
  );
}

// ── Staff emails ──

export function supplierNewOrderEmail(d: {
  supplierName: string;
  orderNumber: string;
  items: Omit<EmailItem, "unitPrice">[];
  shipToCity: string;
  shipToCountry: string;
  processingDays: number;
  dashboardUrl: string;
}): EmailContent {
  const blocks: Block[] = [
    { kind: "heading", text: "New order to ship" },
    {
      kind: "paragraph",
      text: `Hi ${d.supplierName}, order ${d.orderNumber} has been paid. Please ship these items within ${plural(d.processingDays, "business day")} and enter the carrier and tracking number in your dashboard.`,
    },
    { kind: "items", items: d.items },
    { kind: "rows", rows: [{ label: "Ship to", value: `${d.shipToCity}, ${countryName(d.shipToCountry)}` }] },
    { kind: "paragraph", text: "The full shipping address is in your dashboard." },
    { kind: "button", href: d.dashboardUrl, label: "Open your orders" },
  ];
  return render(`New order to ship: ${d.orderNumber}`, PLATFORM_BRAND, blocks, STAFF_FOOTER);
}

export function merchantNewOrderEmail(d: {
  storeName: string;
  orderNumber: string;
  customerName: string;
  country: string;
  items: EmailItem[];
  total: number;
  parcels: number;
  orderUrl: string;
}): EmailContent {
  const total = formatMoney(d.total);
  const blocks: Block[] = [
    { kind: "heading", text: `New order for ${d.storeName}` },
    {
      kind: "paragraph",
      text: `${d.customerName} from ${countryName(d.country)} paid ${total} for order ${d.orderNumber}. It has been sent to ${plural(d.parcels, "supplier")} automatically.`,
    },
    { kind: "items", items: d.items },
    { kind: "rows", rows: [{ label: "Total paid", value: total, strong: true }] },
    { kind: "button", href: d.orderUrl, label: "Open the order" },
  ];
  return render(`New order ${d.orderNumber}: ${total}`, PLATFORM_BRAND, blocks, STAFF_FOOTER);
}

export function merchantReturnEmail(d: {
  orderNumber: string;
  customerName: string;
  reason: string;
  details: string | null;
  orderUrl: string;
}): EmailContent {
  const blocks: Block[] = [
    { kind: "heading", text: "Return requested" },
    { kind: "paragraph", text: `${d.customerName} asked to return order ${d.orderNumber}.` },
    { kind: "rows", rows: [{ label: "Reason", value: d.reason }] },
    ...(d.details ? [{ kind: "lines" as const, boxed: true, title: "Details from the customer", lines: d.details.split(/\r?\n/) }] : []),
    { kind: "paragraph", text: "Approve or reject it on the order page. When you approve it, add the return address in your message to the customer." },
    { kind: "button", href: d.orderUrl, label: "Open the order" },
  ];
  return render(`Return requested for order ${d.orderNumber}`, PLATFORM_BRAND, blocks, STAFF_FOOTER);
}

export function adminAlertEmail(d: { title: string; orderNumber: string; message: string; orderUrl: string }): EmailContent {
  const blocks: Block[] = [
    { kind: "heading", text: d.title },
    { kind: "paragraph", text: `Order ${d.orderNumber}: ${d.message}` },
    { kind: "button", href: d.orderUrl, label: "Open the order in admin" },
  ];
  return render(`${d.title}: order ${d.orderNumber}`, PLATFORM_BRAND, blocks, STAFF_FOOTER);
}
