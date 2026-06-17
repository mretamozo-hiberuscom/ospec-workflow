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
