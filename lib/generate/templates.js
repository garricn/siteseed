import { buildDependencyGraph, topologicalSort } from "../discover/graph.js";
import { generateEntity } from "./faker.js";

/**
 * Extract entity name from a $ref string like "#/components/schemas/Owner".
 */
function refToName(ref) {
  const parts = ref.split("/");
  return parts[parts.length - 1];
}

/**
 * Find the ID field for an entity. Returns the field named "id", or the first
 * field with format "uuid", or undefined if neither exists.
 */
function findIdField(entity) {
  const idField = entity.fields.find((f) => f.name === "id");
  if (idField) return idField;
  return entity.fields.find((f) => f.format === "uuid");
}

/**
 * Resolve $ref and xId fields in a generated record to actual IDs from the registry.
 * Mutates record in place.
 *
 * @param {object} record - Generated record from generateEntity
 * @param {object} entity - Entity definition with fields
 * @param {Map<string, string[]>} registry - Entity name → array of generated IDs
 * @param {object} faker - Faker instance for random selection
 * @returns {object} The mutated record
 */
export function resolveReferences(record, entity, registry, faker) {
  const entityNames = new Map(
    [...registry.keys()].map((n) => [n.toLowerCase(), n]),
  );

  for (const field of entity.fields) {
    // Signal 1: $ref — check first, skip xId if present
    if (field.$ref) {
      const target = refToName(field.$ref);
      const ids = registry.get(target);
      record[field.name] = ids?.length ? faker.helpers.arrayElement(ids) : null;
      continue;
    }

    // Signal 2: xId naming convention
    if (field.name.endsWith("Id") && field.name.length > 2) {
      const prefix = field.name.slice(0, -2).toLowerCase();
      const targetName = entityNames.get(prefix);
      if (targetName) {
        const ids = registry.get(targetName);
        record[field.name] = ids?.length ? faker.helpers.arrayElement(ids) : null;
      }
    }
  }

  return record;
}

/**
 * Generate a complete dataset for all entities in dependency order.
 *
 * @param {Array<{name: string, fields: Array}>} entities - Entities from discovery
 * @param {object} [options]
 * @param {number} [options.count=5] - Number of records per entity
 * @param {object} options.faker - Faker instance
 * @returns {{ [entityName: string]: Array<object> }}
 */
export function generateDataset(entities, options = {}) {
  const { count = 5, faker } = options;

  const graph = buildDependencyGraph(entities);
  const sortedNames = topologicalSort(graph);

  const entityMap = new Map(entities.map((e) => [e.name, e]));
  const registry = new Map();
  const dataset = {};

  for (const name of sortedNames) {
    const entity = entityMap.get(name);
    const idField = findIdField(entity);
    const records = [];
    const ids = [];

    for (let i = 0; i < count; i++) {
      const record = generateEntity(entity, faker);
      resolveReferences(record, entity, registry, faker);
      records.push(record);

      if (idField) {
        ids.push(record[idField.name]);
      }
    }

    registry.set(name, ids);
    dataset[name] = records;
  }

  return dataset;
}
