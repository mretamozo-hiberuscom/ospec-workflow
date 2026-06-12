"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  RUNTIME_EVENT_RELATIVE_PATH,
  appendRuntimeEvent,
  findActiveChanges,
  findOpenSpecRoot,
  readBackendMode,
  readBaselineState,
  readState,
  writeSessionSummary,
} = require("./ospec-state.js");

async function createWorkspace(t) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "ospec-state-"));

  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  return workspace;
}

async function createChange(workspace, name, state) {
  const changePath = path.join(workspace, "openspec", "changes", name);

  await fs.mkdir(changePath, { recursive: true });
  await fs.writeFile(path.join(changePath, "state.yaml"), state);
  return changePath;
}

test("finds the OpenSpec root when present", async (t) => {
  const workspace = await createWorkspace(t);

  assert.equal(await findOpenSpecRoot(workspace), null);
  await fs.mkdir(path.join(workspace, "openspec"));
  assert.equal(
    await findOpenSpecRoot(workspace),
    path.join(workspace, "openspec"),
  );
});

test("reads state metadata from a change directory or state path", async (t) => {
  const workspace = await createWorkspace(t);
  const changePath = await createChange(
    workspace,
    "add-export",
    "change:\n  status: blocked\n  current_phase: apply\n",
  );
  const fromDirectory = await readState(changePath);
  const fromFile = await readState(path.join(changePath, "state.yaml"));

  assert.equal(fromDirectory.directoryName, "add-export");
  assert.equal(fromDirectory.status, "blocked");
  assert.equal(fromDirectory.content, fromFile.content);
  assert.equal(await readState(path.join(workspace, "missing")), null);
});

test("prefers change status over a top-level status", async (t) => {
  const workspace = await createWorkspace(t);
  const changePath = await createChange(
    workspace,
    "status-priority",
    "status: completed\nchange:\n  status: active\n",
  );

  assert.equal((await readState(changePath)).status, "active");
});

test("returns active changes newest first and excludes archive and terminal states", async (t) => {
  const workspace = await createWorkspace(t);
  const oldChange = await createChange(workspace, "old", "status: active\n");
  const completed = await createChange(
    workspace,
    "completed",
    "status: completed\n",
  );
  const recent = await createChange(
    workspace,
    "recent",
    "change:\n  status: blocked\n",
  );
  await fs.mkdir(
    path.join(workspace, "openspec", "changes", "archive", "archived"),
    { recursive: true },
  );
  const oldTime = new Date("2026-06-10T08:00:00.000Z");
  const recentTime = new Date("2026-06-10T10:00:00.000Z");

  await fs.utimes(path.join(oldChange, "state.yaml"), oldTime, oldTime);
  await fs.utimes(
    path.join(completed, "state.yaml"),
    new Date("2026-06-10T11:00:00.000Z"),
    new Date("2026-06-10T11:00:00.000Z"),
  );
  await fs.utimes(path.join(recent, "state.yaml"), recentTime, recentTime);

  const active = await findActiveChanges(
    path.join(workspace, "openspec"),
  );

  assert.deepEqual(
    active.map(({ directoryName }) => directoryName),
    ["recent", "old"],
  );
});

test("writes a change-scoped session summary and skips unchanged content", async (t) => {
  const workspace = await createWorkspace(t);
  const changePath = await createChange(
    workspace,
    "add-export",
    "status: active\n",
  );

  const first = await writeSessionSummary(changePath, "# Summary\n");
  const second = await writeSessionSummary(changePath, "# Summary\n");

  assert.equal(first.status, "written");
  assert.equal(second.status, "fresh");
  assert.equal(
    first.path,
    ".ospec/session/add-export/session-summary.md",
  );
  assert.equal(await fs.readFile(first.absolutePath, "utf8"), "# Summary\n");
});

test("appends runtime events without serializing workspace metadata", async (t) => {
  const workspace = await createWorkspace(t);
  const event = {
    workspace,
    timestamp: "2026-06-10T10:35:00+02:00",
    agent: "sdd-apply",
    skill_resolution: "fallback-registry",
    action: "refresh-registry-next-delegation",
  };

  const first = await appendRuntimeEvent(event);
  await appendRuntimeEvent({ ...event, agent: "sdd-spec" });
  const lines = (await fs.readFile(first.absolutePath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));

  assert.equal(first.path, RUNTIME_EVENT_RELATIVE_PATH);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].workspace, undefined);
  assert.equal(lines[0].agent, "sdd-apply");
  assert.equal(lines[1].agent, "sdd-spec");
});

test("appendRuntimeEvent serializes concurrent writers without corrupting lines", async (t) => {
  const workspace = await createWorkspace(t);
  const count = 40;

  // Parallel sub-agents each fire subagent-stop -> appendRuntimeEvent at once.
  // Every line must remain whole JSON and every event must survive.
  const results = await Promise.all(
    Array.from({ length: count }, (_unused, i) =>
      appendRuntimeEvent({ workspace, seq: i, payload: "x".repeat(300) }),
    ),
  );

  const lines = (await fs.readFile(results[0].absolutePath, "utf8"))
    .trim()
    .split(/\r?\n/);

  assert.equal(lines.length, count, "no line may be lost or merged");
  const seqs = lines.map((line) => JSON.parse(line).seq).sort((a, b) => a - b);
  assert.deepEqual(seqs, Array.from({ length: count }, (_unused, i) => i));
});

test("readBaselineState returns null when baseline block is absent", () => {
  assert.equal(readBaselineState("strict_tdd: true\ntesting:\n  command: node --test\n"), null);
});

test("readBaselineState returns null for empty content", () => {
  assert.equal(readBaselineState(""), null);
});

test("readBaselineState parses status: pending with all inline empty lists", () => {
  const content = [
    "baseline:",
    "  status: pending",
    "  domains_pending: []",
    "  domains_done: []",
    "  stale_domains: []",
    '  last_checked: ""',
  ].join("\n");
  const result = readBaselineState(content);

  assert.equal(result.status, "pending");
  assert.deepEqual(result.domains_pending, []);
  assert.deepEqual(result.domains_done, []);
  assert.deepEqual(result.stale_domains, []);
  assert.equal(result.last_checked, "");
});

test("readBaselineState parses status: partial with indented list items", () => {
  const content = [
    "baseline:",
    "  status: partial",
    "  domains_pending:",
    "    - auth",
    "    - payments",
    "  domains_done:",
    "    - users",
    "  stale_domains: []",
    '  last_checked: ""',
  ].join("\n");
  const result = readBaselineState(content);

  assert.equal(result.status, "partial");
  assert.deepEqual(result.domains_pending, ["auth", "payments"]);
  assert.deepEqual(result.domains_done, ["users"]);
  assert.deepEqual(result.stale_domains, []);
});

test("readBaselineState parses status: done with stale_domains list", () => {
  const content = [
    "baseline:",
    "  status: done",
    "  domains_pending: []",
    "  domains_done:",
    "    - auth",
    "    - users",
    "  stale_domains:",
    "    - auth",
    "  last_checked: 2026-06-10T14:00:00Z",
  ].join("\n");
  const result = readBaselineState(content);

  assert.equal(result.status, "done");
  assert.deepEqual(result.domains_done, ["auth", "users"]);
  assert.deepEqual(result.stale_domains, ["auth"]);
  assert.equal(result.last_checked, "2026-06-10T14:00:00Z");
});

test("readBaselineState normalizes CRLF line endings", () => {
  const content = [
    "baseline:",
    "  status: pending",
    "  domains_pending: []",
    "  domains_done: []",
    "  stale_domains: []",
    '  last_checked: ""',
  ].join("\r\n");
  const result = readBaselineState(content);

  assert.equal(result.status, "pending");
  assert.deepEqual(result.domains_pending, []);
});

test("readBaselineState skips comment lines inside and outside the block", () => {
  const content = [
    "# top-level comment",
    "baseline:",
    "  # comment inside block",
    "  status: partial",
    "  domains_pending:",
    "    - auth",
    "  domains_done: []",
    "  stale_domains: []",
    '  last_checked: ""',
  ].join("\n");
  const result = readBaselineState(content);

  assert.equal(result.status, "partial");
  assert.deepEqual(result.domains_pending, ["auth"]);
});

test("readBackendMode defaults to openspec when the artifact_store block is absent", () => {
  assert.equal(readBackendMode("schema: spec-driven\n"), "openspec");
  assert.equal(readBackendMode(""), "openspec");
});

test("readBackendMode reads a configured federated backend", () => {
  const content = [
    "schema: spec-driven",
    "artifact_store:",
    "  backend: workspace-federated",
  ].join("\n");

  assert.equal(readBackendMode(content), "workspace-federated");
});

test("readBackendMode falls back to openspec for an unknown backend", () => {
  const content = ["artifact_store:", "  backend: dropbox"].join("\n");

  assert.equal(readBackendMode(content), "openspec");
});

test("readBackendMode tolerates CRLF and trailing comments", () => {
  const content = [
    "artifact_store:",
    "  backend: workspace-federated # active",
  ].join("\r\n");

  assert.equal(readBackendMode(content), "workspace-federated");
});

test("readBaselineState does not bleed into subsequent top-level blocks", () => {
  const content = [
    "baseline:",
    "  status: done",
    "  domains_pending: []",
    "  domains_done: []",
    "  stale_domains: []",
    '  last_checked: ""',
    "strict_tdd: true",
    "testing:",
    "  command: node --test",
  ].join("\n");
  const result = readBaselineState(content);

  assert.equal(result.status, "done");
});
