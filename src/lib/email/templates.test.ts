import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  escapeHtml,
  formatFrom,
  merchantNewOrderEmail,
  orderConfirmationEmail,
  parcelShippedEmail,
  paymentFailedEmail,
  refundEmail,
  returnResolvedEmail,
  safeColor,
  supplierNewOrderEmail,
  type EmailOrder,
} from "./templates";

const brand = { name: "Sunny Shop", color: "#0EA5E9" };

const order: EmailOrder = {
  number: "OLZ-AB12",
  createdAt: new Date("2026-10-30T10:00:00Z"),
  name: "Anna Müller",
  addressLine1: "Hauptstraße 5",
  addressLine2: null,
  city: "Berlin",
  postalCode: "10115",
  country: "DE",
  items: [
    { title: "Linen shirt", variantName: "Blue / M", quantity: 2, unitPrice: 2500 },
    { title: "Mug", variantName: "Default", quantity: 1, unitPrice: 999 },
  ],
  subtotal: 5999,
  discountCode: "WELCOME10",
  discountTotal: 600,
  shippingTotal: 0,
  vatRate: 0.19,
  vatTotal: 862,
  total: 5399,
};

function confirmation(overrides: Partial<Parameters<typeof orderConfirmationEmail>[0]> = {}) {
  return orderConfirmationEmail({
    brand,
    order,
    bankPaymentPending: false,
    parcels: 1,
    orderUrl: "https://olozzo.com/s/sunny/order/ord_1?t=abc",
    withdrawalUrl: "https://olozzo.com/legal/withdrawal",
    termsUrl: "https://olozzo.com/legal/terms",
    supportEmail: "help@sunny.example",
    ...overrides,
  });
}

describe("order confirmation", () => {
  it("lists what was bought, the totals with VAT, the address and the order link", () => {
    const { subject, html, text } = confirmation();
    assert.equal(subject, "Order OLZ-AB12 confirmed");
    for (const part of ["Linen shirt", "Blue / M", "€50.00", "€9.99", "WELCOME10", "−€6.00", "Free", "€53.99", "Includes VAT (19%)", "€8.62", "Hauptstraße 5", "10115 Berlin", "Germany"]) {
      assert.ok(text.includes(part), `text has ${part}`);
    }
    assert.ok(html.includes('href="https://olozzo.com/s/sunny/order/ord_1?t=abc"'));
    assert.ok(!text.includes("(Default)"), "no variant name for single-variant products");
  });

  it("carries the right of withdrawal and the model withdrawal form, addressed to the store", () => {
    const { text, html } = confirmation();
    assert.ok(text.includes("within 14 days of receiving the goods"));
    assert.ok(text.includes("Model withdrawal form"));
    assert.ok(text.includes("To: Sunny Shop, help@sunny.example"));
    assert.ok(text.includes("Order number: OLZ-AB12"));
    assert.ok(html.includes("https://olozzo.com/legal/withdrawal"));
    assert.ok(html.includes("https://olozzo.com/legal/terms"));
  });

  it("says when a bank payment is still on its way, and when items come in several parcels", () => {
    const { subject, text } = confirmation({ bankPaymentPending: true, parcels: 2 });
    assert.equal(subject, "Order OLZ-AB12 received: waiting for your bank payment");
    assert.ok(text.includes("Your bank payment of €53.99 is on its way"));
    assert.ok(text.includes("Payment: Bank payment in progress"));
    assert.ok(text.includes("2 separate parcels"));
  });

  it("escapes what customers and merchants typed", () => {
    const { html } = confirmation({
      brand: { name: "Shop <b>", color: "#000" },
      order: { ...order, name: '<script>alert("x")</script>', items: [{ title: "A & B", variantName: "Default", quantity: 1, unitPrice: 100 }] },
    });
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(html.includes("A &amp; B"));
    assert.ok(html.includes("Shop &lt;b&gt;"));
  });
});

describe("parcel shipped", () => {
  const base = {
    brand,
    orderNumber: "OLZ-AB12",
    customerName: "Anna Müller",
    carrier: "DHL",
    trackingNumber: "JJD000123",
    trackingUrl: "https://www.dhl.de/track?id=JJD000123",
    items: [{ title: "Mug", variantName: "Default", quantity: 1 }],
    shipped: 1,
    parcels: 2,
    isUpdate: false,
    orderUrl: "https://olozzo.com/order",
    supportEmail: null,
  };

  it("names the parcel, the carrier and the tracking, and says more parcels follow", () => {
    const { subject, text, html } = parcelShippedEmail(base);
    assert.equal(subject, "Parcel 1 of 2 from order OLZ-AB12 is on its way");
    assert.ok(text.includes("Tracking number: JJD000123"));
    assert.ok(html.includes('href="https://www.dhl.de/track?id=JJD000123"'));
    assert.ok(text.includes("1 more parcel will follow"));
    assert.ok(!text.includes("€"), "no prices in a shipping email");
  });

  it("keeps it simple for a single parcel, and announces corrected tracking", () => {
    assert.equal(parcelShippedEmail({ ...base, parcels: 1 }).subject, "Your order OLZ-AB12 is on its way");
    const update = parcelShippedEmail({ ...base, isUpdate: true });
    assert.equal(update.subject, "New tracking for your order OLZ-AB12");
    assert.ok(!update.text.includes("more parcel"));
  });
});

describe("other customer emails", () => {
  it("payment failed: cancelled, not charged", () => {
    const { subject, text } = paymentFailedEmail({ brand, orderNumber: "OLZ-AB12", customerName: "Anna", total: 5399, shopUrl: "https://olozzo.com/s/sunny", supportEmail: null });
    assert.equal(subject, "Payment for order OLZ-AB12 did not go through");
    assert.ok(text.includes("the order has been cancelled"));
    assert.ok(text.includes("You have not been charged"));
  });

  it("refund: full or partial amount", () => {
    const full = refundEmail({ brand, orderNumber: "OLZ-AB12", customerName: "Anna", amount: 5399, full: true, orderUrl: "u", supportEmail: null });
    assert.ok(full.text.includes("we have refunded €53.99 for order OLZ-AB12"));
    const partial = refundEmail({ brand, orderNumber: "OLZ-AB12", customerName: "Anna", amount: 1000, full: false, orderUrl: "u", supportEmail: null });
    assert.ok(partial.text.includes("€10.00 in total so far"));
  });

  it("return decision: passes on the store's message", () => {
    const approved = returnResolvedEmail({ brand, orderNumber: "OLZ-AB12", customerName: "Anna", approved: true, message: "Send to:\nWarehouse 1", orderUrl: "u", supportEmail: null });
    assert.equal(approved.subject, "Your return for order OLZ-AB12 is approved");
    assert.ok(approved.text.includes("Message from the store\nSend to:\nWarehouse 1"));
    const rejected = returnResolvedEmail({ brand, orderNumber: "OLZ-AB12", customerName: "Anna", approved: false, message: null, orderUrl: "u", supportEmail: null });
    assert.ok(rejected.text.includes("could not accept"));
  });
});

describe("staff emails", () => {
  it("supplier: what to ship and where to, without the customer's street address", () => {
    const { subject, text } = supplierNewOrderEmail({
      supplierName: "EuroGoods",
      orderNumber: "OLZ-AB12",
      items: [{ title: "Mug", variantName: "Default", quantity: 3 }],
      shipToCity: "Berlin",
      shipToCountry: "DE",
      processingDays: 2,
      dashboardUrl: "https://olozzo.com/supplier/orders",
    });
    assert.equal(subject, "New order to ship: OLZ-AB12");
    assert.ok(text.includes("- 3 × Mug"));
    assert.ok(text.includes("within 2 business days"));
    assert.ok(text.includes("Ship to: Berlin, Germany"));
    assert.ok(!text.includes("Hauptstraße"));
  });

  it("merchant: the paid order and how many suppliers it went to", () => {
    const { subject, text } = merchantNewOrderEmail({
      storeName: "Sunny Shop",
      orderNumber: "OLZ-AB12",
      customerName: "Anna Müller",
      country: "DE",
      items: order.items,
      total: 5399,
      parcels: 2,
      orderUrl: "https://olozzo.com/merchant/orders/ord_1",
    });
    assert.equal(subject, "New order OLZ-AB12: €53.99");
    assert.ok(text.includes("sent to 2 suppliers automatically"));
  });
});

describe("helpers", () => {
  it("formatFrom puts the sender name in front of the configured address", () => {
    assert.equal(formatFrom("Sunny Shop", "orders@olozzo.com"), '"Sunny Shop" <orders@olozzo.com>');
    assert.equal(formatFrom("Sunny Shop", "olozzo <orders@olozzo.com>"), '"Sunny Shop" <orders@olozzo.com>');
    assert.equal(formatFrom('Bad "name" <x>\r\n', "orders@olozzo.com"), '"Bad name x" <orders@olozzo.com>');
    assert.equal(formatFrom("", "orders@olozzo.com"), "orders@olozzo.com");
    assert.equal(formatFrom("Sunny Shop", ""), "Sunny Shop");
  });

  it("safeColor accepts hex colours only", () => {
    assert.equal(safeColor("#0EA5E9"), "#0EA5E9");
    assert.equal(safeColor("#abc"), "#abc");
    assert.equal(safeColor("red;background:url(x)"), "#C8462A");
    assert.equal(safeColor(null), "#C8462A");
  });

  it("escapeHtml escapes the five special characters", () => {
    assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
