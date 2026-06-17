"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const {
  ARTIFACT_STORE_MODES,
  DEFAULT_ARTIFACT_STORE_MODE,
  createArtifactStore,
} = require("./artifact-store.js");

async function createWorkspace(t) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "artifact-store-"));

  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  return workspace;
}

async function writeConfig(workspace, content = "schema: spec-driven\n") {
  const configPath = path.join(workspace, "openspec", "config.yaml");

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, content);
  return configPath;
}

async function writeChange(workspace, name, state) {
  const changePath = path.join(workspace, "openspec", "changes", name);

  await fs.mkdir(changePath, { recursive: true });
  await fs.writeFile(path.join(changePath, "state.yaml"), state);
  return changePath;
}

async function writeAtlas(workspace, body) {
  const atlasPath = path.join(workspace, "openspec", "workspace.yaml");

  await fs.mkdir(path.dirname(atlasPath), { recursive: true });
  await fs.writeFile(atlasPath, body);
}

async function writeMemberChange(workspace, memberDir, name, state) {
  const changePath = path.join(
    workspace,
    memberDir,
    "openspec",
    "changes",
    name,
  );

  await fs.mkdir(changePath, { recursive: true });
  await fs.writeFile(path.join(changePath, "state.yaml"), state);
}

test("exposes the supported modes and a default", () => {
  assert.deepEqual(ARTIFACT_STORE_MODES, ["openspec", "workspace-federated"]);
  assert.equal(DEFAULT_ARTIFACT_STORE_MODE, "openspec");
});

test("defaults to the openspec mode when none is provided", () => {
  const store = createArtifactStore({ workspace: "/tmp/example" });

  assert.equal(store.mode, "openspec");
});

test("rejects an unknown artifact store mode", () => {
  assert.throws(
    () => createArtifactStore({ mode: "dropbox", workspace: "/tmp/example" }),
    /unknown artifact store mode/i,
  );
});

test("resolves derived paths relative to the workspace", () => {
  const store = createArtifactStore({ mode: "openspec", workspace: "/tmp/ws" });

  assert.equal(store.workspace, path.resolve("/tmp/ws"));
  assert.equal(store.cacheRelativePath, ".ospec/cache/skill-registry.cache.json");
  assert.equal(store.runtimeEventRelativePath, ".ospec/runtime/subagent-events.jsonl");
  assert.equal(store.latestSessionRelativePath, ".ospec/session/latest.md");
  assert.equal(
    store.cachePath(),
    path.join(path.resolve("/tmp/ws"), ".ospec", "cache", "skill-registry.cache.json"),
  );
  assert.equal(
    store.sessionSummaryPath("add-export"),
    path.join(path.resolve("/tmp/ws"), ".ospec", "session", "add-export", "session-summary.md"),
  );
});

test("openspec: detects initialization from openspec/config.yaml", async (t) => {
  const workspace = await createWorkspace(t);
  const store = createArtifactStore({ workspace });

  assert.equal(await store.isInitialized(), false);
  assert.equal(await store.readConfig(), null);

  await writeConfig(workspace, "schema: spec-driven\nversion: 1\n");

  assert.equal(await store.isInitialized(), true);
  assert.equal(store.configPath(), path.join(workspace, "openspec", "config.yaml"));
  assert.match(await store.readConfig(), /spec-driven/);
});

test("openspec: delegates active change discovery", async (t) => {
  const workspace = await createWorkspace(t);
  const store = createArtifactStore({ workspace });

  await writeChange(workspace, "recent", "change:\n  status: blocked\n");
  await writeChange(workspace, "completed", "status: completed\n");

  const active = await store.findActiveChanges();

  assert.deepEqual(
    active.map(({ directoryName }) => directoryName),
    ["recent"],
  );
});

test("openspec: writes a change-scoped session summary", async (t) => {
  const workspace = await createWorkspace(t);
  const store = createArtifactStore({ workspace });

  await writeChange(workspace, "add-export", "status: active\n");

  const result = await store.writeSessionSummary("add-export", "# Summary\n");

  assert.equal(result.status, "written");
  assert.equal(result.path, ".ospec/session/add-export/session-summary.md");
  assert.equal(await fs.readFile(result.absolutePath, "utf8"), "# Summary\n");
});

test("openspec: appends runtime events and injects the workspace", async (t) => {
  const workspace = await createWorkspace(t);
  const store = createArtifactStore({ workspace });

  const result = await store.appendRuntimeEvent({
    timestamp: "2026-06-10T10:35:00+02:00",
    agent: "sdd-apply",
    skill_resolution: "fallback-registry",
  });
  const line = JSON.parse(
    (await fs.readFile(result.absolutePath, "utf8")).trim(),
  );

  assert.equal(result.path, ".ospec/runtime/subagent-events.jsonl");
  assert.equal(line.workspace, undefined);
  assert.equal(line.agent, "sdd-apply");
});

test("workspace-federated: keeps the derived layout workspace-local", async (t) => {
  const workspace = await createWorkspace(t);
  const store = createArtifactStore({ mode: "workspace-federated", workspace });

  assert.equal(store.cacheRelativePath, ".ospec/cache/skill-registry.cache.json");
  const event = await store.appendRuntimeEvent({ agent: "sdd-apply" });
  assert.equal(event.path, ".ospec/runtime/subagent-events.jsonl");
});

test("workspace-federated: isInitialized reflects atlas presence", async (t) => {
  const workspace = await createWorkspace(t);
  const store = createArtifactStore({ mode: "workspace-federated", workspace });

  assert.equal(await store.isInitialized(), false);

  await writeAtlas(
    workspace,
    ["members:", "  - id: api", "    path: member-api"].join("\n"),
  );

  assert.equal(await store.isInitialized(), true);
});

test("workspace-federated: keeps changeDirectory and config coordinator-local", async (t) => {
  const workspace = await createWorkspace(t);
  const store = createArtifactStore({ mode: "workspace-federated", workspace });

  assert.equal(
    store.changeDirectory("rollout"),
    path.join(workspace, "openspec", "changes", "rollout"),
  );
  assert.equal(await store.readConfig(), null);

  await writeConfig(workspace, "schema: spec-driven\n");

  assert.match(await store.readConfig(), /spec-driven/);
});

test("workspace-federated: unions coordinator and member changes with source tags", async (t) => {
  const workspace = await createWorkspace(t);

  await writeAtlas(
    workspace,
    ["members:", "  - id: api", "    path: member-api"].join("\n"),
  );
  await writeChange(workspace, "rollout", "change:\n  status: planning\n");
  await writeMemberChange(
    workspace,
    "member-api",
    "add-endpoint",
    "change:\n  status: applying\n",
  );
  await writeMemberChange(
    workspace,
    "member-api",
    "shipped",
    "status: archived\n",
  );

  const store = createArtifactStore({ mode: "workspace-federated", workspace });
  const active = await store.findActiveChanges();

  assert.deepEqual(
    active.map((change) => `${change.source}:${change.directoryName}`).sort(),
    [".:rollout", "api:add-endpoint"],
  );
});

test("workspace-federated: orders aggregated changes by recency across members", async (t) => {
  const workspace = await createWorkspace(t);

  await writeAtlas(
    workspace,
    ["members:", "  - id: api", "    path: member-api"].join("\n"),
  );
  await writeChange(workspace, "rollout", "change:\n  status: planning\n");
  await writeMemberChange(
    workspace,
    "member-api",
    "add-endpoint",
    "change:\n  status: applying\n",
  );

  const older = new Date("2026-06-10T08:00:00.000Z");
  const newer = new Date("2026-06-10T12:00:00.000Z");
  await fs.utimes(
    path.join(workspace, "openspec", "changes", "rollout", "state.yaml"),
    older,
    older,
  );
  await fs.utimes(
    path.join(
      workspace,
      "member-api",
      "openspec",
      "changes",
      "add-endpoint",
      "state.yaml",
    ),
    newer,
    newer,
  );

  const store = createArtifactStore({ mode: "workspace-federated", workspace });
  const active = await store.findActiveChanges();

  assert.equal(active[0].source, "api");
  assert.equal(active[0].directoryName, "add-endpoint");
});

test("workspace-federated: skips an unreachable member without throwing", async (t) => {
  const workspace = await createWorkspace(t);

  await writeAtlas(
    workspace,
    [
      "members:",
      "  - id: api",
      "    path: member-api",
      "  - id: ghost",
      "    path: nowhere",
    ].join("\n"),
  );
  await writeMemberChange(
    workspace,
    "member-api",
    "add-endpoint",
    "change:\n  status: applying\n",
  );

  const store = createArtifactStore({ mode: "workspace-federated", workspace });
  const active = await store.findActiveChanges();

  assert.deepEqual(
    active.map((change) => change.directoryName),
    ["add-endpoint"],
  );
  assert.equal(active.warnings[0].member, "ghost");
});

const VALID_MARKER = [
  "federation:",
  "  id: fed-001",
  "member:",
  "  id: svc-api",
  "  role: primary",
  "  type: microservicio",
  "  layer: dominio",
  "  remote: https://example.com/api.git",
  "  provides:",
  "    - { id: api-public, consumers: [svc-web], surface: openapi }",
  "roster:",
  "  - { id: svc-api, remote: https://example.com/api.git }",
  "updated_at: 2026-06-17T10:00:00.000Z",
  "",
].join("\n");

async function writeMemberMarker(workspace, memberDir, marker) {
  const memberRoot = path.join(workspace, memberDir);

  await fs.mkdir(path.join(memberRoot, ".git"), { recursive: true });
  await fs.mkdir(path.join(memberRoot, "openspec"), { recursive: true });
  await fs.writeFile(
    path.join(memberRoot, "openspec", "federation.member.yaml"),
    marker,
  );
}

function captureWarn(t) {
  const warnings = [];
  const original = console.warn;

  console.warn = (...args) => warnings.push(args.join(" "));
  t.after(() => {
    console.warn = original;
  });

  return warnings;
}

function gitAvailable() {
  const probe = spawnSync("git", ["--version"], { stdio: "ignore" });

  return !probe.error && probe.status === 0;
}

test("workspace-federated: regenerates the atlas from markers when it is absent", async (t) => {
  const workspace = await createWorkspace(t);
  await writeMemberMarker(workspace, "member-api", VALID_MARKER);

  const store = createArtifactStore({ mode: "workspace-federated", workspace });

  assert.equal(await store.isInitialized(), true);

  const written = await fs.readFile(
    path.join(workspace, "openspec", "workspace.yaml"),
    "utf8",
  );

  assert.match(written, /id: svc-api/);
});

test("workspace-federated: regenerates and warns when the cache is corrupt", async (t) => {
  const workspace = await createWorkspace(t);
  await writeMemberMarker(workspace, "member-api", VALID_MARKER);
  await writeAtlas(workspace, "::: not valid atlas yaml :::\n\t}{][\n");

  const warnings = captureWarn(t);
  const store = createArtifactStore({ mode: "workspace-federated", workspace });

  assert.equal(await store.isInitialized(), true);
  assert.ok(warnings.some((warning) => /corrupt/i.test(warning)));
});

test("workspace-federated: warns but keeps loading when workspace.yaml is git-tracked", async (t) => {
  if (!gitAvailable()) {
    t.skip("git is not available");
    return;
  }

  const workspace = await createWorkspace(t);

  spawnSync("git", ["init"], { cwd: workspace, stdio: "ignore" });
  spawnSync("git", ["config", "user.email", "t@example.com"], {
    cwd: workspace,
    stdio: "ignore",
  });
  spawnSync("git", ["config", "user.name", "tester"], {
    cwd: workspace,
    stdio: "ignore",
  });
  await writeAtlas(
    workspace,
    ["members:", "  - id: api", "    path: member-api"].join("\n"),
  );
  spawnSync("git", ["add", "openspec/workspace.yaml"], {
    cwd: workspace,
    stdio: "ignore",
  });

  const warnings = captureWarn(t);
  const store = createArtifactStore({ mode: "workspace-federated", workspace });
  const described = await store.describeWorkspace();

  assert.ok(described && described.members.length === 1);
  assert.ok(warnings.some((warning) => /git rm --cached/.test(warning)));
});
