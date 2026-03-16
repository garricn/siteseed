# /siteseed

Seed a web app with realistic test data. Discovers the app's data model from an OpenAPI spec (or UI forms as fallback), generates fake data respecting field types and entity relationships, and inserts it via API calls.

## Usage

```
/siteseed <openapi-url> [--count N] [--auth HEADER]
/siteseed <seed-plan.yaml>
/siteseed discover <openapi-url>
```

## Instructions

When this skill is invoked:

1. If given an OpenAPI URL, run discovery + seed in one step:
   ```bash
   npx siteseed run --openapi <url> --auto --count 5
   ```

2. If given a seed plan YAML file, execute it:
   ```bash
   npx siteseed run <plan.yaml>
   ```

3. If given `discover`, just output the entity graph without seeding:
   ```bash
   npx siteseed discover --openapi <url>
   ```

4. If auth is needed, pass it:
   ```bash
   npx siteseed run --openapi <url> --auto --auth "Bearer $TOKEN"
   ```

## Examples

```
/siteseed https://app.example.com/api/openapi.json
/siteseed https://app.example.com/api/openapi.json --count 10 --auth "Bearer abc123"
/siteseed discover https://api.example.com/v1/openapi.json
/siteseed seed-plan.yaml
```
