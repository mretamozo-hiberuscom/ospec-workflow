"use strict";

// WU4 (Phase 5) — sdd-workspace explore/classify subcommand.
//
// Integration tests for the executable backbone of the `explore` subcommand
// (`scripts/lib/federation-explore.js`). explore() realizes the workspace-explore
// phase: depth-1 container scan → per-member classification → idempotent enroll →
// atlas-cache regeneration → human-readable workspace-map.md. The tests use real
// `fs.mkdtemp` container fixtures with `.git` markers (directory and worktree-file
// forms) and assert the three artifact types, partial-failure resilience, the
// empty-container guard, and enroll byte-stability on re-run.

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { explore, classifyMember } = require("./federation-explore.js");
const { parseAtlas } = require("./workspace-atlas.js");
const { parseMarker } = require("./federation-marker.js");

const MARKER_RELATIVE_PATH = path.join("openspec", "federation.member.yaml");

async function makeContainer(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fed-explore-"));

  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function makeMember(root, name, options = {}) {
  const { gitAs = "dir", files = {} } = options;
  const dir = path.join(root, name);

  await fs.mkdir(dir, { recursive: true });

  if (gitAs === "file") {
    await fs.writeFile(
      path.join(dir, ".git"),
      "gitdir: /elsewhere/.git/worktrees/wt\n",
    );
  } else {
    await fs.mkdir(path.join(dir, ".git"), { recursive: true });
  }

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(dir, relativePath);

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }

  return dir;
}

async function exists(target) {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}

async function readMarker(memberDir) {
  return parseMarker(
    await fs.readFile(path.join(memberDir, MARKER_RELATIVE_PATH), "utf8"),
  );
}

// --- Explore Artifacts: three artifacts on success -------------------------

test("explore writes a marker per member plus the atlas cache and the map", async (t) => {
  const root = await makeContainer(t);

  await makeMember(root, "svc-api", {
    files: {
      "package.json": '{ "name": "svc-api" }\n',
      "src/index.js": "module.exports = () => 'api';\n",
      "openspec/config.yaml": "schema: ospec-config\n",
    },
  });
  await makeMember(root, "lib-common", {
    files: { "Common.csproj": "<Project></Project>\n" },
  });
  await makeMember(root, "app-web", {
    files: {
      "package.json": '{ "name": "app-web" }\n',
      "src/main.ts": "export const x = 1;\n",
    },
  });

  const result = await explore(root);

  assert.equal(result.status, "success");
  assert.equal(result.members.length, 3);

  assert.ok(await exists(path.join(root, "svc-api", MARKER_RELATIVE_PATH)));
  assert.ok(await exists(path.join(root, "lib-common", MARKER_RELATIVE_PATH)));
  assert.ok(await exists(path.join(root, "app-web", MARKER_RELATIVE_PATH)));

  const atlasPath = path.join(root, "openspec", "workspace.yaml");
  const mapPath = path.join(root, "openspec", "workspace-map.md");

  assert.ok(await exists(atlasPath), "atlas cache must be written");
  assert.ok(await exists(mapPath), "workspace-map.md must be written");

  const atlas = parseAtlas(await fs.readFile(atlasPath, "utf8"));
  const atlasIds = atlas.members.map((member) => member.id).sort();

  assert.deepEqual(atlasIds, ["app-web", "lib-common", "svc-api"]);

  const map = await fs.readFile(mapPath, "utf8");

  assert.match(map, /svc-api/);
  assert.match(map, /lib-common/);
  assert.match(map, /app-web/);
});

// --- Member Classification triangulation ------------------------------------

test("explore classifies a node service as microservicio/dominio/brownfield", async (t) => {
  const root = await makeContainer(t);
  const member = await makeMember(root, "svc-api", {
    files: {
      "package.json": '{ "name": "svc-api" }\n',
      "src/index.js": "module.exports = 1;\n",
      "openspec/config.yaml": "schema: ospec-config\n",
    },
  });

  await explore(root);

  const marker = await readMarker(member);

  assert.equal(marker.member.type, "microservicio");
  assert.equal(marker.member.layer, "dominio");

  const row = (await explore(root)).members.find((m) => m.id === "svc-api");

  assert.equal(row.brownfield, true);
  assert.equal(row.initDone, true);
});

test("explore classifies a csproj-only package as nuget/common/greenfield", async (t) => {
  const root = await makeContainer(t);
  const member = await makeMember(root, "lib-common", {
    files: { "Common.csproj": "<Project></Project>\n" },
  });

  const result = await explore(root);
  const marker = await readMarker(member);

  assert.equal(marker.member.type, "nuget");
  assert.equal(marker.member.layer, "common");

  const row = result.members.find((m) => m.id === "lib-common");

  assert.equal(row.brownfield, false);
  assert.equal(row.initDone, false);
});

test("explore sets type null with a warning when the stack cannot be inferred", async (t) => {
  const root = await makeContainer(t);
  const member = await makeMember(root, "mystery", {
    files: { "README.md": "# mystery\n" },
  });

  const result = await explore(root);
  const row = result.members.find((m) => m.id === "mystery");

  assert.equal(row.type, null);
  assert.ok(
    row.warnings.some((warning) => /type/i.test(warning)),
    "an undeterminable type must emit a per-member warning",
  );

  const marker = await readMarker(member);

  assert.equal(marker.member.type, undefined);
  assert.equal(marker.member.id, "mystery");
});

// --- Container Detection: .git as a plain file (worktree/submodule) ----------

test("explore counts a member whose .git is a plain file (worktree)", async (t) => {
  const root = await makeContainer(t);

  await makeMember(root, "wt-member", {
    gitAs: "file",
    files: { "package.json": '{ "name": "wt-member" }\n' },
  });

  const result = await explore(root);

  assert.equal(result.members.length, 1);
  assert.ok(await exists(path.join(root, "wt-member", MARKER_RELATIVE_PATH)));

  const atlas = parseAtlas(
    await fs.readFile(path.join(root, "openspec", "workspace.yaml"), "utf8"),
  );

  assert.deepEqual(
    atlas.members.map((member) => member.id),
    ["wt-member"],
  );
});

// --- Container Detection: empty container -----------------------------------

test("explore writes no artifacts and warns when no member repos are found", async (t) => {
  const root = await makeContainer(t);

  await fs.mkdir(path.join(root, "not-a-repo"), { recursive: true });

  const result = await explore(root);

  assert.equal(result.members.length, 0);
  assert.deepEqual(result.artifacts, []);
  assert.ok(
    result.warnings.some((warning) => /no member/i.test(warning)),
    "an empty container must surface a warning",
  );

  assert.equal(
    await exists(path.join(root, "openspec", "workspace.yaml")),
    false,
  );
  assert.equal(
    await exists(path.join(root, "openspec", "workspace-map.md")),
    false,
  );
});

// --- Explore Artifacts: partial enroll failure → pending in map -------------

test("explore records a failed enroll as pending and builds the atlas from the survivors", async (t) => {
  const root = await makeContainer(t);

  await makeMember(root, "m-a", {
    files: { "package.json": '{ "name": "m-a" }\n' },
  });
  // Force enroll to fail for m-broken: its openspec path exists as a FILE, so
  // enroll's `mkdir(openspec, { recursive })` throws and the member is skipped.
  const broken = await makeMember(root, "m-broken", {
    files: { "package.json": '{ "name": "m-broken" }\n' },
  });

  await fs.writeFile(path.join(broken, "openspec"), "not a directory\n");

  await makeMember(root, "m-c", {
    files: { "Service.csproj": "<Project></Project>\n" },
  });

  const result = await explore(root);

  assert.ok(await exists(path.join(root, "m-a", MARKER_RELATIVE_PATH)));
  assert.ok(await exists(path.join(root, "m-c", MARKER_RELATIVE_PATH)));

  const brokenRow = result.members.find((m) => m.id === "m-broken");

  assert.equal(brokenRow.enroll, "pending");
  assert.ok(brokenRow.reason, "the failure reason must be captured");

  const atlas = parseAtlas(
    await fs.readFile(path.join(root, "openspec", "workspace.yaml"), "utf8"),
  );

  assert.deepEqual(
    atlas.members.map((member) => member.id).sort(),
    ["m-a", "m-c"],
  );

  const map = await fs.readFile(
    path.join(root, "openspec", "workspace-map.md"),
    "utf8",
  );

  assert.match(map, /m-broken/);
  assert.match(map, /pending/);
});

// --- Resumable Bootstrap: re-run is byte-stable -----------------------------

test("re-running explore on unchanged members leaves markers byte-stable", async (t) => {
  const root = await makeContainer(t);
  const member = await makeMember(root, "svc-api", {
    files: { "package.json": '{ "name": "svc-api" }\n' },
  });

  await explore(root);

  const markerPath = path.join(member, MARKER_RELATIVE_PATH);
  const firstContent = await fs.readFile(markerPath, "utf8");
  const firstUpdatedAt = parseMarker(firstContent).updated_at;

  const second = await explore(root);
  const secondContent = await fs.readFile(markerPath, "utf8");

  assert.equal(secondContent, firstContent, "marker content must be byte-stable");
  assert.equal(parseMarker(secondContent).updated_at, firstUpdatedAt);

  const row = second.members.find((m) => m.id === "svc-api");

  assert.equal(row.enroll, "fresh");
});

// --- classifyMember unit triangulation --------------------------------------

test("classifyMember derives the common layer from a shared directory name", async (t) => {
  const root = await makeContainer(t);
  const member = await makeMember(root, "shared-kit", {
    files: { "package.json": '{ "name": "shared-kit" }\n' },
  });

  const classification = await classifyMember(member);

  assert.equal(classification.layer, "common");
});

// --- Security: path traversal containment (write path, risk-critical-001) ----

test("explore never enrolls or writes outside the container on a traversal path", async (t) => {
  const root = await makeContainer(t);

  // A legitimate in-root member that must still be enrolled (regression).
  await makeMember(root, "svc-api", {
    files: { "package.json": '{ "name": "svc-api" }\n' },
  });

  // Sibling target OUTSIDE the container that the traversal path would write into.
  const outside = path.join(root, "..", `evil-${path.basename(root)}`);

  t.after(() => fs.rm(outside, { recursive: true, force: true }));

  await fs.writeFile(
    path.join(root, ".gitmodules"),
    [
      '[submodule "evil"]',
      `  path = ../evil-${path.basename(root)}`,
      "  url = https://example.com/evil.git",
      "",
    ].join("\n"),
  );

  const result = await explore(root);

  // The malicious member is skipped — no enroll, not in the member rows.
  assert.ok(!result.members.some((m) => String(m.id).includes("evil-")));
  assert.ok(result.members.some((m) => m.id === "svc-api"));

  // CRITICAL: nothing was created outside the container root (no arbitrary write).
  assert.equal(await exists(outside), false);
  assert.equal(await exists(path.join(outside, MARKER_RELATIVE_PATH)), false);

  // A fail-open traversal warning surfaced; the run still succeeded.
  assert.equal(result.status, "success");
  assert.ok(result.warnings.some((w) => /escape/i.test(w)));
});

test("explore writes no artifacts when the only member escapes the container", async (t) => {
  const root = await makeContainer(t);
  const outside = path.join(root, "..", `evil-${path.basename(root)}`);

  t.after(() => fs.rm(outside, { recursive: true, force: true }));

  await fs.writeFile(
    path.join(root, ".gitmodules"),
    [
      '[submodule "evil"]',
      `  path = ../evil-${path.basename(root)}`,
      "  url = https://example.com/evil.git",
      "",
    ].join("\n"),
  );

  const result = await explore(root);

  assert.equal(result.members.length, 0);
  assert.deepEqual(result.artifacts, []);
  assert.equal(await exists(outside), false);
  assert.ok(result.warnings.some((w) => /escape/i.test(w)));
});

// WU7 (risk-warning-symlink-001): a real symlink planted inside the container,
// referenced by a clean (no `../`) .gitmodules path, must NOT let explore →
// enroll mkdir/write a marker THROUGH the symlink, outside the real container.
test("explore never enrolls or writes through a symlinked member that escapes the container", async (t) => {
  const root = await makeContainer(t);

  // A legitimate in-root member that must still be enrolled (regression).
  await makeMember(root, "svc-api", {
    files: { "package.json": '{ "name": "svc-api" }\n' },
  });

  // A real, empty directory OUTSIDE the container (no openspec yet).
  const outside = path.join(root, "..", `escape-${path.basename(root)}`);
  await fs.mkdir(outside, { recursive: true });
  t.after(() => fs.rm(outside, { recursive: true, force: true }));

  // Plant a symlink INSIDE the container whose name has no `../`.
  const linkType = process.platform === "win32" ? "junction" : "dir";
  try {
    await fs.symlink(outside, path.join(root, "legit"), linkType);
  } catch (error) {
    if (error.code === "EPERM" || error.code === "EACCES") {
      t.skip("symlink creation not permitted on this platform");
      return;
    }
    throw error;
  }

  await fs.writeFile(
    path.join(root, ".gitmodules"),
    [
      '[submodule "legit"]',
      "  path = legit",
      "  url = https://example.com/legit.git",
      "",
    ].join("\n"),
  );

  const result = await explore(root);

  // The symlinked member is skipped; the genuine in-root member is still enrolled.
  assert.ok(!result.members.some((m) => m.id === "legit"));
  assert.ok(result.members.some((m) => m.id === "svc-api"));

  // CRITICAL: nothing was written through the symlink, outside the real container.
  assert.equal(await exists(path.join(outside, MARKER_RELATIVE_PATH)), false);

  // Fail-open: a warning surfaced and the run still succeeded.
  assert.equal(result.status, "success");
  assert.ok(result.warnings.some((w) => /escape|symlink/i.test(w)));
});

// --- S3: explore atomic writes (temp+rename) and integration ----------------

test("3.1.1 · workspace.yaml written via temp+rename", async (t) => {
  const root = await makeContainer(t);
  await makeMember(root, "svc-api", {
    files: { "package.json": '{ "name": "svc-api" }\n' },
  });

  const originalRename = fs.rename;
  let renamedWorkspaceYaml = false;
  fs.rename = async (oldPath, newPath) => {
    if (newPath.endsWith("workspace.yaml") && oldPath.endsWith("workspace.yaml.tmp")) {
      renamedWorkspaceYaml = true;
    }
    return originalRename(oldPath, newPath);
  };

  try {
    await explore(root);
    assert.ok(renamedWorkspaceYaml, "workspace.yaml must be written via rename");
    const existsTmp = await exists(path.join(root, "openspec", "workspace.yaml.tmp"));
    assert.equal(existsTmp, false);
  } finally {
    fs.rename = originalRename;
  }
});

test("3.1.2 · workspace-map.md written via temp+rename", async (t) => {
  const root = await makeContainer(t);
  await makeMember(root, "svc-api", {
    files: { "package.json": '{ "name": "svc-api" }\n' },
  });

  const originalRename = fs.rename;
  let renamedWorkspaceMap = false;
  fs.rename = async (oldPath, newPath) => {
    if (newPath.endsWith("workspace-map.md") && oldPath.endsWith("workspace-map.md.tmp")) {
      renamedWorkspaceMap = true;
    }
    return originalRename(oldPath, newPath);
  };

  try {
    await explore(root);
    assert.ok(renamedWorkspaceMap, "workspace-map.md must be written via rename");
    const existsTmp = await exists(path.join(root, "openspec", "workspace-map.md.tmp"));
    assert.equal(existsTmp, false);
  } finally {
    fs.rename = originalRename;
  }
});

test("3.1.3 · workspace-map.md write fails after workspace.yaml succeeds", async (t) => {
  const root = await makeContainer(t);
  await makeMember(root, "svc-api", {
    files: { "package.json": '{ "name": "svc-api" }\n' },
  });

  const openspecDir = path.join(root, "openspec");
  await fs.mkdir(openspecDir, { recursive: true });
  await fs.writeFile(path.join(openspecDir, "workspace-map.md"), "original map content");

  const originalWriteFile = fs.writeFile;
  fs.writeFile = async (file, data, ...rest) => {
    if (String(file).endsWith("workspace-map.md.tmp")) {
      const err = new Error("ENOSPC: no space left on device");
      err.code = "ENOSPC";
      throw err;
    }
    return originalWriteFile(file, data, ...rest);
  };

  try {
    const result = await explore(root);
    assert.equal(await exists(path.join(openspecDir, "workspace.yaml")), true);
    assert.equal(await fs.readFile(path.join(openspecDir, "workspace-map.md"), "utf8"), "original map content");
    assert.ok(result.warnings.some(w => w.includes("workspace-map.md")));
  } finally {
    fs.writeFile = originalWriteFile;
  }
});

test("3.1.4 · Stale workspace-map.md.tmp detected and overwritten", async (t) => {
  const root = await makeContainer(t);
  await makeMember(root, "svc-api", {
    files: { "package.json": '{ "name": "svc-api" }\n' },
  });

  const openspecDir = path.join(root, "openspec");
  await fs.mkdir(openspecDir, { recursive: true });
  const tmpPath = path.join(openspecDir, "workspace-map.md.tmp");
  await fs.writeFile(tmpPath, "stale content");

  const result = await explore(root);
  assert.equal(result.status, "success");
  assert.equal(await exists(tmpPath), false);
  assert.equal(await exists(path.join(openspecDir, "workspace-map.md")), true);
});

test("3.1.5 · explore integration S1 + S3: brownfield member marker has origin: explore and files are atomic", async (t) => {
  const root = await makeContainer(t);
  await makeMember(root, "svc-api", {
    files: {
      "package.json": '{ "name": "svc-api" }\n',
      "src/index.js": "module.exports = {};\n",
    },
  });

  const result = await explore(root);
  assert.equal(result.status, "success");

  const marker = await readMarker(path.join(root, "svc-api"));
  assert.equal(marker.origin, "explore");

  assert.equal(await exists(path.join(root, "openspec", "workspace.yaml")), true);
  assert.equal(await exists(path.join(root, "openspec", "workspace-map.md")), true);
});
