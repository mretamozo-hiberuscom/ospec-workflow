"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { execSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../..");
const VALIDATE_SCRIPT = path.join(ROOT, "scripts", "configure", "validate-phase.js");

test("validate-phase CLI: exits with 0 for freeform or undefined route", () => {
  const cmd = `node "${VALIDATE_SCRIPT}" sdd-tasks freeform my-change`;
  const result = execSync(cmd).toString().trim();
  assert.equal(result, "");
});

test("validate-phase CLI: fails validation when required file is missing", () => {
  // Use standard route which expects design.md for sdd-tasks phase
  const changeName = `test-change-${Date.now()}`;
  const changeDir = path.join(ROOT, "openspec", "changes", changeName);
  fs.mkdirSync(changeDir, { recursive: true });

  try {
    const cmd = `node "${VALIDATE_SCRIPT}" sdd-tasks standard ${changeName}`;
    let threw = false;
    try {
      execSync(cmd, { stdio: "pipe" });
    } catch (e) {
      threw = true;
      assert.equal(e.status, 1);
    }
    assert.equal(threw, true, "execSync should throw error with status 1");
  } finally {
    // Clean up temporary change dir
    fs.rmSync(changeDir, { recursive: true, force: true });
  }
});

test("validate-phase CLI: passes validation when required file is present", () => {
  const changeName = `test-change-ok-${Date.now()}`;
  const changeDir = path.join(ROOT, "openspec", "changes", changeName);
  fs.mkdirSync(changeDir, { recursive: true });
  fs.writeFileSync(path.join(changeDir, "design.md"), "Design details");

  try {
    const cmd = `node "${VALIDATE_SCRIPT}" sdd-tasks standard ${changeName}`;
    const result = execSync(cmd).toString();
    assert.match(result, /\[OK\]/);
  } finally {
    fs.rmSync(changeDir, { recursive: true, force: true });
  }
});
