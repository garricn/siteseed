#!/usr/bin/env node

import { parseArgs } from "node:util";
import { faker } from "@faker-js/faker";
import { discoverFromOpenAPI } from "../lib/discover/index.js";
import { generatePlan, writePlan } from "../lib/seed/index.js";
import { executeSeed } from "../lib/seed/index.js";

const USAGE = `Usage: siteseed <command> [options]

Commands:
  discover   Discover entities from an OpenAPI spec
  plan       Generate a seed plan
  run        Execute a seed plan

Options:
  --openapi <url|file>   OpenAPI spec URL or file path
  --base-url <url>       Override base URL
  --count <n>            Records per entity (default: 5)
  --auth <header>        Authorization header value
  --out <file>           Output file path (plan command)
  --dry-run              Preview without executing
  --auto                 Auto mode: discover + plan + seed
  --help                 Show this help message

Examples:
  siteseed discover --openapi ./spec.json
  siteseed plan --openapi ./spec.json --count 10
  siteseed run plan.yaml --openapi ./spec.json --auth "Bearer token"
  siteseed run --openapi ./spec.json --auto --dry-run`;

function printUsage() {
  process.stderr.write(USAGE + "\n");
}

function fatal(msg) {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(2);
}

async function handleDiscover(values) {
  if (!values.openapi) fatal("--openapi is required");
  const result = await discoverFromOpenAPI(values.openapi, values["base-url"]);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

async function handlePlan(values) {
  if (!values.openapi) fatal("--openapi is required");
  const count = values.count ? Number(values.count) : 5;
  const discovery = await discoverFromOpenAPI(values.openapi);
  const plan = generatePlan(discovery.entities, { baseUrl: discovery.baseUrl, count });
  const yaml = await writePlan(plan, values.out || undefined);
  process.stdout.write(yaml);
  if (values.out) {
    process.stderr.write(`Plan written to ${values.out}\n`);
  }
}

async function handleRun(values, positionals) {
  if (!values.openapi) fatal("--openapi is required");

  let planSource;
  if (values.auto) {
    const count = values.count ? Number(values.count) : 5;
    const discovery = await discoverFromOpenAPI(values.openapi);
    const plan = generatePlan(discovery.entities, { baseUrl: discovery.baseUrl, count });
    planSource = await writePlan(plan);
  } else {
    const planFile = positionals[1];
    if (!planFile) fatal("plan file is required (or use --auto)");
    planSource = planFile;
  }

  const result = await executeSeed(planSource, {
    openapi: values.openapi,
    auth: values.auth,
    dryRun: values["dry-run"] || false,
    faker,
  });

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");

  if (result.errors && result.errors.length > 0) {
    process.stderr.write(`Completed with ${result.errors.length} error(s)\n`);
    process.exit(1);
  }
}

try {
  const { values, positionals } = parseArgs({
    options: {
      openapi: { type: "string" },
      "base-url": { type: "string" },
      count: { type: "string" },
      auth: { type: "string" },
      out: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      auto: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  const command = positionals[0];

  if (values.help || !command) {
    printUsage();
    process.exit(0);
  }

  switch (command) {
    case "discover":
      await handleDiscover(values);
      break;
    case "plan":
      await handlePlan(values);
      break;
    case "run":
      await handleRun(values, positionals);
      break;
    default:
      printUsage();
      process.exit(2);
  }
} catch (err) {
  if (err.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
    process.stderr.write(`Error: ${err.message}\n`);
    printUsage();
    process.exit(2);
  }
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(2);
}
