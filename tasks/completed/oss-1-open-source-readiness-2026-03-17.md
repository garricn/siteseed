# OSS-1 — Open-Source Readiness

## Context

siteseed is part of the site\* toolchain (sitecap → sitetest → siteseed → sitefix). sitecap and sitetest are already public. siteseed needs to go public so downstream projects (infiniteOS) can install it in CI via `npm install garricn/siteseed`.

Current state: clean ESM codebase, no hardcoded secrets in code or git history, MIT license declared in package.json but no LICENSE file, no README, no `"files"` whitelist, no community scaffolding.

## Goals

- `npm install garricn/siteseed` works for external users
- No PII, secrets, or internal references in committed files or git history
- Standard open-source scaffolding (LICENSE, README, CONTRIBUTING, CoC)
- Engineering standards enforced (linting, CI, `"files"` whitelist)

## Phase A — Critical Blockers (SRL)

### A1. Add LICENSE file

- File: `LICENSE` (new)
- MIT license text, matching `"license": "MIT"` in package.json

### A2. Add `"files"` field to package.json

- File: `package.json`
- Whitelist production artifacts only:
  ```
  "files": ["lib/", "bin/", "generated/"]
  ```
- Excludes: test/, tasks/, CLAUDE.md, Skill.md, Makefile, scripts/
- Note: npm automatically includes package.json, README.md, LICENSE, and CHANGELOG.md regardless of `"files"` — do not add them to the whitelist

### A3. Add `"repository"`, `"engines"`, `"author"`, `"bugs"` to package.json

- File: `package.json`
- `"repository": { "type": "git", "url": "https://github.com/garricn/siteseed.git" }`
- `"bugs": { "url": "https://github.com/garricn/siteseed/issues" }`
- `"author": "Garric Nahapetian"`
- `"engines": { "node": ">=22" }` — ESM + modern features

### A4. PII and sensitive content scrub

- Scan all files (excluding node_modules) for:
  - Email addresses (personal, internal)
  - API keys, tokens, passwords
  - Internal URLs (prim.sh internal endpoints, private repos)
  - Personal identifiers that shouldn't be public
- Scan git history: `git log --all --format='%s' | grep -i 'secret\|key\|token\|password'`
- Scan deleted files: `git log --all --diff-filter=D --name-only`
- **Expected:** Prior audit found codebase clean — no secrets in code or history, no internal emails. `garricn` references are the public GitHub username. Implementer must re-run scans to confirm.
- If any PII found: rewrite history with `git filter-repo` before making public

### A5. Create README.md

- File: `README.md` (new)
- Sections: one-line description, install, quick start (CLI modes: discover, plan, run), discovery modes (OpenAPI, tRPC, GraphQL), seed plan format, library API, link to CONTRIBUTING.md
- Draw from CLAUDE.md but rewrite for external audience
- Include badges: CI status, license, npm version

## Phase B — CI & Engineering Standards (starts after A2; runs PARA alongside A3–A5)

### B1. Add `npm pack` verification to CI

- File: `.github/workflows/ci.yml`
- CI already exists: runs on `ubuntu-latest`, Node 22, `npm ci` + `make check`, triggers on push/PR. No private deps or internal service refs — fork-safe as-is.
- **Only change needed:** Add `npm pack --dry-run` step after `make check` to verify `"files"` whitelist produces the expected package contents

### B2. Update SECURITY.md

- File: `SECURITY.md`
- Current text says "Report vulnerabilities via GitHub Issues (private vulnerability report)" — this is ambiguous. It should explicitly direct reporters to GitHub Security Advisories, not Issues.
- Replace with: "Report vulnerabilities via [GitHub Security Advisories](https://github.com/garricn/siteseed/security/advisories). Do not open public issues for security vulnerabilities."
- No internal emails present — clean

### B3. Add pre-commit hook for secrets detection

- File: `.pre-commit-config.yaml`
- Add gitleaks hook to existing pre-commit config:
  ```yaml
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.22.1
    hooks:
      - id: gitleaks
  ```
- This runs locally on each commit. No separate CI step needed — pre-commit already runs via `make setup`.

## Phase C — Community Scaffolding (PARA with Phase B)

### C1. Add CONTRIBUTING.md

- File: `CONTRIBUTING.md` (new)
- Sections: filing issues, submitting PRs, dev setup (`make setup`, `make check`), coding conventions (ESM, node:test)

### C2. Add CODE_OF_CONDUCT.md

- File: `CODE_OF_CONDUCT.md` (new)
- Contributor Covenant v2.1

### C3. Add GitHub issue/PR templates

- Files: `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/PULL_REQUEST_TEMPLATE.md` (new)
- Lightweight — match sitetest templates if they exist

## Phase D — Publish & Verify (SRL, after A+B+C)

### D1. Bump version

- File: `package.json`
- Also update `generated/api-routes.js` VERSION constant (or re-run `make generate` to pick it up)
- `"version": "0.1.0"` → `"1.0.0"` if API is considered stable, or `"0.2.0"` if still evolving
- Decision point for the user: 1.0.0 signals semver stability guarantees. Choose based on whether the discover/plan/seed API surface is locked down.

### D2. Make repo public

- `gh repo edit garricn/siteseed --visibility public`
- Verify: `npm install garricn/siteseed` works from a clean environment

### D3. Add CHANGELOG.md

- File: `CHANGELOG.md` (new)
- Populate from git history using Keep a Changelog format

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| files whitelist | `"files"` in package.json | Whitelist safer than .npmignore blacklist for excluding sensitive files |
| Internal files | Keep CLAUDE.md, Skill.md, tasks/ in repo | Useful for Claude Code contributors; excluded from npm by `"files"` |
| Version | 1.0.0 or 0.2.0 | 1.0.0 if API is stable; 0.2.0 if still evolving. User decides. |
| Node version | >=22 | ESM + node:test features; matches CI |
| PII scrub | Scan code + git history | Must verify before making public; no rewriting needed if clean |

## Validation

### Automated

- `make check` passes (lint + test)
- `npm pack --dry-run` includes only lib/, bin/, generated/
- gitleaks scan: no secrets in repo history
- `npm install garricn/siteseed` works from clean env after making public

### Manual

- Review README for accuracy and external-audience clarity
- Spot-check git history for any PII or internal refs missed by automated scan

## Agent Team

Recommended: No — Phases are mostly sequential and most changes touch package.json which would conflict across parallel agents.

## Before Closing

- [ ] Run `make check` (lint + test pass)
- [ ] Run `npm pack --dry-run` and verify only lib/, bin/, generated/ are included
- [ ] Run gitleaks scan on full git history
- [ ] Confirm no PII, internal emails, or private URLs in committed files
- [ ] Verify LICENSE file matches MIT SPDX
- [ ] `npm install garricn/siteseed` works from clean environment
- [ ] Repo visibility set to public
