import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canViewOrder,
  hashOrderAccessToken,
  newOrderAccessToken,
  orderEmailToken,
  orderEmailTokenMatches,
  orderPagePath,
  orderTokenMatches,
} from "./order-access";

describe("order access tokens", () => {
  it("creates a long random token and stores only its hash", () => {
    const a = newOrderAccessToken();
    const b = newOrderAccessToken();
    assert.notEqual(a.token, b.token);
    assert.ok(a.token.length >= 43);
    assert.equal(a.hash, hashOrderAccessToken(a.token));
    assert.notEqual(a.hash, a.token);
  });

  it("accepts only the matching token", () => {
    const { token, hash } = newOrderAccessToken();
    assert.equal(orderTokenMatches(hash, token), true);
    assert.equal(orderTokenMatches(hash, `${token}x`), false);
    assert.equal(orderTokenMatches(hash, ""), false);
    assert.equal(orderTokenMatches(hash, undefined), false);
    assert.equal(orderTokenMatches(null, token), false);
    assert.equal(orderTokenMatches(hash, "x".repeat(500)), false);
  });
});

describe("order email links", () => {
  it("signs the order id with the secret: stable, different per order and per secret", () => {
    const token = orderEmailToken("ord_1", "secret-a");
    assert.ok(token && token.length >= 43);
    assert.equal(orderEmailToken("ord_1", "secret-a"), token);
    assert.notEqual(orderEmailToken("ord_2", "secret-a"), token);
    assert.notEqual(orderEmailToken("ord_1", "secret-b"), token);
  });

  it("accepts the signature of this order only", () => {
    const token = orderEmailToken("ord_1", "secret-a");
    assert.equal(orderEmailTokenMatches("ord_1", token, "secret-a"), true);
    assert.equal(orderEmailTokenMatches("ord_2", token, "secret-a"), false);
    assert.equal(orderEmailTokenMatches("ord_1", token, "secret-b"), false);
    assert.equal(orderEmailTokenMatches("ord_1", `${token}x`, "secret-a"), false);
    assert.equal(orderEmailTokenMatches("ord_1", null, "secret-a"), false);
  });

  it("makes no links without a secret", () => {
    assert.equal(orderEmailToken("ord_1", ""), null);
    assert.equal(orderEmailTokenMatches("ord_1", "anything", ""), false);
  });
});

describe("canViewOrder", () => {
  const { token, hash } = newOrderAccessToken();
  const order = { id: "ord_1", customerId: "cust", accessTokenHash: hash, store: { ownerId: "merchant" } };

  it("lets the customer, the store owner and admins in", () => {
    assert.equal(canViewOrder(order, { id: "cust", role: "CUSTOMER" }, null), true);
    assert.equal(canViewOrder(order, { id: "merchant", role: "MERCHANT" }, null), true);
    assert.equal(canViewOrder(order, { id: "someone", role: "ADMIN" }, null), true);
  });

  it("lets a guest in with the link token only", () => {
    assert.equal(canViewOrder(order, null, token), true);
    assert.equal(canViewOrder(order, null, null), false);
    assert.equal(canViewOrder(order, null, "wrong"), false);
  });

  it("lets a guest in with the link from an email", () => {
    const saved = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "test-secret";
    try {
      assert.equal(canViewOrder(order, null, orderEmailToken("ord_1")), true);
      assert.equal(canViewOrder(order, null, orderEmailToken("ord_2")), false);
    } finally {
      if (saved === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = saved;
    }
  });

  it("keeps other signed-in users out", () => {
    assert.equal(canViewOrder(order, { id: "other", role: "CUSTOMER" }, null), false);
    assert.equal(canViewOrder(order, { id: "other-merchant", role: "MERCHANT" }, null), false);
  });

  it("keeps guests out of orders created before tokens existed", () => {
    assert.equal(canViewOrder({ ...order, accessTokenHash: null }, null, token), false);
  });
});

describe("orderPagePath", () => {
  it("adds the token when there is one", () => {
    assert.equal(orderPagePath("olozzo", "ord1", "a-b_c"), "/s/olozzo/order/ord1?t=a-b_c");
    assert.equal(orderPagePath("olozzo", "ord1"), "/s/olozzo/order/ord1");
  });
});
