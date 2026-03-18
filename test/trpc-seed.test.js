import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { faker } from "@faker-js/faker";
import { seedViaTRPC } from "../lib/seed/api.js";

const customerEntity = {
  name: "Customer",
  toolName: "create_customer",
  fields: [
    { name: "id", type: "string", format: "uuid", required: true },
    { name: "email", type: "string", format: "email", required: true },
  ],
};

function makePlan(overrides = {}) {
  return {
    version: 1,
    baseUrl: "https://api.example.com",
    entities: [{ name: "Customer", count: 2, ...overrides }],
  };
}

function mockFetch(status = 201) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, ...opts });
    return { ok: status >= 200 && status < 300, status, statusText: "OK", text: async () => "response body" };
  };
  return { fn, calls };
}

describe("seedViaTRPC", () => {
  it("calls tRPC mutation URL", async () => {
    const { fn, calls } = mockFetch(201);
    faker.seed(1);
    await seedViaTRPC(makePlan(), [customerEntity], { faker, fetch: fn });
    assert.ok(calls[0].url.includes("/trpc/create_customer"));
  });

  it("wraps body in { json: record }", async () => {
    const { fn, calls } = mockFetch(201);
    faker.seed(2);
    await seedViaTRPC(makePlan(), [customerEntity], { faker, fetch: fn });
    const parsed = JSON.parse(calls[0].body);
    assert.ok("json" in parsed, "body should have json wrapper");
    assert.ok("id" in parsed.json);
    assert.ok("email" in parsed.json);
  });

  it("seeds correct count", async () => {
    const { fn } = mockFetch(201);
    faker.seed(3);
    const result = await seedViaTRPC(makePlan(), [customerEntity], { faker, fetch: fn });
    assert.equal(result.seeded["Customer"], 2);
    assert.equal(result.errors.length, 0);
  });

  it("sends auth header", async () => {
    const { fn, calls } = mockFetch(201);
    faker.seed(4);
    await seedViaTRPC(makePlan(), [customerEntity], { faker, fetch: fn, auth: "Bearer tok" });
    assert.equal(calls[0].headers["Authorization"], "Bearer tok");
  });

  it("captures HTTP errors", async () => {
    const { fn } = mockFetch(400);
    faker.seed(5);
    const result = await seedViaTRPC(makePlan(), [customerEntity], { faker, fetch: fn });
    assert.equal(result.errors.length, 2);
    assert.ok(result.errors[0].error.includes("400"));
  });

  it("dry run skips HTTP and returns records", async () => {
    const fn = async () => { throw new Error("should not be called"); };
    faker.seed(6);
    const result = await seedViaTRPC(makePlan(), [customerEntity], { faker, fetch: fn, dryRun: true });
    assert.equal(result.dryRun, true);
    assert.equal(result.seeded["Customer"], 2);
    assert.equal(result.records["Customer"].length, 2);
  });

  it("falls back to entity name when toolName absent", async () => {
    const { fn, calls } = mockFetch(201);
    faker.seed(7);
    const entityNoToolName = { ...customerEntity, toolName: undefined };
    await seedViaTRPC(makePlan(), [entityNoToolName], { faker, fetch: fn });
    assert.ok(calls[0].url.includes("/trpc/customer"));
  });
});
