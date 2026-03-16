# siteseed

## Tech Stack

- Node.js (ESM)
- Zod (operation schemas, API codegen)
- No build step

## Project Structure

```
bin/siteseed.js        — CLI entry point
bin/api-server.js   — REST API (thin shell over generated routes)
bin/mcp-server.js   — MCP server (thin shell over generated tools)
lib/
  index.js          — library exports
  operations.js     — defineOp() + Zod schemas (SSoT for API surfaces)
  registry.js       — collects all operations
scripts/generate.js — codegen: MCP tools, REST routes, OpenAPI, tools.json
generated/          — codegen output (committed, not gitignored)
test/               — node:test
```

## Commands

```bash
make setup          # install deps + pre-commit hooks
make test           # run tests
make check          # lint + test
make generate       # regenerate API surfaces from operations

npm run api         # REST API on port 3100
npm run mcp         # MCP server (stdio)
```

## Architecture

Core logic (`lib/`) imports nothing from API layer (`bin/`, `generated/`).
Operations are the bridge — they import core logic and export handlers consumed
by generated surfaces. All API surfaces (MCP, REST, OpenAPI, function-calling
tools) are generated from `lib/operations.js` via `scripts/generate.js`.
Do not hand-write API handlers — define operations with Zod schemas, run
`make generate`.
