"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const ORCHESTRATOR_AGENT_PATH = path.join(ROOT_DIR, "agents", "sdd-orchestrator.agent.md");
const BASELINE_AGENT_PATH = path.join(ROOT_DIR, "agents", "sdd-baseline.agent.md");
const BASELINE_SKILL_PATH = path.join(ROOT_DIR, "skills", "sdd-baseline", "SKILL.md");

async function fileContains(filePath, pattern) {
  const content = await fs.readFile(filePath, "utf8");
  if (pattern instanceof RegExp) {
    return pattern.test(content);
  }
  return content.includes(pattern);
}

test("5.1.1 · sdd-orchestrator.agent.md contains section for federation baseline loop", async () => {
  const pattern = /federation baseline loop|federation-baseline/i;
  assert.ok(
    await fileContains(ORCHESTRATOR_AGENT_PATH, pattern),
    "Orchestrator agent must document the federation baseline loop"
  );
});

test("5.1.2 · sdd-orchestrator.agent.md contains vscode/askQuestions in gate context", async () => {
  const pattern = /vscode\/askQuestions/i;
  assert.ok(
    await fileContains(ORCHESTRATOR_AGENT_PATH, pattern),
    "Orchestrator agent must use vscode/askQuestions for unified gate"
  );
});

test("5.1.3 · sdd-orchestrator.agent.md contains continue-log-retry logic description", async () => {
  const pattern = /continue-log-retry|no abortar/i;
  assert.ok(
    await fileContains(ORCHESTRATOR_AGENT_PATH, pattern),
    "Orchestrator agent must describe continue-log-retry policy"
  );
});

test("5.1.4 · sdd-orchestrator.agent.md contains retry-failed mechanism", async () => {
  const pattern = /retry-failed|--retry-failed/i;
  assert.ok(
    await fileContains(ORCHESTRATOR_AGENT_PATH, pattern),
    "Orchestrator agent must support retry-failed flag"
  );
});

test("5.1.5 · sdd-orchestrator.agent.md references federation-baseline-orchestrator", async () => {
  const pattern = /federation-baseline-orchestrator/i;
  assert.ok(
    await fileContains(ORCHESTRATOR_AGENT_PATH, pattern),
    "Orchestrator agent must reference the library"
  );
});

test("5.1.6 · sdd-baseline.agent.md contains ## Parameters with four federated fields", async () => {
  const content = await fs.readFile(BASELINE_AGENT_PATH, "utf8");
  assert.ok(content.includes("federation_member_id"));
  assert.ok(content.includes("target_dir"));
  assert.ok(content.includes("parent_change"));
  assert.ok(content.includes("coordinator_root"));
});

test("5.1.7 · sdd-baseline.agent.md indicates write target is target_dir", async () => {
  const pattern = /target_dir/i;
  assert.ok(
    await fileContains(BASELINE_AGENT_PATH, pattern),
    "Baseline agent must indicate write target is target_dir"
  );
});

test("5.1.8 · sdd-baseline.agent.md documents batch-0 skip conditions", async () => {
  const content = await fs.readFile(BASELINE_AGENT_PATH, "utf8");
  assert.ok(content.includes("manifest.md"));
  assert.ok(content.includes("config.yaml"));
  assert.ok(content.includes("batch-0"));
});

test("5.1.9 · sdd-baseline.agent.md describes aggregated state updates", async () => {
  const pattern = /federation-baseline-status.yaml/i;
  assert.ok(
    await fileContains(BASELINE_AGENT_PATH, pattern),
    "Baseline agent must document updates to federation-baseline-status.yaml"
  );
});

test("5.1.10 · SKILL.md contains four federated parameters", async () => {
  const content = await fs.readFile(BASELINE_SKILL_PATH, "utf8");
  assert.ok(content.includes("federation_member_id"));
  assert.ok(content.includes("target_dir"));
  assert.ok(content.includes("parent_change"));
  assert.ok(content.includes("coordinator_root"));
});

test("5.1.11 · SKILL.md documents coordinator_root resolution order", async () => {
  const content = await fs.readFile(BASELINE_SKILL_PATH, "utf8");
  assert.ok(content.includes("coordinator_root"));
  assert.ok(content.includes("traversal"));
});

test("5.1.12 · SKILL.md mentions member-local write target", async () => {
  const content = await fs.readFile(BASELINE_SKILL_PATH, "utf8");
  assert.ok(content.includes("target_dir"));
});

test("5.1.13 · sdd-orchestrator.agent.md mentions read-and-link boundary D10", async () => {
  const pattern = /read-and-link|D10/i;
  assert.ok(
    await fileContains(ORCHESTRATOR_AGENT_PATH, pattern),
    "Orchestrator must document read-and-link boundary D10"
  );
});

test("5.1.14 · sdd-baseline.agent.md documents error path for partial parameters", async () => {
  const pattern = /blocked|question_gate/i;
  assert.ok(
    await fileContains(BASELINE_AGENT_PATH, pattern),
    "Baseline agent must block if federation parameters are partial"
  );
});
