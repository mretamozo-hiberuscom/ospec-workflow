"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadTree, parseModels, runConfigure } = require("./cli.js");

const FIXTURES = path.join(__dirname, "__fixtures__");
const SOURCE = path.join(FIXTURES, "source");

function tmpOut(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "configure-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function readTree(dir) {
  const out = {};
  const walk = (abs, rel) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const childAbs = path.join(abs, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(childAbs, childRel);
      } else {
        out[childRel] = fs.readFileSync(childAbs, "utf8");
      }
    }
  };
  walk(dir, "");
  return out;
}

// ---------------------------------------------------------------------------
// Requirement: writes a dist/<target>/ tree from a source fixture
// ---------------------------------------------------------------------------

test("runConfigure writes a claude tree to the out dir", (t) => {
  const out = tmpOut(t);
  const result = runConfigure({ sourceDir: SOURCE, target: "claude", outDir: out, validate: false });

  assert.equal(result.exitCode, 0);
  assert.ok(fs.existsSync(path.join(out, "agents/sdd-apply.md")));
  assert.ok(fs.existsSync(path.join(out, "commands/sdd-apply.md")));
  // orchestrator ships as a skill, not a sub-agent
  assert.ok(fs.existsSync(path.join(out, "skills/sdd-orchestrator/SKILL.md")));
  assert.ok(!fs.existsSync(path.join(out, "agents/sdd-orchestrator.md")));
  assert.ok(!fs.existsSync(path.join(out, "rules")));
});

// ---------------------------------------------------------------------------
// Requirement: Source Non-Regression
// ---------------------------------------------------------------------------

test("the source fixture is left byte-for-byte unchanged", (t) => {
  const before = readTree(SOURCE);
  runConfigure({ sourceDir: SOURCE, target: "claude", outDir: tmpOut(t), validate: false });
  runConfigure({ sourceDir: SOURCE, target: "vscode", outDir: tmpOut(t), validate: false });
  const after = readTree(SOURCE);

  assert.deepEqual(after, before);
});

// ---------------------------------------------------------------------------
// Requirement: Validation Gate
// ---------------------------------------------------------------------------

test("--no-validate skips the gate (validator not invoked)", (t) => {
  let called = false;
  const runValidator = () => {
    called = true;
    return { status: 0, stdout: "", stderr: "" };
  };
  const result = runConfigure({
    sourceDir: SOURCE,
    target: "claude",
    outDir: tmpOut(t),
    validate: false,
    runValidator,
  });

  assert.equal(called, false);
  assert.equal(result.exitCode, 0);
});

test("a validator failure yields a non-zero exit without throwing", (t) => {
  const runValidator = () => ({ status: 1, stdout: "1 errors, 0 warnings", stderr: "boom" });
  const result = runConfigure({
    sourceDir: SOURCE,
    target: "claude",
    outDir: tmpOut(t),
    validate: true,
    runValidator,
  });

  assert.notEqual(result.exitCode, 0);
});

test("reported warnings also fail the strict gate even on a zero status", (t) => {
  const runValidator = () => ({ status: 0, stdout: "0 errors, 2 warnings", stderr: "" });
  const result = runConfigure({
    sourceDir: SOURCE,
    target: "claude",
    outDir: tmpOut(t),
    validate: true,
    runValidator,
  });

  assert.notEqual(result.exitCode, 0);
});

test("a clean validator run keeps a zero exit", (t) => {
  const runValidator = () => ({ status: 0, stdout: "Validation passed", stderr: "" });
  const result = runConfigure({
    sourceDir: SOURCE,
    target: "claude",
    outDir: tmpOut(t),
    validate: true,
    runValidator,
  });

  assert.equal(result.exitCode, 0);
});

// ---------------------------------------------------------------------------
// Golden snapshots
// ---------------------------------------------------------------------------

for (const target of ["claude"]) {
  test(`generated ${target} tree matches the committed golden`, (t) => {
    const out = tmpOut(t);
    runConfigure({ sourceDir: SOURCE, target, outDir: out, validate: false });

    const generated = readTree(out);
    const golden = readTree(path.join(FIXTURES, "golden", target));

    assert.deepEqual(Object.keys(generated).sort(), Object.keys(golden).sort());
    for (const file of Object.keys(golden)) {
      assert.equal(generated[file], golden[file], `mismatch in ${file}`);
    }
  });
}

// ---------------------------------------------------------------------------
// loadTree + parseModels
// ---------------------------------------------------------------------------

test("loadTree reads the plugin source roots into {path, content}", () => {
  const files = loadTree(SOURCE);
  const paths = files.map((f) => f.path);

  assert.ok(paths.includes(".claude-plugin/plugin.json"));
  assert.ok(paths.includes("agents/sdd-orchestrator.agent.md"));
  assert.ok(paths.includes("rules/agent-teams.instructions.md"));
  for (const file of files) {
    assert.equal(typeof file.content, "string");
  }
});

test("parseModels reads the two-table shape with scalars and inline arrays", () => {
  const models = parseModels(
    ["agents:", "  sdd-apply: default", "  _default: default", "tiers:", "  default:", "    claude: sonnet", '    vscode: ["A (copilot)", "B (copilot)"]', "    copilot-cli: inherit"].join("\n"),
  );

  assert.equal(models.agents["sdd-apply"], "default");
  assert.equal(models.tiers.default.claude, "sonnet");
  assert.deepEqual(models.tiers.default.vscode, ["A (copilot)", "B (copilot)"]);
  assert.equal(models.tiers.default["copilot-cli"], "inherit");
});
