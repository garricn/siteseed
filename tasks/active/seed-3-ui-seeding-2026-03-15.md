# SEED-3: UI Seeding

## Context

SEED-1 seeds via API POST. SEED-3 seeds by filling forms in a web app's UI, using sitetest's runbook format. This is the fallback for apps without a REST API.

The pipeline: DSC-3 discovers entities from accessibility tree → GEN-1/2 generates data → SEED-3 converts generated records into sitetest YAML steps that fill forms and submit.

sitetest is an optional dependency. Its step format:
```yaml
- goto: /customers/new
- fill: { selector: "[name='email']", value: "test@example.com" }
- select: { selector: "[name='status']", value: "active" }
- check: "[name='active']"
- click: "button[type='submit']"
```

sitetest exports `run(runbook, options)` for programmatic execution.

## Goals

- Generate sitetest YAML runbook steps from entity records + field metadata
- Map entity fields to form interaction steps (fill, select, check)
- Support both: (a) generate YAML file for manual use, (b) execute directly via sitetest API
- Integrate with the seed plan: each entity has a form URL and field-to-selector mapping

## Extended Seed Plan Schema

SEED-3 extends the seed plan with UI-specific fields:

```yaml
version: 1
baseUrl: https://app.example.com
entities:
  - name: Customer
    count: 5
    mode: ui                    # "api" (default) or "ui"
    formUrl: /customers/new     # URL to navigate to
    selectors:                  # field name → CSS selector
      email: "[name='email']"
      name: "[name='name']"
      status: "[name='status']"
    submitSelector: "button[type='submit']"
```

If `mode` is omitted or `api`, SEED-1 handles it. If `mode: ui`, SEED-3 handles it.

## Field → Step Mapping

| field type | field has enum? | sitetest step |
|---|---|---|
| `string` | no | `fill: { selector, value }` |
| `string` | yes | `select: { selector, value }` |
| `number` | — | `fill: { selector, value: String(number) }` |
| `boolean` (true) | — | `check: selector` |
| `boolean` (false) | — | `uncheck: selector` |

### Selector resolution

For each field, the selector comes from `planEntity.selectors[fieldName]`. If no selector mapping exists, fall back to `[name='${fieldName}']`.

## Function Signatures

`lib/seed/ui.js` exports:

- `generateRunbookSteps(record, entity, planEntity)` → `Array<object>`
  - Converts a single generated record into sitetest step objects
  - Returns: `[{ goto: formUrl }, ...fillSteps, { click: submitSelector }]`

- `generateRunbook(records, entity, planEntity)` → `object`
  - Wraps multiple records into a complete sitetest runbook
  - Returns: `{ name: "Seed <entityName>", steps: [...] }` with goto/fill/submit per record

- `seedViaUI(plan, entities, options)` → `{ seeded, errors }`
  - Same interface as `seedViaAPI` but for UI-mode entities
  - `options.execute`: boolean — if true, call sitetest `run()` directly; if false, return YAML
  - `options.sitetest`: optional sitetest module (for dependency injection)
  - When `execute: false`, returns `{ seeded, errors, runbook: yamlString }`

## Phases

### Phase 1: Step generation (`lib/seed/ui.js`)

- `generateRunbookSteps(record, entity, planEntity)`:
  - Start with `{ goto: planEntity.formUrl }`
  - For each field in entity: look up selector, map type to step
  - End with `{ click: planEntity.submitSelector || "button[type='submit']" }`
  - Skip fields with no value (null from $ref) or where selector is explicitly `false`

- `generateRunbook(records, entity, planEntity)`:
  - For each record, generate steps and concatenate
  - Return runbook object

### Phase 2: Execution (`lib/seed/ui.js`)

- `seedViaUI(plan, entities, options)`:
  - Generate records per entity (same as SEED-1: generateEntity + resolveReferences + applyOverrides)
  - For each UI-mode entity: generate runbook steps
  - If `execute: true` and sitetest available: call `sitetest.run()`
  - If `execute: false`: serialize to YAML and return
  - Track seeded counts and errors

### Phase 3: Integration

- `lib/seed/index.js` — add exports
- `lib/index.js` — add public export
- `lib/operations.js` — seedOp handler: check plan entity mode, dispatch to API or UI
- `bin/siteseed.js` — `run` command: `--ui-out <file>` to write runbook YAML instead of executing

### Phase 4: Tests

Create `test/ui-seed.test.js`:

- **String field → fill step**: `assert.deepEqual(steps[1], { fill: { selector: "[name='email']", value: "test@example.com" } })`
- **Enum field → select step**: field with enum → `assert.equal(steps[n].select.selector, ...)`
- **Boolean true → check step**: `assert.deepEqual(step, { check: "[name='active']" })`
- **Boolean false → uncheck step**: `assert.deepEqual(step, { uncheck: "[name='active']" })`
- **Number field → fill with string value**: `assert.equal(typeof steps[n].fill.value, "string")`
- **First step is goto**: `assert.ok(steps[0].goto)`
- **Last step is click submit**: `assert.ok(steps[steps.length - 1].click)`
- **Custom selector from plan**: plan has `selectors: { email: "#email-input" }` → `assert.equal(step.fill.selector, "#email-input")`
- **Fallback selector**: no selector mapping → `assert.equal(step.fill.selector, "[name='email']")`
- **Multiple records generate repeated goto+fill+submit blocks**: 2 records → steps include 2 goto's
- **seedViaUI returns runbook YAML when execute: false**: assert result has `runbook` string containing YAML
- **Null fields ($ref) are skipped**: field value is null → no step generated for it

## Files to Create

- `lib/seed/ui.js` — UI seeding step generation + execution

## Files to Modify

- `lib/seed/index.js` — add exports
- `lib/index.js` — add public export
- `bin/siteseed.js` — add `--ui-out` option
- `test/ui-seed.test.js` — tests (new file)

## Design Decisions

1. **Sitetest is optional** — `seedViaUI` with `execute: true` dynamically imports sitetest. If not available, throws a clear error. YAML generation works without sitetest.

2. **Selector mapping in plan** — users must provide field→selector mappings since CSS selectors can't be reliably inferred from entity field names. Fallback `[name='fieldName']` works for well-formed HTML forms.

3. **No Playwright dependency** — SEED-3 generates runbook YAML. Actual browser execution is sitetest's concern. This keeps siteseed lightweight.

4. **Mode field on plan entity** — `api` (default) vs `ui` determines dispatch. Mixed plans are supported (some entities via API, others via UI).

## Agent Team

Recommended: No — single module, step generation and execution are tightly coupled.

## Before Closing

- [ ] Run `make check` (lint + tests pass)
- [ ] Verify string→fill, enum→select, boolean→check/uncheck mapping
- [ ] Verify null fields are skipped (no step generated)
- [ ] Verify goto is first step, click submit is last
- [ ] Verify custom selectors from plan override defaults
- [ ] Verify YAML output is valid sitetest runbook format
- [ ] Confirm `lib/seed/ui.js` imports nothing from `bin/` or `generated/`
