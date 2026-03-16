import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { faker } from "@faker-js/faker";
import { generateDataset, resolveReferences } from "../lib/generate/templates.js";

const ownerEntity = {
  name: "Owner",
  fields: [
    { name: "id", type: "string", format: "uuid", required: true },
    { name: "email", type: "string", format: "email", required: true },
  ],
};

const petEntity = {
  name: "Pet",
  fields: [
    { name: "id", type: "string", format: "uuid", required: true },
    { name: "name", type: "string", required: true },
    { name: "owner", type: "object", required: true, $ref: "#/components/schemas/Owner" },
  ],
};

describe("generateDataset", () => {
  it("generates correct count per entity", () => {
    const result = generateDataset([ownerEntity, petEntity], { count: 3, faker });
    assert.equal(result["Owner"].length, 3);
    assert.equal(result["Pet"].length, 3);
  });

  it("default count is 5", () => {
    const result = generateDataset([ownerEntity], { faker });
    assert.equal(result["Owner"].length, 5);
  });

  it("resolves $ref to real ID", () => {
    faker.seed(100);
    const result = generateDataset([ownerEntity, petEntity], { count: 3, faker });
    const ownerIds = result["Owner"].map((r) => r.id);
    for (const pet of result["Pet"]) {
      assert.ok(pet.owner !== null, "owner ref should not be null");
      assert.ok(ownerIds.includes(pet.owner), "owner ref should be a real Owner ID");
    }
  });

  it("resolves xId to real ID", () => {
    const customerEntity = {
      name: "Customer",
      fields: [
        { name: "id", type: "string", format: "uuid", required: true },
        { name: "name", type: "string", required: true },
      ],
    };
    const orderEntity = {
      name: "Order",
      fields: [
        { name: "id", type: "string", format: "uuid", required: true },
        { name: "customerId", type: "string", required: true },
        { name: "total", type: "number", required: true },
      ],
    };
    faker.seed(200);
    const result = generateDataset([customerEntity, orderEntity], { count: 3, faker });
    const customerIds = result["Customer"].map((r) => r.id);
    for (const order of result["Order"]) {
      assert.ok(order.customerId !== null, "customerId should not be null");
      assert.ok(customerIds.includes(order.customerId), "customerId should be a real Customer ID");
    }
  });

  it("respects dependency order — Owner generated before Pet", () => {
    faker.seed(300);
    const result = generateDataset([petEntity, ownerEntity], { count: 2, faker });
    // Pet refs should resolve even though Pet was listed first in input
    const ownerIds = result["Owner"].map((r) => r.id);
    assert.ok(ownerIds.includes(result["Pet"][0].owner));
  });

  it("handles entity with no ID field", () => {
    const noIdEntity = {
      name: "Tag",
      fields: [
        { name: "label", type: "string", required: true },
      ],
    };
    const refEntity = {
      name: "Item",
      fields: [
        { name: "id", type: "string", format: "uuid", required: true },
        { name: "tag", type: "object", required: false, $ref: "#/components/schemas/Tag" },
      ],
    };
    const result = generateDataset([noIdEntity, refEntity], { count: 2, faker });
    // Tag has no ID field, so Item.tag should be null
    for (const item of result["Item"]) {
      assert.equal(item.tag, null);
    }
  });

  it("handles no dependencies", () => {
    const tagEntity = {
      name: "Tag",
      fields: [
        { name: "id", type: "string", format: "uuid", required: true },
        { name: "label", type: "string", required: true },
      ],
    };
    const result = generateDataset([tagEntity], { count: 4, faker });
    assert.equal(result["Tag"].length, 4);
  });

  it("seeded faker produces deterministic output", () => {
    faker.seed(42);
    const result1 = generateDataset([ownerEntity], { count: 2, faker });
    faker.seed(42);
    const result2 = generateDataset([ownerEntity], { count: 2, faker });
    assert.deepEqual(result1, result2);
  });
});

describe("resolveReferences", () => {
  it("$ref checked before xId", () => {
    // Field has $ref AND name ending in Id — $ref should win
    const entity = {
      name: "Order",
      fields: [
        { name: "customerId", type: "object", required: true, $ref: "#/components/schemas/Customer" },
      ],
    };
    const registry = new Map([["Customer", ["cust-1", "cust-2"]]]);
    faker.seed(500);
    const record = { customerId: "original" };
    resolveReferences(record, entity, registry, faker);
    assert.ok(["cust-1", "cust-2"].includes(record.customerId));
  });
});
