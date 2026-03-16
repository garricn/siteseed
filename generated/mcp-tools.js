// AUTO-GENERATED — do not edit. Run: npm run generate
import * as ops from "../lib/operations.js";

export const tools = [
    {
      name: "discover",
      description: "Discover entities and relationships from an OpenAPI spec URL. Returns an entity graph with field types, dependencies, and seed order.",
      inputSchema: {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "type": "object",
            "properties": {
                  "openapi": {
                        "type": "string",
                        "description": "URL or file path to OpenAPI 3.x spec (JSON or YAML)"
                  },
                  "baseUrl": {
                        "description": "Override base URL for API calls (inferred from spec if omitted)",
                        "type": "string"
                  }
            },
            "required": [
                  "openapi"
            ],
            "additionalProperties": false
      },
    },
    {
      name: "plan",
      description: "Generate a seed plan from an entity graph. Returns YAML seed plan with entity order, counts, and field generators.",
      inputSchema: {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "type": "object",
            "properties": {
                  "openapi": {
                        "type": "string",
                        "description": "URL or file path to OpenAPI 3.x spec"
                  },
                  "count": {
                        "default": 5,
                        "description": "Default number of entities to seed per type",
                        "type": "number"
                  }
            },
            "required": [
                  "openapi",
                  "count"
            ],
            "additionalProperties": false
      },
    },
    {
      name: "seed",
      description: "Execute a seed plan — create entities via API calls in dependency order. Returns seeded entity counts and any errors.",
      inputSchema: {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "type": "object",
            "properties": {
                  "plan": {
                        "type": "string",
                        "description": "YAML seed plan content or file path"
                  },
                  "openapi": {
                        "description": "URL or file path to OpenAPI 3.x spec (required for entity schema discovery)",
                        "type": "string"
                  },
                  "auth": {
                        "description": "Auth header value (e.g., 'Bearer token')",
                        "type": "string"
                  },
                  "dryRun": {
                        "default": false,
                        "description": "Preview what would be seeded without executing",
                        "type": "boolean"
                  }
            },
            "required": [
                  "plan",
                  "dryRun"
            ],
            "additionalProperties": false
      },
    },
    {
      name: "status",
      description: "Check the result of the last seed run.",
      inputSchema: {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "type": "object",
            "properties": {},
            "additionalProperties": false
      },
    }
  ];

export async function handleTool(name, args) {
  switch (name) {
      case "discover":
        return ops.discoverOp.handler(ops.discoverOp.input.parse(args));
      case "plan":
        return ops.planOp.handler(ops.planOp.input.parse(args));
      case "seed":
        return ops.seedOp.handler(ops.seedOp.input.parse(args));
      case "status":
        return ops.statusOp.handler(ops.statusOp.input.parse(args));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
