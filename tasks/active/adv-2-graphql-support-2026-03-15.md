# ADV-2: GraphQL Support

## Context

DSC-1 discovers from OpenAPI, DSC-3 from UI, ADV-1 from tRPC. ADV-2 adds GraphQL introspection as a discovery source.

GraphQL APIs expose their schema via the standard introspection query. The response contains types, fields, and relationships — all the information needed to build an entity graph.

## Goals

- Discover entities from a GraphQL endpoint via introspection query
- Extract object types with their fields, types, and nullability
- Map GraphQL scalar types to siteseed field types
- Detect relationships via field types referencing other object types
- Filter to "input" types (mutations) or "model" types (output objects)

## GraphQL → Entity Mapping

### Type filtering

| GraphQL type kind | Include? | Reason |
|---|---|---|
| `OBJECT` (not starting with `__`) | Yes | Domain model types |
| `INPUT_OBJECT` (for mutations) | Yes | Create input shapes |
| `SCALAR` | No | Primitives, not entities |
| `ENUM` | No | Used as field values, not entities |
| `INTERFACE` / `UNION` | No | Abstract, not directly seedable |
| `__*` types | No | Introspection meta-types |

**Prefer INPUT_OBJECT** types matching `Create*Input` / `Add*Input` patterns (they represent what you send to create an entity). Fall back to OBJECT types if no matching inputs found.

### Scalar mapping

| GraphQL scalar | Entity field type | format |
|---|---|---|
| `String` | `string` | — |
| `Int` | `number` | `integer` |
| `Float` | `number` | `float` |
| `Boolean` | `boolean` | — |
| `ID` | `string` | `uuid` |
| `DateTime` / `Date` | `string` | `date-time` / `date` |

### Nullability → required

GraphQL `NON_NULL` wrapper → `required: true`. Nullable fields → `required: false`.

**Inversion-prone**: In GraphQL, `NON_NULL` means required. The field's `type.kind === "NON_NULL"` wraps the actual type. Must unwrap to get the real type while noting required status.

| type.kind | required? | actual type |
|---|---|---|
| `NON_NULL` | true | `type.ofType` |
| other | false | `type` itself |

### Relationship detection

A field whose type is another OBJECT type → dependency edge (`$ref` equivalent). A field whose type is `LIST` of an OBJECT → array dependency.

## Function Signatures

`lib/discover/graphql.js` exports:

- `discoverFromGraphQL(endpoint, options?)` → `{ entities: Array, source: "graphql" }`
  - `endpoint`: GraphQL endpoint URL
  - `options.headers`: custom headers (e.g., auth)
  - `options.fetch`: injectable fetch
  - Sends introspection query, parses response, maps to entities

- `parseIntrospectionResult(data)` → `Array<entity>`
  - Pure function: takes introspection `__schema` data, returns entities
  - Separated for testability (test with fixture data, no HTTP)

## Phases

### Phase 1: Introspection query (`lib/discover/graphql.js`)

- Standard introspection query fetching all types with fields
- Send via POST to endpoint with `Content-Type: application/json`
- Parse response `data.__schema.types`

### Phase 2: Type → entity mapping

- Filter types per table above
- For each type, map fields: unwrap NON_NULL, map scalars, detect OBJECT references
- Set `$ref`-equivalent for object-type fields (for DSC-2 graph building)

### Phase 3: Wire into exports + CLI

- `lib/discover/index.js` — add export
- `lib/index.js` — add export
- `bin/siteseed.js` — add `--graphql` option to discover command

### Phase 4: Tests

Create `test/graphql-discover.test.js` with introspection fixture:

- **Extracts entity from OBJECT type**: `assert.ok(entities.find(e => e.name === "Customer"))`
- **Skips introspection types**: no entity named `__Type` or `__Field`
- **Maps String → string**: `assert.equal(field.type, "string")`
- **Maps Int → number integer**: `assert.equal(field.type, "number")` and `assert.equal(field.format, "integer")`
- **Maps Boolean → boolean**: `assert.equal(field.type, "boolean")`
- **Maps ID → string uuid**: `assert.equal(field.format, "uuid")`
- **NON_NULL → required true**: `assert.equal(field.required, true)`
- **Nullable → required false**: `assert.equal(field.required, false)`
- **Object reference → $ref-style field**: field type is another entity → `assert.ok(field.$ref)`
- **Source is graphql**: `assert.equal(result.source, "graphql")`
- **Prefers CreateInput types**: if `CreateCustomerInput` exists, entity derived from it

Test fixture: `test/fixtures/graphql-introspection.json` — minimal introspection result with 2-3 types.

## Files to Create

- `lib/discover/graphql.js`
- `test/graphql-discover.test.js`
- `test/fixtures/graphql-introspection.json`

## Files to Modify

- `lib/discover/index.js` — add export
- `lib/index.js` — add export
- `bin/siteseed.js` — add `--graphql` option

## Design Decisions

1. **Standard introspection query** — works with any spec-compliant GraphQL server. No schema file parsing needed.
2. **Prefer CreateInput types** — they represent the "write" shape, which is what seeding needs. Output types may have computed fields.
3. **Injectable fetch** — same pattern as SEED-1 for testability.
4. **$ref-style references** — reuse DSC-2's graph builder by storing references in the same format.

## Agent Team

Recommended: No — single module, introspection parsing and type mapping are tightly coupled.

## Before Closing

- [ ] Run `make check`
- [ ] Verify NON_NULL unwrapping: required flag correct AND actual type extracted
- [ ] Verify introspection meta-types filtered out
- [ ] Verify OBJECT field references stored for DSC-2 compatibility
- [ ] Verify `--graphql` CLI option works
