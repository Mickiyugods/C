import { test } from "node:test";
import assert from "node:assert/strict";

// config.mjs needs these to load; they are never used by these pure tests.
process.env.RPC_URL ??= "http://127.0.0.1:8545";
process.env.LAUNCHER ??= "0x0000000000000000000000000000000000000001";
process.env.REGISTRY ??= "0x0000000000000000000000000000000000000002";
process.env.DISTRIBUTOR ??= "0x0000000000000000000000000000000000000003";

const { normalizeOrder } = await import("../src/market/opensea.mjs");
const { nextCap } = await import("../src/tasks/market.mjs");

const COLLECTION = "0x9d1497d448a75E7d1A055D74cFfA50BC15120845";
const NOW = 1_800_000_000;

const apiOrder = (over = {}, params = {}) => ({
  order_hash: "0xabc",
  protocol_data: {
    signature: "0xdead",
    parameters: {
      offerer: "0x1111111111111111111111111111111111111111",
      zone: "0x0000000000000000000000000000000000000000",
      offer: [{ itemType: 2, token: COLLECTION, identifierOrCriteria: "7", startAmount: "1", endAmount: "1" }],
      consideration: [
        { itemType: 0, token: "0x0000000000000000000000000000000000000000", identifierOrCriteria: "0", startAmount: "900", endAmount: "900", recipient: "0x1111111111111111111111111111111111111111" },
        { itemType: 0, token: "0x0000000000000000000000000000000000000000", identifierOrCriteria: "0", startAmount: "100", endAmount: "100", recipient: "0x2222222222222222222222222222222222222222" },
      ],
      orderType: 0,
      startTime: String(NOW - 100),
      endTime: String(NOW + 100_000),
      zoneHash: "0x" + "00".repeat(32),
      salt: "12345",
      conduitKey: "0x" + "00".repeat(32),
      totalOriginalConsiderationItems: 2,
      counter: "0",
      ...params,
    },
    ...over,
  },
});

test("a plain fixed price ETH listing becomes a vault order priced at the sum of all payments", () => {
  const n = normalizeOrder(apiOrder(), COLLECTION, NOW);
  assert.equal(n.price, 1000n);
  assert.equal(n.tokenId, 7n);
  assert.equal(n.order.parameters.consideration.length, 2);
  assert.equal(typeof n.order.parameters.salt, "bigint");
  assert.equal("counter" in n.order.parameters, false, "counter is not part of OrderParameters");
});

test("listings the vault would reject are filtered out before any gas is spent", () => {
  const reject = (label, o) => assert.equal(normalizeOrder(o, COLLECTION, NOW), null, label);
  reject("restricted", apiOrder({}, { orderType: 2 }));
  reject("partial", apiOrder({}, { orderType: 1 }));
  reject("expired", apiOrder({}, { endTime: String(NOW - 1) }));
  reject("about to expire", apiOrder({}, { endTime: String(NOW + 30) }));
  reject("not started", apiOrder({}, { startTime: String(NOW + 500) }));
  reject("auction pricing", apiOrder({}, { consideration: [{ itemType: 0, token: "0x0", identifierOrCriteria: "0", startAmount: "900", endAmount: "100", recipient: "0x1111111111111111111111111111111111111111" }], totalOriginalConsiderationItems: 1 }));
  reject("paid in a token", apiOrder({}, { consideration: [{ itemType: 1, token: "0x3333333333333333333333333333333333333333", identifierOrCriteria: "0", startAmount: "5", endAmount: "5", recipient: "0x1111111111111111111111111111111111111111" }], totalOriginalConsiderationItems: 1 }));
  reject("tip items appended", apiOrder({}, { totalOriginalConsiderationItems: 1 }));
  reject("another collection", apiOrder({}, { offer: [{ itemType: 2, token: "0x4444444444444444444444444444444444444444", identifierOrCriteria: "7", startAmount: "1", endAmount: "1" }] }));
  reject("two items offered", apiOrder({}, { offer: [{ itemType: 2, token: COLLECTION, identifierOrCriteria: "7", startAmount: "1", endAmount: "1" }, { itemType: 2, token: COLLECTION, identifierOrCriteria: "8", startAmount: "1", endAmount: "1" }] }));
  reject("erc1155", apiOrder({}, { offer: [{ itemType: 3, token: COLLECTION, identifierOrCriteria: "7", startAmount: "1", endAmount: "1" }] }));
  reject("no signature", apiOrder({ signature: undefined }));
  reject("empty", {});
});

test("the cap follows the vault rules: free to fall, +10% at most per hour, never above the ceiling", () => {
  const base = { hardMaxCap: 100n, now: 10_000n };
  assert.equal(nextCap({ ...base, cap: 0n, lastRaiseAt: 0n, desired: 40n }), 40n, "first post");
  assert.equal(nextCap({ ...base, cap: 0n, lastRaiseAt: 0n, desired: 500n }), 100n, "clamped to the ceiling");
  assert.equal(nextCap({ ...base, cap: 50n, lastRaiseAt: 0n, desired: 40n }), 40n, "lowering is free");
  assert.equal(nextCap({ ...base, cap: 50n, lastRaiseAt: 0n, desired: 90n }), 55n, "raise limited to +10%");
  assert.equal(nextCap({ ...base, cap: 50n, lastRaiseAt: 0n, desired: 52n }), 52n, "small raise passes");
  assert.equal(nextCap({ ...base, cap: 50n, lastRaiseAt: 9_000n, desired: 90n }), 50n, "raised less than an hour ago: stays");
});
