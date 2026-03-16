/**
 * Extract the entity name from a $ref string like "#/components/schemas/Owner".
 */
function refToName(ref) {
  const parts = ref.split("/");
  return parts[parts.length - 1];
}

/**
 * Build a dependency graph from an array of entities.
 * Detects dependencies via $ref, items.$ref, and xId naming convention.
 *
 * @param {Array<{name: string, fields: Array}>} entities
 * @returns {{ nodes: string[], edges: Array<{from: string, to: string}> }}
 */
export function buildDependencyGraph(entities) {
  const nodes = entities.map((e) => e.name);
  const nodeNamesLower = new Map(nodes.map((n) => [n.toLowerCase(), n]));
  const edgeSet = new Set();
  const edges = [];

  function addEdge(from, to) {
    const key = `${from}\u2192${to}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push({ from, to });
  }

  for (const entity of entities) {
    for (const field of entity.fields) {
      // Signal 1: direct $ref
      if (field.$ref) {
        const target = refToName(field.$ref);
        if (nodes.includes(target)) {
          addEdge(entity.name, target);
        }
        continue;
      }

      // Signal 2: items.$ref on array fields
      if (field.items?.$ref) {
        const target = refToName(field.items.$ref);
        if (nodes.includes(target)) {
          addEdge(entity.name, target);
        }
      }

      // Signal 3: xId naming convention (only if no $ref)
      if (field.name.endsWith("Id") && field.name.length > 2) {
        const prefix = field.name.slice(0, -2).toLowerCase();
        const target = nodeNamesLower.get(prefix);
        if (target) {
          addEdge(entity.name, target);
        }
      }
    }
  }

  return { nodes, edges };
}

/**
 * Topological sort using Kahn's algorithm. Returns entity names in seed order
 * (dependencies first). Throws if a cycle is detected.
 *
 * @param {{ nodes: string[], edges: Array<{from: string, to: string}> }} graph
 * @returns {string[]}
 */
export function topologicalSort(graph) {
  const { nodes, edges } = graph;
  if (nodes.length === 0) return [];

  const inDegree = new Map(nodes.map((n) => [n, 0]));
  const adjacency = new Map(nodes.map((n) => [n, []]));

  for (const { from, to } of edges) {
    inDegree.set(from, (inDegree.get(from) || 0) + 1);
    adjacency.get(to).push(from);
  }

  const queue = [];
  for (const [node, deg] of inDegree) {
    if (deg === 0) queue.push(node);
  }

  const sorted = [];
  while (queue.length > 0) {
    const node = queue.shift();
    sorted.push(node);
    for (const dependent of adjacency.get(node)) {
      const newDeg = inDegree.get(dependent) - 1;
      inDegree.set(dependent, newDeg);
      if (newDeg === 0) queue.push(dependent);
    }
  }

  if (sorted.length < nodes.length) {
    const cycleNodes = nodes.filter((n) => !sorted.includes(n));
    throw new Error(`Dependency cycle detected among entities: ${cycleNodes.join(", ")}`);
  }

  return sorted;
}
