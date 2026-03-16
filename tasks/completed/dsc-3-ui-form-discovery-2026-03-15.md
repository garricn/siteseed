# DSC-3: UI Form Discovery

## Context

siteseed's API discovery mode (DSC-1) reads OpenAPI specs. DSC-3 adds a fallback: discover entities by analyzing forms in a web app's UI via sitecap's accessibility tree output.

sitecap's `capturePage()` or `navigateAndCapture()` produces an `accessibility.txt` file with indented lines like:
```
- form "Create Customer"
  - textbox "Name"
  - textbox "Email"
  - combobox "Status" [value: "active"]
  - button "Submit"
```

DSC-3 parses this format to extract form-based entities with field types inferred from input roles and labels.

sitecap is an optional dependency (`optionalDependencies` in package.json). DSC-3 operates on accessibility tree text — it does NOT import sitecap directly. The caller provides the tree text (from a file or sitecap API).

## Goals

- Parse sitecap accessibility tree text into entity definitions
- Infer field types from ARIA roles and label text (name heuristics)
- Output the same entity structure as DSC-1: `{ name, fields: [{ name, type, required, format? }] }`
- One form = one entity; form name = entity name
- Support multiple forms in a single tree (multiple entities)

## Accessibility Tree Format

sitecap's `formatAXTree()` produces indented lines:
```
- <role> "<name>" [value: "<value>"]
```

Relevant roles for form discovery:

| ARIA role | Entity field type | Notes |
|---|---|---|
| `form` | — | Container. Name becomes entity name |
| `textbox` | `string` | May have format heuristic from label |
| `spinbutton` | `number` | Numeric input |
| `checkbox` | `boolean` | |
| `combobox` | `string` + enum | Options from child `option` roles |
| `listbox` | `string` + enum | Select alternative |
| `radio` | `string` + enum | Grouped radio buttons |
| `switch` | `boolean` | Toggle |
| `searchbox` | `string` | Treat as textbox |

### Form detection

A form entity is identified by:
1. A node with `role === "form"` and a non-empty name
2. All child input nodes (textbox, spinbutton, checkbox, etc.) become fields
3. Nesting depth determines parent-child (indentation-based parsing)

If no `form` role exists but inputs are found, create a single entity named from the page title or "UnknownForm".

### Label → format heuristic

For `textbox` role fields, apply name heuristics (same patterns as GEN-1):

| label contains (case-insensitive) | format |
|---|---|
| `email` | `email` |
| `phone`, `tel` | `phone` |
| `date`, `birthday`, `dob` | `date` |
| `url`, `website`, `link` | `uri` |
| `zip`, `postal` | `string` (no special format) |
| `password` | `string` |
| `price`, `amount`, `cost` | override type to `number` |

**Inversion-prone**: label heuristic applies ONLY to `textbox` role. A `spinbutton` labeled "email count" should stay `number`, not become `email`.

| role | label contains "email" | result |
|---|---|---|
| textbox | yes | format: "email" |
| spinbutton | yes | type: "number" (no format change) |

### Required field detection

Fields are marked required if:
- The node has a `required` property in the tree (sitecap includes ARIA properties)
- Or the label contains `*` (common visual indicator)

## Function Signatures

`lib/discover/ui.js` exports:

- `discoverFromUI(treeText, options?)` → `{ entities: Array, source: "ui" }`
  - `treeText`: accessibility tree text (string)
  - `options.defaultEntityName`: fallback name if no form role found (default: "Form")
  - Parses tree, extracts forms, maps fields

- `parseAccessibilityTree(text)` → `Array<{ role, name, value?, depth, children? }>`
  - Parses indented tree text into structured nodes

## Phases

### Phase 1: Tree parser (`lib/discover/ui.js`)

- `parseAccessibilityTree(text)`:
  - Split by newlines, for each line: extract indent depth, role, name, value
  - Regex: `/^(\s*)- (\w+)(?: "([^"]*)")?(?: \[value: "([^"]*)"\])?/`
  - Build tree structure based on indent depth
  - Return flat array of nodes with `depth` field

### Phase 2: Form extraction (`lib/discover/ui.js`)

- Find all nodes with `role === "form"` — each becomes an entity
- For each form node, collect child input nodes (textbox, spinbutton, checkbox, combobox, switch)
- Map each input to a field: `{ name: inputName, type: roleToType(role), required, format? }`
- Apply label heuristic for textbox fields
- If no form nodes found, collect all top-level inputs into a single entity

### Phase 3: Wire into barrel export + CLI

- `lib/discover/index.js` — add `discoverFromUI` export
- `lib/index.js` — add public export
- `bin/siteseed.js` — add `--url` option to `discover` command (future: calls sitecap then `discoverFromUI`)
  - For now, add `--tree` option: `siteseed discover --tree accessibility.txt` — reads tree file directly
  - `--url` requires sitecap integration (deferred to SEED-3)

### Phase 4: Tests

Create `test/ui-discover.test.js` with inline tree text fixtures:

- **Parses single form**: tree with one form + 3 inputs → `assert.equal(entities.length, 1)` and `assert.equal(entities[0].fields.length, 3)`
- **Entity name from form**: `form "Create Customer"` → `assert.equal(entities[0].name, "Create Customer")`
- **Textbox → string**: `textbox "Name"` → `assert.equal(field.type, "string")`
- **Spinbutton → number**: `spinbutton "Age"` → `assert.equal(field.type, "number")`
- **Checkbox → boolean**: `checkbox "Active"` → `assert.equal(field.type, "boolean")`
- **Email label heuristic**: `textbox "Email"` → `assert.equal(field.format, "email")`
- **Label heuristic only on textbox**: `spinbutton "Email Count"` → `assert.equal(field.type, "number")` and `assert.equal(field.format, undefined)`
- **Multiple forms**: tree with 2 form nodes → `assert.equal(entities.length, 2)`
- **No form node → fallback entity**: inputs without form wrapper → `assert.equal(entities[0].name, "Form")`
- **Combobox → string with enum**: `combobox "Status"` with child options → `assert.deepEqual(field.enum, ["active", "inactive"])`
- **Required from label asterisk**: `textbox "Name *"` → `assert.equal(field.required, true)`
- **Source is "ui"**: `assert.equal(result.source, "ui")`

Test fixture (inline string):
```
- form "Create Customer"
  - textbox "Name *"
  - textbox "Email"
  - spinbutton "Age"
  - checkbox "Active"
  - combobox "Status"
    - option "active"
    - option "inactive"
  - button "Submit"
```

## Files to Create

- `lib/discover/ui.js` — UI form discovery

## Files to Modify

- `lib/discover/index.js` — add export
- `lib/index.js` — add public export
- `bin/siteseed.js` — add `--tree` option to discover command
- `test/ui-discover.test.js` — tests (new file)

## Design Decisions

1. **No sitecap import** — DSC-3 operates on tree text, not Playwright pages. The caller (CLI or SEED-3) is responsible for obtaining the tree. This keeps the dependency optional.

2. **Form name = entity name** — keeps it simple. Users can rename in the generated seed plan if needed.

3. **Label heuristics reuse GEN-1 patterns** — same name-matching approach for consistency. Format inference from labels mirrors the name heuristic table.

4. **Combobox options as enums** — child `option` nodes under a combobox/listbox provide enum values. This gives realistic data generation for select fields.

5. **Asterisk = required** — common UI pattern. Not foolproof but good enough for heuristic discovery.

## Agent Team

Recommended: No — single module, tree parser + form extractor are tightly coupled.

## Before Closing

- [ ] Run `make check` (lint + tests pass)
- [ ] Verify label heuristic only applies to textbox role
- [ ] Verify combobox child options extracted as enum
- [ ] Verify required detection from `*` in label
- [ ] Verify fallback entity name when no form node present
- [ ] Verify output matches DSC-1 entity structure exactly
- [ ] Confirm `lib/discover/ui.js` imports nothing from `bin/` or `generated/`
