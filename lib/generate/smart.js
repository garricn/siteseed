import { generateFieldValue } from "./faker.js";

const STRING_EDGE_CASES = ["", "a", "A".repeat(255), "日本語テスト", "O'Brien <script>alert(1)</script>"];
const NUMBER_EDGE_CASES = [0, -1, Number.MAX_SAFE_INTEGER, 0.001];
const INTEGER_EDGE_CASES = [0, 1, -1, 2147483647];
const EMAIL_EDGE_CASES = ["test+tag@example.com", "user@subdomain.example.com"];
const DATE_EDGE_CASES = ["1970-01-01", new Date().toISOString().split("T")[0], "2099-12-31"];
const DATETIME_EDGE_CASES = ["1970-01-01T00:00:00.000Z", new Date().toISOString(), "2099-12-31T23:59:59.999Z"];

const PRICE_POINTS = [9.99, 19.99, 29.99, 49.00, 99.99, 149.00, 199.99, 299.99, 499.00, 999.99];

/**
 * Determine if a record index should be an edge case.
 * First N records are edge cases (deterministic, not random).
 *
 * @param {number} index - Record index (0-based)
 * @param {number} count - Total records
 * @param {number} ratio - Edge case ratio (0–1)
 * @returns {boolean}
 */
export function isEdgeCaseRecord(index, count, ratio) {
  const edgeCaseCount = Math.floor(count * ratio);
  return index < edgeCaseCount;
}

/**
 * Get an edge case value for a field, cycling through the pool.
 */
function getEdgeCaseValue(field, index) {
  if (field.enum) {
    return field.enum[index % field.enum.length];
  }

  if (field.type === "string") {
    if (field.format === "email") return EMAIL_EDGE_CASES[index % EMAIL_EDGE_CASES.length];
    if (field.format === "date") return DATE_EDGE_CASES[index % DATE_EDGE_CASES.length];
    if (field.format === "date-time") return DATETIME_EDGE_CASES[index % DATETIME_EDGE_CASES.length];
    return STRING_EDGE_CASES[index % STRING_EDGE_CASES.length];
  }

  if (field.type === "number") {
    if (field.format === "integer") return INTEGER_EDGE_CASES[index % INTEGER_EDGE_CASES.length];
    return NUMBER_EDGE_CASES[index % NUMBER_EDGE_CASES.length];
  }

  if (field.type === "boolean") {
    return index % 2 === 0;
  }

  return null;
}

/**
 * Generate a field value with smart strategy support.
 *
 * @param {object} field - Entity field
 * @param {object} faker - Faker instance
 * @param {object} [options]
 * @param {string} [options.strategy="random"] - "random" | "edge-case" | "persona" | "mixed"
 * @param {number} [options.recordIndex=0] - Current record index
 * @param {number} [options.totalCount=1] - Total records
 * @param {number} [options.edgeCaseRatio=0.2] - Ratio of edge case records
 * @param {object} [options.persona] - Persona overrides
 * @param {Map} [options.enumCounters] - Enum round-robin counters
 * @returns {any}
 */
export function generateSmartFieldValue(field, faker, options = {}) {
  const {
    strategy = "random",
    recordIndex = 0,
    totalCount = 1,
    edgeCaseRatio = 0.2,
    persona,
    enumCounters,
  } = options;

  // Persona override
  if (persona && field.name in persona) {
    return persona[field.name];
  }

  // $ref → null (same as GEN-1)
  if (field.$ref) return null;

  // Edge case strategy
  const useEdgeCase = strategy === "edge-case" ||
    (strategy === "mixed" && isEdgeCaseRecord(recordIndex, totalCount, edgeCaseRatio));

  if (useEdgeCase) {
    return getEdgeCaseValue(field, recordIndex);
  }

  // Enum round-robin for report-friendly data
  if (field.enum && enumCounters) {
    const key = field.name;
    const idx = enumCounters.get(key) || 0;
    enumCounters.set(key, idx + 1);
    return field.enum[idx % field.enum.length];
  }

  // Report-friendly date spread
  if (strategy === "mixed" || strategy === "persona") {
    if (field.type === "string" && field.format === "date") {
      const daysAgo = Math.floor((recordIndex / Math.max(totalCount - 1, 1)) * 90);
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString().split("T")[0];
    }
    if (field.type === "string" && field.format === "date-time") {
      const daysAgo = Math.floor((recordIndex / Math.max(totalCount - 1, 1)) * 90);
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString();
    }
  }

  // Report-friendly price points
  if ((strategy === "mixed" || strategy === "persona") && field.type === "number" && !field.format) {
    const lower = field.name.toLowerCase();
    if (lower === "price" || lower === "amount" || lower === "cost" || lower === "total") {
      return PRICE_POINTS[recordIndex % PRICE_POINTS.length];
    }
  }

  // Fallback to normal generation
  return generateFieldValue(field, faker);
}

/**
 * Generate a complete entity record with smart strategy.
 *
 * @param {object} entity - Entity with fields
 * @param {object} faker - Faker instance
 * @param {object} [options] - Same as generateSmartFieldValue options
 * @returns {object}
 */
export function generateSmartEntity(entity, faker, options = {}) {
  const record = {};
  for (const field of entity.fields) {
    record[field.name] = generateSmartFieldValue(field, faker, options);
  }
  return record;
}
