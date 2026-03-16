import { readFile } from "node:fs/promises";
import yaml from "js-yaml";

/**
 * Map an OpenAPI property to an entity field.
 */
function mapProperty(name, prop, requiredSet) {
  if (prop.$ref) {
    return { name, type: "object", required: requiredSet.has(name), $ref: prop.$ref };
  }

  const field = {
    name,
    type: mapType(prop.type),
    required: requiredSet.has(name),
  };

  if (prop.format) {
    field.format = mapFormat(prop.type, prop.format);
  }

  if (prop.enum) {
    field.enum = prop.enum;
  }

  if (prop.type === "array" && prop.items) {
    field.items = prop.items.$ref
      ? { $ref: prop.items.$ref }
      : { type: mapType(prop.items.type) };
    if (prop.items.format) {
      field.items.format = mapFormat(prop.items.type, prop.items.format);
    }
    if (prop.items.enum) {
      field.items.enum = prop.items.enum;
    }
  }

  return field;
}

function mapType(openapiType) {
  if (openapiType === "integer") return "number";
  return openapiType || "string";
}

function mapFormat(openapiType, openapiFormat) {
  if ((openapiType === "integer" || openapiType === "number") && openapiFormat === "int32") return "integer";
  if ((openapiType === "integer" || openapiType === "number") && openapiFormat === "int64") return "integer";
  if (openapiType === "integer" && !openapiFormat) return "integer";
  if ((openapiType === "number") && (openapiFormat === "float" || openapiFormat === "double")) return "float";
  return openapiFormat;
}

/**
 * Load an OpenAPI spec from a URL or file path. Returns parsed object.
 */
async function loadSpec(source) {
  let raw;
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to fetch spec: ${res.status} ${res.statusText}`);
    raw = await res.text();
  } else {
    raw = await readFile(source, "utf-8");
  }

  try {
    return JSON.parse(raw);
  } catch {
    return yaml.load(raw);
  }
}

/**
 * Extract entities from an OpenAPI spec's components/schemas.
 */
function extractEntities(spec) {
  const schemas = spec.components?.schemas;
  if (!schemas) return [];

  const entities = [];
  for (const [name, schema] of Object.entries(schemas)) {
    if (!schema.properties && schema.type !== "object") continue;

    const requiredSet = new Set(schema.required || []);
    const fields = [];

    for (const [propName, prop] of Object.entries(schema.properties || {})) {
      fields.push(mapProperty(propName, prop, requiredSet));
    }

    entities.push({ name, fields });
  }

  return entities;
}

/**
 * Discover entities from an OpenAPI spec URL or file path.
 *
 * @param {string} source - URL or file path to OpenAPI 3.x spec
 * @param {string} [baseUrl] - Override base URL (inferred from spec if omitted)
 * @returns {Promise<{entities: Array, baseUrl: string|undefined, source: string}>}
 */
export async function discoverFromOpenAPI(source, baseUrl) {
  const spec = await loadSpec(source);

  if (!spec.openapi) {
    throw new Error("Invalid OpenAPI spec: missing 'openapi' version field");
  }

  const resolvedBaseUrl = baseUrl || spec.servers?.[0]?.url;
  const entities = extractEntities(spec);

  return { entities, baseUrl: resolvedBaseUrl, source: "openapi" };
}
