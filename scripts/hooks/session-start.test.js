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
  { withOpenSpec = true, configContent = "strict_tdd: true\n" } = {},
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


