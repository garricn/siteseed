import yaml from "js-yaml";
import { generateEntity } from "../generate/faker.js";
import { resolveReferences } from "../generate/templates.js";
import { applyOverrides } from "./plan.js";

/**
 * Get CSS selector for a field from plan selectors or fallback.
 */
function getSelector(fieldName, planEntity) {
  if (planEntity.selectors && planEntity.selectors[fieldName]) {
    return planEntity.selectors[fieldName];
  }
  return `[name='${fieldName}']`;
}

/**
 * Find the ID field for an entity.
 */
function findIdField(entity) {
  return entity.fields.find((f) => f.name === "id") || entity.fields.find((f) => f.format === "uuid");
}

/**
 * Convert a field value into a sitetest step.
 */
function fieldToStep(fieldName, value, field, planEntity) {
  if (value === null || value === undefined) return null;

  const selector = getSelector(fieldName, planEntity);
  if (selector === false) return null;

  // Enum fields → select
  if (field.enum) {
    return { select: { selector, value: String(value) } };
  }

  // Boolean → check/uncheck
  if (field.type === "boolean") {
    return value ? { check: selector } : { uncheck: selector };
  }

  // Everything else → fill
  return { fill: { selector, value: String(value) } };
}

/**
 * Generate sitetest runbook steps for a single record.
 *
 * @param {object} record - Generated record
 * @param {object} entity - Entity definition with fields
 * @param {object} planEntity - Plan entity with formUrl, selectors, submitSelector
 * @returns {Array<object>} Array of sitetest step objects
 */
export function generateRunbookSteps(record, entity, planEntity) {
  const steps = [];

  steps.push({ goto: planEntity.formUrl });

  for (const field of entity.fields) {
    const value = record[field.name];
    const step = fieldToStep(field.name, value, field, planEntity);
    if (step) steps.push(step);
  }

  steps.push({ click: planEntity.submitSelector || "button[type='submit']" });

  return steps;
}

/**
 * Generate a complete sitetest runbook for multiple records of one entity.
 *
 * @param {Array<object>} records - Generated records
 * @param {object} entity - Entity definition
 * @param {object} planEntity - Plan entity config
 * @returns {{ name: string, steps: Array<object> }}
 */
export function generateRunbook(records, entity, planEntity) {
  const steps = [];
  for (const record of records) {
    steps.push(...generateRunbookSteps(record, entity, planEntity));
  }
  return { name: `Seed ${entity.name}`, steps };
}

/**
 * Seed UI-mode entities by generating sitetest runbook steps.
 *
 * @param {object} plan - Parsed seed plan
 * @param {Array} entities - Discovered entities
 * @param {object} [options]
 * @param {object} options.faker - Faker instance
 * @param {boolean} [options.execute=false] - Execute via sitetest (requires sitetest)
 * @param {object} [options.sitetest] - Injected sitetest module
 * @returns {Promise<{seeded: object, errors: Array, runbook?: string}>}
 */
export async function seedViaUI(plan, entities, options = {}) {
  const { faker, execute = false, sitetest: sitetestMod } = options;

  const entityMap = new Map(entities.map((e) => [e.name, e]));
  const registry = new Map();
  const seeded = {};
  const errors = [];
  const allRunbooks = [];

  const uiEntities = plan.entities.filter((pe) => pe.mode === "ui");

  for (const planEntity of uiEntities) {
    const entity = entityMap.get(planEntity.name);
    if (!entity) continue;

    const idField = findIdField(entity);
    const ids = [];
    const records = [];

    for (let i = 0; i < planEntity.count; i++) {
      const record = generateEntity(entity, faker);
      resolveReferences(record, entity, registry, faker);
      applyOverrides(record, planEntity.overrides);
      records.push(record);

      if (idField) ids.push(record[idField.name]);
    }

    registry.set(planEntity.name, ids);
    const runbook = generateRunbook(records, entity, planEntity);
    allRunbooks.push(runbook);

    if (execute) {
      const mod = sitetestMod || await import("sitetest").catch(() => null);
      if (!mod) {
        errors.push({ entity: planEntity.name, index: 0, error: "sitetest not available" });
        continue;
      }
      try {
        await mod.run(runbook);
        seeded[planEntity.name] = planEntity.count;
      } catch (err) {
        errors.push({ entity: planEntity.name, index: 0, error: err.message });
      }
    } else {
      seeded[planEntity.name] = planEntity.count;
    }
  }

  const result = { seeded, errors };

  if (!execute && allRunbooks.length > 0) {
    const combined = {
      name: "Seed via UI",
      steps: allRunbooks.flatMap((rb) => rb.steps),
    };
    result.runbook = yaml.dump(combined);
  }

  return result;
}
