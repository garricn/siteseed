import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { faker } from "@faker-js/faker";
import { generateRunbookSteps, generateRunbook, seedViaUI } from "../lib/seed/ui.js";

const entity = {
  name: "Customer",
  fields: [
    { name: "email", type: "string", format: "email", required: true },
    { name: "name", type: "string", required: true },
    { name: "age", type: "number", required: false },
    { name: "active", type: "boolean", required: false },
    { name: "status", type: "string", enum: ["active", "inactive"], required: false },
    { name: "owner", type: "object", $ref: "#/components/schemas/Owner", required: false },
  ],
};

const planEntity = {
  name: "Customer",
  count: 2,
  mode: "ui",
  formUrl: "/customers/new",
  selectors: {
    email: "#email-input",
  },
  submitSelector: "button.save",
};

describe("generateRunbookSteps", () => {
  it("first step is goto", () => {
    const record = { email: "a@b.com", name: "Jo", age: 30, active: true, status: "active", owner: null };
    const steps = generateRunbookSteps(record, entity, planEntity);
    assert.deepEqual(steps[0], { goto: "/customers/new" });
  });

  it("last step is click submit", () => {
    const record = { email: "a@b.com", name: "Jo", age: 30, active: true, status: "active", owner: null };
    const steps = generateRunbookSteps(record, entity, planEntity);
    assert.deepEqual(steps[steps.length - 1], { click: "button.save" });
  });

  it("string field → fill step", () => {
    const record = { email: "test@example.com", name: "Jo", age: 30, active: true, status: "active", owner: null };
    const steps = generateRunbookSteps(record, entity, planEntity);
    const fillStep = steps.find((s) => s.fill && s.fill.selector === "#email-input");
    assert.deepEqual(fillStep, { fill: { selector: "#email-input", value: "test@example.com" } });
  });

  it("custom selector from plan", () => {
    const record = { email: "test@example.com", name: "Jo", age: 30, active: true, status: "active", owner: null };
    const steps = generateRunbookSteps(record, entity, planEntity);
    const emailStep = steps.find((s) => s.fill && s.fill.value === "test@example.com");
    assert.equal(emailStep.fill.selector, "#email-input");
  });

  it("fallback selector", () => {
    const record = { email: "a@b.com", name: "Jo", age: 30, active: true, status: "active", owner: null };
    const steps = generateRunbookSteps(record, entity, planEntity);
    const nameStep = steps.find((s) => s.fill && s.fill.value === "Jo");
    assert.equal(nameStep.fill.selector, "[name='name']");
  });

  it("number field → fill with string value", () => {
    const record = { email: "a@b.com", name: "Jo", age: 30, active: true, status: "active", owner: null };
    const steps = generateRunbookSteps(record, entity, planEntity);
    const ageStep = steps.find((s) => s.fill && s.fill.value === "30");
    assert.ok(ageStep);
    assert.equal(typeof ageStep.fill.value, "string");
  });

  it("boolean true → check step", () => {
    const record = { email: "a@b.com", name: "Jo", age: 30, active: true, status: "active", owner: null };
    const steps = generateRunbookSteps(record, entity, planEntity);
    const checkStep = steps.find((s) => s.check);
    assert.deepEqual(checkStep, { check: "[name='active']" });
  });

  it("boolean false → uncheck step", () => {
    const record = { email: "a@b.com", name: "Jo", age: 30, active: false, status: "active", owner: null };
    const steps = generateRunbookSteps(record, entity, planEntity);
    const uncheckStep = steps.find((s) => s.uncheck);
    assert.deepEqual(uncheckStep, { uncheck: "[name='active']" });
  });

  it("enum field → select step", () => {
    const record = { email: "a@b.com", name: "Jo", age: 30, active: true, status: "active", owner: null };
    const steps = generateRunbookSteps(record, entity, planEntity);
    const selectStep = steps.find((s) => s.select);
    assert.ok(selectStep);
    assert.equal(selectStep.select.selector, "[name='status']");
    assert.equal(selectStep.select.value, "active");
  });

  it("null fields ($ref) are skipped", () => {
    const record = { email: "a@b.com", name: "Jo", age: 30, active: true, status: "active", owner: null };
    const steps = generateRunbookSteps(record, entity, planEntity);
    const ownerSteps = steps.filter((s) =>
      (s.fill && s.fill.selector.includes("owner")) ||
      (s.select && s.select.selector.includes("owner"))
    );
    assert.equal(ownerSteps.length, 0);
  });
});

describe("generateRunbook", () => {
  it("multiple records generate repeated goto+fill+submit blocks", () => {
    const records = [
      { email: "a@b.com", name: "A", age: 1, active: true, status: "active", owner: null },
      { email: "c@d.com", name: "B", age: 2, active: false, status: "inactive", owner: null },
    ];
    const runbook = generateRunbook(records, entity, planEntity);
    const gotos = runbook.steps.filter((s) => s.goto);
    assert.equal(gotos.length, 2);
    assert.equal(runbook.name, "Seed Customer");
  });
});

describe("seedViaUI", () => {
  it("returns runbook YAML when execute: false", async () => {
    faker.seed(500);
    const plan = {
      version: 1,
      baseUrl: "https://app.example.com",
      entities: [{ ...planEntity }],
    };
    const result = await seedViaUI(plan, [entity], { faker, execute: false });
    assert.ok(result.runbook);
    assert.ok(typeof result.runbook === "string");
    assert.ok(result.runbook.includes("goto"));
    assert.equal(result.seeded["Customer"], 2);
    assert.equal(result.errors.length, 0);
  });

  it("skips non-ui entities", async () => {
    faker.seed(600);
    const plan = {
      version: 1,
      baseUrl: "https://app.example.com",
      entities: [{ name: "Customer", count: 3, mode: "api" }],
    };
    const result = await seedViaUI(plan, [entity], { faker, execute: false });
    assert.equal(Object.keys(result.seeded).length, 0);
  });
});
