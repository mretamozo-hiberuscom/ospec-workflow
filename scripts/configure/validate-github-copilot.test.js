"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runConfigure } = require("./cli.js");
const { validate } = require("./validate-github-copilot.js");

const SOURCE = path.join(__dirname, "__fixtures__", "source");

function tmpOut(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-github-copilot-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("validate accepts generated github-copilot output", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });

  const result = validate(out);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("validate rejects prompt target residue and forbidden paths", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  fs.mkdirSync(path.join(out, ".claude-plugin"));
  const promptPath = path.join(out, ".github/prompts/sdd-apply.prompt.md");
  const prompt = fs.readFileSync(promptPath, "utf8");
  fs.writeFileSync(promptPath, prompt.replace("---\n\n", "target: github-copilot\n---\n\n"));

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("forbidden path present: .claude-plugin")));
  assert.ok(result.errors.some((error) => error.includes("must not include target frontmatter")));
});

test("validate requires the skills tree so agent skill references resolve", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  // A clean generated tree ships skills/ — removing it must fail the gate.
  assert.equal(validate(out).errors.length, 0);
  fs.rmSync(path.join(out, "skills"), { recursive: true, force: true });

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("missing required path: skills")));
});

test("validate rejects malformed Copilot hooks", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  fs.writeFileSync(
    path.join(out, ".github/hooks/hooks.json"),
    JSON.stringify({ version: 1, hooks: { sessionStart: [{ type: "command" }] } }, null, 2),
  );

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("must include bash or powershell")));
});

test("validate reports required path type mismatches without throwing", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  fs.rmSync(path.join(out, ".github/agents"), { recursive: true, force: true });
  fs.writeFileSync(path.join(out, ".github/agents"), "not a directory\n");
  fs.rmSync(path.join(out, ".mcp.json"), { force: true });
  fs.mkdirSync(path.join(out, ".mcp.json"));

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("required directory is not a directory: .github/agents")));
  assert.ok(result.errors.some((error) => error.includes("required file is not a file: .mcp.json")));
});

test("validate rejects an agent that references a skill the tree does not ship", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  fs.writeFileSync(
    path.join(out, ".github/agents/ghost.agent.md"),
    "---\nname: ghost\ntarget: github-copilot\n---\n\nRead `skills/ghost/SKILL.md` before work.\n",
  );

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("references missing skill: skills/ghost/SKILL.md")));
});

test("validate rejects a hook that invokes a missing script", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  fs.writeFileSync(
    path.join(out, ".github/hooks/hooks.json"),
    JSON.stringify(
      { version: 1, hooks: { sessionStart: [{ type: "command", bash: 'node "scripts/hooks/ghost.js"' }] } },
      null,
      2,
    ),
  );

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("references missing script: scripts/hooks/ghost.js")));
});

test("validate rejects a malformed .mcp.json (missing servers and missing transport)", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });

  fs.writeFileSync(path.join(out, ".mcp.json"), JSON.stringify({}, null, 2));
  assert.ok(validate(out).errors.some((error) => error.includes("must have an mcpServers object")));

  fs.writeFileSync(path.join(out, ".mcp.json"), JSON.stringify({ mcpServers: { bad: { type: "stdio" } } }, null, 2));
  assert.ok(validate(out).errors.some((error) => error.includes("server bad must define a command")));
});

test("validate rejects residual ${input: placeholder in .mcp.json", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  // Poison the generated .mcp.json with an unresolved input placeholder.
  fs.writeFileSync(
    path.join(out, ".mcp.json"),
    JSON.stringify(
      { mcpServers: { svc: { command: "npx", env: { RESIDUAL_KEY: "${input:RESIDUAL_KEY}" } } } },
      null,
      2,
    ),
  );

  const result = validate(out);

  assert.ok(result.errors.length > 0, "must report at least one error");
  assert.ok(
    result.errors.some((error) => error.includes("${input:")),
    "at least one error must reference the residual placeholder",
  );
});

test("validate rejects case-insensitive vscode residue and unexpected Copilot markdown suffixes", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: SOURCE, target: "github-copilot", outDir: out, validate: false });
  fs.mkdirSync(path.join(out, ".github/agents/VSCodeResidue"));
  fs.writeFileSync(path.join(out, ".github/prompts/unexpected.md"), "---\n---\n");
  fs.writeFileSync(path.join(out, ".github/instructions/unexpected.md"), "---\napplyTo: '**'\n---\n");

  const result = validate(out);

  assert.ok(result.errors.some((error) => error.includes("vscode path residue: .github/agents/VSCodeResidue")));
  assert.ok(result.errors.some((error) => error.includes("must use .prompt.md suffix")));
  assert.ok(result.errors.some((error) => error.includes("must use .instructions.md suffix")));
});
