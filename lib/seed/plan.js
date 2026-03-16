import { readFile, writeFile } from "node:fs/promises";
import yaml from "js-yaml";
import { buildDependencyGraph, topologicalSort } from "../discover/graph.js";

/**
 * Generate a seed plan from discovered entities.
 * Entities are ordered by dependency (topological sort).
 *
 * @param {Array<{name: string, fields: Array}>} entities
 * @param {object} [options]
 * @param {string} [options.baseUrl]
 * @param {number} [options.count=5]
 * @returns {{ version: number, baseUrl: string|undefined, entities: Array }}
 */
export function generatePlan(entities, options = {}) {
  const { baseUrl, count = 5 } = options;

  const graph = buildDependencyGraph(entities);
  const sortedNames = topologicalSort(graph);

  const planEntities = sortedNames.map((name) => ({ name, count }));

  return { version: 1, baseUrl, entities: planEntities };
}

/**
 * Read a seed plan from a YAML string or file path.
 *
 * @param {string} source - YAML string (multiline) or file path
 * @returns {Promise<object>} Parsed plan object
 */
export async function readPlan(source) {
  let raw;
  if (source.includes("\n")) {
    raw = source;
  } else {
    raw = await readFile(source, "utf-8");
  }

  const plan = yaml.load(raw);

  if (!plan || plan.version === undefined) {
    throw new Error("Invalid seed plan: missing 'version' field");
  }
  if (!Array.isArray(plan.entities)) {
    throw new Error("Invalid seed plan: missing 'entities' array");
  }

  return plan;
}

/**
 * Write a seed plan to YAML. Optionally writes to a file.
 *
 * @param {object} plan - Plan object
 * @param {string} [filePath] - Optional file path to write to
 * @returns {Promise<string>} YAML string
 */
export async function writePlan(plan, filePath) {
  const yamlStr = yaml.dump(plan);
  if (filePath) {
    await writeFile(filePath, yamlStr, "utf-8");
  }
  return yamlStr;
}

/**
 * Apply field overrides to a generated record. Mutates in place.
 *
 * @param {object} record - Generated record
 * @param {object} [overrides] - Map of fieldName → fixedValue
 * @returns {object} The mutated record
 */
export function applyOverrides(record, overrides) {
  if (overrides) {
    Object.assign(record, overrides);
  }
  return record;
}
