import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { allOperations } from "../lib/registry.js";

describe("registry", () => {
  it("exports at least one operation", () => {
    assert.ok(allOperations.length > 0);
  });

  it("each operation has required fields", () => {
    for (const op of allOperations) {
      assert.ok(op.name, "operation must have a name");
      assert.ok(op.description, "operation must have a description");
      assert.ok(op.type, "operation must have a type");
      assert.ok(op.input, "operation must have an input schema");
      assert.ok(typeof op.handler === "function", "operation must have a handler");
    }
  });
});

describe("codegen", () => {
  it("generate.js produces output matching committed files", async () => {
    const files = ["mcp-tools.js", "api-routes.js", "openapi.json", "tools.json"];
    const before = {};
    for (const f of files) {
      before[f] = await readFile(resolve("generated", f), "utf-8");
    }

    execSync("node scripts/generate.js", { stdio: "pipe" });

    for (const f of files) {
      const after = await readFile(resolve("generated", f), "utf-8");
      assert.equal(after, before[f], `generated/${f} changed after re-running generate.js — commit the updated file`);
    }
  });

  it("openapi.json is valid OpenAPI 3.1", async () => {
    const raw = await readFile(resolve("generated/openapi.json"), "utf-8");
    const spec = JSON.parse(raw);
    assert.equal(spec.openapi, "3.1.0");
    assert.ok(spec.info.title, "missing info.title");
    assert.ok(spec.info.version, "missing info.version");
    assert.ok(spec.paths, "missing paths");
    for (const [path, methods] of Object.entries(spec.paths)) {
      assert.match(path, /^\//, `path must start with /: ${path}`);
      for (const [method, def] of Object.entries(methods)) {
        assert.ok(["get", "post", "put", "patch", "delete"].includes(method), `invalid method: ${method}`);
        assert.ok(def.summary, `missing summary for ${method} ${path}`);
        assert.ok(def.operationId, `missing operationId for ${method} ${path}`);
        assert.ok(def.responses, `missing responses for ${method} ${path}`);
      }
    }
  });

  it("tools.json entries have required fields", async () => {
    const raw = await readFile(resolve("generated/tools.json"), "utf-8");
    const tools = JSON.parse(raw);
    assert.ok(Array.isArray(tools), "tools.json must be an array");
    assert.ok(tools.length > 0, "tools.json must have at least one tool");
    for (const tool of tools) {
      assert.ok(tool.name, "tool must have a name");
      assert.ok(tool.description, "tool must have a description");
      assert.ok(tool.input_schema, "tool must have an input_schema");
      assert.equal(tool.input_schema.type, "object", "input_schema must be an object type");
    }
  });

  it("mcp-tools.js exports tools array and handleTool function", async () => {
    const { tools, handleTool } = await import("../generated/mcp-tools.js");
    assert.ok(Array.isArray(tools), "tools must be an array");
    assert.ok(tools.length > 0, "tools must have at least one entry");
    assert.equal(typeof handleTool, "function", "handleTool must be a function");
    for (const tool of tools) {
      assert.ok(tool.name, "tool must have a name");
      assert.ok(tool.inputSchema, "tool must have an inputSchema");
    }
  });

  it("api-routes.js exports handleRequest function", async () => {
    const { handleRequest } = await import("../generated/api-routes.js");
    assert.equal(typeof handleRequest, "function", "handleRequest must be a function");
  });
});
