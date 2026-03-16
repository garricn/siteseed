# SEED-1: API Seeding

## Context

With discovery (DSC-1/2), generation (GEN-1/2), and seed plans (GEN-3) complete, SEED-1 executes the plan — POSTing generated records to REST API endpoints in dependency order. This is the core execution engine.

The `seedOp` handler in `lib/operations.js` is stubbed. It receives a plan (YAML string or file path), optional auth header, and a dry-run flag.

## Goals

- Read a seed plan, discover entities from the spec, generate data, and POST to API endpoints
- Support auth header on all requests
- Dry-run mode: generate everything but skip HTTP calls, return what would be sent
- Track seeded entity counts and collect errors without aborting the entire run
- Wire into `seedOp.handler`

## Execution Pipeline

```
readPlan(planSource) → discoverFromOpenAPI(plan.baseUrl + /openapi or original spec)
→ generateDataset(entities, { count, faker }) → applyOverrides per entity
→ POST each record to baseUrl/<entityNameLowerPlural>
```

### Endpoint Convention

Entity name → REST endpoint: lowercase + `s` suffix.

| Entity name | Endpoint |
|---|---|
| `Owner` | `POST /owners` |
| `Pet` | `POST /pets` |
| `OrderItem` | `POST /orderitems` |

Simple lowercase + `s`. No smart pluralization — keep it predictable and overridable in future versions.

## Function Signatures

`lib/seed/api.js` exports:

- `seedViaAPI(plan, entities, options)` → `{ seeded: { [name]: number }, errors: Array<{ entity: string, index: number, error: string }> }`
  - `plan`: parsed plan object (from `readPlan`)
  - `entities`: discovered entities array (for schema info needed by generateDataset)
  - `options.faker`: faker instance
  - `options.auth`: auth header string (e.g., `"Bearer token"`)
  - `options.dryRun`: boolean — skip HTTP, return generated records
  - `options.fetch`: fetch function (injectable for testing)
  - Generates dataset, applies overrides, POSTs in plan entity order

- `executeSeed(planSource, options)` → same return type
  - High-level orchestrator: reads plan, discovers from `options.openapi`, generates, seeds
  - `options.openapi`: spec URL/path (required — plan only has baseUrl, not full spec)
  - `options.auth`, `options.dryRun`, `options.faker`, `options.fetch`
  - This is what `seedOp.handler` calls

## HTTP Request Shape

```
POST {baseUrl}/{entityEndpoint}
Content-Type: application/json
Authorization: {auth}    ← only if auth provided

{record JSON body}
```

Response handling:
- 2xx → success, increment seeded count
- 4xx/5xx → capture error `{ entity, index, error: statusText or body }`, continue to next record
- Network error → capture error, continue

## Dry Run

When `dryRun: true`:
- Generate all records and apply overrides (same as real run)
- Skip all HTTP calls
- Return `{ seeded: { Owner: 5, Pet: 10 }, errors: [], dryRun: true, records: { Owner: [...], Pet: [...] } }`
- The `records` field is only present in dry-run mode (for inspection)

## Phases

### Phase 1: Core seeder (`lib/seed/api.js`)

- `seedViaAPI(plan, entities, options)`:
  - Call `generateDataset(entities, { count: planEntity.count, faker })` — but need per-entity counts. Since `generateDataset` uses a single count, call it per-entity or adjust.

  **Per-entity count handling**: The plan has per-entity counts. `generateDataset` takes a single count. Instead of using `generateDataset`, iterate plan entities in order and use `generateEntity` + `resolveReferences` + `applyOverrides` per record, maintaining the ID registry manually. This gives per-entity count control.

  Actually, simpler: iterate plan entities in order, for each generate `count` records using `generateEntity`, resolve refs, apply overrides, POST. This replicates what `generateDataset` does but with per-entity counts.

- For each plan entity (already in topological order):
  - Generate `count` records via `generateEntity(entity, faker)`
  - `resolveReferences(record, entity, registry, faker)` for each
  - `applyOverrides(record, planEntity.overrides)` for each
  - Track IDs in registry (same as GEN-2)
  - If not dryRun: POST to `{baseUrl}/{endpoint}`
  - Track success count and errors

- `executeSeed(planSource, options)`:
  - `readPlan(planSource)` to get plan
  - `discoverFromOpenAPI(options.openapi)` to get entities
  - Call `seedViaAPI(plan, discovery.entities, options)`

### Phase 2: Wire into operations

- `lib/seed/index.js` — add `seedViaAPI`, `executeSeed` exports
- `lib/operations.js` — update `seedOp.handler` to call `executeSeed`
  - Note: `seedOp` input has `plan` (YAML) but no `openapi` field. The plan's baseUrl isn't sufficient to re-discover. Two options:
    1. Add `openapi` to seedOp input schema
    2. Store the openapi source in the plan YAML

  **Decision**: Add `openapi` as optional field to `seedOp.input`. If not provided, seed can't discover entities — error. This keeps the plan format simple.

- `lib/index.js` — add public exports

### Phase 3: Tests

Create `test/seed.test.js` with a mock fetch:

- **Seeds entities via POST**: mock fetch returns 201, assert `seeded["Owner"] === count`
- **Sends correct endpoint**: mock captures URL, assert URL ends with `/owners`
- **Sends JSON body**: mock captures body, assert it's a valid object with expected fields
- **Sends auth header**: mock captures headers, assert `Authorization` header matches
- **No auth header when not provided**: mock captures headers, assert no Authorization
- **Dry run skips HTTP**: mock fetch that throws if called, assert no error and `seeded` counts correct
- **Dry run includes records**: assert `result.records` is present with entity arrays
- **Captures HTTP errors**: mock fetch returns 400, assert `errors.length > 0` and error has entity/index/error fields
- **Captures network errors**: mock fetch throws, assert error captured
- **Continues after error**: mock fetch fails for first record, succeeds for rest, assert `seeded` count is `count - 1`
- **Applies overrides**: mock captures body, plan has `overrides: { status: "active" }`, assert every body has `status === "active"`
- **Resolves references across entities**: Owner seeded first, Pet has $ref to Owner, assert Pet body's owner field is a real Owner ID

## Files to Create

- `lib/seed/api.js` — API seeding execution

## Files to Modify

- `lib/seed/index.js` — add exports
- `lib/operations.js` — update `seedOp` input schema + handler
- `lib/index.js` — add public exports
- `test/seed.test.js` — tests (new file)

## Design Decisions

1. **Injectable fetch** — pass `fetch` as an option for testability. Default to global `fetch`. No HTTP library dependency.

2. **Per-entity loop instead of generateDataset** — plan has per-entity counts and overrides, so we iterate plan entities manually rather than using `generateDataset` (which takes a single count). This replicates the same logic (generate → resolve → track IDs) but with plan-level control.

3. **Continue on error** — a failed POST for one record shouldn't abort the entire seed run. Collect errors and report them alongside successes.

4. **Add `openapi` to seedOp** — the plan has baseUrl but not the full spec path. Re-discovery requires the spec. Making it an optional input field is cleaner than embedding it in the plan YAML.

5. **Simple endpoint naming** — `lowercase(name) + "s"`. No inflection library. Users can override endpoints in future versions.

## Agent Team

Recommended: No — api.js depends on all prior modules, tests need mock fetch wiring.

## Before Closing

- [ ] Run `make check` (lint + tests pass)
- [ ] Run `make generate` — verify output matches (seedOp input schema changed, so generated files WILL change — commit them)
- [ ] Verify auth header sent only when provided
- [ ] Verify dry run never calls fetch
- [ ] Verify errors are collected, not thrown
- [ ] Verify per-entity counts from plan are respected
- [ ] Verify overrides applied after reference resolution (not before)
- [ ] Confirm `lib/seed/api.js` imports only from `../discover/`, `../generate/`, and `./plan.js`
