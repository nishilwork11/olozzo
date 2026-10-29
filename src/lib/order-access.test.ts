import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canViewOrder, hashOrderAccessToken, newOrderAccessToken, orderPagePath, orderTokenMatches } from "./order-access";

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

describe("canViewOrder", () => {
  const { token, hash } = newOrderAccessToken();
  const order = { customerId: "cust", accessTokenHash: hash, store: { ownerId: "merchant" } };

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
