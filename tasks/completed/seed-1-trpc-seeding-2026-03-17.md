# SEED-1 — tRPC Seeding Support

**Status:** pending
**Unblocks:** InfiniteOS FB-12

## Context

`siteseed run` currently requires `--openapi` and always seeds via REST (`POST /entities`). When a target app exposes only a tRPC router (no REST API), seeding fails. Three discovery bugs also block tRPC use in practice.

## Goals

1. Fix three `discoverFromTRPC` bugs so real-world tRPC tools.json files parse correctly.
2. Add `seedViaTRPC` so `run --trpc` can call tRPC mutations instead of REST endpoints.

## Discovery Bugs to Fix

### Bug 1 — Suffix tool name patterns (`xxx_create`)

Current regex: `/^(create|add)[_-]?(.+)$/i` — prefix only.
Misses: `customer_create`, `order_add`, etc.

Fix: also match suffix pattern `/^(.+)[_-](create|add)$/i`. Extract entity name from capture group 1.

Decision table:

```
tool name         | regex match | entity
------------------|-------------|--------
create_customer   | prefix      | Customer   ✓ (already works)
add_order         | prefix      | Order      ✓ (already works)
customer_create   | suffix      | Customer   ✗ (needs fix)
order_add         | suffix      | Order      ✗ (needs fix)
get_customer      | neither     | (skip)     ✓
```

### Bug 2 — Schema key casing (`inputSchema` vs `input_schema`)

Current code: `tool.input_schema` only.
Some tRPC tool formats expose `inputSchema` (camelCase).

Fix: `const schema = tool.input_schema ?? tool.inputSchema;`

### Bug 3 — Nested array fields

Current code skips or misrepresents `{ type: "array", items: { ... } }` fields.
Fix: when `prop.type === "array"` and `prop.items` exists, map field as `{ name, type: "array", items: { type: prop.items.type } }`. Faker generator should produce `[]` for array fields (safe default; override via seed plan).

## tRPC Seeding

### Protocol

tRPC v10 HTTP mutations:
```
POST <baseUrl>/trpc/<procedureName>
Content-Type: application/json

{"json": { ...data }}
```

Response: `{"result": {"data": {"json": {...}}}}` on success, non-2xx on error.

### Procedure name

Store `toolName` on the entity at discovery time so the seeder can derive the tRPC URL without re-parsing the name.

Entity shape gains optional field: `toolName?: string` (only present when discovered via tRPC).

### `seedViaTRPC(plan, entities, options)`

Parallel to existing `seedViaAPI`. Same signature, same return shape `{seeded, errors}`.

Key differences from `seedViaAPI`:

| Concern       | seedViaAPI              | seedViaTRPC                             |
|---------------|-------------------------|-----------------------------------------|
| URL           | `baseUrl/owners`        | `baseUrl/trpc/create_owner`             |
| Body          | `JSON.stringify(record)`| `JSON.stringify({json: record})`        |
| Method        | POST                    | POST                                    |
| Success check | `res.ok`                | `res.ok`                                |

### `executeSeed` update

Add `trpc` option. Selection logic:

```
trpc provided  | openapi provided | discovery + seed path
---------------|------------------|----------------------
Yes            | No               | discoverFromTRPC + seedViaTRPC
No             | Yes              | discoverFromOpenAPI + seedViaAPI
Yes            | Yes              | error: ambiguous
No             | No               | error: one required
```

### CLI `handleRun` update

- Add `--trpc <file>` option (already parsed at discover level, needs wiring to run)
- Remove hard `fatal("--openapi is required")` — allow `--trpc` as alternative
- Pass `trpc: values.trpc` into `executeSeed`

## Files to Modify

### `lib/discover/trpc.js`
- Update `CREATE_PATTERN` or split into two regexes (prefix + suffix)
- `toolNameToEntity`: try prefix match, then suffix match
- Schema key: `tool.input_schema ?? tool.inputSchema`
- Array field: handle `prop.type === "array"` in `mapProperty`
- Store `toolName` on each entity: `entities.push({ name, toolName: tool.name, fields })`

### `lib/seed/api.js`
- Add `seedViaTRPC(plan, entities, options)` — same param/return shape as `seedViaAPI`
  - URL: `${plan.baseUrl}/trpc/${entity.toolName ?? toolNameFromEntityName(planEntity.name)}`
  - Body: `JSON.stringify({ json: record })`
- Update `executeSeed`: accept `trpc` option, route to correct discovery + seed path
  - Validate: both or neither → throw

### `bin/siteseed.js`
- `handleRun`: accept `--trpc` as alternative to `--openapi`
- Pass `trpc: values.trpc` to `executeSeed`
- Update `--auto` path: if `--trpc` provided, use tRPC discovery for plan generation

### `test/fixtures/trpc-tools.json`
Add entries:
- `customer_create` (suffix pattern, uses `inputSchema`)
- `tag_add` (suffix pattern, array field `aliases`)

### `test/trpc-discover.test.js`
Add tests:
- `assert.ok(entities.find(e => e.name === "Customer"))` when tool name is `customer_create`
- `assert.ok(entities.find(e => e.name === "Tag"))` when tool name is `tag_add`
- `assert.equal(schema, tool.inputSchema)` fallback: entity extracted when only `inputSchema` present
- `assert.equal(aliasField.type, "array")` for array field
- `assert.equal(entity.toolName, "customer_create")` — toolName stored

### `test/trpc-seed.test.js` (new)
- `assert.ok(calls[0].url.includes("/trpc/create_customer"))` — correct mutation URL
- `assert.deepEqual(JSON.parse(calls[0].body), { json: record })` — tRPC body wrapper
- `assert.equal(result.seeded["Customer"], 2)` — count correct
- `assert.equal(result.errors.length, 0)` — happy path
- `assert.equal(result.errors[0].error, "400 ...")` — error capture
- dry run: `assert.equal(result.dryRun, true)`

## Dependency Direction

`lib/seed/api.js` imports from `lib/discover/index.js` (already does). No new cross-module dependencies introduced. `toolName` flows from `trpc.js` → entity object → `seedViaTRPC` — no circular imports.

## Validation

**Automated (local + CI):**
- `make check` — lint + all existing tests must still pass (no regressions)
- New unit tests in `test/trpc-discover.test.js` cover all three bug fixes
- New `test/trpc-seed.test.js` covers `seedViaTRPC` happy path, error capture, dry run
- `executeSeed` routing: unit test each quadrant of the decision table above

**Manual:**
- Point at a real InfiniteOS dev instance with `siteseed run --trpc tools.json --base-url http://localhost:3000` and verify FB-12 entities seed correctly.

## Agent Team

Recommended: No — each phase feeds the next (seeding depends on fixed entity shape from discovery).

## Before Closing

- [ ] `make check` passes (lint + all tests)
- [ ] Suffix pattern tested with both `xxx_create` and `xxx_add`
- [ ] `inputSchema` fallback tested (fixture entry uses camelCase key)
- [ ] Array field type present on entity, faker does not throw
- [ ] `seedViaTRPC` body is `{ json: record }`, not bare `record`
- [ ] `executeSeed` throws on ambiguous (both `--trpc` and `--openapi`)
- [ ] CLI `--trpc` wired all the way through to `executeSeed`
- [ ] No existing REST tests broken
