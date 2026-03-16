import { z } from "zod";
import { discoverFromOpenAPI } from "./discover/index.js";
import { generatePlan } from "./seed/index.js";
import { writePlan } from "./seed/index.js";

/**
 * Define an operation — single source of truth for all API surfaces.
 */
function defineOp({ name, description, type, input, handler }) {
  return { name, description, type, input, handler };
}

export const discoverOp = defineOp({
  name: "discover",
  description:
    "Discover entities and relationships from an OpenAPI spec URL. Returns an entity graph with field types, dependencies, and seed order.",
  type: "query",
  input: z.object({
    openapi: z
      .string()
      .describe("URL or file path to OpenAPI 3.x spec (JSON or YAML)"),
    baseUrl: z
      .string()
      .optional()
      .describe("Override base URL for API calls (inferred from spec if omitted)"),
  }),
  handler: async ({ openapi, baseUrl }) => {
    return discoverFromOpenAPI(openapi, baseUrl);
  },
});

export const planOp = defineOp({
  name: "plan",
  description:
    "Generate a seed plan from an entity graph. Returns YAML seed plan with entity order, counts, and field generators.",
  type: "query",
  input: z.object({
    openapi: z
      .string()
      .describe("URL or file path to OpenAPI 3.x spec"),
    count: z
      .number()
      .optional()
      .default(5)
      .describe("Default number of entities to seed per type"),
  }),
  handler: async ({ openapi, count }) => {
    const discovery = await discoverFromOpenAPI(openapi);
    const plan = generatePlan(discovery.entities, { baseUrl: discovery.baseUrl, count });
    const yaml = await writePlan(plan);
    return { plan: yaml, openapi, count };
  },
});

export const seedOp = defineOp({
  name: "seed",
  description:
    "Execute a seed plan — create entities via API calls in dependency order. Returns seeded entity counts and any errors.",
  type: "mutation",
  input: z.object({
    plan: z
      .string()
      .describe("YAML seed plan content or file path"),
    auth: z
      .string()
      .optional()
      .describe("Auth header value (e.g., 'Bearer token')"),
    dryRun: z
      .boolean()
      .optional()
      .default(false)
      .describe("Preview what would be seeded without executing"),
  }),
  handler: async ({ plan, auth, dryRun }) => {
    // TODO: implement in lib/seed/api.js
    return { seeded: {}, errors: [], dryRun, plan, auth };
  },
});

export const statusOp = defineOp({
  name: "status",
  description: "Check the result of the last seed run.",
  type: "query",
  input: z.object({}),
  handler: async () => {
    return { lastRun: null, seeded: {}, errors: [] };
  },
});
