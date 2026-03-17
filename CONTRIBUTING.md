# Contributing to siteseed

## Prerequisites

- Node.js 22+

## Setup

```bash
make setup
```

## Development

Run the full check suite (generate + lint + test):

```bash
make check
```

## Branch Protection

The `main` branch is protected. All changes must go through pull requests.

## Code Style

- ESLint enforces style — run `make check` before submitting
- ESM modules throughout (no CommonJS)
- No build step — source files run directly
