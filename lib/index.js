import { faker as defaultFaker } from "@faker-js/faker";
import { discoverFromOpenAPI } from "./discover/index.js";
import { generatePlan, writePlan } from "./seed/index.js";
import { executeSeed } from "./seed/index.js";

// Re-export all internals
export { discoverFromOpenAPI } from "./discover/index.js";
export { buildDependencyGraph, topologicalSort } from "./discover/index.js";
export { discoverFromUI, parseAccessibilityTree } from "./discover/index.js";
export { discoverFromTRPC } from "./discover/index.js";
export { discoverFromGraphQL, parseIntrospectionResult } from "./discover/index.js";
export { generateFieldValue, generateEntity } from "./generate/index.js";
export { generateDataset } from "./generate/index.js";
export { generateSmartFieldValue, generateSmartEntity, isEdgeCaseRecord } from "./generate/index.js";
export { generatePlan, readPlan, writePlan, applyOverrides } from "./seed/index.js";
export { seedViaAPI, executeSeed } from "./seed/index.js";
export { generateRunbookSteps, generateRunbook, seedViaUI } from "./seed/index.js";

/**
 * Discover entities from an OpenAPI spec. Convenience wrapper for sitefix.
 *
 * @param {object} options
 * @param {string} options.openapi - OpenAPI spec URL or file path
 * @param {string} [options.baseUrl] - Override base URL
 * @returns {Promise<{entities: Array, baseUrl: string|undefined, source: string}>}
 */
export async function discover({ openapi, baseUrl } = {}) {
  return discoverFromOpenAPI(openapi, baseUrl);
}

/**
 * Discover, plan, and seed in one call. Convenience wrapper for sitefix.
 *
 * @param {object} options
 * @param {string} options.openapi - OpenAPI spec URL or file path
 * @param {number} [options.count=5] - Records per entity
 * @param {string} [options.auth] - Authorization header
 * @param {boolean} [options.dryRun=false] - Skip HTTP calls
 * @param {object} [options.faker] - Faker instance (default: built-in)
 * @param {Function} [options.fetch] - Fetch function (default: global fetch)
 * @returns {Promise<{seeded: object, errors: Array}>}
 */
export async function seed({ openapi, count = 5, auth, dryRun = false, faker = defaultFaker, fetch: fetchFn } = {}) {
  const discovery = await discoverFromOpenAPI(openapi);
  const plan = generatePlan(discovery.entities, { baseUrl: discovery.baseUrl, count });
  const planYaml = await writePlan(plan);
  return executeSeed(planYaml, { openapi, auth, dryRun, faker, fetch: fetchFn });
}
