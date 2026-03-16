# GEN-1: Field-Type-Aware Data Generators

## Context

DSC-1 produces entities with typed fields (`{ name, type, required, format?, enum?, items?, $ref? }`). GEN-1 maps each field type+format combination to a faker function that produces realistic test data. This module is a pure function layer — no side effects, no API calls.

GEN-2 will use these generators to build complete entity records with resolved references.

## Goals

- Map every field type+format combination from the DSC-1 type table to a faker call
- Support enum fields (random pick from values)
- Support `xId` / `$ref` fields with a placeholder strategy (GEN-2 resolves actual IDs)
- Provide a single entry point: `generateFieldValue(field, faker)` → value
- Deterministic seeding support via faker's seed mechanism

## Field → Faker Mapping

| type | format | faker call |
|---|---|---|
| `string` | — | `faker.lorem.word()` |
| `string` | `email` | `faker.internet.email()` |
| `string` | `uuid` | `faker.string.uuid()` |
| `string` | `date-time` | `faker.date.recent().toISOString()` |
| `string` | `date` | `faker.date.recent().toISOString().split("T")[0]` |
| `string` | `uri` | `faker.internet.url()` |
| `string` | `phone` | `faker.phone.number()` |
| `string` | (enum present) | random pick from `field.enum` |
| `number` | — | `faker.number.float({ min: 0, max: 10000, fractionDigits: 2 })` |
| `number` | `integer` | `faker.number.int({ min: 1, max: 10000 })` |
| `number` | `float` | `faker.number.float({ min: 0, max: 10000, fractionDigits: 2 })` |
| `boolean` | — | `faker.datatype.boolean()` |
| `array` | — | empty array `[]` (GEN-2 handles population) |
| `object` | — (has `$ref`) | `null` (GEN-2 resolves references) |

### Name-based heuristics

Before falling back to the type-based mapping, check the field name for common patterns:

| field name pattern | faker call |
|---|---|
| `firstName` | `faker.person.firstName()` |
| `lastName` | `faker.person.lastName()` |
| `name` (exact) | `faker.person.fullName()` |
| `phone` / `phoneNumber` | `faker.phone.number()` |
| `address` | `faker.location.streetAddress()` |
| `city` | `faker.location.city()` |
| `state` | `faker.location.state()` |
| `zip` / `zipCode` / `postalCode` | `faker.location.zipCode()` |
| `country` | `faker.location.country()` |
| `company` / `companyName` | `faker.company.name()` |
| `url` / `website` | `faker.internet.url()` |
| `avatar` / `image` / `photo` | `faker.image.url()` |
| `description` / `bio` / `about` | `faker.lorem.sentence()` |
| `title` | `faker.lorem.words(3)` |
| `price` / `amount` / `cost` | `faker.commerce.price()` |

Name heuristics apply only to `string` and `number` types. Enum always wins (if `field.enum` is set, pick from it regardless of name).

### Priority order

1. `field.enum` → random pick
2. `field.$ref` → `null` (reference placeholder)
3. Name-based heuristic match → specific faker call
4. Type + format mapping → generic faker call

## Function Signatures

`lib/generate/faker.js` exports:

- `generateFieldValue(field, faker)` → `any`
  - `field`: entity field object from DSC-1
  - `faker`: faker instance (passed in for seed control)
  - Returns a single generated value

- `generateEntity(entity, faker)` → `object`
  - `entity`: `{ name, fields }` from DSC-1
  - Returns `{ [fieldName]: generatedValue }` for all fields

## Phases

### Phase 1: Core generator (`lib/generate/faker.js`)

- `generateFieldValue(field, faker)` implementing the priority chain above
- Name heuristic lookup: a map of `{ pattern: string, generator: fn }` entries, matched case-insensitively against `field.name`
- `generateEntity(entity, faker)` iterating fields and calling `generateFieldValue`

### Phase 2: Barrel export

- `lib/generate/index.js` — export `generateFieldValue` and `generateEntity`
- `lib/index.js` — add public exports

### Phase 3: Tests

Create `test/generate.test.js`:

- **String field → string value**: `generateFieldValue({ name: "tag", type: "string", required: true }, faker)` → `assert.equal(typeof result, "string")`
- **Email format → valid email**: field with `format: "email"` → `assert.match(result, /@/)`
- **UUID format → valid UUID**: field with `format: "uuid"` → `assert.match(result, /^[0-9a-f-]{36}$/i)`
- **Date-time format → ISO string**: field with `format: "date-time"` → `assert.ok(!isNaN(Date.parse(result)))`
- **Date format → YYYY-MM-DD**: field with `format: "date"` → `assert.match(result, /^\d{4}-\d{2}-\d{2}$/)`
- **Number field → number**: field with `type: "number"` → `assert.equal(typeof result, "number")`
- **Integer format → integer**: field with `format: "integer"` → `assert.ok(Number.isInteger(result))`
- **Boolean field → boolean**: → `assert.equal(typeof result, "boolean")`
- **Enum field → value from enum**: field with `enum: ["a", "b", "c"]` → `assert.ok(["a", "b", "c"].includes(result))`
- **Enum wins over name heuristic**: field `{ name: "email", enum: ["x"] }` → `assert.equal(result, "x")`
- **$ref field → null**: field with `$ref` → `assert.equal(result, null)`
- **Name heuristic — email**: field `{ name: "email", type: "string" }` (no format) → `assert.match(result, /@/)`
- **Name heuristic — firstName**: → `assert.equal(typeof result, "string")` and non-empty
- **Array field → empty array**: → `assert.deepEqual(result, [])`
- **generateEntity returns object with all fields**: entity with 3 fields → `assert.equal(Object.keys(result).length, 3)`
- **Seeded faker produces deterministic output**: seed faker, generate twice → `assert.equal(result1, result2)`

## Files to Create

- `lib/generate/faker.js` — field generators
- `lib/generate/index.js` — barrel export
- `test/generate.test.js` — tests

## Files to Modify

- `lib/index.js` — add public exports

## Design Decisions

1. **Faker instance passed in** — don't import faker at module level. Callers pass their own instance so they can control seeding. This makes tests deterministic and lets GEN-2 share a seed across entity generation.

2. **Name heuristics are best-effort** — they improve data quality but aren't critical. If a name doesn't match, the type+format fallback always works. Keep the heuristic list short and obvious.

3. **$ref and array return placeholders** — GEN-2 owns reference resolution and array population. GEN-1 just generates leaf values.

4. **No field-name-to-format inference** — DSC-1 already extracts `format` from OpenAPI. GEN-1 trusts the field metadata. Name heuristics only apply when format is absent.

## Agent Team

Recommended: No — single module with tests that depend on it directly.

## Before Closing

- [ ] Run `make check` (lint + tests pass)
- [ ] Verify priority order: enum > $ref > name heuristic > type+format
- [ ] Verify enum always wins: field with both `enum` and name match uses enum
- [ ] Verify $ref returns null, not a generated value
- [ ] Verify seeded faker produces identical output across two runs
- [ ] Confirm `lib/generate/faker.js` imports nothing from `bin/` or `generated/`
