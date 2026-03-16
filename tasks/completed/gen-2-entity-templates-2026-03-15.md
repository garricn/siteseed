# GEN-2: Entity Templates — Reference Resolution

## Context

GEN-1 generates leaf field values but returns `null` for `$ref` fields and `[]` for arrays. GEN-2 builds complete entity records by generating entities in dependency order (from DSC-2's topological sort) and resolving references to IDs of previously seeded entities.

This is the bridge between field-level generation (GEN-1) and seed plan execution (GEN-3/SEED-1).

## Goals

- Generate multiple records per entity type in topological order
- Resolve `$ref` fields to IDs from previously generated entities
- Resolve `xId` fields (e.g., `customerId`) to IDs from the referenced entity
- Track generated IDs in a registry for cross-entity reference resolution
- Return a complete dataset ready for seeding

## Data Flow

```
entities (DSC-1) → buildDependencyGraph (DSC-2) → topologicalSort (DSC-2) → generateDataset (GEN-2)
```

Input: entities array + count per entity type
Output: `{ [entityName]: Array<record> }` — ordered map of generated records

## ID Registry

As entities are generated in dependency order, their `id` fields (or first field with `format: "uuid"`) are tracked:

```json
{
  "Owner": ["uuid-1", "uuid-2", "uuid-3"],
  "Pet": ["uuid-4", "uuid-5"]
}
```

When generating a record for `Pet` with field `{ name: "owner", $ref: "#/components/schemas/Owner" }`, pick a random ID from `registry["Owner"]`.

## Reference Resolution Rules

| Field pattern | How to resolve | Fallback if no IDs |
|---|---|---|
| `$ref: "#/components/schemas/X"` | Random ID from `registry[X]` | `null` |
| `name: "xId"` matching entity `X` | Random ID from `registry[X]` | `null` |
| `items.$ref` (array of refs) | Not resolved in GEN-2 — stays `[]` | `[]` |

**Which field is the ID?** For each entity, the ID field is the first field where `name === "id"` OR `format === "uuid"`. If neither exists, references to that entity resolve to `null`.

| has "id" field | has uuid field | ID source |
|---|---|---|
| Yes | — | `record.id` |
| No | Yes | first uuid field value |
| No | No | `null` (no trackable ID) |

## Function Signatures

`lib/generate/templates.js` exports:

- `generateDataset(entities, options)` → `{ [entityName]: Array<record> }`
  - `entities`: array from `discoverFromOpenAPI().entities`
  - `options.count`: number of records per entity (default 5)
  - `options.faker`: faker instance
  - Internally calls `buildDependencyGraph`, `topologicalSort`, `generateEntity`, then resolves references

- `resolveReferences(record, entity, registry, faker)` → `record` (mutated)
  - Post-processes a record from `generateEntity` to fill in `$ref` and `xId` fields with actual IDs from registry

## Phases

### Phase 1: Core template engine (`lib/generate/templates.js`)

- Import `buildDependencyGraph`, `topologicalSort` from `../discover/graph.js`
- Import `generateEntity` from `./faker.js`
- `findIdField(entity)` — returns the field to use as entity ID (name "id" or first uuid format field)
- `resolveReferences(record, entity, registry, faker)` — for each field in entity:
  - If `field.$ref`: extract entity name, pick random ID from registry
  - If `field.name` ends with `Id` and matches an entity: pick random ID from registry
  - Skip if registry has no IDs for the target entity
- `generateDataset(entities, options)`:
  - Build graph + sort
  - For each entity in sort order: generate `count` records via `generateEntity`, resolve refs, track IDs
  - Return map of entity name → records array

### Phase 2: Barrel export + public API

- `lib/generate/index.js` — add `generateDataset` export
- `lib/index.js` — add `generateDataset` export

### Phase 3: Tests

Create `test/templates.test.js`:

- **Generates correct count per entity**: 2 entities, count=3 → `assert.equal(result["Pet"].length, 3)`
- **Resolves $ref to real ID**: Owner has uuid id field, Pet has $ref to Owner → `assert.ok(result["Pet"][0].owner !== null)` and `assert.ok(registry["Owner"].includes(result["Pet"][0].owner))`
- **Resolves xId to real ID**: Order has `customerId`, Customer exists → `assert.ok(result["Order"][0].customerId !== null)` and ID is from Customer records
- **Respects dependency order**: Owner generated before Pet → Owner IDs available when Pet is generated
- **Handles entity with no ID field**: entity has no "id" or uuid field → references to it resolve to `null`
- **Handles no dependencies**: standalone entity → generates normally, `assert.equal(result["Tag"].length, count)`
- **Uses provided faker instance**: seeded faker → deterministic output, `assert.deepEqual(result1, result2)`
- **Default count is 5**: no count option → `assert.equal(result["Pet"].length, 5)`

**xId resolution reuse**: The `xId` matching logic (strip trailing "Id", case-insensitive match against entity names) must be consistent with DSC-2's `buildDependencyGraph`. Import or replicate the same check.

**Inversion-prone**: `resolveReferences` must check `field.$ref` FIRST, then `xId`. If a field has `$ref`, skip the `xId` check (same logic as DSC-2's graph builder). The `continue` after `$ref` handling in DSC-2 ensures this — replicate that pattern.

## Files to Create

- `lib/generate/templates.js` — dataset generation + reference resolution

## Files to Modify

- `lib/generate/index.js` — add export
- `lib/index.js` — add export
- `test/templates.test.js` — tests (new file)

## Design Decisions

1. **Random ID selection** — `faker.helpers.arrayElement(registry[target])` picks a random ID from the pool. This distributes references realistically rather than always pointing to the first record.

2. **xId gets resolved here, not in GEN-1** — GEN-1's `generateFieldValue` generates a random string for `xId` fields (since it has no registry context). GEN-2's `resolveReferences` overwrites these with actual IDs from the registry.

3. **Array $ref not resolved** — `items.$ref` arrays stay empty. Populating them would require inverse relationship logic (which entities reference this one?) and count decisions. Defer to a future enhancement.

4. **Mutate-in-place for resolveReferences** — since the record was just created by `generateEntity`, there's no aliasing risk. Avoids unnecessary copies.

## Agent Team

Recommended: No — templates.js depends on both graph.js and faker.js, tests exercise the full pipeline.

## Before Closing

- [ ] Run `make check` (lint + tests pass)
- [ ] Verify $ref resolution: field with `$ref` gets an ID from registry, not null (when registry has IDs)
- [ ] Verify xId resolution: `customerId` gets an ID from `Customer` registry
- [ ] Verify $ref checked before xId (same as DSC-2 graph builder)
- [ ] Verify entity with no ID field: references to it resolve to null
- [ ] Confirm `lib/generate/templates.js` imports only from `../discover/` and `./faker.js`
