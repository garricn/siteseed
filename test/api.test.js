import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { faker } from "@faker-js/faker";
import { discover, seed } from "../lib/index.js";

const FIXTURE = resolve("test/fixtures/petstore-nocycle.json");

describe("discover()", () => {
  it("returns entities from OpenAPI spec", async () => {
    const result = await discover({ openapi: FIXTURE });
    assert.ok(Array.isArray(result.entities));
    assert.ok(result.entities.length > 0);
    assert.equal(result.source, "openapi");
  });
});

describe("seed()", () => {
  it("discovers, plans, and seeds in one call (dry run)", async () => {
    faker.seed(1000);
    const result = await seed({
      openapi: FIXTURE,
      count: 2,
      dryRun: true,
      faker,
    });
    assert.ok(result.seeded);
    assert.equal(result.seeded["Owner"], 2);
    assert.equal(result.seeded["Pet"], 2);
    assert.equal(result.dryRun, true);
    assert.equal(result.errors.length, 0);
  });

  it("uses default count of 5", async () => {
    faker.seed(2000);
    const result = await seed({
      openapi: FIXTURE,
      dryRun: true,
      faker,
    });
    assert.equal(result.seeded["Owner"], 5);
    assert.equal(result.seeded["Pet"], 5);
  });
});
