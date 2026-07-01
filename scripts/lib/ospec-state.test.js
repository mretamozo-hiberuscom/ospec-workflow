"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  RUNTIME_EVENT_RELATIVE_PATH,
  appendRuntimeEvent,
  detectSpecDrift,
  findActiveChanges,
  findOpenSpecRoot,
  matchesGlobs,
  readBackendMode,
  readBaselineState,
  readStagedFiles,
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

test("appendRuntimeEvent reclaims a stale orphaned lock instead of stalling forever", async (t) => {
  const workspace = await createWorkspace(t);
  const eventPath = path.join(workspace, ...RUNTIME_EVENT_RELATIVE_PATH.split("/"));
  await fs.mkdir(path.dirname(eventPath), { recursive: true });

  // Simulate a writer that crashed holding the lock: an old, never-released file.
  const lockPath = `${eventPath}.lock`;
  await fs.writeFile(lockPath, "");
  const past = new Date(Date.now() - 60000);
  await fs.utimes(lockPath, past, past);

  const result = await appendRuntimeEvent({ workspace, seq: 1 });

  assert.match((await fs.readFile(result.absolutePath, "utf8")).trim(), /"seq":1/);
  await assert.rejects(fs.stat(lockPath), (error) => error.code === "ENOENT");
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

// ---------------------------------------------------------------------------
// Domain drift primitives: matchesGlobs, readStagedFiles, detectSpecDrift
// ---------------------------------------------------------------------------

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

async function createDriftFixture(t, { domainsDone = ["hooks"], manifest }) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "ospec-drift-"));

  t.after(() => fs.rm(workspace, { recursive: true, force: true }));

  const openspecRoot = path.join(workspace, "openspec");

  await fs.mkdir(path.join(openspecRoot, "specs", "_baseline"), { recursive: true });
  await fs.mkdir(path.join(openspecRoot, "changes"), { recursive: true });

  const configLines = [
    "baseline:",
    "  status: done",
    "  domains_pending: []",
    "  domains_done:",
    ...domainsDone.map((domain) => `    - ${domain}`),
    "  stale_domains: []",
    '  last_checked: "2026-06-14T19:00:00Z"',
  ].join("\n");

  await fs.writeFile(path.join(openspecRoot, "config.yaml"), configLines);
  await fs.writeFile(path.join(openspecRoot, "specs", "_baseline", "manifest.md"), manifest);

  return workspace;
}

async function createActiveChange(workspace, name, status, specDomain) {
  const changePath = path.join(workspace, "openspec", "changes", name);

  await fs.mkdir(changePath, { recursive: true });
  await fs.writeFile(path.join(changePath, "state.yaml"), `status: ${status}\n`);

  if (specDomain) {
    await fs.mkdir(path.join(changePath, "specs", specDomain), { recursive: true });
  }
}

// Stub gitRunner keyed on the `diff` / `--cached` args, mirroring how both
// SessionStart and PreToolUse invoke the shared drift primitives.
function stubGitRunner(rangeResponses = {}, stagedResponse = []) {
  return function gitRunner(args) {
    if (args[0] === "diff" && args.includes("--cached")) {
      if (stagedResponse instanceof Error) {
        throw stagedResponse;
      }

      return stagedResponse.join("\n");
    }

    if (args[0] === "diff") {
      const range = args[args.length - 1];
      const response = rangeResponses[range];

      if (response === undefined) {
        throw new Error(`no stub configured for range ${range}`);
      }

      if (response instanceof Error) {
        throw response;
      }

      return response.join("\n");
    }

    throw new Error(`unexpected git args: ${args.join(" ")}`);
  };
}

test("matchesGlobs matches ** across any directory depth", () => {
  assert.equal(matchesGlobs("skills/sdd-apply/nested/SKILL.md", ["skills/**/*.md"]), true);
  assert.equal(matchesGlobs("skills/SKILL.md", ["skills/**/*.md"]), false);
});

test("matchesGlobs matches * only within a single path segment", () => {
  assert.equal(matchesGlobs("scripts/hooks/session-start.js", ["scripts/hooks/*.js"]), true);
  assert.equal(matchesGlobs("scripts/hooks/lib/git-state.js", ["scripts/hooks/*.js"]), false);
});

test("matchesGlobs matches a literal path exactly", () => {
  assert.equal(matchesGlobs("hooks/hooks.json", ["hooks/hooks.json"]), true);
  assert.equal(matchesGlobs("hooks/hooks.json.bak", ["hooks/hooks.json"]), false);
});

test("matchesGlobs returns false when no glob matches", () => {
  assert.equal(
    matchesGlobs("scripts/other.js", ["scripts/hooks/*.js", "hooks/hooks.json"]),
    false,
  );
});

test("readStagedFiles parses `git diff --name-only --cached` output", () => {
  const runner = stubGitRunner({}, ["scripts/hooks/session-start.js", "docs/readme.md"]);

  assert.deepEqual(readStagedFiles(runner), [
    "scripts/hooks/session-start.js",
    "docs/readme.md",
  ]);
});

test("readStagedFiles returns null on git failure without throwing", () => {
  const runner = stubGitRunner({}, new Error("git failed"));

  assert.doesNotThrow(() => readStagedFiles(runner));
  assert.equal(readStagedFiles(runner), null);
});

test("detectSpecDrift reports a domain as drifted when changed files match its source globs", async (t) => {
  const manifest = buildManifest(
    ["- hooks: Runtime hooks | sources: scripts/hooks/*.js, hooks/hooks.json"],
    ["| hooks | done | 3 | 59fbfe8 | 2026-06-14T15:00:00Z |"],
  );
  const workspace = await createDriftFixture(t, { domainsDone: ["hooks"], manifest });
  const gitRunner = stubGitRunner({
    "59fbfe8..HEAD": ["scripts/hooks/session-start.js", "README.md"],
  });

  const result = detectSpecDrift({ workspace, gitRunner });

  assert.deepEqual(result, {
    status: "warning",
    domains: [
      {
        domain: "hooks",
        sinceCommit: "59fbfe8",
        sources: ["scripts/hooks/*.js", "hooks/hooks.json"],
        files: ["scripts/hooks/session-start.js"],
      },
    ],
  });
});

test("detectSpecDrift returns null when changed files do not overlap the domain's globs", async (t) => {
  const manifest = buildManifest(
    ["- hooks: Runtime hooks | sources: scripts/hooks/*.js"],
    ["| hooks | done | 3 | 59fbfe8 | 2026-06-14T15:00:00Z |"],
  );
  const workspace = await createDriftFixture(t, { domainsDone: ["hooks"], manifest });
  const gitRunner = stubGitRunner({ "59fbfe8..HEAD": ["README.md", "package.json"] });

  assert.equal(detectSpecDrift({ workspace, gitRunner }), null);
});

test("detectSpecDrift suppresses a domain already covered by an active change's specs scope", async (t) => {
  const manifest = buildManifest(
    ["- hooks: Runtime hooks | sources: scripts/hooks/*.js"],
    ["| hooks | done | 3 | 59fbfe8 | 2026-06-14T15:00:00Z |"],
  );
  const workspace = await createDriftFixture(t, { domainsDone: ["hooks"], manifest });

  await createActiveChange(workspace, "in-flight-hooks-change", "active", "hooks");

  const gitRunner = stubGitRunner({ "59fbfe8..HEAD": ["scripts/hooks/session-start.js"] });

  assert.equal(detectSpecDrift({ workspace, gitRunner }), null);
});

test("detectSpecDrift fails safe when the git probe throws (bad hash / no git / detached HEAD)", async (t) => {
  const manifest = buildManifest(
    ["- hooks: Runtime hooks | sources: scripts/hooks/*.js"],
    ["| hooks | done | 3 | 59fbfe8 | 2026-06-14T15:00:00Z |"],
  );
  const workspace = await createDriftFixture(t, { domainsDone: ["hooks"], manifest });
  const gitRunner = () => {
    throw new Error("fatal: bad revision '59fbfe8..HEAD'");
  };

  assert.doesNotThrow(() => detectSpecDrift({ workspace, gitRunner }));
  assert.equal(detectSpecDrift({ workspace, gitRunner }), null);
});

test("detectSpecDrift derives source globs from the manifest's Domain Map sources: list", async (t) => {
  const manifest = buildManifest(
    [
      "- hooks: Runtime hooks | sources: scripts/hooks/*.js, hooks/hooks.json, scripts/lib/ospec-state.js",
    ],
    ["| hooks | done | 3 | 59fbfe8 | 2026-06-14T15:00:00Z |"],
  );
  const workspace = await createDriftFixture(t, { domainsDone: ["hooks"], manifest });
  const gitRunner = stubGitRunner({ "59fbfe8..HEAD": ["scripts/lib/ospec-state.js"] });

  const result = detectSpecDrift({ workspace, gitRunner });

  assert.deepEqual(result.domains[0].sources, [
    "scripts/hooks/*.js",
    "hooks/hooks.json",
    "scripts/lib/ospec-state.js",
  ]);
});

test("detectSpecDrift uses the latest Entries row per domain (append-only log, latest wins)", async (t) => {
  const manifest = buildManifest(
    ["- hooks: Runtime hooks | sources: scripts/hooks/*.js"],
    [
      "| hooks | done | 3 | 111aaaa | 2026-06-01T00:00:00Z |",
      "| hooks | reconciled | - | 222bbbb | 2026-06-20T00:00:00Z |",
    ],
  );
  const workspace = await createDriftFixture(t, { domainsDone: ["hooks"], manifest });
  const gitRunner = stubGitRunner({ "222bbbb..HEAD": ["scripts/hooks/session-start.js"] });

  const result = detectSpecDrift({ workspace, gitRunner });

  assert.equal(result.domains[0].sinceCommit, "222bbbb");
});

test("detectSpecDrift returns null when zero domains drift", async (t) => {
  const manifest = buildManifest(
    [
      "- hooks: Runtime hooks | sources: scripts/hooks/*.js",
      "- routing: Routing | sources: scripts/lib/route-dispatcher.js",
    ],
    [
      "| hooks | done | 3 | 59fbfe8 | 2026-06-14T15:00:00Z |",
      "| routing | done | 2 | aaa1111 | 2026-06-14T14:00:00Z |",
    ],
  );
  const workspace = await createDriftFixture(t, {
    domainsDone: ["hooks", "routing"],
    manifest,
  });
  const gitRunner = stubGitRunner({
    "59fbfe8..HEAD": [],
    "aaa1111..HEAD": ["README.md"],
  });

  assert.equal(detectSpecDrift({ workspace, gitRunner }), null);
});

test("detectSpecDrift reports two domains drifted simultaneously", async (t) => {
  const manifest = buildManifest(
    [
      "- hooks: Runtime hooks | sources: scripts/hooks/*.js",
      "- routing: Routing | sources: scripts/lib/route-dispatcher.js",
    ],
    [
      "| hooks | done | 3 | 59fbfe8 | 2026-06-14T15:00:00Z |",
      "| routing | done | 2 | aaa1111 | 2026-06-14T14:00:00Z |",
    ],
  );
  const workspace = await createDriftFixture(t, {
    domainsDone: ["hooks", "routing"],
    manifest,
  });
  const gitRunner = stubGitRunner({
    "59fbfe8..HEAD": ["scripts/hooks/session-start.js"],
    "aaa1111..HEAD": ["scripts/lib/route-dispatcher.js"],
  });

  const result = detectSpecDrift({ workspace, gitRunner });

  assert.deepEqual(result.domains.map((domain) => domain.domain).sort(), ["hooks", "routing"]);
});

test("detectSpecDrift tolerates irregular whitespace and a trailing comma in sources:", async (t) => {
  const manifest = buildManifest(
    ["- hooks: Runtime hooks | sources:   scripts/hooks/*.js ,  hooks/hooks.json ,   "],
    ["| hooks | done | 3 | 59fbfe8 | 2026-06-14T15:00:00Z |"],
  );
  const workspace = await createDriftFixture(t, { domainsDone: ["hooks"], manifest });
  const gitRunner = stubGitRunner({ "59fbfe8..HEAD": ["hooks/hooks.json"] });

  const result = detectSpecDrift({ workspace, gitRunner });

  assert.deepEqual(result.domains[0].sources, ["scripts/hooks/*.js", "hooks/hooks.json"]);
});

test("detectSpecDrift does not suppress an unrelated domain via a different active change's specs scope", async (t) => {
  const manifest = buildManifest(
    ["- hooks: Runtime hooks | sources: scripts/hooks/*.js"],
    ["| hooks | done | 3 | 59fbfe8 | 2026-06-14T15:00:00Z |"],
  );
  const workspace = await createDriftFixture(t, { domainsDone: ["hooks"], manifest });

  await createActiveChange(workspace, "unrelated-change", "active", "routing");

  const gitRunner = stubGitRunner({ "59fbfe8..HEAD": ["scripts/hooks/session-start.js"] });
  const result = detectSpecDrift({ workspace, gitRunner });

  assert.deepEqual(result.domains.map((domain) => domain.domain), ["hooks"]);
});
