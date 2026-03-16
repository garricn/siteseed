import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseIntrospectionResult, discoverFromGraphQL } from "../lib/discover/graphql.js";

const FIXTURE = resolve("test/fixtures/graphql-introspection.json");

async function loadFixture() {
  const raw = await readFile(FIXTURE, "utf-8");
  return JSON.parse(raw).data.__schema;
}

describe("parseIntrospectionResult", () => {
  it("extracts entity from OBJECT type", async () => {
    const schema = await loadFixture();
    const entities = parseIntrospectionResult(schema);
    assert.ok(entities.find((e) => e.name === "Customer"));
  });

  it("skips introspection types", async () => {
    const schema = await loadFixture();
    const entities = parseIntrospectionResult(schema);
    assert.ok(!entities.find((e) => e.name === "__Type"));
  });

  it("skips Query/Mutation types", async () => {
    const schema = await loadFixture();
    const entities = parseIntrospectionResult(schema);
    assert.ok(!entities.find((e) => e.name === "Query"));
  });

  it("maps String → string", async () => {
    const schema = await loadFixture();
    const entities = parseIntrospectionResult(schema);
    const customer = entities.find((e) => e.name === "Customer");
    const name = customer.fields.find((f) => f.name === "name");
    assert.equal(name.type, "string");
  });

  it("maps Int → number integer", async () => {
    const schema = await loadFixture();
    const entities = parseIntrospectionResult(schema);
    const customer = entities.find((e) => e.name === "Customer");
    const age = customer.fields.find((f) => f.name === "age");
    assert.equal(age.type, "number");
    assert.equal(age.format, "integer");
  });

  it("maps Float → number float", async () => {
    const schema = await loadFixture();
    const entities = parseIntrospectionResult(schema);
    const customer = entities.find((e) => e.name === "Customer");
    const rating = customer.fields.find((f) => f.name === "rating");
    assert.equal(rating.type, "number");
    assert.equal(rating.format, "float");
  });

  it("maps Boolean → boolean", async () => {
    const schema = await loadFixture();
    const entities = parseIntrospectionResult(schema);
    const customer = entities.find((e) => e.name === "Customer");
    const active = customer.fields.find((f) => f.name === "active");
    assert.equal(active.type, "boolean");
  });

  it("maps ID → string uuid", async () => {
    const schema = await loadFixture();
    const entities = parseIntrospectionResult(schema);
    const customer = entities.find((e) => e.name === "Customer");
    const id = customer.fields.find((f) => f.name === "id");
    assert.equal(id.type, "string");
    assert.equal(id.format, "uuid");
  });

  it("NON_NULL → required true", async () => {
    const schema = await loadFixture();
    const entities = parseIntrospectionResult(schema);
    const customer = entities.find((e) => e.name === "Customer");
    assert.equal(customer.fields.find((f) => f.name === "id").required, true);
    assert.equal(customer.fields.find((f) => f.name === "email").required, true);
  });

  it("nullable → required false", async () => {
    const schema = await loadFixture();
    const entities = parseIntrospectionResult(schema);
    const customer = entities.find((e) => e.name === "Customer");
    assert.equal(customer.fields.find((f) => f.name === "name").required, false);
    assert.equal(customer.fields.find((f) => f.name === "age").required, false);
  });

  it("object reference → $ref field", async () => {
    const schema = await loadFixture();
    const entities = parseIntrospectionResult(schema);
    const order = entities.find((e) => e.name === "Order");
    const customer = order.fields.find((f) => f.name === "customer");
    assert.equal(customer.type, "object");
    assert.equal(customer.$ref, "Customer");
  });

  it("list of objects → array with $ref", async () => {
    const schema = await loadFixture();
    const entities = parseIntrospectionResult(schema);
    const customer = entities.find((e) => e.name === "Customer");
    const orders = customer.fields.find((f) => f.name === "orders");
    assert.equal(orders.type, "array");
    assert.equal(orders.$ref, "Order");
  });
});

describe("discoverFromGraphQL", () => {
  it("source is graphql", async () => {
    const fixture = JSON.parse(await readFile(FIXTURE, "utf-8"));
    const mockFetch = async () => ({
      ok: true,
      json: async () => fixture,
    });
    const result = await discoverFromGraphQL("http://localhost/graphql", { fetch: mockFetch });
    assert.equal(result.source, "graphql");
    assert.ok(result.entities.length > 0);
  });

  it("throws on failed introspection", async () => {
    const mockFetch = async () => ({ ok: false, status: 401, statusText: "Unauthorized" });
    await assert.rejects(
      () => discoverFromGraphQL("http://localhost/graphql", { fetch: mockFetch }),
      /introspection failed/i,
    );
  });
});
