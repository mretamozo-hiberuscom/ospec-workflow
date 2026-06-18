"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  parseMarker,
  serializeMarker,
  enroll,
} = require("./federation-marker.js");

const MARKER_RELATIVE_PATH = path.join("openspec", "federation.member.yaml");

async function createWorkspace(t) {
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), "federation-marker-"),
  );

  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  return workspace;
}

function buildData(overrides = {}) {
  const member = {
    id: "svc-api",
    role: "primary",
    type: "microservicio",
    layer: "dominio",
    remote: "https://example.com/api.git",
    provides: [
      { id: "api-public", consumers: ["svc-web"], surface: "openapi" },
      { id: "api-events", consumers: [], surface: "asyncapi" },
    ],
    ...(overrides.member || {}),
  };

  return {
    federation: { id: "fed-001" },
    member,
    roster: [
      { id: "svc-api", remote: "https://example.com/api.git" },
      { id: "svc-web", remote: "https://example.com/web.git" },
    ],
    ...(overrides.top || {}),
  };
}

// --- parseMarker / serializeMarker round-trip ------------------------------

test("serializeMarker/parseMarker round-trip preserves every field", () => {
  const data = { ...buildData(), updated_at: "2026-06-17T10:00:00.000Z" };

  const parsed = parseMarker(serializeMarker(data));

  assert.deepEqual(parsed, data);
});

test("round-trip preserves provides sub-fields including empty consumers", () => {
  const data = { ...buildData(), updated_at: "2026-06-17T10:00:00.000Z" };

  const parsed = parseMarker(serializeMarker(data));

  assert.deepEqual(parsed.member.provides[0], {
    id: "api-public",
    consumers: ["svc-web"],
    surface: "openapi",
  });
  assert.deepEqual(parsed.member.provides[1].consumers, []);
});

test("serializeMarker emits updated_at as the last field", () => {
  const yaml = serializeMarker({
    ...buildData(),
    updated_at: "2026-06-17T10:00:00.000Z",
  });
  const lines = yaml.trimEnd().split("\n");

  assert.match(lines[lines.length - 1], /^updated_at:/);
});

// --- enroll: first write ---------------------------------------------------

test("enroll writes the marker on first call and stamps updated_at", async (t) => {
  const ws = await createWorkspace(t);
  const memberDir = path.join(ws, "svc-api");
  const before = Date.now();

  const result = await enroll(memberDir, buildData());

  assert.equal(result.status, "written");
  assert.equal(result.path, path.join(memberDir, MARKER_RELATIVE_PATH));

  const written = await fs.readFile(result.path, "utf8");
  const parsed = parseMarker(written);

  assert.equal(parsed.member.id, "svc-api");
  assert.equal(parsed.member.role, "primary");
  assert.deepEqual(parsed.member.provides[0].consumers, ["svc-web"]);
  assert.equal(parsed.roster.length, 2);

  // updated_at is a fresh, valid ISO-8601 UTC timestamp.
  assert.equal(parsed.updated_at, result.updated_at);
  const stamped = Date.parse(parsed.updated_at);
  assert.ok(!Number.isNaN(stamped));
  assert.ok(stamped >= before && stamped <= Date.now() + 1000);
  assert.match(parsed.updated_at, /Z$/);
});

// --- enroll: idempotency (no timestamp refresh) ----------------------------

test("enroll is idempotent on identical data and keeps updated_at stable", async (t) => {
  const ws = await createWorkspace(t);
  const memberDir = path.join(ws, "svc-api");
  const oldTimestamp = "2020-01-01T00:00:00.000Z";

  // Seed an existing marker with an OLD timestamp written directly.
  await fs.mkdir(path.join(memberDir, "openspec"), { recursive: true });
  const seeded = serializeMarker({ ...buildData(), updated_at: oldTimestamp });
  await fs.writeFile(path.join(memberDir, MARKER_RELATIVE_PATH), seeded);

  const result = await enroll(memberDir, buildData());

  assert.equal(result.status, "fresh");
  assert.equal(result.updated_at, oldTimestamp);

  const after = await fs.readFile(
    path.join(memberDir, MARKER_RELATIVE_PATH),
    "utf8",
  );
  assert.equal(after, seeded);
});

test("enroll ignores member key ordering when deciding idempotency", async (t) => {
  const ws = await createWorkspace(t);
  const memberDir = path.join(ws, "svc-api");
  const oldTimestamp = "2020-01-01T00:00:00.000Z";

  await fs.mkdir(path.join(memberDir, "openspec"), { recursive: true });
  const seeded = serializeMarker({ ...buildData(), updated_at: oldTimestamp });
  await fs.writeFile(path.join(memberDir, MARKER_RELATIVE_PATH), seeded);

  // Same semantic content, member keys supplied in a different order.
  const reordered = buildData({
    member: {
      layer: "dominio",
      type: "microservicio",
      role: "primary",
      id: "svc-api",
      remote: "https://example.com/api.git",
      provides: [
        { id: "api-public", consumers: ["svc-web"], surface: "openapi" },
        { id: "api-events", consumers: [], surface: "asyncapi" },
      ],
    },
  });

  const result = await enroll(memberDir, reordered);

  assert.equal(result.status, "fresh");
  assert.equal(result.updated_at, oldTimestamp);
});

// --- enroll: update refreshes the marker -----------------------------------

test("enroll rewrites and refreshes updated_at when content changes", async (t) => {
  const ws = await createWorkspace(t);
  const memberDir = path.join(ws, "svc-api");
  const oldTimestamp = "2020-01-01T00:00:00.000Z";

  await fs.mkdir(path.join(memberDir, "openspec"), { recursive: true });
  const seeded = serializeMarker({ ...buildData(), updated_at: oldTimestamp });
  await fs.writeFile(path.join(memberDir, MARKER_RELATIVE_PATH), seeded);

  const result = await enroll(
    memberDir,
    buildData({ member: { role: "secondary" } }),
  );

  assert.equal(result.status, "written");
  assert.ok(Date.parse(result.updated_at) > Date.parse(oldTimestamp));

  const parsed = parseMarker(
    await fs.readFile(path.join(memberDir, MARKER_RELATIVE_PATH), "utf8"),
  );
  assert.equal(parsed.member.role, "secondary");
  assert.equal(parsed.updated_at, result.updated_at);
});

test("enroll creates the openspec directory when absent", async (t) => {
  const ws = await createWorkspace(t);
  const memberDir = path.join(ws, "fresh-member");

  const result = await enroll(memberDir, buildData());

  assert.equal(result.status, "written");
  const stat = await fs.stat(path.join(memberDir, "openspec"));
  assert.ok(stat.isDirectory());
});

test("enroll leaves no temporary file behind after an atomic write", async (t) => {
  const ws = await createWorkspace(t);
  const memberDir = path.join(ws, "svc-api");

  await enroll(memberDir, buildData());

  const entries = await fs.readdir(path.join(memberDir, "openspec"));
  assert.deepEqual(
    entries.filter((name) => name.endsWith(".tmp")),
    [],
  );
});

// --- WU7 Fix A: I/O error vs absence vs corrupt-marker -----------------------
// resilience-warning-001 / reliability-warning-002. readExistingMarker must
// distinguish "marker absent" (ENOENT → write fresh) and "present-but-unparseable"
// (parse failure → self-heal rewrite) from a "genuine I/O error" (EACCES/EBUSY/
// EISDIR → rethrow so enroll aborts instead of destroying the canonical marker).

test("enroll rethrows a transient I/O read error and does NOT overwrite a healthy marker", async (t) => {
  const ws = await createWorkspace(t);
  const memberDir = path.join(ws, "svc-api");
  const oldTimestamp = "2020-01-01T00:00:00.000Z";

  // Seed a HEALTHY, readable marker — the canonical source of truth.
  await fs.mkdir(path.join(memberDir, "openspec"), { recursive: true });
  const seeded = serializeMarker({ ...buildData(), updated_at: oldTimestamp });
  await fs.writeFile(path.join(memberDir, MARKER_RELATIVE_PATH), seeded);

  // Simulate a transient, non-ENOENT read failure (e.g. EACCES/EBUSY) on the
  // marker read only; every other fs op behaves normally.
  const realReadFile = fs.readFile;
  fs.readFile = async (target, ...rest) => {
    if (String(target).endsWith("federation.member.yaml")) {
      const error = new Error("EACCES: permission denied, open");
      error.code = "EACCES";
      throw error;
    }

    return realReadFile(target, ...rest);
  };

  try {
    await assert.rejects(
      () => enroll(memberDir, buildData({ member: { role: "secondary" } })),
      (error) => error.code === "EACCES",
    );
  } finally {
    fs.readFile = realReadFile;
  }

  // The healthy marker must be intact — enroll must NOT have overwritten it.
  const after = await fs.readFile(
    path.join(memberDir, MARKER_RELATIVE_PATH),
    "utf8",
  );
  assert.equal(after, seeded);
});

test("enroll rethrows EISDIR when the marker path is a directory (no silent overwrite)", async (t) => {
  const ws = await createWorkspace(t);
  const memberDir = path.join(ws, "svc-api");

  // Make the marker PATH itself a directory → fs.readFile raises EISDIR, which
  // is a genuine I/O error, not "marker absent".
  await fs.mkdir(path.join(memberDir, MARKER_RELATIVE_PATH), { recursive: true });

  await assert.rejects(
    () => enroll(memberDir, buildData()),
    (error) => error.code === "EISDIR",
  );

  // No stray atomic temp file from a half-done write must be left behind.
  const entries = await fs.readdir(path.join(memberDir, "openspec"));
  assert.deepEqual(
    entries.filter((name) => name.endsWith(".tmp")),
    [],
  );
});

test("enroll rewrites a present-but-unparseable marker (corrupt self-heal stays green)", async (t) => {
  const ws = await createWorkspace(t);
  const memberDir = path.join(ws, "svc-api");

  // A present marker whose content fails parseMarker (whitespace only).
  await fs.mkdir(path.join(memberDir, "openspec"), { recursive: true });
  await fs.writeFile(path.join(memberDir, MARKER_RELATIVE_PATH), "   \n");

  const result = await enroll(memberDir, buildData());

  assert.equal(result.status, "written");

  const parsed = parseMarker(
    await fs.readFile(path.join(memberDir, MARKER_RELATIVE_PATH), "utf8"),
  );
  assert.equal(parsed.member.id, "svc-api");
});

// --- S1: Marker Hygiene / origin field tests --------------------------------

test("2.1.1 · Explore enroll sets origin: explore on new marker", async (t) => {
  const ws = await createWorkspace(t);
  const memberDir = path.join(ws, "svc-api");

  const data = buildData({ top: { origin: "explore" } });
  const result = await enroll(memberDir, data);

  assert.equal(result.status, "written");

  const written = await fs.readFile(result.path, "utf8");
  const parsed = parseMarker(written);
  assert.equal(parsed.origin, "explore");
});

test("2.1.2 · Explore enroll does not downgrade origin: init", async (t) => {
  const ws = await createWorkspace(t);
  const memberDir = path.join(ws, "svc-api");
  const oldTimestamp = "2020-01-01T00:00:00.000Z";

  await fs.mkdir(path.join(memberDir, "openspec"), { recursive: true });
  const seeded = serializeMarker({ ...buildData(), origin: "init", updated_at: oldTimestamp });
  await fs.writeFile(path.join(memberDir, MARKER_RELATIVE_PATH), seeded);

  const data = buildData({ top: { origin: "explore" } });
  const result = await enroll(memberDir, data);

  assert.equal(result.status, "fresh");
  assert.equal(result.updated_at, oldTimestamp);

  const written = await fs.readFile(path.join(memberDir, MARKER_RELATIVE_PATH), "utf8");
  const parsed = parseMarker(written);
  assert.equal(parsed.origin, "init");
});

test("2.1.3 · Explore enroll does not downgrade origin: manual", async (t) => {
  const ws = await createWorkspace(t);
  const memberDir = path.join(ws, "svc-api");
  const oldTimestamp = "2020-01-01T00:00:00.000Z";

  await fs.mkdir(path.join(memberDir, "openspec"), { recursive: true });
  const seeded = serializeMarker({ ...buildData(), origin: "manual", updated_at: oldTimestamp });
  await fs.writeFile(path.join(memberDir, MARKER_RELATIVE_PATH), seeded);

  const data = buildData({ top: { origin: "explore" } });
  const result = await enroll(memberDir, data);

  assert.equal(result.status, "fresh");
  assert.equal(result.updated_at, oldTimestamp);

  const written = await fs.readFile(path.join(memberDir, MARKER_RELATIVE_PATH), "utf8");
  const parsed = parseMarker(written);
  assert.equal(parsed.origin, "manual");
});

test("2.1.4 · sdd-init enroll upgrades origin: explore to init", async (t) => {
  const ws = await createWorkspace(t);
  const memberDir = path.join(ws, "svc-api");
  const oldTimestamp = "2020-01-01T00:00:00.000Z";

  await fs.mkdir(path.join(memberDir, "openspec"), { recursive: true });
  const seeded = serializeMarker({ ...buildData(), origin: "explore", updated_at: oldTimestamp });
  await fs.writeFile(path.join(memberDir, MARKER_RELATIVE_PATH), seeded);

  const data = buildData({ top: { origin: "init" } });
  const result = await enroll(memberDir, data);

  assert.equal(result.status, "written");
  assert.ok(Date.parse(result.updated_at) > Date.parse(oldTimestamp));

  const written = await fs.readFile(result.path, "utf8");
  const parsed = parseMarker(written);
  assert.equal(parsed.origin, "init");
});

test("2.1.5 · serializeMarker/parseMarker round-trip with origin field present", () => {
  const data = { ...buildData(), origin: "explore", updated_at: "2026-06-17T10:00:00.000Z" };

  const parsed = parseMarker(serializeMarker(data));

  assert.deepEqual(parsed, data);
});

