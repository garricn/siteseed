import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDependencyGraph, topologicalSort } from "../lib/discover/graph.js";

describe("buildDependencyGraph", () => {
  it("detects $ref dependency", () => {
    const entities = [
      { name: "Pet", fields: [{ name: "owner", type: "object", $ref: "#/components/schemas/Owner" }] },
      { name: "Owner", fields: [] },
    ];
    const graph = buildDependencyGraph(entities);
    assert.deepEqual(graph.edges, [{ from: "Pet", to: "Owner" }]);
  });

  it("detects items.$ref dependency", () => {
    const entities = [
      { name: "Owner", fields: [{ name: "pets", type: "array", items: { $ref: "#/components/schemas/Pet" } }] },
      { name: "Pet", fields: [] },
    ];
    const graph = buildDependencyGraph(entities);
    assert.deepEqual(graph.edges, [{ from: "Owner", to: "Pet" }]);
  });

  it("detects xId dependency", () => {
    const entities = [
      { name: "Order", fields: [{ name: "customerId", type: "string", required: true }] },
      { name: "Customer", fields: [] },
    ];
    const graph = buildDependencyGraph(entities);
    assert.deepEqual(graph.edges, [{ from: "Order", to: "Customer" }]);
  });

  it("skips xId when $ref present", () => {
    const entities = [
      { name: "Order", fields: [{ name: "customerId", type: "object", $ref: "#/components/schemas/Customer" }] },
      { name: "Customer", fields: [] },
    ];
    const graph = buildDependencyGraph(entities);
    assert.equal(graph.edges.length, 1);
    assert.deepEqual(graph.edges[0], { from: "Order", to: "Customer" });
  });

  it("skips xId when no matching entity", () => {
    const entities = [
      { name: "Order", fields: [{ name: "fooId", type: "string" }] },
    ];
    const graph = buildDependencyGraph(entities);
    assert.deepEqual(graph.edges, []);
  });

  it("deduplicates edges", () => {
    const entities = [
      {
        name: "Order",
        fields: [
          { name: "customer", type: "object", $ref: "#/components/schemas/Customer" },
          { name: "customerId", type: "string" },
        ],
      },
      { name: "Customer", fields: [] },
    ];
    const graph = buildDependencyGraph(entities);
    assert.equal(graph.edges.length, 1);
  });

  it("handles empty entities", () => {
    const graph = buildDependencyGraph([]);
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(graph.edges, []);
  });
});

describe("topologicalSort", () => {
  it("sorts linear chain", () => {
    const graph = {
      nodes: ["A", "B", "C"],
      edges: [
        { from: "A", to: "B" },
        { from: "B", to: "C" },
      ],
    };
    assert.deepEqual(topologicalSort(graph), ["C", "B", "A"]);
  });

  it("sorts diamond — D first, A last", () => {
    const graph = {
      nodes: ["A", "B", "C", "D"],
      edges: [
        { from: "A", to: "B" },
        { from: "A", to: "C" },
        { from: "B", to: "D" },
        { from: "C", to: "D" },
      ],
    };
    const result = topologicalSort(graph);
    assert.equal(result[0], "D");
    assert.equal(result[result.length - 1], "A");
    assert.ok(result.includes("B"));
    assert.ok(result.includes("C"));
  });

  it("handles no edges", () => {
    const graph = { nodes: ["A", "B", "C"], edges: [] };
    const result = topologicalSort(graph);
    assert.equal(result.length, 3);
    assert.ok(result.includes("A"));
    assert.ok(result.includes("B"));
    assert.ok(result.includes("C"));
  });

  it("detects cycles", () => {
    const graph = {
      nodes: ["A", "B"],
      edges: [
        { from: "A", to: "B" },
        { from: "B", to: "A" },
      ],
    };
    assert.throws(() => topologicalSort(graph), /cycle/i);
  });

  it("handles empty graph", () => {
    assert.deepEqual(topologicalSort({ nodes: [], edges: [] }), []);
  });
});
