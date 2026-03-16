const INPUT_ROLES = new Set(["textbox", "spinbutton", "checkbox", "combobox", "listbox", "radio", "switch", "searchbox"]);

const ROLE_TYPE_MAP = {
  textbox: "string",
  searchbox: "string",
  spinbutton: "number",
  checkbox: "boolean",
  switch: "boolean",
  combobox: "string",
  listbox: "string",
  radio: "string",
};

const LABEL_FORMAT_HEURISTICS = [
  { pattern: /email/i, format: "email" },
  { pattern: /phone|tel/i, format: "phone" },
  { pattern: /date|birthday|dob/i, format: "date" },
  { pattern: /url|website|link/i, format: "uri" },
  { pattern: /price|amount|cost/i, format: null, typeOverride: "number" },
];

const LINE_REGEX = /^(\s*)- (\w+)(?: "([^"]*)")?(?: \[value: "([^"]*)"\])?/;

/**
 * Parse accessibility tree text into structured nodes.
 *
 * @param {string} text - Indented tree text from sitecap
 * @returns {Array<{role: string, name: string, value?: string, depth: number, index: number}>}
 */
export function parseAccessibilityTree(text) {
  const nodes = [];
  for (const line of text.split("\n")) {
    const match = line.match(LINE_REGEX);
    if (!match) continue;

    const [, indent, role, name, value] = match;
    const depth = indent.length / 2;
    const node = { role, name: name || "", depth, index: nodes.length };
    if (value !== undefined) node.value = value;
    nodes.push(node);
  }
  return nodes;
}

/**
 * Get child nodes of a parent node based on depth.
 * Children are nodes immediately after parent with depth === parent.depth + 1,
 * until a node at parent.depth or less is encountered.
 */
function getChildren(nodes, parentIndex) {
  const parent = nodes[parentIndex];
  const children = [];
  for (let i = parentIndex + 1; i < nodes.length; i++) {
    if (nodes[i].depth <= parent.depth) break;
    if (nodes[i].depth === parent.depth + 1) {
      children.push(nodes[i]);
    }
  }
  return children;
}

/**
 * Get all descendant nodes within a parent's scope.
 */
function getDescendants(nodes, parentIndex) {
  const parent = nodes[parentIndex];
  const descendants = [];
  for (let i = parentIndex + 1; i < nodes.length; i++) {
    if (nodes[i].depth <= parent.depth) break;
    descendants.push(nodes[i]);
  }
  return descendants;
}

/**
 * Extract enum values from child option nodes of a combobox/listbox.
 */
function extractEnumValues(nodes, parentIndex) {
  const children = getChildren(nodes, parentIndex);
  const options = children.filter((n) => n.role === "option" && n.name);
  return options.length > 0 ? options.map((n) => n.name) : undefined;
}

/**
 * Convert a tree input node to an entity field.
 */
function nodeToField(node, nodes) {
  const rawName = node.name || "unnamed";
  const hasAsterisk = rawName.includes("*");
  const cleanName = rawName.replace(/\s*\*\s*$/, "").trim();

  const field = {
    name: cleanName,
    type: ROLE_TYPE_MAP[node.role] || "string",
    required: hasAsterisk,
  };

  // Label heuristic — only for textbox/searchbox roles
  if (node.role === "textbox" || node.role === "searchbox") {
    for (const h of LABEL_FORMAT_HEURISTICS) {
      if (h.pattern.test(cleanName)) {
        if (h.typeOverride) {
          field.type = h.typeOverride;
        } else if (h.format) {
          field.format = h.format;
        }
        break;
      }
    }
  }

  // Enum extraction for combobox/listbox
  if (node.role === "combobox" || node.role === "listbox") {
    const enumValues = extractEnumValues(nodes, node.index);
    if (enumValues) field.enum = enumValues;
  }

  return field;
}

/**
 * Extract entities from input nodes within a scope.
 */
function extractFieldsFromNodes(inputNodes, allNodes) {
  return inputNodes
    .filter((n) => INPUT_ROLES.has(n.role) && n.name)
    .map((n) => nodeToField(n, allNodes));
}

/**
 * Discover entities from a sitecap accessibility tree.
 *
 * @param {string} treeText - Accessibility tree text
 * @param {object} [options]
 * @param {string} [options.defaultEntityName="Form"] - Fallback entity name
 * @returns {{ entities: Array<{name: string, fields: Array}>, source: "ui" }}
 */
export function discoverFromUI(treeText, options = {}) {
  const { defaultEntityName = "Form" } = options;
  const nodes = parseAccessibilityTree(treeText);
  const entities = [];

  // Find all form nodes
  const formNodes = nodes.filter((n) => n.role === "form" && n.name);

  if (formNodes.length > 0) {
    for (const formNode of formNodes) {
      const descendants = getDescendants(nodes, formNode.index);
      const fields = extractFieldsFromNodes(descendants, nodes);
      if (fields.length > 0) {
        entities.push({ name: formNode.name, fields });
      }
    }
  } else {
    // No form nodes — collect all input nodes into one entity
    const fields = extractFieldsFromNodes(nodes, nodes);
    if (fields.length > 0) {
      entities.push({ name: defaultEntityName, fields });
    }
  }

  return { entities, source: "ui" };
}
