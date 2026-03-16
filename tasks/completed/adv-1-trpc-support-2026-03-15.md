# ADV-1: tRPC Support

## Context

DSC-1 discovers entities from OpenAPI specs. ADV-1 adds a third discovery mode: reading a tRPC router definition (or its generated `tools.json` / operations registry) to extract entity schemas.

tRPC routers define procedures with Zod input schemas — the same Zod library siteseed already uses. The discovery path reads these schemas and converts them to the standard entity structure.

## Goals

- Discover entities from a tRPC router definition file or exported tools.json
- Extract Zod input schemas from mutation procedures (these represent "create" operations)
- Convert Zod schemas to entity fields matching DSC-1's output format
- Support both: (a) reading a tools.json file, (b) importing a router module directly

## Discovery Approaches

### Approach A: tools.json (preferred, static)

A `tools.json` file (like siteseed's own `generated/tools.json`) contains function-calling tool definitions with JSON Schema input schemas. Parse these the same way DSC-1 parses OpenAPI `components/schemas`.

### Approach B: Router module import (dynamic)

Import the tRPC router module, introspect its procedures, extract Zod schemas. More complex — requires the router's dependencies to be available. Defer to a future enhancement if Approach A covers most cases.

**Decision**: Implement Approach A only. tools.json is a standard output format and doesn't require runtime dependencies.

## Entity Extraction from tools.json

Each tool entry represents a procedure. Entity discovery heuristic:

| tool name pattern | entity? | entity name |
|---|---|---|
| `create_*` / `add_*` | Yes | strip prefix, PascalCase |
| `update_*` / `edit_*` | No (update, not create) | — |
| `delete_*` / `remove_*` | No | — |
| `get_*` / `list_*` / `find_*` | No (read) | — |
| Other | Skip | — |

**Inversion-prone**: only `create`/`add` prefixed tools become entities. A tool named `createOrder` → entity `Order`. A tool named `getOrder` is skipped.

For each create tool, the `input_schema` properties become entity fields, mapped using the same JSON Schema → field type logic as DSC-1's OpenAPI parser.

## Function Signatures

`lib/discover/trpc.js` exports:

- `discoverFromTRPC(source)` → `{ entities: Array, source: "trpc" }`
  - `source`: path to tools.json file
  - Reads file, filters create tools, extracts input schemas, maps to entities

## Phases

### Phase 1: tools.json parser (`lib/discover/trpc.js`)

- Load and parse tools.json
- Filter tools matching create/add pattern
- For each: extract `input_schema.properties`, map to entity fields
- Reuse `mapType`/`mapFormat` logic pattern from openapi.js (or extract shared helper)

### Phase 2: Wire into exports + CLI

- `lib/discover/index.js` — add export
- `lib/index.js` — add export
- `bin/siteseed.js` — add `--trpc` option to discover command

### Phase 3: Tests

Create `test/trpc-discover.test.js`:

- **Extracts entity from create tool**: tools.json with `create_customer` → `assert.equal(entities[0].name, "Customer")`
- **Skips non-create tools**: `get_customer`, `delete_customer` → `assert.equal(entities.length, 0)` (if only those)
- **Maps input_schema to fields**: `assert.equal(field.type, "string")`, `assert.equal(field.format, "email")`
- **Handles required fields**: `assert.equal(field.required, true)` for fields in `required` array
- **Source is trpc**: `assert.equal(result.source, "trpc")`
- **Multiple create tools → multiple entities**: 2 create tools → `assert.equal(entities.length, 2)`

## Files to Create

- `lib/discover/trpc.js`
- `test/trpc-discover.test.js`
- `test/fixtures/trpc-tools.json` — test fixture

## Files to Modify

- `lib/discover/index.js` — add export
- `lib/index.js` — add export
- `bin/siteseed.js` — add `--trpc` option

## Design Decisions

1. **tools.json only** — avoids requiring tRPC runtime. tools.json is a standard, static artifact.
2. **Create/add prefix heuristic** — simple, predictable. Covers the common CRUD pattern.
3. **Reuse JSON Schema mapping** — tools.json input_schema is JSON Schema, same as OpenAPI. Share or mirror the mapping logic from openapi.js.

## Agent Team

Recommended: No — single module with shared mapping logic from openapi.js.

## Before Closing

- [ ] Run `make check`
- [ ] Verify only create/add tools become entities
- [ ] Verify field mapping matches DSC-1 output structure
- [ ] Verify `--trpc` CLI option works
