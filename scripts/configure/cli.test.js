"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadTree, gatherRuntimeScripts, parseModels, runConfigure, defaultRunValidator } = require("./cli.js");

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

test("github-copilot validation uses the profile-level validator command", (t) => {
  const out = tmpOut(t);
  let validatorProfile = null;
  let validatorOut = null;
  const runValidator = (profile, outDir) => {
    validatorProfile = profile;
    validatorOut = outDir;
    return { status: 0, stdout: "0 errors, 0 warnings\n", stderr: "" };
  };

  const result = runConfigure({
    sourceDir: SOURCE,
    target: "github-copilot",
    outDir: out,
    validate: true,
    runValidator,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(validatorOut, out);
  assert.ok(
    validatorProfile.validate.some((part) => part.includes("validate-github-copilot.js")),
    "profile.validate argv must reference the github-copilot validator",
  );
});

test("defaultRunValidator runs the validator without a shell, passing {out} as one literal argv element", () => {
  // Without a shell, metacharacters in the output path cannot be reinterpreted:
  // the path arrives as a single argv element, proving the injection vector is gone.
  const profile = {
    validate: [process.execPath, "-e", "process.stdout.write(JSON.stringify(process.argv))", "{out}"],
  };
  const hostileOut = "a b & echo pwned > owned.txt";

  const result = defaultRunValidator(profile, hostileOut);
  const argv = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(argv[argv.length - 1], hostileOut);
});

// ---------------------------------------------------------------------------
// Golden snapshots
// ---------------------------------------------------------------------------

for (const target of ["claude", "github-copilot"]) {
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

test("gatherRuntimeScripts walks hook requires, excluding tests and generator code", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "scripts/hooks"), { recursive: true });
  fs.mkdirSync(path.join(dir, "scripts/lib"), { recursive: true });
  fs.writeFileSync(path.join(dir, "scripts/hooks/start.js"), 'require("../lib/dep.js");\n');
  fs.writeFileSync(path.join(dir, "scripts/hooks/start.test.js"), '// test, must not ship\n');
  fs.writeFileSync(path.join(dir, "scripts/lib/dep.js"), "module.exports = {};\n");
  fs.writeFileSync(path.join(dir, "scripts/lib/generator-only.js"), "// not required by hooks\n");

  const paths = gatherRuntimeScripts(dir).map((f) => f.path);

  assert.ok(paths.includes("scripts/hooks/start.js"));
  assert.ok(paths.includes("scripts/lib/dep.js"));
  assert.ok(!paths.includes("scripts/hooks/start.test.js"), "test files must be excluded");
  assert.ok(!paths.includes("scripts/lib/generator-only.js"), "unreferenced (generator) files excluded");
});

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
