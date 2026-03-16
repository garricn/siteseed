import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { faker } from "@faker-js/faker";
import { seedViaAPI } from "../lib/seed/api.js";

const ownerEntity = {
  name: "Owner",
  fields: [
    { name: "id", type: "string", format: "uuid", required: true },
    { name: "email", type: "string", format: "email", required: true },
    { name: "status", type: "string", required: false },
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

function makePlan(overrides = {}) {
  return {
    version: 1,
    baseUrl: "https://api.example.com",
    entities: [
      { name: "Owner", count: 2, ...overrides.owner },
      { name: "Pet", count: 3, ...overrides.pet },
    ],
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

describe("seedViaAPI", () => {
  it("seeds entities via POST", async () => {
    const { fn } = mockFetch(201);
    faker.seed(1);
    const result = await seedViaAPI(makePlan(), [ownerEntity, petEntity], { faker, fetch: fn });
    assert.equal(result.seeded["Owner"], 2);
    assert.equal(result.seeded["Pet"], 3);
    assert.equal(result.errors.length, 0);
  });

  it("sends correct endpoint", async () => {
    const { fn, calls } = mockFetch(201);
    faker.seed(2);
    await seedViaAPI(
      { version: 1, baseUrl: "https://api.example.com", entities: [{ name: "Owner", count: 1 }] },
      [ownerEntity],
      { faker, fetch: fn },
    );
    assert.ok(calls[0].url.endsWith("/owners"));
  });

  it("sends JSON body", async () => {
    const { fn, calls } = mockFetch(201);
    faker.seed(3);
    await seedViaAPI(
      { version: 1, baseUrl: "https://api.example.com", entities: [{ name: "Owner", count: 1 }] },
      [ownerEntity],
      { faker, fetch: fn },
    );
    const body = JSON.parse(calls[0].body);
    assert.ok("id" in body);
    assert.ok("email" in body);
  });

  it("sends auth header", async () => {
    const { fn, calls } = mockFetch(201);
    faker.seed(4);
    await seedViaAPI(
      { version: 1, baseUrl: "https://api.example.com", entities: [{ name: "Owner", count: 1 }] },
      [ownerEntity],
      { faker, fetch: fn, auth: "Bearer token123" },
    );
    assert.equal(calls[0].headers["Authorization"], "Bearer token123");
  });

  it("no auth header when not provided", async () => {
    const { fn, calls } = mockFetch(201);
    faker.seed(5);
    await seedViaAPI(
      { version: 1, baseUrl: "https://api.example.com", entities: [{ name: "Owner", count: 1 }] },
      [ownerEntity],
      { faker, fetch: fn },
    );
    assert.equal(calls[0].headers["Authorization"], undefined);
  });

  it("dry run skips HTTP", async () => {
    const fn = async () => { throw new Error("should not be called"); };
    faker.seed(6);
    const result = await seedViaAPI(makePlan(), [ownerEntity, petEntity], { faker, fetch: fn, dryRun: true });
    assert.equal(result.seeded["Owner"], 2);
    assert.equal(result.seeded["Pet"], 3);
    assert.equal(result.errors.length, 0);
  });

  it("dry run includes records", async () => {
    const fn = async () => { throw new Error("should not be called"); };
    faker.seed(7);
    const result = await seedViaAPI(makePlan(), [ownerEntity, petEntity], { faker, fetch: fn, dryRun: true });
    assert.equal(result.dryRun, true);
    assert.equal(result.records["Owner"].length, 2);
    assert.equal(result.records["Pet"].length, 3);
  });

  it("captures HTTP errors", async () => {
    const { fn } = mockFetch(400);
    faker.seed(8);
    const result = await seedViaAPI(
      { version: 1, baseUrl: "https://api.example.com", entities: [{ name: "Owner", count: 2 }] },
      [ownerEntity],
      { faker, fetch: fn },
    );
    assert.equal(result.errors.length, 2);
    assert.equal(result.errors[0].entity, "Owner");
    assert.equal(result.errors[0].index, 0);
    assert.ok(result.errors[0].error.includes("400"));
  });

  it("captures network errors", async () => {
    const fn = async () => { throw new Error("network failure"); };
    faker.seed(9);
    const result = await seedViaAPI(
      { version: 1, baseUrl: "https://api.example.com", entities: [{ name: "Owner", count: 1 }] },
      [ownerEntity],
      { faker, fetch: fn },
    );
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].error, "network failure");
  });

  it("continues after error", async () => {
    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount === 1) return { ok: false, status: 500, statusText: "Error", text: async () => "fail" };
      return { ok: true, status: 201, statusText: "Created", text: async () => "" };
    };
    faker.seed(10);
    const result = await seedViaAPI(
      { version: 1, baseUrl: "https://api.example.com", entities: [{ name: "Owner", count: 3 }] },
      [ownerEntity],
      { faker, fetch: fn },
    );
    assert.equal(result.seeded["Owner"], 2);
    assert.equal(result.errors.length, 1);
  });

  it("applies overrides", async () => {
    const { fn, calls } = mockFetch(201);
    faker.seed(11);
    await seedViaAPI(
      { version: 1, baseUrl: "https://api.example.com", entities: [{ name: "Owner", count: 2, overrides: { status: "active" } }] },
      [ownerEntity],
      { faker, fetch: fn },
    );
    for (const call of calls) {
      const body = JSON.parse(call.body);
      assert.equal(body.status, "active");
    }
  });

  it("resolves references across entities", async () => {
    const { fn, calls } = mockFetch(201);
    faker.seed(12);
    await seedViaAPI(makePlan(), [ownerEntity, petEntity], { faker, fetch: fn });
    // First 2 calls are Owner, next 3 are Pet
    const ownerBodies = calls.slice(0, 2).map((c) => JSON.parse(c.body));
    const ownerIds = ownerBodies.map((b) => b.id);
    const petBodies = calls.slice(2).map((c) => JSON.parse(c.body));
    for (const pet of petBodies) {
      assert.ok(pet.owner !== null, "pet.owner should not be null");
      assert.ok(ownerIds.includes(pet.owner), "pet.owner should be a real Owner ID");
    }
  });
});
