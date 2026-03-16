import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const CLI = resolve("bin/siteseed.js");
const FIXTURE = resolve("test/fixtures/petstore-nocycle.json");

function run(args, { expectFail = false } = {}) {
  try {
    const stdout = execFileSync("node", [CLI, ...args], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10000,
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    if (expectFail) {
      return { stdout: err.stdout || "", stderr: err.stderr || "", exitCode: err.status };
    }
    throw err;
  }
}

describe("CLI", () => {
  it("no args prints usage and exits 0", () => {
    const { exitCode } = run([]);
    assert.equal(exitCode, 0);
  });

  it("--help prints usage and exits 0", () => {
    const { exitCode } = run(["--help"]);
    assert.equal(exitCode, 0);
  });

  it("unknown subcommand exits 2", () => {
    const { exitCode } = run(["badcmd"], { expectFail: true });
    assert.equal(exitCode, 2);
  });

  it("discover outputs JSON with entities", () => {
    const { stdout } = run(["discover", "--openapi", FIXTURE]);
    const result = JSON.parse(stdout);
    assert.ok(Array.isArray(result.entities));
    assert.ok(result.entities.length > 0);
  });

  it("plan outputs YAML", () => {
    const { stdout } = run(["plan", "--openapi", FIXTURE]);
    assert.ok(stdout.includes("version: 1"));
    assert.ok(stdout.includes("entities:"));
  });

  it("plan with --count", () => {
    const { stdout } = run(["plan", "--openapi", FIXTURE, "--count", "3"]);
    assert.ok(stdout.includes("count: 3"));
  });

  it("plan with --out writes file", () => {
    const outPath = resolve("/tmp/siteseed-test-plan.yaml");
    try {
      run(["plan", "--openapi", FIXTURE, "--out", outPath]);
      assert.ok(existsSync(outPath));
    } finally {
      if (existsSync(outPath)) unlinkSync(outPath);
    }
  });

  it("run --auto --dry-run outputs seeded counts", () => {
    const { stdout } = run(["run", "--openapi", FIXTURE, "--auto", "--dry-run"]);
    const result = JSON.parse(stdout);
    assert.ok(result.seeded);
    assert.ok(typeof result.seeded === "object");
    assert.equal(result.dryRun, true);
  });

  it("run without --openapi exits 2", () => {
    const { exitCode } = run(["run", "--auto"], { expectFail: true });
    assert.equal(exitCode, 2);
  });

  it("discover without --openapi exits 2", () => {
    const { exitCode } = run(["discover"], { expectFail: true });
    assert.equal(exitCode, 2);
  });
});
