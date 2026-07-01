"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  CACHE_RELATIVE_PATH,
  runSessionStart,
} = require("./session-start.js");

async function createFixture(
  t,
  {
    withOpenSpec = true,
    configContent = "strict_tdd: true\n",
    manifestContent = null,
  } = {},
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ospec-hook-"));
  const pluginRoot = path.join(root, "plugin");
  const workspace = path.join(root, "workspace");

  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await fs.mkdir(path.join(pluginRoot, "skills", "example"), {
    recursive: true,
  });
  await fs.mkdir(path.join(pluginRoot, "skills", "_shared"), {
    recursive: true,
  });
  await fs.mkdir(path.join(pluginRoot, "rules"), { recursive: true });
  await fs.mkdir(workspace, { recursive: true });

  await fs.writeFile(
    path.join(pluginRoot, "skills", "example", "SKILL.md"),
    [
      "---",
      "name: example",
      'description: "Example skill. Trigger: JavaScript, hooks"',
      "---",
      "",
      "## Hard Rules",
      "",
      "- Keep output deterministic.",
      "- Do not mutate OpenSpec.",
      "",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(pluginRoot, "skills", "_shared", "runtime.md"),
    "Shared runtime contract.\n",
  );
  await fs.writeFile(
    path.join(pluginRoot, "rules", "common.md"),
    "Common project rule.\n",
  );

  if (withOpenSpec) {
    await fs.mkdir(path.join(workspace, "openspec"), { recursive: true });
    await fs.writeFile(
      path.join(workspace, "openspec", "config.yaml"),
      configContent,
    );

    if (manifestContent !== null) {
      await fs.mkdir(path.join(workspace, "openspec", "specs", "_baseline"), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(workspace, "openspec", "specs", "_baseline", "manifest.md"),
        manifestContent,
      );
    }
  }

  return { pluginRoot, root, workspace };
}

test("creates the registry cache when OpenSpec is detected", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t);
  const generatedAt = new Date("2026-06-10T08:00:00.000Z");

  const result = await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
    now: () => generatedAt,
  });

  assert.deepEqual(result, {
    status: "ok",
    ospecDetected: true,
    registry: {
      status: "generated",
      path: CACHE_RELATIVE_PATH,
    },
  });

  const cache = JSON.parse(
    await fs.readFile(
      path.join(workspace, ...CACHE_RELATIVE_PATH.split("/")),
      "utf8",
    ),
  );

  assert.equal(cache.version, 2);
  assert.match(cache.fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(cache.workspace, undefined); // openspec mode: no federated context
  assert.equal(cache.generated_at, generatedAt.toISOString());
  assert.deepEqual(cache.skills, [
    {
      id: "example",
      path: "skills/example/SKILL.md",
      triggers: ["JavaScript", "hooks"],
      compact_rules: [
        "Keep output deterministic.",
        "Do not mutate OpenSpec.",
      ],
      capabilities: [],
    },
  ]);
});

test("does not rewrite a cache whose fingerprint is unchanged", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t);
  const cachePath = path.join(
    workspace,
    ...CACHE_RELATIVE_PATH.split("/"),
  );

  await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
    now: () => new Date("2026-06-10T08:00:00.000Z"),
  });
  const originalCache = await fs.readFile(cachePath, "utf8");

  const result = await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
    now: () => new Date("2026-06-10T09:00:00.000Z"),
  });

  assert.equal(result.registry.status, "reused");
  assert.equal(await fs.readFile(cachePath, "utf8"), originalCache);
});

test("regenerates the cache after a fingerprint input changes", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t);
  const cachePath = path.join(
    workspace,
    ...CACHE_RELATIVE_PATH.split("/"),
  );

  await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
    now: () => new Date("2026-06-10T08:00:00.000Z"),
  });
  const originalCache = JSON.parse(await fs.readFile(cachePath, "utf8"));

  await fs.writeFile(
    path.join(pluginRoot, "rules", "common.md"),
    "Changed project rule.\n",
  );
  await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
    now: () => new Date("2026-06-10T09:00:00.000Z"),
  });

  const updatedCache = JSON.parse(await fs.readFile(cachePath, "utf8"));

  assert.notEqual(updatedCache.fingerprint, originalCache.fingerprint);
  assert.equal(updatedCache.generated_at, "2026-06-10T09:00:00.000Z");
});

test("does not create auxiliary files without OpenSpec", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t, {
    withOpenSpec: false,
  });

  const result = await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
  });

  assert.deepEqual(result, {
    status: "ok",
    ospecDetected: false,
    registry: {
      status: "skipped",
      path: CACHE_RELATIVE_PATH,
    },
  });
  await assert.rejects(
    fs.stat(path.join(workspace, ".ospec")),
    (error) => error.code === "ENOENT",
  );
});

function baselineConfig(fields) {
  return [
    "strict_tdd: true",
    "baseline:",
    `  status: ${fields.status}`,
    `  domains_pending:${fields.domains_pending.length === 0 ? " []" : ""}`,
    ...fields.domains_pending.map((d) => `    - ${d}`),
    `  domains_done:${fields.domains_done.length === 0 ? " []" : ""}`,
    ...fields.domains_done.map((d) => `    - ${d}`),
    `  stale_domains:${fields.stale_domains.length === 0 ? " []" : ""}`,
    ...fields.stale_domains.map((d) => `    - ${d}`),
    `  last_checked: "${fields.last_checked ?? ""}"`,
    "",
  ].join("\n");
}

test("emits baseline hint when baseline.status is pending", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t, {
    configContent: baselineConfig({
      status: "pending",
      domains_pending: [],
      domains_done: [],
      stale_domains: [],
    }),
  });

  const result = await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
    now: () => new Date("2026-06-10T08:00:00.000Z"),
  });

  assert.equal(typeof result.baseline, "object");
  assert.equal(typeof result.baseline.hint, "string");
  assert.ok(result.baseline.hint.length > 0);
});

test("emits hint naming pending count when baseline is partial with 2 pending domains", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t, {
    configContent: baselineConfig({
      status: "partial",
      domains_pending: ["auth", "payments"],
      domains_done: ["users"],
      stale_domains: [],
    }),
  });

  const result = await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
    now: () => new Date("2026-06-10T08:00:00.000Z"),
  });

  assert.equal(typeof result.baseline, "object");
  assert.ok(result.baseline.hint.includes("2"));
});

test("emits hint listing stale domain when baseline is done with a stale entry", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t, {
    configContent: baselineConfig({
      status: "done",
      domains_pending: [],
      domains_done: ["auth"],
      stale_domains: ["auth"],
      last_checked: "2026-06-10T12:00:00Z",
    }),
  });

  const result = await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
    now: () => new Date("2026-06-10T08:00:00.000Z"),
  });

  assert.equal(typeof result.baseline, "object");
  assert.ok(result.baseline.hint.includes("auth"));
});

test("omits baseline key when baseline.status is done with no stale domains", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t, {
    configContent: baselineConfig({
      status: "done",
      domains_pending: [],
      domains_done: ["auth"],
      stale_domains: [],
    }),
  });

  const result = await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
    now: () => new Date("2026-06-10T08:00:00.000Z"),
  });

  assert.equal(result.baseline, undefined);
});

test("omits baseline key when config has no baseline block", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t);

  const result = await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
    now: () => new Date("2026-06-10T08:00:00.000Z"),
  });

  assert.equal(result.baseline, undefined);
});

test("federated backend without an atlas is treated as uninitialized", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t, {
    configContent: "artifact_store:\n  backend: workspace-federated\n",
  });

  const result = await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
    now: () => new Date("2026-06-10T08:00:00.000Z"),
  });

  assert.equal(result.ospecDetected, false);
  assert.equal(result.registry.status, "skipped");
});

test("federated backend with an atlas refreshes the registry", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t, {
    configContent: "artifact_store:\n  backend: workspace-federated\n",
  });

  await fs.writeFile(
    path.join(workspace, "openspec", "workspace.yaml"),
    [
      "members:",
      "  - id: api",
      "    path: ../api",
      "  - id: web",
      "    path: ../web",
      "contracts:",
      "  - id: auth",
      "    provider: api",
      "    consumers: [web]",
    ].join("\n"),
  );

  const result = await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
    now: () => new Date("2026-06-10T08:00:00.000Z"),
  });

  assert.equal(result.ospecDetected, true);
  assert.equal(result.registry.status, "generated");

  // v2 federates atlas context into the cache so a delegator sees the workspace
  // shape (members + contracts) without re-parsing workspace.yaml.
  const cache = JSON.parse(
    await fs.readFile(path.join(workspace, ...CACHE_RELATIVE_PATH.split("/")), "utf8"),
  );
  assert.equal(cache.version, 2);
  assert.deepEqual(
    cache.workspace.members.map((member) => member.id),
    ["api", "web"],
  );
  assert.deepEqual(cache.workspace.contracts, [
    { id: "auth", provider: "api", consumers: ["web"] },
  ]);
});

test("agent-shield: respects DISABLE_AGENT_SHIELD env bypass in SessionStart", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t);
  const oldEnv = process.env.DISABLE_AGENT_SHIELD;
  process.env.DISABLE_AGENT_SHIELD = "true";
  try {
    // Create an unignored .env file
    await fs.writeFile(path.join(workspace, ".env"), "API_KEY=123", "utf8");
    await fs.writeFile(path.join(workspace, ".gitignore"), "other_file\n", "utf8");

    const result = await runSessionStart({
      input: { cwd: workspace },
      pluginRoot,
    });

    assert.equal(result.security, undefined);
    assert.equal(result.systemMessage, undefined);
  } finally {
    if (oldEnv === undefined) {
      delete process.env.DISABLE_AGENT_SHIELD;
    } else {
      process.env.DISABLE_AGENT_SHIELD = oldEnv;
    }
  }
});

test("agent-shield: scans for unignored env files in SessionStart", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t);
  // Create an unignored .env file
  await fs.writeFile(path.join(workspace, ".env"), "API_KEY=123", "utf8");
  await fs.writeFile(path.join(workspace, ".gitignore"), "other_file\n", "utf8");

  const result = await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
  });

  assert.ok(result.security);
  assert.equal(result.security.status, "warning");
  const alert = result.security.alerts.find(a => a.file === ".env");
  assert.ok(alert);
  assert.equal(alert.type, "unignored-env-file");
  assert.match(result.systemMessage, /cuidado/i);
});

test("agent-shield: .env is NOT marked as ignored if only .env.local is in .gitignore", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t);
  await fs.writeFile(path.join(workspace, ".env"), "API_KEY=123", "utf8");
  await fs.writeFile(path.join(workspace, ".gitignore"), ".env.local\n", "utf8");

  const result = await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
  });

  assert.ok(result.security);
  assert.equal(result.security.status, "warning");
  const alert = result.security.alerts.find(a => a.file === ".env");
  assert.ok(alert, ".env should trigger warning because .env.local is NOT a match for .env");
});

test("agent-shield: scans for embedded credentials in .git/config in SessionStart", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t);
  await fs.mkdir(path.join(workspace, ".git"), { recursive: true });
  await fs.writeFile(
    path.join(workspace, ".git", "config"),
    "[remote \"origin\"]\n  url = https://user:secret123@github.com/org/repo.git\n",
    "utf8"
  );

  const result = await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
  });

  assert.ok(result.security);
  assert.equal(result.security.status, "warning");
  const alert = result.security.alerts.find(a => a.file === ".git/config");
  assert.ok(alert);
  assert.equal(alert.type, "embedded-credentials");
  assert.match(result.systemMessage, /credenciales/i);
});

// ---------------------------------------------------------------------------
// Capabilities surfacing (Tasks 1.8, 1.9, 1.10)
// ---------------------------------------------------------------------------

test("capabilities surfaced in result when config has block-sequence capabilities", async (t) => {
  const configContent = [
    "strict_tdd: true",
    "capabilities:",
    "  - name: angular",
    "  - name: postgres",
    "",
  ].join("\n");

  const { pluginRoot, workspace } = await createFixture(t, { configContent });

  const result = await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
    now: () => new Date("2026-06-20T08:00:00.000Z"),
  });

  assert.deepEqual(result.capabilities, ["angular", "postgres"]);
});

test("capabilities key absent from result when config has no capabilities block", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t);

  const result = await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
    now: () => new Date("2026-06-20T08:00:00.000Z"),
  });

  assert.equal(result.capabilities, undefined);
});

test("adding stack skills triggers cache regeneration with capabilities populated", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t);

  // First run — cache generated without stack skills
  await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
    now: () => new Date("2026-06-20T08:00:00.000Z"),
  });

  // Add stack skills AFTER first run
  const skillsToCreate = [
    {
      id: "stack-angular",
      capabilities: ["angular"],
      content: [
        "---",
        "name: stack-angular",
        'description: "Angular frontend. Trigger: angular"',
        "capabilities: [angular]",
        "---",
        "## Critical Rules",
        "- Use standalone components.",
      ].join("\n"),
    },
    {
      id: "stack-java",
      capabilities: ["java"],
      content: [
        "---",
        "name: stack-java",
        "capabilities: [java]",
        "---",
        "## Critical Rules",
        "- Use constructor injection.",
      ].join("\n"),
    },
    {
      id: "stack-kafka",
      capabilities: ["kafka"],
      content: [
        "---",
        "name: stack-kafka",
        "capabilities: [kafka]",
        "---",
        "## Critical Rules",
        "- Enable idempotence.",
      ].join("\n"),
    },
    {
      id: "stack-sqlserver",
      capabilities: ["sqlserver"],
      content: [
        "---",
        "name: stack-sqlserver",
        "capabilities: [sqlserver]",
        "---",
        "## Critical Rules",
        "- Enable RCSI.",
      ].join("\n"),
    },
  ];

  for (const skill of skillsToCreate) {
    const dir = path.join(pluginRoot, "skills", skill.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "SKILL.md"), skill.content);
  }

  // Second run — fingerprint changed, should regenerate
  const result = await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
    now: () => new Date("2026-06-20T09:00:00.000Z"),
  });

  assert.equal(result.registry.status, "generated");

  const cache = JSON.parse(
    await fs.readFile(
      path.join(workspace, ...CACHE_RELATIVE_PATH.split("/")),
      "utf8",
    ),
  );

  for (const skill of skillsToCreate) {
    const stackEntry = cache.skills.find((s) => s.id === skill.id);
    assert.ok(stackEntry, `${skill.id} must appear in cache after regen`);
    assert.deepEqual(stackEntry.capabilities, skill.capabilities);
  }
});

// ---------------------------------------------------------------------------
// Robustness and input fallback tests
// ---------------------------------------------------------------------------

test("runSessionStart: input is null handles fallbackCwd resolving correctly", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t);
  const result = await runSessionStart({
    input: null,
    pluginRoot,
    fallbackCwd: workspace,
    now: () => new Date("2026-06-20T08:00:00.000Z"),
  });
  assert.equal(result.status, "ok");
  assert.equal(result.ospecDetected, true);
});

test("runSessionStart: config read failure (EISDIR/EPERM) does not break session start", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t, { withOpenSpec: false });
  // Create openspec/config.yaml as a directory to trigger read error
  const configPath = path.join(workspace, "openspec", "config.yaml");
  await fs.mkdir(configPath, { recursive: true });

  const result = await runSessionStart({
    input: { cwd: workspace },
    pluginRoot,
    now: () => new Date("2026-06-20T08:00:00.000Z"),
  });

  assert.equal(result.status, "ok");
  assert.equal(result.ospecDetected, true);
  assert.equal(result.baseline, undefined);
  assert.equal(result.capabilities, undefined);
});

// ---------------------------------------------------------------------------
// Phase 4: Git Collaboration Advisory in SessionStart
// ---------------------------------------------------------------------------

/**
 * Git stub runner for session-start advisory tests.
 * Keys: "symbolic-ref", "--show-current", "--porcelain"
 */
function makeSessionGitRunner(responses) {
  return (args) => {
    for (const [key, value] of Object.entries(responses)) {
      if (args.includes(key)) {
        if (value instanceof Error) throw value;
        return value;
      }
    }
    throw new Error(`Unexpected git args: ${args.join(" ")}`);
  };
}

// (a) default branch + clean tree → gitCollaboration warning with dirtyTree:false
test("git-collab-session: default branch + clean tree → gitCollaboration.status warning, dirtyTree false, systemMessage mentions default branch", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t);
  const gitRunner = makeSessionGitRunner({
    "symbolic-ref": "origin/main",
    "--show-current": "main",
    "--porcelain": "",
  });
  const result = await runSessionStart({ input: { cwd: workspace }, pluginRoot, gitRunner });
  assert.ok(result.gitCollaboration, "gitCollaboration must be present");
  assert.equal(result.gitCollaboration.status, "warning");
  assert.strictEqual(result.gitCollaboration.dirtyTree, false, "dirtyTree must be false for clean tree");
  assert.ok(result.systemMessage && result.systemMessage.includes("rama por defecto"), "systemMessage must mention 'rama por defecto'");
});

// (b) feature branch + dirty tree → gitCollaboration with dirtyTree:true
test("git-collab-session: feature branch + dirty tree → dirtyTree true, systemMessage mentions 'sin commitear'", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t);
  const gitRunner = makeSessionGitRunner({
    "symbolic-ref": "origin/main",
    "--show-current": "feat/x",
    "--porcelain": "M modified.js",
  });
  const result = await runSessionStart({ input: { cwd: workspace }, pluginRoot, gitRunner });
  assert.ok(result.gitCollaboration, "gitCollaboration must be present");
  assert.strictEqual(result.gitCollaboration.dirtyTree, true);
  assert.ok(result.systemMessage && result.systemMessage.includes("sin commitear"), "systemMessage must mention 'sin commitear'");
});

// (c) default branch AND dirty tree → single gitCollaboration, message contains both
test("git-collab-session: combined (default + dirty) → single gitCollaboration entry, message mentions both conditions", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t);
  const gitRunner = makeSessionGitRunner({
    "symbolic-ref": "origin/main",
    "--show-current": "main",
    "--porcelain": "M modified.js",
  });
  const result = await runSessionStart({ input: { cwd: workspace }, pluginRoot, gitRunner });
  assert.ok(result.gitCollaboration, "gitCollaboration must be present");
  assert.strictEqual(result.gitCollaboration.dirtyTree, true);
  assert.ok(result.systemMessage && result.systemMessage.includes("rama por defecto"), "must mention default branch");
  assert.ok(result.systemMessage && result.systemMessage.includes("sin commitear"), "must mention uncommitted changes");
});

// (d) clean feature branch → gitCollaboration key absent
test("git-collab-session: clean feature branch → gitCollaboration key absent", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t);
  const gitRunner = makeSessionGitRunner({
    "symbolic-ref": "origin/main",
    "--show-current": "feat/clean",
    "--porcelain": "",
  });
  const result = await runSessionStart({ input: { cwd: workspace }, pluginRoot, gitRunner });
  assert.equal(result.gitCollaboration, undefined, "gitCollaboration must be absent for clean feature branch");
});

// (e) DISABLE_GIT_COLLABORATION_GUARD=true → no gitCollaboration key
test("git-collab-session: DISABLE_GIT_COLLABORATION_GUARD=true → gitCollaboration key absent", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t);
  const oldEnv = process.env.DISABLE_GIT_COLLABORATION_GUARD;
  process.env.DISABLE_GIT_COLLABORATION_GUARD = "true";
  try {
    const gitRunner = makeSessionGitRunner({
      "symbolic-ref": "origin/main",
      "--show-current": "main",
      "--porcelain": "M modified.js",
    });
    const result = await runSessionStart({ input: { cwd: workspace }, pluginRoot, gitRunner });
    assert.equal(result.gitCollaboration, undefined, "gitCollaboration must be absent when guard is disabled");
  } finally {
    if (oldEnv === undefined) delete process.env.DISABLE_GIT_COLLABORATION_GUARD;
    else process.env.DISABLE_GIT_COLLABORATION_GUARD = oldEnv;
  }
});

// (f) git binary absent → no gitCollaboration, other outputs unaffected
test("git-collab-session: git binary absent → no gitCollaboration, registry/baseline/security unaffected", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t);
  const gitRunner = () => { throw new Error("git: command not found"); };
  const result = await runSessionStart({ input: { cwd: workspace }, pluginRoot, gitRunner });
  assert.equal(result.gitCollaboration, undefined, "gitCollaboration must be absent when git fails");
  assert.equal(result.status, "ok", "status must still be ok");
  assert.equal(result.ospecDetected, true, "ospecDetected must still be true");
});

// (g) status probe fails + branch resolves to default → gitCollaboration present, dirtyTree NOT present
test("git-collab-session: status probe fails + on default branch → gitCollaboration present, dirtyTree field absent", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t);
  const gitRunner = makeSessionGitRunner({
    "symbolic-ref": "origin/main",
    "--show-current": "main",
    "--porcelain": new Error("git status failed"),
  });
  const result = await runSessionStart({ input: { cwd: workspace }, pluginRoot, gitRunner });
  assert.ok(result.gitCollaboration, "gitCollaboration must be present (default branch condition fires)");
  assert.equal(result.gitCollaboration.dirtyTree, undefined, "dirtyTree must be absent (not false) when status probe fails");
});

// ---------------------------------------------------------------------------
// Phase 5: Spec Drift Advisory in SessionStart
// ---------------------------------------------------------------------------

function baselineDomainsDoneConfig(domains) {
  return baselineConfig({
    status: "done",
    domains_pending: [],
    domains_done: domains,
    stale_domains: [],
    last_checked: "2026-06-14T19:00:00Z",
  });
}

function buildManifest(domainMapLines, entryRows) {
  return [
    "# Baseline Manifest",
    "",
    "## Domain Map (batch 0 — written once, user-approved)",
    ...domainMapLines,
    "",
    "## Entries (append-only log; latest row per domain wins)",
    "| domain | status | batch | commit | timestamp (UTC) |",
    "|---|---|---|---|---|",
    ...entryRows,
  ].join("\n");
}

// Combines the git-collaboration probe stub (symbolic-ref / --show-current /
// --porcelain) with the drift probe stub (`diff --name-only <hash>..HEAD`) so
// a single injected gitRunner can answer both hook paths, mirroring how a
// real `git` binary answers every probe from one process.
function makeDriftSessionGitRunner({ collab = {}, driftRanges = {} } = {}) {
  const collabResponses = {
    "symbolic-ref": "origin/main",
    "--show-current": "feat/clean",
    "--porcelain": "",
    ...collab,
  };

  return (args) => {
    if (args[0] === "diff" && !args.includes("--cached")) {
      const range = args[args.length - 1];
      const response = driftRanges[range];

      if (response === undefined) {
        throw new Error(`no drift stub configured for range ${range}`);
      }
      if (response instanceof Error) throw response;
      return response.join("\n");
    }

    for (const [key, value] of Object.entries(collabResponses)) {
      if (args.includes(key)) {
        if (value instanceof Error) throw value;
        return value;
      }
    }

    throw new Error(`Unexpected git args: ${args.join(" ")}`);
  };
}

const HOOKS_MANIFEST = buildManifest(
  ["- hooks: Runtime hooks | sources: scripts/hooks/*.js"],
  ["| hooks | done | 3 | 59fbfe8 | 2026-06-14T15:00:00Z |"],
);

// (a) domain drifted → specDrift present naming the domain, systemMessage names it
test("spec-drift-session: drifted domain → specDrift.status warning naming the domain, systemMessage mentions it", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t, {
    configContent: baselineDomainsDoneConfig(["hooks"]),
    manifestContent: HOOKS_MANIFEST,
  });
  const gitRunner = makeDriftSessionGitRunner({
    driftRanges: { "59fbfe8..HEAD": ["scripts/hooks/session-start.js"] },
  });

  const result = await runSessionStart({ input: { cwd: workspace }, pluginRoot, gitRunner });

  assert.ok(result.specDrift, "specDrift must be present");
  assert.equal(result.specDrift.status, "warning");
  assert.deepEqual(
    result.specDrift.domains.map((d) => d.domain),
    ["hooks"],
  );
  assert.equal(result.specDrift.domains[0].sinceCommit, "59fbfe8");
  assert.match(result.specDrift.domains[0].message, /hooks/);
  assert.ok(result.systemMessage && result.systemMessage.includes("hooks"), "systemMessage must name the drifted domain");
});

// (b) no domain drifted → specDrift key entirely absent
test("spec-drift-session: no drifted domain → specDrift key absent", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t, {
    configContent: baselineDomainsDoneConfig(["hooks"]),
    manifestContent: HOOKS_MANIFEST,
  });
  const gitRunner = makeDriftSessionGitRunner({
    driftRanges: { "59fbfe8..HEAD": ["README.md"] },
  });

  const result = await runSessionStart({ input: { cwd: workspace }, pluginRoot, gitRunner });

  assert.equal(result.specDrift, undefined);
});

// (c) DISABLE_SPEC_DRIFT_GUARD=true → absent, and the drift probe is never invoked
test("spec-drift-session: DISABLE_SPEC_DRIFT_GUARD=true → specDrift absent, no drift git probes invoked", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t, {
    configContent: baselineDomainsDoneConfig(["hooks"]),
    manifestContent: HOOKS_MANIFEST,
  });
  // No driftRanges configured — a drift probe call would throw "no drift stub
  // configured", proving the guard genuinely skips the probe rather than the
  // stub happening to tolerate it.
  const gitRunner = makeDriftSessionGitRunner({});
  const oldEnv = process.env.DISABLE_SPEC_DRIFT_GUARD;
  process.env.DISABLE_SPEC_DRIFT_GUARD = "true";
  try {
    const result = await runSessionStart({ input: { cwd: workspace }, pluginRoot, gitRunner });
    assert.equal(result.specDrift, undefined);
  } finally {
    if (oldEnv === undefined) delete process.env.DISABLE_SPEC_DRIFT_GUARD;
    else process.env.DISABLE_SPEC_DRIFT_GUARD = oldEnv;
  }
});

// (d) openspec not initialized → drift check never runs (early-return path)
test("spec-drift-session: openspec not initialized → drift check never runs", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t, { withOpenSpec: false });
  const gitRunner = () => {
    throw new Error("git must never be invoked when openspec is not initialized");
  };

  const result = await runSessionStart({ input: { cwd: workspace }, pluginRoot, gitRunner });

  assert.equal(result.ospecDetected, false);
  assert.equal(result.specDrift, undefined);
});

// (e) TRIANGULATE — gitCollaboration + specDrift firing together: both lines
// present, newline-joined, in order (git-collaboration line first).
test("spec-drift-session: gitCollaboration and specDrift firing together → both systemMessage lines present, in order", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t, {
    configContent: baselineDomainsDoneConfig(["hooks"]),
    manifestContent: HOOKS_MANIFEST,
  });
  const gitRunner = makeDriftSessionGitRunner({
    collab: { "--show-current": "main" }, // onDefault branch → gitCollaboration fires
    driftRanges: { "59fbfe8..HEAD": ["scripts/hooks/session-start.js"] },
  });

  const result = await runSessionStart({ input: { cwd: workspace }, pluginRoot, gitRunner });

  assert.ok(result.gitCollaboration, "gitCollaboration must be present");
  assert.ok(result.specDrift, "specDrift must be present");

  const lines = result.systemMessage.split("\n");
  assert.equal(lines.length, 2, "systemMessage must have exactly two newline-joined lines");
  assert.match(lines[0], /rama por defecto/, "git-collaboration line must come first");
  assert.match(lines[1], /hooks/, "spec-drift line must come second, naming the domain");
});

// (f) TRIANGULATE — injected runner throws mid-probe → status ok still
// returned, no specDrift key (fail-safe: never breaks session start).
test("spec-drift-session: drift git probe throws → status ok, no specDrift key, no crash", async (t) => {
  const { pluginRoot, workspace } = await createFixture(t, {
    configContent: baselineDomainsDoneConfig(["hooks"]),
    manifestContent: HOOKS_MANIFEST,
  });
  const gitRunner = makeDriftSessionGitRunner({
    driftRanges: { "59fbfe8..HEAD": new Error("fatal: bad revision '59fbfe8..HEAD'") },
  });

  const result = await runSessionStart({ input: { cwd: workspace }, pluginRoot, gitRunner });

  assert.equal(result.status, "ok");
  assert.equal(result.specDrift, undefined);
});


