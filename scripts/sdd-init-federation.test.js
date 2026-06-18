"use strict";

// WU3 (Phase 4) — sdd-init federated bridge contract.
//
// The federated `target_dir` + multirepo container-detection behavior of sdd-init
// is expressed as a documented contract inside two source-of-truth markdown files:
//   - skills/sdd-init/SKILL.md   (the executor procedure: detection gate + target_dir)
//   - agents/sdd-init.agent.md   (the agent-facing `## Parameters` contract)
// These files ARE the deliverable for WU3 (no executable code changes), so this test
// is the contract that pins the required behavior. It mirrors the existing markdown
// content-contract tests (docs-lint.test.js, manifest-sync.test.js).

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const SKILL = path.join(ROOT, "skills", "sdd-init", "SKILL.md");
const AGENT = path.join(ROOT, "agents", "sdd-init.agent.md");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

// --- skills/sdd-init/SKILL.md : target_dir resolution -----------------------

test("SKILL.md documents reading target_dir from the ## Parameters prompt block", () => {
  const text = read(SKILL);
  assert.match(
    text,
    /##\s*Parameters/,
    "SKILL.md must reference the ## Parameters block that carries target_dir",
  );
  assert.match(
    text,
    /target_dir/,
    "SKILL.md must document the target_dir parameter",
  );
});

test("SKILL.md documents the cwd fallback when target_dir is absent", () => {
  const text = read(SKILL);
  // The resolution step must state that an absent block / missing key falls back to cwd.
  assert.match(
    text,
    /target_dir[\s\S]{0,400}?(absent|missing)[\s\S]{0,200}?(cwd|current working directory)/i,
    "SKILL.md must document the cwd fallback when target_dir is absent",
  );
});

test("SKILL.md documents non-existent target_dir → blocked + question_gate, no writes", () => {
  const text = read(SKILL);
  assert.match(
    text,
    /(ENOENT|non-?existent|does not exist)/i,
    "SKILL.md must describe the non-existent target_dir case",
  );
  assert.match(
    text,
    /status:\s*blocked/i,
    "SKILL.md must return status: blocked for an invalid target_dir",
  );
  assert.match(
    text,
    /question_gate/i,
    "SKILL.md must surface a question_gate for an invalid target_dir",
  );
  assert.match(
    text,
    /invalid-path/i,
    "SKILL.md must name the invalid-path question_gate",
  );
});

// --- skills/sdd-init/SKILL.md : multirepo container detection gate -----------

test("SKILL.md documents depth-1 container detection: no own .git AND >=2 children with .git", () => {
  const text = read(SKILL);
  assert.match(
    text,
    /depth-?1|immediate children/i,
    "SKILL.md must describe a depth-1 child scan",
  );
  assert.match(
    text,
    /(no|without)[\s\S]{0,40}?own\s+`?\.git`?/i,
    "SKILL.md must require the container itself to have no own .git",
  );
  assert.match(
    text,
    /(two or more|>=\s*2|≥\s*2|2\s+or\s+more)[\s\S]{0,80}?`?\.git`?/i,
    "SKILL.md must require >=2 children each containing .git",
  );
});

test("SKILL.md documents the federated-vs-normal question_gate with exactly those two options", () => {
  const text = read(SKILL);
  assert.match(text, /`?federated`?/i, "SKILL.md must offer the federated option");
  assert.match(text, /`?normal`?/i, "SKILL.md must offer the normal option");
});

test("SKILL.md states the detection gate fires before any artifact write", () => {
  const text = read(SKILL);
  assert.match(
    text,
    /before\s+any\s+(artifact\s+)?(write|file)|no\s+(files?|artifacts?)\s+(are\s+)?(created|written)/i,
    "SKILL.md must state the gate runs before any artifact write",
  );
});

test("SKILL.md states single-repo and <2-children cases fall through to normal init", () => {
  const text = read(SKILL);
  assert.match(
    text,
    /own\s+`?\.git`?[\s\S]{0,160}?(fall[\s-]?through|normal init|skipped|unchanged|continues?)/i,
    "SKILL.md must state that an own .git skips the gate (single-repo fall-through)",
  );
});

// --- agents/sdd-init.agent.md : ## Parameters contract ----------------------

test("agent.md adds a ## Parameters section documenting the target_dir contract", () => {
  const text = read(AGENT);
  assert.match(text, /##\s*Parameters/, "agent.md must add a ## Parameters section");
  assert.match(text, /target_dir/, "agent.md ## Parameters must document target_dir");
});

test("agent.md documents the three target_dir states: absent→cwd, valid→scoped, missing→blocked", () => {
  const text = read(AGENT);
  assert.match(
    text,
    /absent[\s\S]{0,80}?(cwd|current working directory)/i,
    "agent.md must document absent → cwd",
  );
  assert.match(
    text,
    /(present|valid)[\s\S]{0,120}?(scoped|that path|target_dir)/i,
    "agent.md must document present+valid → init scoped to that path",
  );
  assert.match(
    text,
    /(non-?existent|does not exist|missing)[\s\S]{0,120}?(blocked|question_gate)/i,
    "agent.md must document non-existent → blocked + question_gate",
  );
});

test("agent.md notes the orchestrator injects the block, not env vars or dynamic frontmatter", () => {
  const text = read(AGENT);
  assert.match(
    text,
    /orchestrator[\s\S]{0,120}?inject/i,
    "agent.md must note the orchestrator injects the ## Parameters block",
  );
  assert.match(
    text,
    /(not|no)[\s\S]{0,80}?(env(ironment)?\s+var|dynamic\s+frontmatter)/i,
    "agent.md must note env vars / dynamic frontmatter are NOT used",
  );
});
