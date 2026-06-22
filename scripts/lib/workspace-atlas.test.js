"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  computeImpact,
  parseAtlas,
  resolveMembers,
  loadMarkerFromMember,
  scanMemberMarkers,
  mergeMarkersIntoAtlas,
  serializeAtlas,
  isWithinRoot,
} = require("./workspace-atlas.js");

const SAMPLE_ATLAS = [
  "schema: workspace-federated",
  "version: 1",
  "members:",
  "  - id: api",
  "    path: ../services/api",
  "    role: backend",
  "    openspec_root: openspec",
  "  - id: web",
  "    path: ../apps/web",
  "    role: frontend",
  "contracts:",
  "  - id: api-public-v1",
  "    provider: api",
  "    consumers: [web]",
  "    surface: openapi",
].join("\n");

async function createWorkspace(t) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-atlas-"));

  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  return workspace;
}

test("parseAtlas returns empty collections for empty or non-string content", () => {
  assert.deepEqual(parseAtlas(""), { members: [], contracts: [] });
  assert.deepEqual(parseAtlas(null), { members: [], contracts: [] });
});

test("parseAtlas reads members and contracts from the supported subset", () => {
  const atlas = parseAtlas(SAMPLE_ATLAS);

  assert.equal(atlas.members.length, 2);
  assert.deepEqual(atlas.members[0], {
    id: "api",
    path: "../services/api",
    role: "backend",
    openspec_root: "openspec",
  });
  assert.equal(atlas.members[1].id, "web");
  assert.equal(atlas.contracts.length, 1);
  assert.equal(atlas.contracts[0].provider, "api");
  assert.deepEqual(atlas.contracts[0].consumers, ["web"]);
});

test("parseAtlas parses an empty inline consumers list", () => {
  const content = [
    "contracts:",
    "  - id: solo",
    "    provider: api",
    "    consumers: []",
  ].join("\n");

  assert.deepEqual(parseAtlas(content).contracts[0].consumers, []);
});

test("parseAtlas ignores unsupported nested shapes without throwing", () => {
  const content = [
    "members:",
    "  - id: api",
    "    path: ../api",
    "    metadata:",
    "      owner:",
    "        team: platform",
    "    role: backend",
  ].join("\n");
  const atlas = parseAtlas(content);

  assert.equal(atlas.members[0].id, "api");
  assert.equal(atlas.members[0].path, "../api");
  assert.equal(atlas.members[0].role, "backend");
});

test("resolveMembers resolves relative and absolute roots with default openspec_root", async (t) => {
  const workspace = await createWorkspace(t);
  const atlas = parseAtlas(
    [
      "members:",
      "  - id: rel",
      "    path: ../services/api",
      "  - id: abs",
      `    path: ${path.join(workspace, "external")}`,
    ].join("\n"),
  );

  const resolved = await resolveMembers(workspace, atlas);

  assert.equal(
    resolved[0].root,
    path.resolve(workspace, "../services/api", "openspec"),
  );
  assert.equal(
    resolved[1].root,
    path.resolve(workspace, "external", "openspec"),
  );
});

test("resolveMembers marks members reachable only when an openspec/changes dir exists", async (t) => {
  const workspace = await createWorkspace(t);

  await fs.mkdir(path.join(workspace, "member", "openspec", "changes"), {
    recursive: true,
  });
  const atlas = parseAtlas(
    [
      "members:",
      "  - id: present",
      "    path: member",
      "  - id: ghost",
      "    path: nowhere",
    ].join("\n"),
  );

  const resolved = await resolveMembers(workspace, atlas);
  const byId = Object.fromEntries(resolved.map((m) => [m.id, m]));

  assert.equal(byId.present.reachable, true);
  assert.equal(byId.ghost.reachable, false);
});

test("computeImpact returns the provider and all its consumers", () => {
  const atlas = parseAtlas(
    [
      "contracts:",
      "  - id: api-v1",
      "    provider: api",
      "    consumers: [web, mobile]",
    ].join("\n"),
  );

  assert.deepEqual(
    [...computeImpact(atlas, "api")].sort(),
    ["api", "mobile", "web"],
  );
});

test("computeImpact returns only itself for a leaf member", () => {
  const atlas = parseAtlas(
    [
      "contracts:",
      "  - id: api-v1",
      "    provider: api",
      "    consumers: [web]",
    ].join("\n"),
  );

  assert.deepEqual([...computeImpact(atlas, "web")], ["web"]);
});

const MARKER_API = [
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

async function writeMember(containerRoot, dir, { gitAsFile = false, marker } = {}) {
  const memberRoot = path.join(containerRoot, dir);

  await fs.mkdir(memberRoot, { recursive: true });

  if (gitAsFile) {
    await fs.writeFile(
      path.join(memberRoot, ".git"),
      "gitdir: ../.git/worktrees/x\n",
    );
  } else {
    await fs.mkdir(path.join(memberRoot, ".git"), { recursive: true });
  }

  if (marker !== undefined) {
    await fs.mkdir(path.join(memberRoot, "openspec"), { recursive: true });
    await fs.writeFile(
      path.join(memberRoot, "openspec", "federation.member.yaml"),
      marker,
    );
  }

  return memberRoot;
}

function buildMarker({
  id,
  updatedAt,
  role = "primary",
  provides = [],
  roster = [],
  remote,
}) {
  const member = { id, role, type: "microservicio", layer: "dominio", provides };

  if (remote !== undefined) {
    member.remote = remote;
  }

  return { federation: { id: `fed-${id}` }, member, roster, updated_at: updatedAt };
}

test("loadMarkerFromMember parses a valid marker", async (t) => {
  const ws = await createWorkspace(t);
  const memberRoot = await writeMember(ws, "member-api", { marker: MARKER_API });

  const result = await loadMarkerFromMember(memberRoot);

  assert.equal(result.ok, true);
  assert.equal(result.marker.member.id, "svc-api");
  assert.equal(result.marker.member.provides[0].id, "api-public");
  assert.deepEqual(result.marker.member.provides[0].consumers, ["svc-web"]);
  assert.equal(result.warning, undefined);
});

test("loadMarkerFromMember warns but succeeds when remote is absent", async (t) => {
  const ws = await createWorkspace(t);
  const marker = MARKER_API.replace(
    "  remote: https://example.com/api.git\n",
    "",
  );
  const memberRoot = await writeMember(ws, "member-api", { marker });

  const result = await loadMarkerFromMember(memberRoot);

  assert.equal(result.ok, true);
  assert.equal(result.marker.member.id, "svc-api");
  assert.match(result.warning, /remot/i);
});

test("loadMarkerFromMember fails open when the marker is missing", async (t) => {
  const ws = await createWorkspace(t);

  const result = await loadMarkerFromMember(path.join(ws, "ghost"));

  assert.equal(result.ok, false);
  assert.ok(result.warning);
});

test("loadMarkerFromMember fails open on a malformed marker", async (t) => {
  const ws = await createWorkspace(t);
  const memberRoot = await writeMember(ws, "member-bad", {
    marker: "not-a-marker: : :\n[]{}\n",
  });

  const result = await loadMarkerFromMember(memberRoot);

  assert.equal(result.ok, false);
  assert.ok(result.warning);
});

test("scanMemberMarkers detects a member whose .git is a directory", async (t) => {
  const ws = await createWorkspace(t);
  await writeMember(ws, "svc-api", { marker: MARKER_API });

  const result = await scanMemberMarkers(ws);

  assert.deepEqual(
    result.map((entry) => entry.memberDir),
    ["svc-api"],
  );
  assert.equal(result[0].marker.member.id, "svc-api");
});

test("scanMemberMarkers detects a member whose .git is a plain file", async (t) => {
  const ws = await createWorkspace(t);
  await writeMember(ws, "libs-ui", { gitAsFile: true, marker: MARKER_API });

  const result = await scanMemberMarkers(ws);

  assert.deepEqual(
    result.map((entry) => entry.memberDir),
    ["libs-ui"],
  );
});

test("scanMemberMarkers unions .gitmodules paths without duplicates", async (t) => {
  const ws = await createWorkspace(t);
  await writeMember(ws, "services-extra", { marker: MARKER_API });
  await fs.mkdir(path.join(ws, "libs", "shared", "openspec"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(ws, "libs", "shared", "openspec", "federation.member.yaml"),
    MARKER_API,
  );
  await fs.writeFile(
    path.join(ws, ".gitmodules"),
    [
      '[submodule "libs/shared"]',
      "  path = libs/shared",
      "  url = https://example.com/shared.git",
      '[submodule "services-extra"]',
      "  path = services-extra",
      "  url = https://example.com/extra.git",
      "",
    ].join("\n"),
  );

  const result = await scanMemberMarkers(ws);

  assert.deepEqual(
    result.map((entry) => entry.memberDir).sort(),
    ["libs/shared", "services-extra"],
  );
});

test("scanMemberMarkers returns empty with a warning for a container with no members", async (t) => {
  const ws = await createWorkspace(t);

  const result = await scanMemberMarkers(ws);

  assert.equal(result.length, 0);
  assert.ok(result.warnings.length > 0);
});

test("isWithinRoot accepts nested members and rejects traversal/absolute escapes", () => {
  const root = path.join(path.sep, "srv", "container");

  assert.equal(isWithinRoot(root, path.join(root, "svc-api")), true);
  assert.equal(isWithinRoot(root, path.join(root, "libs", "shared")), true);
  // Degenerate: a candidate that resolves to the container root itself is rejected.
  assert.equal(isWithinRoot(root, root), false);
  // Parent traversal escapes the container.
  assert.equal(isWithinRoot(root, path.resolve(root, "..", "evil")), false);
  // A sibling that merely shares a name prefix is NOT inside (root + path.sep guard).
  assert.equal(isWithinRoot(root, `${root}-evil`), false);
});

test("scanMemberMarkers rejects a .gitmodules path that escapes the container root (read path)", async (t) => {
  const ws = await createWorkspace(t);
  // A legitimate in-root member that must still be discovered (regression).
  await writeMember(ws, "svc-api", { marker: MARKER_API });

  // Plant a marker OUTSIDE the container that a traversal path would otherwise read.
  const outside = path.join(ws, "..", `evil-${path.basename(ws)}`);
  await fs.mkdir(path.join(outside, "openspec"), { recursive: true });
  await fs.writeFile(
    path.join(outside, "openspec", "federation.member.yaml"),
    MARKER_API,
  );
  t.after(() => fs.rm(outside, { recursive: true, force: true }));

  await fs.writeFile(
    path.join(ws, ".gitmodules"),
    [
      '[submodule "evil"]',
      `  path = ../evil-${path.basename(ws)}`,
      "  url = https://example.com/evil.git",
      '[submodule "abs"]',
      `  path = ${path.join(os.tmpdir(), "abs-escape-target")}`,
      "  url = https://example.com/abs.git",
      "",
    ].join("\n"),
  );

  const result = await scanMemberMarkers(ws);

  // Only the in-root member is discovered; the escaping paths are skipped.
  assert.deepEqual(
    result.map((entry) => entry.memberDir),
    ["svc-api"],
  );
  // No out-of-tree READ happened for the escaping members.
  assert.ok(!result.some((entry) => String(entry.memberDir).includes("evil-")));
  // A fail-open warning is surfaced for each rejected traversal path.
  assert.ok(
    result.warnings.some(
      (w) => /escape/i.test(w) && w.includes(`../evil-${path.basename(ws)}`),
    ),
  );
  assert.ok(
    result.warnings.some(
      (w) => /escape/i.test(w) && w.includes("abs-escape-target"),
    ),
  );
});

// WU7 (risk-warning-symlink-001): lexical isWithinRoot alone trusts a member
// directory whose NAME has no `../` even when it is a real symlink physically
// pointing OUTSIDE the container. scanMemberMarkers must resolve the real path
// and reject such an escaping symlink (warn + skip), without out-of-tree reads.
test("scanMemberMarkers rejects a symlinked member that escapes the container (read path)", async (t) => {
  const ws = await createWorkspace(t);
  // A legitimate in-root member that must still be discovered (regression).
  await writeMember(ws, "svc-api", { marker: MARKER_API });

  // A real directory OUTSIDE the container carrying a marker a symlink would expose.
  const outside = path.join(ws, "..", `escape-${path.basename(ws)}`);
  await fs.mkdir(path.join(outside, "openspec"), { recursive: true });
  await fs.writeFile(
    path.join(outside, "openspec", "federation.member.yaml"),
    MARKER_API,
  );
  t.after(() => fs.rm(outside, { recursive: true, force: true }));

  // Plant a symlink INSIDE the container whose name has no `../` (passes lexical).
  const linkType = process.platform === "win32" ? "junction" : "dir";
  try {
    await fs.symlink(outside, path.join(ws, "legit"), linkType);
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES") {
      t.skip("symlink creation not permitted on this platform");
      return;
    }
    throw error;
  }

  await fs.writeFile(
    path.join(ws, ".gitmodules"),
    [
      '[submodule "legit"]',
      "  path = legit",
      "  url = https://example.com/legit.git",
      "",
    ].join("\n"),
  );

  const result = await scanMemberMarkers(ws);

  // Only the genuine in-root member survives; the escaping symlink is rejected.
  assert.deepEqual(
    result.map((entry) => entry.memberDir),
    ["svc-api"],
  );
  assert.ok(!result.some((entry) => entry.memberDir === "legit"));
  // No out-of-tree READ happened through the symlink.
  assert.ok(
    result.warnings.some(
      (w) => /escape|symlink/i.test(w) && w.includes("legit"),
    ),
  );
});

test("mergeMarkersIntoAtlas unions member entries from multiple markers", () => {
  const { atlas } = mergeMarkersIntoAtlas([
    buildMarker({
      id: "svc-api",
      updatedAt: "2026-06-17T10:00:00Z",
      provides: [{ id: "api-public", consumers: ["svc-web"], surface: "openapi" }],
    }),
    buildMarker({ id: "svc-web", updatedAt: "2026-06-17T10:00:00Z" }),
  ]);

  assert.deepEqual(
    atlas.members.map((member) => member.id).sort(),
    ["svc-api", "svc-web"],
  );
  assert.deepEqual(atlas.contracts, [
    { id: "api-public", provider: "svc-api", consumers: ["svc-web"], surface: "openapi" },
  ]);
});

test("mergeMarkersIntoAtlas keeps the later updated_at on duplicate member.id", () => {
  const { atlas } = mergeMarkersIntoAtlas([
    buildMarker({
      id: "svc-auth",
      updatedAt: "2026-06-17T09:00:00Z",
      role: "secondary",
    }),
    buildMarker({
      id: "svc-auth",
      updatedAt: "2026-06-17T12:00:00Z",
      role: "primary",
    }),
  ]);

  const auth = atlas.members.find((member) => member.id === "svc-auth");

  assert.equal(atlas.members.length, 1);
  assert.equal(auth.role, "primary");
});

test("mergeMarkersIntoAtlas breaks an updated_at tie by greater source member.id", () => {
  const ts = "2026-06-17T10:00:00Z";
  const { atlas, warnings } = mergeMarkersIntoAtlas([
    buildMarker({
      id: "svc-api",
      updatedAt: ts,
      roster: [{ id: "svc-gateway", remote: "https://api/gw" }],
    }),
    buildMarker({
      id: "svc-web",
      updatedAt: ts,
      roster: [{ id: "svc-gateway", remote: "https://web/gw" }],
    }),
  ]);

  const gateway = atlas.members.find((member) => member.id === "svc-gateway");

  assert.equal(gateway.remote, "https://web/gw");
  assert.ok(warnings.some((warning) => /tie/i.test(warning)));
});

test("mergeMarkersIntoAtlas is deterministic across re-runs", () => {
  const input = [
    buildMarker({
      id: "svc-api",
      updatedAt: "2026-06-17T10:00:00Z",
      provides: [{ id: "c1", consumers: [], surface: "x" }],
    }),
    buildMarker({ id: "svc-web", updatedAt: "2026-06-17T11:00:00Z" }),
  ];

  assert.deepEqual(
    mergeMarkersIntoAtlas(input).atlas,
    mergeMarkersIntoAtlas(input).atlas,
  );
});

test("mergeMarkersIntoAtlas skips a malformed marker without aborting", () => {
  const { atlas, warnings } = mergeMarkersIntoAtlas([
    null,
    { member: {} },
    buildMarker({ id: "svc-api", updatedAt: "2026-06-17T10:00:00Z" }),
  ]);

  assert.deepEqual(
    atlas.members.map((member) => member.id),
    ["svc-api"],
  );
  assert.ok(warnings.some((warning) => /malformed/i.test(warning)));
});

test("mergeMarkersIntoAtlas maps provides to contracts with provider and consumers", () => {
  const { atlas } = mergeMarkersIntoAtlas([
    buildMarker({
      id: "svc-payments",
      updatedAt: "2026-06-17T10:00:00Z",
      provides: [
        {
          id: "payments-api",
          consumers: ["svc-checkout", "svc-reporting"],
          surface: "openapi",
        },
      ],
    }),
  ]);

  assert.deepEqual(atlas.contracts, [
    {
      id: "payments-api",
      provider: "svc-payments",
      consumers: ["svc-checkout", "svc-reporting"],
      surface: "openapi",
    },
  ]);
  assert.deepEqual(
    [...computeImpact(atlas, "svc-payments")].sort(),
    ["svc-checkout", "svc-payments", "svc-reporting"],
  );
});

test("mergeMarkersIntoAtlas yields a provider-only impact set when consumers are empty", () => {
  const { atlas } = mergeMarkersIntoAtlas([
    buildMarker({
      id: "svc-payments",
      updatedAt: "2026-06-17T10:00:00Z",
      provides: [{ id: "payments-events", consumers: [], surface: "events" }],
    }),
  ]);

  assert.deepEqual(atlas.contracts[0].consumers, []);
  assert.deepEqual([...computeImpact(atlas, "svc-payments")], ["svc-payments"]);
});

test("serializeAtlas round-trips through parseAtlas", () => {
  const atlas = {
    members: [
      { id: "svc-api", role: "primary", type: "microservicio", layer: "dominio" },
      { id: "svc-web", role: "secondary", type: "microfrontal", layer: "common" },
    ],
    contracts: [
      { id: "api-public", provider: "svc-api", consumers: ["svc-web"] },
      { id: "events", provider: "svc-api", consumers: [] },
    ],
  };

  assert.deepEqual(parseAtlas(serializeAtlas(atlas)), atlas);
});

// --- S1: Marker Hygiene / warning suppression tests -----------------------

test("2.2.1 · loadMarkerFromMember suppresses warning on origin: explore marker without remote", async (t) => {
  const ws = await createWorkspace(t);
  const markerContent = [
    "origin: explore",
    "member:",
    "  id: svc-api",
    "  role: primary",
    "roster:",
    "  - id: svc-api",
    "updated_at: 2026-06-17T10:00:00.000Z",
  ].join("\n");
  const memberRoot = await writeMember(ws, "member-api", { marker: markerContent });

  const result = await loadMarkerFromMember(memberRoot);

  assert.equal(result.ok, true);
  assert.equal(result.marker.member.id, "svc-api");
  assert.equal(result.warning, undefined);
});

test("2.2.2 · loadMarkerFromMember emits warning on origin: init marker without remote", async (t) => {
  const ws = await createWorkspace(t);
  const markerContent = [
    "origin: init",
    "member:",
    "  id: svc-api",
    "  role: primary",
    "roster:",
    "  - id: svc-api",
    "updated_at: 2026-06-17T10:00:00.000Z",
  ].join("\n");
  const memberRoot = await writeMember(ws, "member-api", { marker: markerContent });

  const result = await loadMarkerFromMember(memberRoot);

  assert.equal(result.ok, true);
  assert.match(result.warning, /remote/i);
});

test("2.2.3 · loadMarkerFromMember emits warning on legacy marker (origin absent) without remote", async (t) => {
  const ws = await createWorkspace(t);
  const markerContent = [
    "member:",
    "  id: svc-api",
    "  role: primary",
    "roster:",
    "  - id: svc-api",
    "updated_at: 2026-06-17T10:00:00.000Z",
  ].join("\n");
  const memberRoot = await writeMember(ws, "member-api", { marker: markerContent });

  const result = await loadMarkerFromMember(memberRoot);

  assert.equal(result.ok, true);
  assert.match(result.warning, /remote/i);
});

test("2.2.4 · scanMemberMarkers/mergeMarkersIntoAtlas with 2 explore + 1 init markers without remote", async (t) => {
  const ws = await createWorkspace(t);

  const explore1 = [
    "origin: explore",
    "member:",
    "  id: svc-explore-1",
    "  role: primary",
    "roster:",
    "  - id: svc-explore-1",
    "updated_at: 2026-06-17T10:00:00.000Z",
  ].join("\n");

  const explore2 = [
    "origin: explore",
    "member:",
    "  id: svc-explore-2",
    "  role: primary",
    "roster:",
    "  - id: svc-explore-2",
    "updated_at: 2026-06-17T10:00:00.000Z",
  ].join("\n");

  const initMarker = [
    "origin: init",
    "member:",
    "  id: svc-init",
    "  role: primary",
    "roster:",
    "  - id: svc-init",
    "updated_at: 2026-06-17T10:00:00.000Z",
  ].join("\n");

  await writeMember(ws, "svc-explore-1", { marker: explore1 });
  await writeMember(ws, "svc-explore-2", { marker: explore2 });
  await writeMember(ws, "svc-init", { marker: initMarker });

  const results = await scanMemberMarkers(ws);
  assert.equal(results.length, 3);

  const byId = Object.fromEntries(results.map(r => [r.marker.member.id, r]));

  assert.equal(byId["svc-explore-1"].warning, undefined);
  assert.equal(byId["svc-explore-2"].warning, undefined);
  assert.match(byId["svc-init"].warning, /remote/i);

  // When merged:
  const markers = results.map(r => r.marker);
  const { atlas } = mergeMarkersIntoAtlas(markers);
  assert.equal(atlas.members.length, 3);
  assert.deepEqual(atlas.members.map(m => m.id).sort(), ["svc-explore-1", "svc-explore-2", "svc-init"]);
});

test("2.2.5 · mergeMarkersIntoAtlas suppresses roster warning for origin: explore source", () => {
  const markers = [
    {
      origin: "explore",
      member: { id: "svc-api", role: "primary" },
      roster: [
        { id: "svc-shared" } // no remote
      ],
      updated_at: "2026-06-17T10:00:00Z"
    }
  ];

  const { atlas, warnings } = mergeMarkersIntoAtlas(markers);

  assert.equal(atlas.members.length, 2); // svc-api + svc-shared
  // There should be NO warning about roster entry having no remote
  const rosterWarnings = warnings.filter(w => w.includes("roster") || w.includes("remote"));
  assert.equal(rosterWarnings.length, 0);
});

test("2.2.6 · mergeMarkersIntoAtlas emits roster warning for origin: init source", () => {
  const markers = [
    {
      origin: "init",
      member: { id: "svc-api", role: "primary" },
      roster: [
        { id: "svc-shared" } // no remote
      ],
      updated_at: "2026-06-17T10:00:00Z"
    }
  ];

  const { atlas, warnings } = mergeMarkersIntoAtlas(markers);

  assert.equal(atlas.members.length, 2); // svc-api + svc-shared
  // Warning should be emitted
  const rosterWarnings = warnings.filter(w => w.includes("roster") || w.includes("remote") || w.includes("no remote"));
  assert.ok(rosterWarnings.length > 0);
});

test("2.2.7 · Old consumer ignores origin field", () => {
  const markerContent = [
    "origin: explore",
    "member:",
    "  id: svc-api",
    "  role: primary",
    "  remote: https://example.com/api.git",
    "roster:",
    "  - id: svc-api",
    "updated_at: 2026-06-17T10:00:00.000Z",
  ].join("\n");

  const parsed = parseAtlas(markerContent);
  // Old parseAtlas behavior should just work, it doesn't care about origin
  assert.ok(parsed);
});

// ---------------------------------------------------------------------------
// F1 — surface preserved through merge into contract
// ---------------------------------------------------------------------------

test("F1: mergeMarkersIntoAtlas copies surface from provides[] entry into the derived contract", () => {
  const { atlas } = mergeMarkersIntoAtlas([
    buildMarker({
      id: "svc-payments",
      updatedAt: "2026-06-17T10:00:00Z",
      provides: [{ id: "payments-api", consumers: ["svc-checkout"], surface: "openapi" }],
    }),
  ]);

  assert.equal(atlas.contracts.length, 1);
  assert.strictEqual(atlas.contracts[0].surface, "openapi");
  assert.equal(atlas.contracts[0].id, "payments-api");
  assert.equal(atlas.contracts[0].provider, "svc-payments");
  assert.deepEqual(atlas.contracts[0].consumers, ["svc-checkout"]);
});

// ---------------------------------------------------------------------------
// F2 — Merge→serialize round-trip is idempotent (with surface)
// ---------------------------------------------------------------------------

test("F2: mergeMarkersIntoAtlas + serializeAtlas round-trip is byte-identical and preserves surface", () => {
  const markers = [
    buildMarker({
      id: "svc-payments",
      updatedAt: "2026-06-17T10:00:00Z",
      provides: [{ id: "payments-api", consumers: ["svc-checkout"], surface: "openapi" }],
    }),
  ];

  const { atlas: atlas1 } = mergeMarkersIntoAtlas(markers);
  const { atlas: atlas2 } = mergeMarkersIntoAtlas(markers);

  const yaml1 = serializeAtlas(atlas1);
  const yaml2 = serializeAtlas(atlas2);

  assert.strictEqual(yaml1, yaml2, "two serialize runs from the same markers must be byte-identical");
  assert.ok(yaml1.includes("surface: openapi"), "serialized output must contain the surface field");
  assert.ok(yaml2.includes("surface: openapi"), "second serialized output must contain the surface field");
});

// ---------------------------------------------------------------------------
// F3 — provides entry without surface does not inject surface key
// ---------------------------------------------------------------------------

test("F3: mergeMarkersIntoAtlas does not inject surface key when provides entry has none", () => {
  const { atlas } = mergeMarkersIntoAtlas([
    buildMarker({
      id: "svc-noop",
      updatedAt: "2026-06-17T10:00:00Z",
      provides: [{ id: "svc-noop-api", consumers: [] }],
    }),
  ]);

  assert.equal(atlas.contracts.length, 1);
  const contract = atlas.contracts[0];

  assert.ok(!Object.prototype.hasOwnProperty.call(contract, "surface"), "contract must NOT have a surface key when none was provided");
  assert.equal(contract.id, "svc-noop-api");
  assert.equal(contract.provider, "svc-noop");
  assert.deepEqual(contract.consumers, []);
});

// ---------------------------------------------------------------------------
// F4 — explicit surface: null is not copied into the derived contract
// ---------------------------------------------------------------------------

test("F4: mergeMarkersIntoAtlas does not inject surface key when provides entry has surface: null", () => {
  // Guard under test: workspace-atlas.js — the `value === null` branch in the
  // passthrough loop (`if (value === undefined || value === null) continue`).
  // If that branch were removed, `surface: null` would be assigned to the
  // contract object and both assertions below would fail.
  const { atlas } = mergeMarkersIntoAtlas([
    buildMarker({
      id: "svc-nullsurface",
      updatedAt: "2026-06-17T10:00:00Z",
      provides: [{ id: "svc-nullsurface-api", consumers: [], surface: null }],
    }),
  ]);

  assert.equal(atlas.contracts.length, 1);
  const contract = atlas.contracts[0];

  assert.ok(
    !Object.prototype.hasOwnProperty.call(contract, "surface"),
    "contract must NOT have a surface key when the provided value is null",
  );
  assert.equal(contract.id, "svc-nullsurface-api");
  assert.equal(contract.provider, "svc-nullsurface");
  assert.deepEqual(contract.consumers, []);

  // Defense-in-depth: the serialized YAML must not contain a `surface: null` line.
  const yaml = serializeAtlas(atlas);
  assert.ok(!yaml.includes("surface: null"), "serialized YAML must not contain surface: null");
});

