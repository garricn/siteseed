import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { discoverFromTRPC } from "../lib/discover/trpc.js";

const FIXTURE = resolve("test/fixtures/trpc-tools.json");

describe("discoverFromTRPC", () => {
  it("extracts entity from create tool", async () => {
    const result = await discoverFromTRPC(FIXTURE);
    const customer = result.entities.find((e) => e.name === "Customer");
    assert.ok(customer);
  });

  it("skips non-create tools", async () => {
    const result = await discoverFromTRPC(FIXTURE);
    const names = result.entities.map((e) => e.name);
    assert.ok(!names.includes("get_customer"));
    assert.ok(!names.includes("delete_customer"));
  });

  it("maps input_schema to fields", async () => {
    const result = await discoverFromTRPC(FIXTURE);
    const customer = result.entities.find((e) => e.name === "Customer");
    const email = customer.fields.find((f) => f.name === "email");
    assert.equal(email.type, "string");
    assert.equal(email.format, "email");
  });

  it("handles required fields", async () => {
    const result = await discoverFromTRPC(FIXTURE);
    const customer = result.entities.find((e) => e.name === "Customer");
    assert.equal(customer.fields.find((f) => f.name === "id").required, true);
    assert.equal(customer.fields.find((f) => f.name === "email").required, true);
    assert.equal(customer.fields.find((f) => f.name === "name").required, false);
  });

  it("source is trpc", async () => {
    const result = await discoverFromTRPC(FIXTURE);
    assert.equal(result.source, "trpc");
  });

  it("multiple create tools → multiple entities", async () => {
    const result = await discoverFromTRPC(FIXTURE);
    assert.equal(result.entities.length, 2);
    assert.ok(result.entities.find((e) => e.name === "Customer"));
    assert.ok(result.entities.find((e) => e.name === "Order"));
  });

  it("maps integer to number with integer format", async () => {
    const result = await discoverFromTRPC(FIXTURE);
    const customer = result.entities.find((e) => e.name === "Customer");
    const age = customer.fields.find((f) => f.name === "age");
    assert.equal(age.type, "number");
    assert.equal(age.format, "integer");
  });

  it("preserves enum values", async () => {
    const result = await discoverFromTRPC(FIXTURE);
    const order = result.entities.find((e) => e.name === "Order");
    const status = order.fields.find((f) => f.name === "status");
    assert.deepEqual(status.enum, ["pending", "shipped", "delivered"]);
  });
});
