import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { faker } from "@faker-js/faker";
import { generateFieldValue, generateEntity } from "../lib/generate/index.js";

describe("generateFieldValue", () => {
  it("string field → string value", () => {
    const result = generateFieldValue({ name: "tag", type: "string", required: true }, faker);
    assert.equal(typeof result, "string");
  });

  it("email format → valid email", () => {
    const result = generateFieldValue({ name: "contact", type: "string", format: "email", required: true }, faker);
    assert.match(result, /@/);
  });

  it("uuid format → valid UUID", () => {
    const result = generateFieldValue({ name: "id", type: "string", format: "uuid", required: true }, faker);
    assert.match(result, /^[0-9a-f-]{36}$/i);
  });

  it("date-time format → ISO string", () => {
    const result = generateFieldValue({ name: "createdAt", type: "string", format: "date-time", required: true }, faker);
    assert.ok(!isNaN(Date.parse(result)));
  });

  it("date format → YYYY-MM-DD", () => {
    const result = generateFieldValue({ name: "birthday", type: "string", format: "date", required: true }, faker);
    assert.match(result, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("number field → number", () => {
    const result = generateFieldValue({ name: "score", type: "number", required: true }, faker);
    assert.equal(typeof result, "number");
  });

  it("integer format → integer", () => {
    const result = generateFieldValue({ name: "count", type: "number", format: "integer", required: true }, faker);
    assert.ok(Number.isInteger(result));
  });

  it("boolean field → boolean", () => {
    const result = generateFieldValue({ name: "active", type: "boolean", required: true }, faker);
    assert.equal(typeof result, "boolean");
  });

  it("enum field → value from enum", () => {
    const result = generateFieldValue({ name: "status", type: "string", enum: ["a", "b", "c"], required: true }, faker);
    assert.ok(["a", "b", "c"].includes(result));
  });

  it("enum wins over name heuristic", () => {
    const result = generateFieldValue({ name: "email", type: "string", enum: ["x"], required: true }, faker);
    assert.equal(result, "x");
  });

  it("$ref field → null", () => {
    const result = generateFieldValue({ name: "owner", type: "object", $ref: "#/components/schemas/Owner", required: true }, faker);
    assert.equal(result, null);
  });

  it("name heuristic — email", () => {
    const result = generateFieldValue({ name: "email", type: "string", required: true }, faker);
    assert.match(result, /@/);
  });

  it("name heuristic — firstName", () => {
    const result = generateFieldValue({ name: "firstName", type: "string", required: true }, faker);
    assert.equal(typeof result, "string");
    assert.ok(result.length > 0);
  });

  it("array field → empty array", () => {
    const result = generateFieldValue({ name: "tags", type: "array", required: true }, faker);
    assert.deepEqual(result, []);
  });
});

describe("generateEntity", () => {
  it("returns object with all fields", () => {
    const entity = {
      name: "Pet",
      fields: [
        { name: "id", type: "string", format: "uuid", required: true },
        { name: "name", type: "string", required: true },
        { name: "active", type: "boolean", required: true },
      ],
    };
    const result = generateEntity(entity, faker);
    assert.equal(Object.keys(result).length, 3);
    assert.ok("id" in result);
    assert.ok("name" in result);
    assert.ok("active" in result);
  });

  it("seeded faker produces deterministic output", () => {
    const field = { name: "tag", type: "string", required: true };
    faker.seed(42);
    const result1 = generateFieldValue(field, faker);
    faker.seed(42);
    const result2 = generateFieldValue(field, faker);
    assert.equal(result1, result2);
  });
});
