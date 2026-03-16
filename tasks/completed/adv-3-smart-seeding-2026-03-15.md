# ADV-3: Smart Seeding

## Context

GEN-1 generates random data per field type. ADV-3 adds "smart" generation: coherent personas, edge cases, and report-friendly data that makes seeded apps look realistic and exercises more code paths.

## Goals

- Persona-based generation: generate coherent records (e.g., a "solo operator" vs "enterprise company" persona where related fields are consistent)
- Edge case generation: include boundary values, empty strings, max-length strings, special characters
- Report-friendly data: dates spanning meaningful ranges, amounts that sum to round numbers, statuses distributed across all enum values
- Seed plan configuration: `strategy: random | persona | edge-case | mixed`

## Personas

A persona is a template that constrains field generation for coherence:

```yaml
personas:
  solo_operator:
    company: null
    role: "Owner"
    employees: 1
  enterprise:
    company: faker.company.name()
    role: "Admin"
    employees: faker.number.int({ min: 100, max: 10000 })
```

Persona selection: for each record, pick a persona randomly (or round-robin for even distribution). Fields not in the persona use normal generation.

## Edge Cases

For each field type, include boundary values in a configurable percentage of records:

| field type | edge cases |
|---|---|
| `string` | empty `""`, single char `"a"`, max-length (255 chars), unicode `"日本語テスト"`, special chars `"O'Brien <script>"` |
| `number` | `0`, `-1`, `Number.MAX_SAFE_INTEGER`, `0.001` |
| `number` (integer) | `0`, `1`, `-1`, `2147483647` |
| `boolean` | both `true` and `false` (ensure coverage) |
| `string` (email) | `"test+tag@example.com"`, `"user@subdomain.example.com"` |
| `string` (date) | today, epoch `"1970-01-01"`, far future `"2099-12-31"` |
| `enum` | every value appears at least once |

### Edge case distribution

`edgeCaseRatio` (default 0.2): 20% of generated records use edge case values. The first N records are edge cases (not random selection — deterministic for test reproducibility).

| count | edgeCaseRatio | edge case records | normal records |
|---|---|---|---|
| 10 | 0.2 | 2 | 8 |
| 5 | 0.2 | 1 | 4 |
| 5 | 0 | 0 | 5 |
| 5 | 1 | 5 | 0 |

**Inversion-prone**: edge case count = `Math.floor(count * ratio)`, not `Math.ceil`. With ratio=0.2 and count=3, edge cases = 0 (not 1).

## Report-Friendly Data

- **Date spread**: instead of all `faker.date.recent()`, spread dates across the last 90 days for realistic time-series data
- **Enum distribution**: ensure all enum values are represented (round-robin, not random)
- **Amount clustering**: for price/amount fields, generate values in realistic ranges ($9.99, $49.00, $199.99) instead of random floats

## Function Signatures

`lib/generate/smart.js` exports:

- `generateSmartFieldValue(field, faker, options)` → `any`
  - `options.strategy`: `"random"` | `"edge-case"` | `"persona"` | `"mixed"`
  - `options.recordIndex`: which record number (for edge case selection)
  - `options.totalCount`: total records being generated
  - `options.persona`: active persona template (if strategy includes persona)
  - Falls back to `generateFieldValue` for normal generation

- `generateSmartEntity(entity, faker, options)` → `object`
  - Like `generateEntity` but uses `generateSmartFieldValue`
  - Picks persona, determines if edge case record, generates fields

- `createPersona(fields, faker)` → `object`
  - Generates a coherent persona template from field definitions

## Phases

### Phase 1: Edge case generator (`lib/generate/smart.js`)

- Edge case value pools per field type
- `isEdgeCaseRecord(index, count, ratio)` → boolean
- For edge case records: cycle through edge case pools
- For normal records: delegate to `generateFieldValue`

### Phase 2: Report-friendly enhancements

- Date spread: for date/date-time fields, distribute across a range
- Enum round-robin: track enum index, cycle through values
- Amount clustering: predefined realistic price points

### Phase 3: Persona system

- Persona templates: predefined field value overrides
- Persona selection: round-robin across available personas
- Apply persona values, generate remaining fields normally

### Phase 4: Integration

- Seed plan `strategy` field: controls which generation mode
- `lib/generate/index.js` — add exports
- `lib/index.js` — add exports
- Wire into `generateDataset` or provide parallel `generateSmartDataset`

### Phase 5: Tests

Create `test/smart.test.js`:

- **Edge case string includes empty**: generate 10 records with ratio 0.2 → `assert.ok(values.includes(""))`
- **Edge case number includes 0**: `assert.ok(values.includes(0))`
- **Edge case boolean covers both**: `assert.ok(values.includes(true) && values.includes(false))`
- **Enum round-robin**: 6 records, 3 enum values → each value appears exactly twice: `assert.equal(counts["active"], 2)`
- **Date spread covers range**: 10 date values → `assert.ok(maxDate - minDate > 30 * 86400000)` (>30 days spread)
- **isEdgeCaseRecord**: `assert.equal(isEdgeCaseRecord(0, 10, 0.2), true)`, `assert.equal(isEdgeCaseRecord(2, 10, 0.2), false)`
- **Persona applies overrides**: persona has `role: "Admin"` → `assert.equal(record.role, "Admin")`
- **Strategy random = normal generation**: strategy "random" → same as generateFieldValue
- **Edge case ratio 0 = all normal**: `assert.equal(edgeCaseCount, 0)`

## Files to Create

- `lib/generate/smart.js`
- `test/smart.test.js`

## Files to Modify

- `lib/generate/index.js` — add exports
- `lib/index.js` — add exports

## Design Decisions

1. **Separate module, not modifying GEN-1** — `generateFieldValue` stays simple and fast. Smart generation is opt-in via strategy flag.
2. **Deterministic edge cases** — first N records are edge cases, not randomly selected. This makes test output reproducible.
3. **Personas are optional** — the system works without them. They're a quality enhancement, not a requirement.
4. **Floor for edge case count** — conservative: fewer edge cases rather than more. Prevents 100% edge cases at low counts.

## Agent Team

Recommended: No — single module, edge cases and personas share the same generation pipeline.

## Before Closing

- [ ] Run `make check`
- [ ] Verify edge case ratio uses `Math.floor` (not ceil)
- [ ] Verify enum round-robin: all values appear
- [ ] Verify date spread: not all dates are the same day
- [ ] Verify persona fields override, non-persona fields generate normally
- [ ] Verify strategy "random" produces same output as GEN-1
