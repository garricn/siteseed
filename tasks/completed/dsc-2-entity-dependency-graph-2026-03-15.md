# DSC-2: Entity Dependency Graph

## Context

DSC-1 produces a flat array of entities with typed fields. Some fields reference other entities — via explicit `$ref` (from OpenAPI) or implicit foreign key naming (`customerId` → `Customer`). DSC-2 builds a directed dependency graph from these references so entities can be seeded in the correct order (dependencies first).

This graph is the core data structure that GEN-2 (reference resolution) and the seed executor (SEED-1) depend on.

## Goals

- Detect entity dependencies from three signal types: `$ref` fields, `items.$ref` array fields, and `xId`-named fields
- Build a directed acyclic graph (DAG) of entity dependencies
- Topological sort to produce seed order
- Detect and report cycles (error, not silently ignore)

## Dependency Detection

Three ways a field can reference another entity:

| Signal | Example field | Detected dependency |
|---|---|---|
| `$ref` on field | `{ name: "owner", type: "object", $ref: "#/components/schemas/Owner" }` | Current entity → `Owner` |
| `items.$ref` on array field | `{ name: "pets", type: "array", items: { $ref: "#/components/schemas/Pet" } }` | Current entity → `Pet` |
| `xId` naming convention | `{ name: "customerId", type: "string" }` | Current entity → `Customer` |

### xId heuristic

A field matches the FK pattern if:
1. Field name ends with `Id` (case-sensitive)
2. The prefix (everything before `Id`) matches an entity name (case-insensitive)
3. The field does NOT already have a `$ref` (avoid double-counting)

| field name | entities in graph | match? | target |
|---|---|---|---|
| `customerId` | `[Customer, Order]` | Yes | `Customer` |
| `orderId` | `[Customer, Order]` | Yes | `Order` |
| `uuid` | `[Customer]` | No — prefix `u` doesn't match |
| `id` | `[Customer]` | No — empty prefix |
| `customerId` (with `$ref`) | `[Customer]` | No — already has `$ref` |

**Inversion-prone**: The match is `not field.$ref AND name.endsWith("Id") AND prefixMatchesEntity`. Verify all three conditions in tests.

## Graph Representation

```json
{
  "nodes": ["Owner", "Pet", "Order"],
  "edges": [
    { "from": "Pet", "to": "Owner" },
    { "from": "Order", "to": "Pet" }
  ]
}
```

- `nodes`: entity names (from `entities[].name`)
- `edges`: directed edges where `from` depends on `to` (i.e., `to` must be seeded first)

## Topological Sort

Kahn's algorithm (BFS-based) — straightforward, gives clear cycle detection.

Output: array of entity names in seed order (dependencies first).

Example: given edges `Order → Pet`, `Pet → Owner` → sort produces `["Owner", "Pet", "Order"]`.

### Cycle detection

If the sorted output has fewer nodes than the graph, a cycle exists. Throw an error listing the entities involved in the cycle (the unsorted remainder).

## Function Signatures

`lib/discover/graph.js` exports:

- `buildDependencyGraph(entities)` → `{ nodes: string[], edges: { from: string, to: string }[] }`
  - `entities`: array from `discoverFromOpenAPI().entities`
  - Scans fields for `$ref`, `items.$ref`, and `xId` patterns

- `topologicalSort(graph)` → `string[]`
  - Input: graph from `buildDependencyGraph`
  - Returns entity names in seed order
  - Throws `Error` with message containing "cycle" if cycle detected

## Phases

### Phase 1: Graph construction (`lib/discover/graph.js`)

- `buildDependencyGraph(entities)`:
  - Collect all entity names as nodes
  - For each entity, for each field: check the three dependency signals (table above)
  - For `$ref`: extract entity name from `#/components/schemas/<Name>` (last path segment)
  - For `xId`: strip trailing `Id`, match against node names case-insensitively
  - Deduplicate edges (same from→to pair should appear once)

### Phase 2: Topological sort (`lib/discover/graph.js`)

- `topologicalSort(graph)`:
  - Kahn's algorithm: compute in-degrees, BFS from zero in-degree nodes
  - If result length < nodes length → cycle error

### Phase 3: Wire into barrel export

- `lib/discover/index.js` — add exports for `buildDependencyGraph` and `topologicalSort`
- `lib/index.js` — add public exports

### Phase 4: Tests

Create `test/graph.test.js`:

- **Detects $ref dependency**: entities `[Pet(owner: $ref Owner), Owner()]` → assert edge `{ from: "Pet", to: "Owner" }`
- **Detects items.$ref dependency**: entities `[Owner(pets: array items.$ref Pet), Pet()]` → assert edge `{ from: "Owner", to: "Pet" }`
- **Detects xId dependency**: entities `[Order(customerId: string), Customer()]` → assert edge `{ from: "Order", to: "Customer" }`
- **Skips xId when $ref present**: field has both `$ref` and name ending in `Id` → assert only one edge (from `$ref`)
- **Skips xId when no matching entity**: field `fooId` but no `Foo` entity → assert no edge
- **Deduplicates edges**: same dependency detected via both `$ref` and `xId` → assert single edge
- **Topological sort — linear chain**: `A → B → C` → `assert.deepEqual(result, ["C", "B", "A"])`
- **Topological sort — diamond**: `A → B, A → C, B → D, C → D` → assert D first, A last, B and C in middle
- **Topological sort — no edges**: `[A, B, C]` with no deps → assert all three present (order doesn't matter)
- **Cycle detection**: `A → B → A` → `assert.throws` with `/cycle/i`
- **Empty entities**: `[]` → `assert.deepEqual(result, [])`

## Files to Create

- `lib/discover/graph.js` — graph construction + topological sort

## Files to Modify

- `lib/discover/index.js` — add graph exports
- `lib/index.js` — add public exports
- `test/graph.test.js` — tests (new file)

## Design Decisions

1. **Separate functions** — `buildDependencyGraph` and `topologicalSort` are separate so callers can inspect the graph without sorting (useful for DSC-3 UI discovery and ADV-1/ADV-2 alternate discovery modes).

2. **Edge deduplication** — use a Set of `${from}→${to}` strings to avoid duplicate edges when the same dependency is detected via multiple signals.

3. **Case-insensitive xId matching** — entity names are PascalCase (`Customer`), field prefixes are camelCase (`customer`). Compare lowercased.

4. **$ref parsing** — only handle `#/components/schemas/<Name>` format. External file refs are out of scope (would need a resolver, which is a separate concern).

## Agent Team

Recommended: No — graph.js and topologicalSort are tightly coupled, tests depend on both.

## Before Closing

- [ ] Run `make check` (lint + tests pass)
- [ ] Verify xId detection: field must NOT have `$ref`, name must end with `Id`, prefix must match an entity (case-insensitive)
- [ ] Verify cycle detection: sorted length < nodes length triggers error
- [ ] Verify edge deduplication: same from→to pair appears at most once
- [ ] Confirm `lib/discover/graph.js` imports nothing from `bin/` or `generated/`
