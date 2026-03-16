import { discoverFromOpenAPI } from "../discover/index.js";
import { generateEntity } from "../generate/faker.js";
import { resolveReferences } from "../generate/templates.js";
import { readPlan, applyOverrides } from "./plan.js";

/**
 * Derive a REST endpoint from an entity name: lowercase + "s".
 */
function entityEndpoint(name) {
  return name.toLowerCase() + "s";
}

/**
 * Find the ID field for an entity (name "id" or first uuid format field).
 */
function findIdField(entity) {
  return entity.fields.find((f) => f.name === "id") || entity.fields.find((f) => f.format === "uuid");
}

/**
 * Seed entities via API calls.
 *
 * @param {object} plan - Parsed plan object
 * @param {Array} entities - Discovered entities array
 * @param {object} [options]
 * @param {object} options.faker - Faker instance
 * @param {string} [options.auth] - Authorization header value
 * @param {boolean} [options.dryRun] - Skip HTTP calls
 * @param {Function} [options.fetch] - Fetch function (default: global fetch)
 * @returns {Promise<{seeded: object, errors: Array, dryRun?: boolean, records?: object}>}
 */
export async function seedViaAPI(plan, entities, options = {}) {
  const { faker, auth, dryRun = false, fetch: fetchFn = fetch } = options;

  const entityMap = new Map(entities.map((e) => [e.name, e]));
  const registry = new Map();
  const seeded = {};
  const errors = [];
  const records = {};

  for (const planEntity of plan.entities) {
    const entity = entityMap.get(planEntity.name);
    if (!entity) continue;

    const idField = findIdField(entity);
    const ids = [];
    const entityRecords = [];
    let successCount = 0;

    for (let i = 0; i < planEntity.count; i++) {
      const record = generateEntity(entity, faker);
      resolveReferences(record, entity, registry, faker);
      applyOverrides(record, planEntity.overrides);

      if (idField) {
        ids.push(record[idField.name]);
      }

      entityRecords.push(record);

      if (!dryRun) {
        try {
          const url = `${plan.baseUrl}/${entityEndpoint(planEntity.name)}`;
          const headers = { "Content-Type": "application/json" };
          if (auth) headers["Authorization"] = auth;

          const res = await fetchFn(url, {
            method: "POST",
            headers,
            body: JSON.stringify(record),
          });

          if (res.ok) {
            successCount++;
          } else {
            const body = await res.text().catch(() => res.statusText);
            errors.push({ entity: planEntity.name, index: i, error: `${res.status} ${body}` });
          }
        } catch (err) {
          errors.push({ entity: planEntity.name, index: i, error: err.message });
        }
      } else {
        successCount++;
      }
    }

    registry.set(planEntity.name, ids);
    seeded[planEntity.name] = successCount;
    if (dryRun) records[planEntity.name] = entityRecords;
  }

  const result = { seeded, errors };
  if (dryRun) {
    result.dryRun = true;
    result.records = records;
  }
  return result;
}

/**
 * High-level orchestrator: read plan, discover entities, seed via API.
 *
 * @param {string} planSource - YAML string or file path
 * @param {object} options
 * @param {string} options.openapi - OpenAPI spec URL or file path
 * @param {object} options.faker - Faker instance
 * @param {string} [options.auth] - Authorization header
 * @param {boolean} [options.dryRun] - Skip HTTP calls
 * @param {Function} [options.fetch] - Fetch function
 * @returns {Promise<{seeded: object, errors: Array}>}
 */
export async function executeSeed(planSource, options = {}) {
  const { openapi, ...seedOptions } = options;

  if (!openapi) {
    throw new Error("openapi option is required to discover entity schemas");
  }

  const plan = await readPlan(planSource);
  const discovery = await discoverFromOpenAPI(openapi);

  return seedViaAPI(plan, discovery.entities, seedOptions);
}
