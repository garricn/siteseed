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
    assert.equal(result.entities.length, 5);
    assert.ok(result.entities.find((e) => e.name === "Customer"));
    assert.ok(result.entities.find((e) => e.name === "Order"));
    assert.ok(result.entities.find((e) => e.name === "Product"));
    assert.ok(result.entities.find((e) => e.name === "Tag"));
  });

  it("suffix pattern xxx_create extracts entity name", async () => {
    const result = await discoverFromTRPC(FIXTURE);
    assert.ok(result.entities.find((e) => e.name === "Product"));
  });

  it("suffix pattern xxx_add extracts entity name", async () => {
    const result = await discoverFromTRPC(FIXTURE);
    assert.ok(result.entities.find((e) => e.name === "Tag"));
  });

  it("inputSchema (camelCase) fallback", async () => {
    const result = await discoverFromTRPC(FIXTURE);
    const product = result.entities.find((e) => e.name === "Product");
    assert.ok(product, "Product entity from camelCase inputSchema");
    assert.ok(product.fields.find((f) => f.name === "sku"));
  });

  it("array field mapped with type array", async () => {
    const result = await discoverFromTRPC(FIXTURE);
    const tag = result.entities.find((e) => e.name === "Tag");
    const aliases = tag.fields.find((f) => f.name === "aliases");
    assert.equal(aliases.type, "array");
    assert.deepEqual(aliases.items, { type: "string" });
  });

  it("namespaced suffix pattern strips prefix — infos_customers_create → Customers not InfosCustomers", async () => {
    const result = await discoverFromTRPC(FIXTURE);
    const entity = result.entities.find((e) => e.toolName === "infos_customers_create");
    assert.ok(entity, "entity from infos_customers_create should exist");
    assert.equal(entity.name, "Customers");
    assert.notEqual(entity.name, "InfosCustomers");
  });

  it("toolName stored on entity", async () => {
    const result = await discoverFromTRPC(FIXTURE);
    const customer = result.entities.find((e) => e.name === "Customer");
    assert.equal(customer.toolName, "create_customer");
    const product = result.entities.find((e) => e.name === "Product");
    assert.equal(product.toolName, "product_create");
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
