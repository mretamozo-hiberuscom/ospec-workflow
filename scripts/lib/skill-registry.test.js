"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  calculateFingerprint,
  collectFiles,
  discoverSkills,
  extractCapabilities,
  extractCompactRules,
  readRegistryCache,
  writeRegistryCache,
} = require("./skill-registry.js");

async function createRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-registry-"));

  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test("calculates a deterministic content and path fingerprint", async (t) => {
  const root = await createRoot(t);
  const firstPath = path.join(root, "first.md");
  const secondPath = path.join(root, "second.md");

  await fs.writeFile(firstPath, "first\n");
  await fs.writeFile(secondPath, "second\n");

  const forward = await calculateFingerprint([
    { absolutePath: firstPath, relativePath: "rules/first.md" },
    { absolutePath: secondPath, relativePath: "rules/second.md" },
  ]);
  const reverse = await calculateFingerprint([
    { absolutePath: secondPath, relativePath: "rules/second.md" },
    { absolutePath: firstPath, relativePath: "rules/first.md" },
  ]);

  assert.match(forward, /^sha256:[a-f0-9]{64}$/);
  assert.equal(reverse, forward);

  await fs.writeFile(firstPath, "changed\n");
  assert.notEqual(
    await calculateFingerprint([
      { absolutePath: firstPath, relativePath: "rules/first.md" },
      { absolutePath: secondPath, relativePath: "rules/second.md" },
    ]),
    forward,
  );
});

test("discovers cacheable skills and all fingerprint inputs", async (t) => {
  const root = await createRoot(t);
  const files = {
    "skills/example/SKILL.md": [
      "---",
      "name: example",
      'description: "Example. Trigger: JavaScript, hooks"',
      "---",
      "## Hard Rules",
      "- Keep output deterministic.",
    ].join("\n"),
    "skills/sdd-apply/SKILL.md": "---\nname: sdd-apply\n---\n",
    "skills/skill-registry/SKILL.md":
      "---\nname: skill-registry\n---\n",
    "skills/_shared/runtime.md": "Shared runtime.\n",
    "rules/common.md": "Common rule.\n",
  };

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, ...relativePath.split("/"));
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }

  const result = await discoverSkills(root);

  assert.deepEqual(result.skills, [
    {
      id: "example",
      path: "skills/example/SKILL.md",
      triggers: ["JavaScript", "hooks"],
      compact_rules: ["Keep output deterministic."],
      capabilities: [],
    },
  ]);
  assert.deepEqual(
    result.fingerprintPaths.map(({ relativePath }) => relativePath),
    [
      "rules/common.md",
      "skills/_shared/runtime.md",
      "skills/example/SKILL.md",
      "skills/sdd-apply/SKILL.md",
      "skills/skill-registry/SKILL.md",
    ],
  );
});

test("extracts compact rules from complete skill markdown", () => {
  const rules = extractCompactRules(
    [
      "---",
      "name: example",
      "---",
      "## Purpose",
      "- This line is motivation.",
      "## Critical Rules",
      "- First rule.",
      "- Second rule.",
      "| Rule | Requirement |",
      "| --- | --- |",
      "| Third | Must remain deterministic |",
    ].join("\n"),
  );

  assert.deepEqual(rules, [
    "First rule.",
    "Second rule.",
    "Third: Must remain deterministic",
  ]);
});

test("writes and reads registry cache JSON", async (t) => {
  const root = await createRoot(t);
  const cachePath = path.join(root, ".ospec", "cache", "registry.json");
  const data = {
    version: 1,
    fingerprint: "sha256:test",
    skills: [],
  };

  assert.equal(await readRegistryCache(cachePath), null);
  await writeRegistryCache(cachePath, data);
  assert.deepEqual(await readRegistryCache(cachePath), data);
  assert.equal(
    await fs.readFile(cachePath, "utf8"),
    `${JSON.stringify(data, null, 2)}\n`,
  );

  await fs.writeFile(cachePath, "{invalid");
  assert.equal(await readRegistryCache(cachePath), null);
});

// ---------------------------------------------------------------------------
// extractCapabilities (Task 1.5)
// ---------------------------------------------------------------------------

test("extractCapabilities: [angular] returns [angular]", () => {
  assert.deepEqual(extractCapabilities("[angular]"), ["angular"]);
});

test("extractCapabilities: [angular, tailwind] returns both items", () => {
  assert.deepEqual(extractCapabilities("[angular, tailwind]"), [
    "angular",
    "tailwind",
  ]);
});

test("extractCapabilities: semicolon-separated returns both items", () => {
  assert.deepEqual(extractCapabilities("angular;tailwind"), [
    "angular",
    "tailwind",
  ]);
});

test("extractCapabilities: empty string returns empty array", () => {
  assert.deepEqual(extractCapabilities(""), []);
});

test("extractCapabilities: bracket-strip trims whitespace inside brackets", () => {
  assert.deepEqual(extractCapabilities("[ angular ]"), ["angular"]);
});

// ---------------------------------------------------------------------------
// discoverSkills: capabilities field on stack and utility entries (Task 1.7)
// ---------------------------------------------------------------------------

test("discoverSkills: stack entries have capabilities populated, example has empty array", async (t) => {
  const root = await createRoot(t);

  const files = {
    "skills/stack-angular/SKILL.md": [
      "---",
      "name: stack-angular",
      'description: "Angular frontend. Trigger: angular"',
      "capabilities: [angular]",
      "---",
      "## Critical Rules",
      "- Use standalone components.",
    ].join("\n"),
    "skills/stack-java/SKILL.md": [
      "---",
      "name: stack-java",
      "capabilities: [java]",
      "---",
      "## Critical Rules",
      "- Follow naming conventions.",
    ].join("\n"),
    "skills/stack-kafka/SKILL.md": [
      "---",
      "name: stack-kafka",
      "capabilities: [kafka]",
      "---",
      "## Critical Rules",
      "- Enable idempotence.",
    ].join("\n"),
    "skills/stack-sqlserver/SKILL.md": [
      "---",
      "name: stack-sqlserver",
      "capabilities: [sqlserver]",
      "---",
      "## Critical Rules",
      "- Enable RCSI.",
    ].join("\n"),
    "skills/example/SKILL.md": [
      "---",
      "name: example",
      'description: "Example. Trigger: JavaScript"',
      "---",
      "## Hard Rules",
      "- Keep output deterministic.",
    ].join("\n"),
    "rules/common.md": "Common rule.\n",
  };

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, ...relativePath.split("/"));
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
  }

  const result = await discoverSkills(root);

  const angularEntry = result.skills.find((s) => s.id === "stack-angular");
  const javaEntry = result.skills.find((s) => s.id === "stack-java");
  const kafkaEntry = result.skills.find((s) => s.id === "stack-kafka");
  const sqlserverEntry = result.skills.find((s) => s.id === "stack-sqlserver");
  const exampleEntry = result.skills.find((s) => s.id === "example");

  assert.ok(angularEntry, "stack-angular must be in the registry");
  assert.deepEqual(angularEntry.capabilities, ["angular"]);

  assert.ok(javaEntry, "stack-java must be in the registry");
  assert.deepEqual(javaEntry.capabilities, ["java"]);

  assert.ok(kafkaEntry, "stack-kafka must be in the registry");
  assert.deepEqual(kafkaEntry.capabilities, ["kafka"]);

  assert.ok(sqlserverEntry, "stack-sqlserver must be in the registry");
  assert.deepEqual(sqlserverEntry.capabilities, ["sqlserver"]);

  assert.ok(exampleEntry, "example must be in the registry");
  assert.deepEqual(exampleEntry.capabilities, []);
});

// ---------------------------------------------------------------------------
// Robustness and I/O error tests
// ---------------------------------------------------------------------------

test("calculateFingerprint: invalid input throws TypeError", async () => {
  await assert.rejects(calculateFingerprint([123]), TypeError);
});

test("collectFiles: passing a file path instead of directory throws ENOTDIR and is propagated", async (t) => {
  const root = await createRoot(t);
  const filePath = path.join(root, "file.txt");
  await fs.writeFile(filePath, "test");
  await assert.rejects(collectFiles(filePath, () => true));
});

test("readRegistryCache: reading a directory path throws EISDIR/EPERM and is propagated", async (t) => {
  const root = await createRoot(t);
  await assert.rejects(readRegistryCache(root));
});

test("writeRegistryCache: rename error is propagated and not masked by finally block", async (t) => {
  const root = await createRoot(t);
  const dirPath = path.join(root, "target_dir");
  await fs.mkdir(dirPath);
  await assert.rejects(writeRegistryCache(dirPath, { test: true }));
});

