# GEN-3: Seed Plan YAML

## Context

A seed plan is the user-facing configuration that describes what to seed: which entities, how many, and optional field overrides. It sits between discovery (DSC-1/DSC-2) and execution (SEED-1). Plans can be auto-generated from discovered entities or hand-written by users.

`js-yaml` is already a dependency. API: `yaml.load(str)` to parse, `yaml.dump(obj)` to serialize.

## Goals

- Define a YAML schema for seed plans
- Generate a seed plan from discovered entities (auto-plan)
- Read a seed plan from YAML string or file
- Write a seed plan to YAML string or file
- Support per-entity count overrides and field value overrides
- Wire into the `planOp` operation handler

## Seed Plan YAML Schema

```yaml
# seed-plan.yaml
version: 1
baseUrl: https://api.example.com
entities:
  - name: Owner
    count: 5
    overrides:
      active: true
  - name: Pet
    count: 10
    overrides:
      status: available
```

Fields:
- `version`: always `1` (for future schema evolution)
- `baseUrl`: target API base URL (from discovery or user override)
- `entities`: array in seed order (topological — dependencies first)
  - `name`: entity name (must match discovered entity)
  - `count`: number of records to generate (default 5)
  - `overrides`: optional map of `fieldName: fixedValue` — these values replace generated values for every record

## Function Signatures

`lib/seed/plan.js` exports:

- `generatePlan(entities, options)` → plan object
  - `entities`: from `discoverFromOpenAPI().entities`
  - `options.baseUrl`: string
  - `options.count`: default count per entity (default 5)
  - Builds dependency graph, sorts, returns plan object with entities in seed order

- `readPlan(source)` → plan object
  - `source`: YAML string or file path
  - If source starts with `{` or contains `version:`, treat as YAML string
  - Otherwise treat as file path and read it
  - Validates required fields: `version`, `entities` array

- `writePlan(plan, filePath?)` → YAML string
  - Serializes plan to YAML string via `yaml.dump`
  - If `filePath` provided, also writes to disk
  - Returns the YAML string either way

- `applyOverrides(record, overrides)` → record (mutated)
  - For each key in `overrides`, sets `record[key] = overrides[key]`
  - Called by SEED-1 during execution, but defined here since it's plan-level logic

## Phases

### Phase 1: Plan generation (`lib/seed/plan.js`)

- Import `buildDependencyGraph`, `topologicalSort` from `../discover/graph.js`
- `generatePlan(entities, options)`:
  - Build graph + sort for seed order
  - Map sorted entity names to plan entries with default count
  - Return `{ version: 1, baseUrl, entities: [...] }`

### Phase 2: Read/write (`lib/seed/plan.js`)

- `readPlan(source)`:
  - Detect string vs file path: if source includes a newline or starts with `version`, it's a YAML string; otherwise read from file
  - Parse with `yaml.load()`
  - Validate: must have `version` and `entities` array, throw if missing
- `writePlan(plan, filePath?)`:
  - `yaml.dump(plan)` to serialize
  - If filePath, write with `fs.writeFile`
  - Return YAML string

### Phase 3: Override application

- `applyOverrides(record, overrides)`:
  - Simple key-value merge: `Object.assign(record, overrides)`
  - Only applies keys present in overrides map

### Phase 4: Wire into operations

- `lib/seed/index.js` — barrel export
- `lib/index.js` — add public exports
- `lib/operations.js` — update `planOp.handler` to call `generatePlan`

**Dependency direction**: `lib/operations.js` → `lib/seed/index.js` → `lib/seed/plan.js` → `lib/discover/graph.js`

### Phase 5: Tests

Create `test/plan.test.js`:

- **generatePlan returns valid structure**: `assert.equal(plan.version, 1)` and `assert.ok(Array.isArray(plan.entities))`
- **Entities in topological order**: Owner before Pet → `assert.ok(plan.entities.findIndex(e => e.name === "Owner") < plan.entities.findIndex(e => e.name === "Pet"))`
- **Default count is 5**: `assert.equal(plan.entities[0].count, 5)`
- **Custom count**: pass `count: 10` → `assert.equal(plan.entities[0].count, 10)`
- **Includes baseUrl**: `assert.equal(plan.baseUrl, "https://api.example.com")`
- **writePlan returns YAML string**: `assert.ok(typeof yamlStr === "string")` and `assert.ok(yamlStr.includes("version: 1"))`
- **readPlan parses YAML string**: write then read → `assert.deepEqual(readResult.entities, plan.entities)`
- **readPlan from file**: write to temp file, read back → `assert.equal(result.version, 1)`
- **readPlan validates version**: YAML missing version → `assert.throws` with `/version/i`
- **readPlan validates entities**: YAML missing entities → `assert.throws` with `/entities/i`
- **applyOverrides sets values**: `applyOverrides({ a: 1, b: 2 }, { b: 99 })` → `assert.equal(result.b, 99)` and `assert.equal(result.a, 1)`
- **applyOverrides with empty overrides**: no-op → record unchanged

### String vs file detection

| source content | detected as |
|---|---|
| Contains `\n` | YAML string |
| Starts with `version` | YAML string |
| Everything else | file path |

**Inversion-prone**: a file path like `version-1-plan.yaml` would be misdetected as YAML string. Mitigate by checking `\n` first (file paths don't contain newlines), then checking if source looks like valid YAML (starts with `version` or `---`).

Revised logic: if source contains `\n` → YAML string. Otherwise → file path. This is simple and correct since YAML strings always span multiple lines but file paths never contain newlines.

## Files to Create

- `lib/seed/plan.js` — plan generation, read/write, overrides
- `lib/seed/index.js` — barrel export
- `test/plan.test.js` — tests

## Files to Modify

- `lib/index.js` — add public exports
- `lib/operations.js` — update `planOp.handler`

## Design Decisions

1. **Version field** — future-proofing for schema changes. Always `1` for now. `readPlan` validates it exists but doesn't check the value (forward-compatible).

2. **Overrides are static values only** — no expressions, no faker templates, no conditionals. Just `fieldName: value`. Keeps the YAML simple and human-editable.

3. **String vs file detection via newline** — YAML plan strings always have multiple lines. File paths never contain newlines. Simple, reliable heuristic.

4. **applyOverrides defined in plan.js, not templates.js** — overrides are a plan-level concept. SEED-1 will call `applyOverrides` after `generateEntity` + `resolveReferences`.

## Agent Team

Recommended: No — single module, operations.js update depends on plan.js exports.

## Before Closing

- [ ] Run `make check` (lint + tests pass)
- [ ] Run `make generate` — verify output unchanged (planOp handler signature unchanged)
- [ ] Verify topological order in generated plan matches DSC-2 sort
- [ ] Verify readPlan validates required fields
- [ ] Verify writePlan → readPlan round-trip preserves all fields
- [ ] Confirm `lib/seed/plan.js` imports nothing from `bin/` or `generated/`
