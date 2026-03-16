const INTROSPECTION_QUERY = `{
  __schema {
    types {
      name
      kind
      fields {
        name
        type {
          name
          kind
          ofType {
            name
            kind
            ofType {
              name
              kind
            }
          }
        }
      }
    }
  }
}`;

const SCALAR_MAP = {
  String: { type: "string" },
  Int: { type: "number", format: "integer" },
  Float: { type: "number", format: "float" },
  Boolean: { type: "boolean" },
  ID: { type: "string", format: "uuid" },
  DateTime: { type: "string", format: "date-time" },
  Date: { type: "string", format: "date" },
};

/**
 * Unwrap a GraphQL type, extracting required status and the leaf type.
 */
function unwrapType(gqlType) {
  let required = false;
  let current = gqlType;

  if (current.kind === "NON_NULL") {
    required = true;
    current = current.ofType;
  }

  let isList = false;
  if (current.kind === "LIST") {
    isList = true;
    current = current.ofType;
    // Unwrap inner NON_NULL if present
    if (current && current.kind === "NON_NULL") {
      current = current.ofType;
    }
  }

  return { required, isList, typeName: current?.name, typeKind: current?.kind };
}

/**
 * Parse a GraphQL introspection result into entities.
 *
 * @param {object} schemaData - The __schema object from introspection
 * @returns {Array<{name: string, fields: Array}>}
 */
export function parseIntrospectionResult(schemaData) {
  const types = schemaData.types || [];

  // Collect all OBJECT type names for reference detection
  const objectTypeNames = new Set(
    types
      .filter((t) => t.kind === "OBJECT" && !t.name.startsWith("__"))
      .map((t) => t.name),
  );

  // Prefer INPUT_OBJECT types matching Create*Input pattern
  const createInputs = types.filter(
    (t) => t.kind === "INPUT_OBJECT" && /^(Create|Add)\w+Input$/i.test(t.name),
  );

  // Use create inputs if available, otherwise use OBJECT types
  const targetTypes = createInputs.length > 0
    ? createInputs
    : types.filter((t) => t.kind === "OBJECT" && !t.name.startsWith("__") && t.name !== "Query" && t.name !== "Mutation" && t.name !== "Subscription");

  const entities = [];

  for (const gqlType of targetTypes) {
    if (!gqlType.fields || gqlType.fields.length === 0) continue;

    // Derive entity name: strip Create/Add prefix and Input suffix
    let entityName = gqlType.name;
    const inputMatch = entityName.match(/^(?:Create|Add)(\w+?)(?:Input)?$/i);
    if (inputMatch) entityName = inputMatch[1];

    const fields = [];
    for (const gqlField of gqlType.fields) {
      const { required, isList, typeName, typeKind } = unwrapType(gqlField.type);

      // Object reference
      if (typeKind === "OBJECT" || objectTypeNames.has(typeName)) {
        const field = { name: gqlField.name, type: isList ? "array" : "object", required };
        field.$ref = typeName;
        fields.push(field);
        continue;
      }

      // Scalar mapping
      const scalar = SCALAR_MAP[typeName];
      if (scalar) {
        const field = { name: gqlField.name, type: scalar.type, required };
        if (scalar.format) field.format = scalar.format;
        fields.push(field);
        continue;
      }

      // ENUM
      if (typeKind === "ENUM") {
        fields.push({ name: gqlField.name, type: "string", required });
        continue;
      }

      // Fallback
      fields.push({ name: gqlField.name, type: "string", required });
    }

    entities.push({ name: entityName, fields });
  }

  return entities;
}

/**
 * Discover entities from a GraphQL endpoint via introspection.
 *
 * @param {string} endpoint - GraphQL endpoint URL
 * @param {object} [options]
 * @param {object} [options.headers] - Custom headers
 * @param {Function} [options.fetch] - Injectable fetch
 * @returns {Promise<{entities: Array, source: "graphql"}>}
 */
export async function discoverFromGraphQL(endpoint, options = {}) {
  const { headers = {}, fetch: fetchFn = fetch } = options;

  const res = await fetchFn(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ query: INTROSPECTION_QUERY }),
  });

  if (!res.ok) {
    throw new Error(`GraphQL introspection failed: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (!json.data?.__schema) {
    throw new Error("Invalid introspection response: missing __schema");
  }

  const entities = parseIntrospectionResult(json.data.__schema);
  return { entities, source: "graphql" };
}
