import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { discoverFromUI, parseAccessibilityTree } from "../lib/discover/ui.js";

const CUSTOMER_FORM = `- form "Create Customer"
  - textbox "Name *"
  - textbox "Email"
  - spinbutton "Age"
  - checkbox "Active"
  - combobox "Status"
    - option "active"
    - option "inactive"
  - button "Submit"`;

const TWO_FORMS = `- form "Customer"
  - textbox "Name"
- form "Order"
  - spinbutton "Total"
  - textbox "Notes"`;

const NO_FORM = `- textbox "Name"
- textbox "Email"
- checkbox "Active"`;

describe("parseAccessibilityTree", () => {
  it("parses nodes with depth", () => {
    const nodes = parseAccessibilityTree(CUSTOMER_FORM);
    assert.ok(nodes.length > 0);
    assert.equal(nodes[0].role, "form");
    assert.equal(nodes[0].name, "Create Customer");
    assert.equal(nodes[0].depth, 0);
    assert.equal(nodes[1].role, "textbox");
    assert.equal(nodes[1].depth, 1);
  });
});

describe("discoverFromUI", () => {
  it("parses single form", () => {
    const result = discoverFromUI(CUSTOMER_FORM);
    assert.equal(result.entities.length, 1);
    // 5 input fields (textbox x2, spinbutton, checkbox, combobox) — button excluded
    assert.equal(result.entities[0].fields.length, 5);
  });

  it("entity name from form", () => {
    const result = discoverFromUI(CUSTOMER_FORM);
    assert.equal(result.entities[0].name, "Create Customer");
  });

  it("textbox → string", () => {
    const result = discoverFromUI(CUSTOMER_FORM);
    const nameField = result.entities[0].fields.find((f) => f.name === "Name");
    assert.equal(nameField.type, "string");
  });

  it("spinbutton → number", () => {
    const result = discoverFromUI(CUSTOMER_FORM);
    const ageField = result.entities[0].fields.find((f) => f.name === "Age");
    assert.equal(ageField.type, "number");
  });

  it("checkbox → boolean", () => {
    const result = discoverFromUI(CUSTOMER_FORM);
    const activeField = result.entities[0].fields.find((f) => f.name === "Active");
    assert.equal(activeField.type, "boolean");
  });

  it("email label heuristic", () => {
    const result = discoverFromUI(CUSTOMER_FORM);
    const emailField = result.entities[0].fields.find((f) => f.name === "Email");
    assert.equal(emailField.format, "email");
  });

  it("label heuristic only on textbox", () => {
    const tree = `- form "Test"
  - spinbutton "Email Count"`;
    const result = discoverFromUI(tree);
    const field = result.entities[0].fields[0];
    assert.equal(field.type, "number");
    assert.equal(field.format, undefined);
  });

  it("multiple forms", () => {
    const result = discoverFromUI(TWO_FORMS);
    assert.equal(result.entities.length, 2);
    assert.equal(result.entities[0].name, "Customer");
    assert.equal(result.entities[1].name, "Order");
  });

  it("no form node → fallback entity", () => {
    const result = discoverFromUI(NO_FORM);
    assert.equal(result.entities.length, 1);
    assert.equal(result.entities[0].name, "Form");
    assert.equal(result.entities[0].fields.length, 3);
  });

  it("combobox → string with enum", () => {
    const result = discoverFromUI(CUSTOMER_FORM);
    const statusField = result.entities[0].fields.find((f) => f.name === "Status");
    assert.equal(statusField.type, "string");
    assert.deepEqual(statusField.enum, ["active", "inactive"]);
  });

  it("required from label asterisk", () => {
    const result = discoverFromUI(CUSTOMER_FORM);
    const nameField = result.entities[0].fields.find((f) => f.name === "Name");
    assert.equal(nameField.required, true);
    const emailField = result.entities[0].fields.find((f) => f.name === "Email");
    assert.equal(emailField.required, false);
  });

  it("source is ui", () => {
    const result = discoverFromUI(CUSTOMER_FORM);
    assert.equal(result.source, "ui");
  });

  it("custom default entity name", () => {
    const result = discoverFromUI(NO_FORM, { defaultEntityName: "MyForm" });
    assert.equal(result.entities[0].name, "MyForm");
  });
});
