# DSC-1: OpenAPI 3.x Parser

## Context

siteseed's core pipeline starts with discovery — converting an external API spec into an internal entity graph that downstream tasks (dependency analysis, data generation, seeding) consume. DSC-1 implements the OpenAPI discovery path, which is the preferred mode.

All `lib/discover/` files need to be created from scratch. The `discoverOp` handler in `lib/operations.js` is stubbed and returns `{ entities: [] }`.

## Goals

- Parse OpenAPI 3.x specs (JSON and YAML, 3.0.x and 3.1.x) from URL or file path
- Extract `components/schemas` into entity definitions with typed fields, required flags, and enums
- Store raw `$ref` values on fields for DSC-2 to resolve into dependency edges
- Infer `baseUrl` from `servers[0].url` unless overridden
- Return a stable entity structure that GEN-1 and DSC-2 can consume without changes

## Entity Structure

```json
{
  "entities": [
    {
      "name": "Customer",
      "fields": [
        { "name": "id", "type": "string", "format": "uuid", "required": true },
        { "name": "email", "type": "string", "format": "email", "required": true },
        { "name": "status", "type": "string", "enum": ["active", "inactive"], "required": false }
      ]
    }
  ],
  "baseUrl": "https://api.example.com",
  "source": "openapi"
}
```

Field shape: `{ name, type, required, format?, enum?, items?, $ref? }`

## Type Mapping

| OpenAPI | Entity field type | Entity field format |
|---|---|---|
| `type: string` | `string` | — |
| `type: string, format: email` | `string` | `email` |
| `type: string, format: date-time` | `string` | `date-time` |
| `type: string, format: date` | `string` | `date` |
| `type: string, format: uuid` | `string` | `uuid` |
| `type: string, format: uri` | `string` | `uri` |
| `type: string, enum: [...]` | `string` | — (enum array set) |
| `type: integer` | `number` | `integer` |
| `type: number` | `number` | — |
| `type: number, format: float/double` | `number` | `float` |
| `type: boolean` | `boolean` | — |
| `type: array, items: {...}` | `array` | — (items set) |
| `$ref: #/components/schemas/X` | `object` | — ($ref set) |

## Phases

### Phase 1: Spec loading (`lib/discover/openapi.js`)

- Accept URL (use `fetch()`) or file path (use `fs.readFile`)
- Detect format: try `JSON.parse()` first, fall back to `js-yaml`
- Validate minimum OpenAPI structure: `openapi` version field, `components.schemas` present
- Extract `baseUrl` from `servers[0].url` if not overridden

**URL vs file detection**: if input starts with `http://` or `https://`, treat as URL. Otherwise, treat as file path.

### Phase 2: Schema extraction (`lib/discover/openapi.js`)

- Iterate `components.schemas` entries
- For each schema with `type: "object"` (or implicit object with `properties`):
  - Entity name = schema key
  - For each property: map to field using type table above
  - Set `required` flag by checking membership in schema's `required` array
  - Preserve `enum` arrays verbatim
  - For `$ref` properties: store raw ref string, set type to `object`
  - For array items with `$ref`: store on `items.$ref`
- Skip schemas that are not object-like (plain enums, primitives used as reusable types)

### Phase 3: Wire into operations

- `lib/discover/index.js` — barrel export `discoverFromOpenAPI` from `openapi.js`
- `lib/operations.js` — update `discoverOp.handler` to call `discoverFromOpenAPI(openapi, baseUrl)`
- `lib/index.js` — export `{ discoverFromOpenAPI }` as public API

**Dependency direction**: `lib/operations.js` → `lib/discover/index.js` → `lib/discover/openapi.js`. Core logic never imports from `bin/` or `generated/`.

### Phase 4: Tests

Create `test/discover.test.js`:

- **Parses JSON spec from file**: Load a fixture OpenAPI JSON file, assert entities array is non-empty, assert first entity has `name` and `fields` properties
- **Parses YAML spec from file**: Same with YAML fixture
- **Extracts field types correctly**: Given a schema with string/number/boolean/array fields, assert each field's `type` matches expected
- **Captures required flags**: Given schema with `required: ["id", "email"]` and properties `id`, `email`, `name` — assert `id.required === true`, `email.required === true`, `name.required === false`
- **Captures enum values**: Given schema with `enum: ["a", "b"]`, assert `field.enum` deep-equals `["a", "b"]`
- **Preserves $ref**: Given schema with `$ref` property, assert `field.$ref` equals the raw ref string
- **Infers baseUrl from servers**: Given spec with `servers: [{ url: "https://api.example.com" }]`, assert result `baseUrl === "https://api.example.com"`
- **Uses baseUrl override**: Pass explicit `baseUrl`, assert it wins over spec's servers
- **Throws on invalid spec**: Pass invalid content, assert throws with descriptive message

Test fixtures: create `test/fixtures/petstore.json` (minimal subset of Petstore spec — ~30 lines, 2 schemas with varied field types, required arrays, enums, and a $ref).

## Files to Create

- `lib/discover/openapi.js` — parser + schema extraction
- `lib/discover/index.js` — barrel export
- `test/discover.test.js` — tests
- `test/fixtures/petstore.json` — minimal OpenAPI fixture

## Files to Modify

- `lib/operations.js` — replace stub handler with real call
- `lib/index.js` — add public export

## Design Decisions

1. **No external OpenAPI parser library** — the subset we need (schema extraction from `components/schemas`) is small. A library like `swagger-parser` adds weight and complexity for little gain at this stage. Revisit if we need full `$ref` resolution across files.

2. **Raw $ref storage** — don't resolve references in DSC-1. DSC-2 owns dependency graph construction and will resolve `$ref` → entity name mapping. This keeps DSC-1 focused on parsing.

3. **js-yaml for both formats** — `js-yaml` can parse JSON too, but `JSON.parse` is faster and gives better error messages for JSON. Try JSON first, fall back to YAML.

4. **No plural name inference** — entity names come directly from schema keys. Pluralization is a presentation concern for DSC-2/GEN-3.

## Agent Team

Recommended: No — sequential file dependencies (openapi.js must exist before operations.js can import it, tests depend on both).

## Before Closing

- [ ] Run `make check` (lint + typecheck + tests pass)
- [ ] Re-read each acceptance criterion and locate the line of code that enforces it
- [ ] Verify `required` flag logic: field is required iff its name appears in the schema's `required` array (not the property-level `required` key)
- [ ] Verify `make generate` still produces unchanged output (operations handler signature unchanged)
- [ ] Confirm `lib/discover/openapi.js` imports nothing from `bin/` or `generated/`
