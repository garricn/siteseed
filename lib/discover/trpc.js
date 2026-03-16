import { readFile } from "node:fs/promises";

const CREATE_PATTERN = /^(create|add)[_-]?(.+)$/i;

/**
 * Convert a tool name like "create_customer" or "createOrder" to PascalCase entity name.
 */
function toolNameToEntity(name) {
  const match = name.match(CREATE_PATTERN);
  if (!match) return null;
  const raw = match[2].replace(/[_-]/g, " ");
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
 * Only tools matching create/add patterns become entities.
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

    const schema = tool.input_schema;
    if (!schema || !schema.properties) continue;

    const requiredSet = new Set(schema.required || []);
    const fields = [];
    for (const [propName, prop] of Object.entries(schema.properties)) {
      fields.push(mapProperty(propName, prop, requiredSet));
    }

    entities.push({ name: entityName, fields });
  }

  return { entities, source: "trpc" };
}
