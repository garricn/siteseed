// AUTO-GENERATED — do not edit. Run: npm run generate
import * as ops from "../lib/operations.js";

export const tools = [
    {
      name: "health",
      description: "Health check",
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
      case "health":
        return ops.healthOp.handler(ops.healthOp.input.parse(args));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
