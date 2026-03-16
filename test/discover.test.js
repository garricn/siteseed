import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { discoverFromOpenAPI } from "../lib/discover/index.js";

const jsonFixture = resolve("test/fixtures/petstore.json");
const yamlFixture = resolve("test/fixtures/petstore.yaml");

describe("discoverFromOpenAPI", () => {
  it("parses JSON spec from file", async () => {
    const result = await discoverFromOpenAPI(jsonFixture);
    assert.ok(result.entities.length > 0, "should have entities");
    assert.ok(result.entities[0].name, "entity should have name");
    assert.ok(result.entities[0].fields.length > 0, "entity should have fields");
  });

  it("parses YAML spec from file", async () => {
    const result = await discoverFromOpenAPI(yamlFixture);
    assert.ok(result.entities.length > 0, "should have entities");
    assert.equal(result.entities[0].name, "Pet");
  });

  it("extracts field types correctly", async () => {
    const result = await discoverFromOpenAPI(jsonFixture);
    const owner = result.entities.find((e) => e.name === "Owner");
    assert.ok(owner, "Owner entity should exist");

    const id = owner.fields.find((f) => f.name === "id");
    assert.equal(id.type, "string");
    assert.equal(id.format, "uuid");

    const email = owner.fields.find((f) => f.name === "email");
    assert.equal(email.type, "string");
    assert.equal(email.format, "email");

    const rating = owner.fields.find((f) => f.name === "rating");
    assert.equal(rating.type, "number");
    assert.equal(rating.format, "float");

    const active = owner.fields.find((f) => f.name === "active");
    assert.equal(active.type, "boolean");

    const tags = owner.fields.find((f) => f.name === "tags");
    assert.equal(tags.type, "array");
    assert.deepEqual(tags.items, { type: "string" });

    const createdAt = owner.fields.find((f) => f.name === "createdAt");
    assert.equal(createdAt.type, "string");
    assert.equal(createdAt.format, "date-time");
  });

  it("captures required flags", async () => {
    const result = await discoverFromOpenAPI(jsonFixture);
    const pet = result.entities.find((e) => e.name === "Pet");

    const id = pet.fields.find((f) => f.name === "id");
    assert.equal(id.required, true);

    const name = pet.fields.find((f) => f.name === "name");
    assert.equal(name.required, true);

    const tag = pet.fields.find((f) => f.name === "tag");
    assert.equal(tag.required, false);
  });

  it("captures enum values", async () => {
    const result = await discoverFromOpenAPI(jsonFixture);
    const pet = result.entities.find((e) => e.name === "Pet");
    const status = pet.fields.find((f) => f.name === "status");
    assert.deepEqual(status.enum, ["available", "pending", "sold"]);
  });

  it("preserves $ref on object properties", async () => {
    const result = await discoverFromOpenAPI(jsonFixture);
    const pet = result.entities.find((e) => e.name === "Pet");
    const owner = pet.fields.find((f) => f.name === "owner");
    assert.equal(owner.$ref, "#/components/schemas/Owner");
    assert.equal(owner.type, "object");
  });

  it("preserves $ref on array items", async () => {
    const result = await discoverFromOpenAPI(jsonFixture);
    const owner = result.entities.find((e) => e.name === "Owner");
    const pets = owner.fields.find((f) => f.name === "pets");
    assert.equal(pets.type, "array");
    assert.equal(pets.items.$ref, "#/components/schemas/Pet");
  });

  it("infers baseUrl from servers", async () => {
    const result = await discoverFromOpenAPI(jsonFixture);
    assert.equal(result.baseUrl, "https://api.petstore.example.com");
  });

  it("uses baseUrl override", async () => {
    const result = await discoverFromOpenAPI(jsonFixture, "https://custom.example.com");
    assert.equal(result.baseUrl, "https://custom.example.com");
  });

  it("sets source to openapi", async () => {
    const result = await discoverFromOpenAPI(jsonFixture);
    assert.equal(result.source, "openapi");
  });

  it("skips non-object schemas", async () => {
    const result = await discoverFromOpenAPI(jsonFixture);
    const names = result.entities.map((e) => e.name);
    assert.ok(!names.includes("Status"), "should skip plain enum schema");
  });

  it("throws on invalid spec", async () => {
    await assert.rejects(
      () => discoverFromOpenAPI(resolve("test/fixtures/petstore.json").replace("petstore", "nonexistent")),
      { code: "ENOENT" },
    );
  });

  it("throws on spec missing openapi field", async () => {
    // Create a temp approach — use a fixture inline by writing to a tmp path
    const { writeFile, unlink } = await import("node:fs/promises");
    const tmp = resolve("test/fixtures/invalid.json");
    await writeFile(tmp, JSON.stringify({ info: { title: "bad" } }));
    try {
      await assert.rejects(
        () => discoverFromOpenAPI(tmp),
        /missing 'openapi' version field/,
      );
    } finally {
      await unlink(tmp);
    }
  });
});
