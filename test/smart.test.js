import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { faker } from "@faker-js/faker";
import { isEdgeCaseRecord, generateSmartFieldValue, generateSmartEntity } from "../lib/generate/smart.js";

describe("isEdgeCaseRecord", () => {
  it("first records are edge cases", () => {
    assert.equal(isEdgeCaseRecord(0, 10, 0.2), true);
    assert.equal(isEdgeCaseRecord(1, 10, 0.2), true);
  });

  it("later records are not edge cases", () => {
    assert.equal(isEdgeCaseRecord(2, 10, 0.2), false);
    assert.equal(isEdgeCaseRecord(9, 10, 0.2), false);
  });

  it("uses floor — ratio 0.2 count 3 = 0 edge cases", () => {
    assert.equal(isEdgeCaseRecord(0, 3, 0.2), false);
  });

  it("ratio 0 means no edge cases", () => {
    assert.equal(isEdgeCaseRecord(0, 10, 0), false);
  });

  it("ratio 1 means all edge cases", () => {
    assert.equal(isEdgeCaseRecord(9, 10, 1), true);
  });
});

describe("generateSmartFieldValue", () => {
  it("edge case string includes empty", () => {
    const field = { name: "tag", type: "string", required: true };
    const values = [];
    for (let i = 0; i < 10; i++) {
      values.push(generateSmartFieldValue(field, faker, { strategy: "edge-case", recordIndex: i }));
    }
    assert.ok(values.includes(""), "should include empty string");
  });

  it("edge case number includes 0", () => {
    const field = { name: "score", type: "number", required: true };
    const values = [];
    for (let i = 0; i < 10; i++) {
      values.push(generateSmartFieldValue(field, faker, { strategy: "edge-case", recordIndex: i }));
    }
    assert.ok(values.includes(0));
  });

  it("edge case boolean covers both", () => {
    const field = { name: "active", type: "boolean", required: true };
    const values = [];
    for (let i = 0; i < 4; i++) {
      values.push(generateSmartFieldValue(field, faker, { strategy: "edge-case", recordIndex: i }));
    }
    assert.ok(values.includes(true));
    assert.ok(values.includes(false));
  });

  it("enum round-robin distributes evenly", () => {
    const field = { name: "status", type: "string", enum: ["active", "inactive", "pending"], required: true };
    const counters = new Map();
    const values = [];
    for (let i = 0; i < 6; i++) {
      values.push(generateSmartFieldValue(field, faker, { strategy: "random", enumCounters: counters }));
    }
    const counts = {};
    for (const v of values) counts[v] = (counts[v] || 0) + 1;
    assert.equal(counts["active"], 2);
    assert.equal(counts["inactive"], 2);
    assert.equal(counts["pending"], 2);
  });

  it("date spread covers range", () => {
    const field = { name: "createdAt", type: "string", format: "date", required: true };
    const values = [];
    for (let i = 0; i < 10; i++) {
      values.push(generateSmartFieldValue(field, faker, { strategy: "mixed", recordIndex: i, totalCount: 10 }));
    }
    const dates = values.map((v) => new Date(v).getTime());
    const spread = Math.max(...dates) - Math.min(...dates);
    assert.ok(spread > 30 * 86400000, "dates should spread over 30+ days");
  });

  it("persona applies overrides", () => {
    const field = { name: "role", type: "string", required: true };
    const result = generateSmartFieldValue(field, faker, { persona: { role: "Admin" } });
    assert.equal(result, "Admin");
  });

  it("strategy random = normal generation", () => {
    const field = { name: "tag", type: "string", required: true };
    faker.seed(42);
    const result = generateSmartFieldValue(field, faker, { strategy: "random" });
    assert.equal(typeof result, "string");
    assert.ok(result.length > 0);
  });

  it("$ref returns null", () => {
    const field = { name: "owner", type: "object", $ref: "#/components/schemas/Owner", required: false };
    const result = generateSmartFieldValue(field, faker, { strategy: "edge-case" });
    assert.equal(result, null);
  });
});

describe("generateSmartEntity", () => {
  it("generates all fields", () => {
    const entity = {
      name: "Item",
      fields: [
        { name: "id", type: "string", format: "uuid", required: true },
        { name: "name", type: "string", required: true },
        { name: "active", type: "boolean", required: false },
      ],
    };
    faker.seed(100);
    const record = generateSmartEntity(entity, faker, { strategy: "random" });
    assert.equal(Object.keys(record).length, 3);
    assert.ok("id" in record);
    assert.ok("name" in record);
    assert.ok("active" in record);
  });
});
