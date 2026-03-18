import { readFile } from "node:fs/promises";

const PREFIX_PATTERN = /^(create|add)[_-]?(.+)$/i;
const SUFFIX_PATTERN = /^(.+)[_-](create|add)$/i;

/**
 * Convert a tool name like "create_customer", "createOrder", or "customer_create"
 * to PascalCase entity name. Returns null if not a create/add tool.
 */
function toolNameToEntity(name) {
  let raw;
  const prefix = name.match(PREFIX_PATTERN);
  if (prefix) {
    raw = prefix[2];
  } else {
    const suffix = name.match(SUFFIX_PATTERN);
    if (suffix) {
      // For namespaced names like "infos_customers_create", use only the last
      // segment before _create/_add to avoid "InfosCustomers" entity names.
      const segments = suffix[1].split(/[_-]/);
      raw = segments[segments.length - 1];
    } else {
      return null;
    }
  }
  raw = raw.replace(/[_-]/g, " ");
  return raw.replace(/(?:^|\s)\w/g, (c) => c.trim().toUpperCase()).replace(/\s/g, "");
}

function mapType(jsonSchemaType) {
  if (jsonSchemaType === "integer") return "number";
  return jsonSchemaType || "string";
}

function mapFormat(type, format) {
  if ((type === "integer" || type === "number") && (format === "int32" || format === "int64")) return "integer";
  if (type === "integer" && !format) return "integer";
  if (type === "number" && (format === "float" || format === "double")) return "float";
  return format;
}

function mapProperty(name, prop, requiredSet) {
  if (prop.type === "array") {
    const field = { name, type: "array", required: requiredSet.has(name) };
    if (prop.items?.type) field.items = { type: prop.items.type };
    return field;
  }

  const field = {
    name,
    type: mapType(prop.type),
    required: requiredSet.has(name),
  };
  const mappedFormat = mapFormat(prop.type, prop.format);
  if (mappedFormat) field.format = mappedFormat;
  if (prop.enum) field.enum = prop.enum;
  return field;
}

/**
 * Discover entities from a tools.json file (tRPC / function-calling format).
 * Only tools matching create/add patterns (prefix or suffix) become entities.
 *
 * @param {string} source - Path to tools.json file
 * @returns {Promise<{entities: Array, source: "trpc"}>}
 */
export async function discoverFromTRPC(source) {
  const raw = await readFile(source, "utf-8");
  const tools = JSON.parse(raw);

  const entities = [];
  for (const tool of tools) {
    const entityName = toolNameToEntity(tool.name);
    if (!entityName) continue;

    const schema = tool.input_schema ?? tool.inputSchema;
    if (!schema || !schema.properties) continue;

    const requiredSet = new Set(schema.required || []);
    const fields = [];
    for (const [propName, prop] of Object.entries(schema.properties)) {
      fields.push(mapProperty(propName, prop, requiredSet));
    }

    const entity = { name: entityName, toolName: tool.name, fields };
    if (tool.trpcPath !== undefined) entity.trpcPath = tool.trpcPath;
    entities.push(entity);
  }

  return { entities, source: "trpc" };
}
