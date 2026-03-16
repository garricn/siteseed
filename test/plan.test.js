import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { unlink } from "node:fs/promises";
import { generatePlan, readPlan, writePlan, applyOverrides } from "../lib/seed/index.js";

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

describe("generatePlan", () => {
  it("returns valid structure", () => {
    const plan = generatePlan([ownerEntity, petEntity], { baseUrl: "https://api.example.com" });
    assert.equal(plan.version, 1);
    assert.ok(Array.isArray(plan.entities));
  });

  it("entities in topological order", () => {
    const plan = generatePlan([petEntity, ownerEntity]);
    const ownerIdx = plan.entities.findIndex((e) => e.name === "Owner");
    const petIdx = plan.entities.findIndex((e) => e.name === "Pet");
    assert.ok(ownerIdx < petIdx, "Owner should come before Pet");
  });

  it("default count is 5", () => {
    const plan = generatePlan([ownerEntity]);
    assert.equal(plan.entities[0].count, 5);
  });

  it("custom count", () => {
    const plan = generatePlan([ownerEntity], { count: 10 });
    assert.equal(plan.entities[0].count, 10);
  });

  it("includes baseUrl", () => {
    const plan = generatePlan([ownerEntity], { baseUrl: "https://api.example.com" });
    assert.equal(plan.baseUrl, "https://api.example.com");
  });
});

describe("writePlan", () => {
  it("returns YAML string", async () => {
    const plan = generatePlan([ownerEntity], { baseUrl: "https://api.example.com" });
    const yamlStr = await writePlan(plan);
    assert.ok(typeof yamlStr === "string");
    assert.ok(yamlStr.includes("version: 1"));
  });
});

describe("readPlan", () => {
  it("parses YAML string", async () => {
    const plan = generatePlan([ownerEntity, petEntity], { baseUrl: "https://api.example.com" });
    const yamlStr = await writePlan(plan);
    const result = await readPlan(yamlStr);
    assert.deepEqual(result.entities, plan.entities);
  });

  it("reads from file", async () => {
    const plan = generatePlan([ownerEntity], { baseUrl: "https://api.example.com" });
    const tmp = resolve("test/fixtures/tmp-plan.yaml");
    await writePlan(plan, tmp);
    try {
      const result = await readPlan(tmp);
      assert.equal(result.version, 1);
      assert.deepEqual(result.entities, plan.entities);
    } finally {
      await unlink(tmp);
    }
  });

  it("validates version", async () => {
    await assert.rejects(
      () => readPlan("entities:\n  - name: Foo\n    count: 5\n"),
      /version/i,
    );
  });

  it("validates entities", async () => {
    await assert.rejects(
      () => readPlan("version: 1\n"),
      /entities/i,
    );
  });
});

describe("applyOverrides", () => {
  it("sets override values", () => {
    const record = { a: 1, b: 2 };
    const result = applyOverrides(record, { b: 99 });
    assert.equal(result.b, 99);
    assert.equal(result.a, 1);
  });

  it("no-op with empty overrides", () => {
    const record = { a: 1 };
    applyOverrides(record, undefined);
    assert.equal(record.a, 1);
  });
});
