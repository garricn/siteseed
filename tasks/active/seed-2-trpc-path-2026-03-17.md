# SEED-2 — trpcPath Support

**Status:** pending
**Depends:** SEED-1
**Unblocks:** InfiniteOS FB-12 Phase 0

## Context

InfiniteOS tools.json exposes a `trpcPath` field on each tool (e.g., `"trpcPath": "customers.create"`). This is the canonical tRPC procedure path — it is the correct URL segment to use when calling mutations. Currently `seedViaTRPC` falls back to `entity.toolName` (e.g., `infos_customers_create`), which is not a valid tRPC path and causes 404s.

## Goal

When `tool.trpcPath` is present, store it on the entity and prefer it over `toolName` when constructing the tRPC mutation URL.

## Changes

### `lib/discover/trpc.js`

In `discoverFromTRPC`, when pushing each entity, include `trpcPath: tool.trpcPath ?? undefined`.

Entity shape (after SEED-1 + SEED-2):
```json
{
  "name": "Customers",
  "toolName": "infos_customers_create",
  "trpcPath": "customers.create",
  "fields": [...]
}
```

`trpcPath` is optional — omit (or `undefined`) when absent from the tool.

### `lib/seed/api.js`

In `seedViaTRPC`, URL construction priority:

```
trpcPath present | toolName present | URL segment used
-----------------|------------------|------------------
Yes              | Yes              | trpcPath
Yes              | No               | trpcPath
No               | Yes              | toolName
No               | No               | planEntity.name.toLowerCase()
```

Current line:
```js
const procedureName = entity.toolName ?? planEntity.name.toLowerCase();
```

Replace with:
```js
const procedureName = entity.trpcPath ?? entity.toolName ?? planEntity.name.toLowerCase();
```

Note: this is `trpcPath ?? toolName ?? fallback` — NOT `toolName ?? trpcPath`. Priority order matters; verify it is not inverted.

## Test Fixture

Add one entry to `test/fixtures/trpc-tools.json` with `trpcPath`:

```json
{
  "name": "infos_widgets_create",
  "trpcPath": "widgets.create",
  "input_schema": { ... }
}
```

## Test Assertions

### `test/trpc-discover.test.js`

- `assert.equal(entity.trpcPath, "widgets.create")` — stored when present
- `assert.equal(entity.trpcPath, undefined)` — absent when tool has no trpcPath (existing entities)

### `test/trpc-seed.test.js`

- `assert.ok(calls[0].url.includes("/trpc/widgets.create"))` — trpcPath used in URL when present
- `assert.ok(calls[0].url.includes("/trpc/create_customer"))` — toolName still used when trpcPath absent (regression)

## Dependency Direction

`trpcPath` flows from `trpc.js` (discovery) → entity object → `seedViaTRPC` (seeding). Same direction as `toolName`. No new imports.

## Validation

**Automated (local + CI):** `make check` — all existing tests pass, new assertions cover both presence and absence of `trpcPath`.

**Manual:** Point at InfiniteOS dev instance; verify `widgets.create` (or equivalent) path is used in the POST URL.

## Agent Team

Recommended: No — two-line change with corresponding tests; no parallelism benefit.

## Before Closing

- [ ] `make check` passes
- [ ] `trpcPath` stored on entity when present, `undefined` when absent
- [ ] URL uses `trpcPath` when present — NOT `toolName` (verify priority order not inverted)
- [ ] Existing `toolName`-only tests still pass (no regression)
- [ ] Fixture entity count updated if new tool added
