"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runConfigure } = require("./cli.js");
const { validate } = require("./validate-opencode.js");

const SOURCE = path.join(__dirname, "__fixtures__", "source");

function tmpOut(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-opencode-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("validate accepts generated opencode output", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false });

  const result = validate(out);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("validate rejects Claude/Copilot layout residue and the standalone .mcp.json", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false });
  fs.mkdirSync(path.join(out, ".claude-plugin"));
  fs.mkdirSync(path.join(out, ".github"));
  fs.writeFileSync(path.join(out, ".mcp.json"), JSON.stringify({ mcpServers: {} }, null, 2));

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("forbidden path present: .claude-plugin")));
  assert.ok(result.errors.some((error) => error.includes("forbidden path present: .github")));
  assert.ok(result.errors.some((error) => error.includes("forbidden path present: .mcp.json")));
});

test("validate requires a mode on every agent and rejects VS Code-only keys", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false });
  fs.writeFileSync(
    path.join(out, ".opencode/agents/ghost.md"),
    "---\nname: ghost\ntarget: vscode\nuser-invocable: false\n---\n\nbody\n",
  );

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("must declare mode: primary|subagent|all")));
  assert.ok(result.errors.some((error) => error.includes("must not include target frontmatter")));
  assert.ok(result.errors.some((error) => error.includes("must not include user-invocable frontmatter")));
});

test("validate rejects VS Code-only command frontmatter", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false });
  fs.writeFileSync(
    path.join(out, ".opencode/commands/ghost.md"),
    "---\nname: ghost\ntools: ['read']\nargument-hint: \"<x>\"\n---\n\nbody\n",
  );

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("must not include name frontmatter")));
  assert.ok(result.errors.some((error) => error.includes("must not include tools frontmatter")));
  assert.ok(result.errors.some((error) => error.includes("must not include argument-hint frontmatter")));
});

test("validate rejects a malformed opencode.json (bad mcp server, non-array instructions)", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false });

  fs.writeFileSync(
    path.join(out, "opencode.json"),
    JSON.stringify(
      { $schema: "https://opencode.ai/config.json", mcp: { bad: { type: "local" } }, instructions: "x" },
      null,
      2,
    ),
  );

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("(local) must have a non-empty command array")));
  assert.ok(result.errors.some((error) => error.includes("instructions must be an array of strings")));
});

test("validate rejects opencode.json without a $schema", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false });
  fs.writeFileSync(path.join(out, "opencode.json"), JSON.stringify({ mcp: {} }, null, 2));

  assert.ok(validate(out).errors.some((error) => error.includes("must include a $schema")));
});

test("validate fails when the plugin is missing spawnSync invocation", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false });
  assert.equal(validate(out).errors.length, 0);

  // Replace the plugin with a stub that lacks spawnSync — the new validator
  // checks for the binary invocation contract, not the old require() script references.
  fs.writeFileSync(path.join(out, ".opencode/plugins/ospec.js"), "// empty plugin stub\n");

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("must use spawnSync")));
  assert.ok(result.errors.some((error) => error.includes("must reference the ospec-hooks binary")));
});

test("validate requires the skills tree so agent skill references resolve", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false });
  assert.equal(validate(out).errors.length, 0);
  fs.rmSync(path.join(out, "skills"), { recursive: true, force: true });

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("missing required path: skills")));
});

test("validate rejects an agent that references a skill the tree does not ship", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "opencode", outDir: out, validate: false });
  fs.writeFileSync(
    path.join(out, ".opencode/agents/ghost.md"),
    "---\nname: ghost\nmode: subagent\n---\n\nRead `skills/ghost/SKILL.md` before work.\n",
  );

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("references missing skill: skills/ghost/SKILL.md")));
});
