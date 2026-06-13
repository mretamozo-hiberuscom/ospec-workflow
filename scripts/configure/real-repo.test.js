"use strict";

// Real-repo integration: the golden snapshots exercise a reduced fixture tree,
// so these tests generate from the actual repository root to catch issues that
// only surface against the full source (e.g. a skill file with namespace/path
// residue, or a phase agent that references a skill the target drops). No
// external CLI is required, so this runs cross-platform in CI.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runConfigure } = require("./cli.js");
const { validate } = require("./validate-github-copilot.js");
const { validate: validateOpencode } = require("./validate-opencode.js");

const ROOT = path.resolve(__dirname, "..", "..");

function tmpOut(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-real-repo-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function walk(root, relDir = "", acc = []) {
  const absDir = path.join(root, relDir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    return acc;
  }
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walk(root, rel, acc);
    } else if (entry.isFile()) {
      acc.push(rel);
    }
  }
  return acc;
}

test("real repo: all four targets generate non-empty trees", (t) => {
  for (const target of ["claude", "vscode", "github-copilot", "opencode"]) {
    const out = tmpOut(t);
    const result = runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });
    assert.ok(result.files.length > 0, `${target} produced no files`);
  }
});

test("real repo: github-copilot output passes its own validator", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "github-copilot", outDir: out, validate: false });

  const result = validate(out);

  assert.deepEqual(result.errors, [], `validator errors:\n${result.errors.join("\n")}`);
});

test("real repo: opencode output passes its own validator", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "opencode", outDir: out, validate: false });

  const result = validateOpencode(out);

  assert.deepEqual(result.errors, [], `validator errors:\n${result.errors.join("\n")}`);
});

test("real repo: opencode ships every source skill file the agents read by path", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "opencode", outDir: out, validate: false });

  const sourceSkills = walk(ROOT, "skills").filter((rel) => rel.endsWith(".md"));
  assert.ok(sourceSkills.length > 0, "source must contain skills to test");
  for (const rel of sourceSkills) {
    assert.ok(fs.existsSync(path.join(out, rel)), `skill dropped from opencode output: ${rel}`);
  }
});

test("real repo: opencode plugin bridges to scripts that ship in the tree", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "opencode", outDir: out, validate: false });

  const plugin = fs.readFileSync(path.join(out, ".opencode", "plugins", "ospec.js"), "utf8");
  for (const rel of ["scripts/hooks/pre-tool-use.js", "scripts/hooks/session-start.js"]) {
    assert.match(plugin, new RegExp(rel.replace(/\//g, "\\/")), `plugin must bridge ${rel}`);
    assert.ok(fs.existsSync(path.join(out, rel)), `bridged script not shipped: ${rel}`);
  }
});

test("real repo: github-copilot ships every source skill file", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "github-copilot", outDir: out, validate: false });

  const sourceSkills = walk(ROOT, "skills").filter((rel) => rel.endsWith(".md"));
  assert.ok(sourceSkills.length > 0, "source must contain skills to test");
  for (const rel of sourceSkills) {
    assert.ok(fs.existsSync(path.join(out, rel)), `skill dropped from github-copilot output: ${rel}`);
  }
});

test("real repo: every skill a phase agent says to load exists in github-copilot output", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "github-copilot", outDir: out, validate: false });

  const agentDir = path.join(out, ".github", "agents");
  const reference = /`(skills\/[^`]+\.md)`/g;
  let checked = 0;
  for (const file of walk(agentDir)) {
    const text = fs.readFileSync(path.join(agentDir, file), "utf8");
    for (const match of text.matchAll(reference)) {
      const rel = match[1];
      assert.ok(fs.existsSync(path.join(out, rel)), `${file} loads ${rel}, but it is not shipped`);
      checked += 1;
    }
  }
  assert.ok(checked > 0, "expected at least one agent to reference a skill file");
});

test("real repo: no foreign vscode/ namespace survives in the claude tree", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "claude", outDir: out, validate: false });

  for (const file of walk(out)) {
    if (!file.endsWith(".md")) {
      continue;
    }
    const text = fs.readFileSync(path.join(out, file), "utf8");
    assert.doesNotMatch(text, /vscode\//, `vscode/ namespace residue in ${file}`);
  }
});

test("real repo: sdd-clarify agent propagates to all four targets", (t) => {
  const targetPaths = {
    claude: "agents/sdd-clarify.md",
    vscode: "agents/sdd-clarify.agent.md",
    "github-copilot": ".github/agents/sdd-clarify.agent.md",
    opencode: ".opencode/agents/sdd-clarify.md",
  };

  for (const [target, expectedPath] of Object.entries(targetPaths)) {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });
    assert.ok(
      fs.existsSync(path.join(out, expectedPath)),
      `sdd-clarify agent missing from ${target} output at ${expectedPath}`
    );
  }
});

test("real repo: sdd-clarify skill propagates to opencode and github-copilot", (t) => {
  const skillRel = "skills/sdd-clarify/SKILL.md";

  for (const target of ["opencode", "github-copilot"]) {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });
    assert.ok(
      fs.existsSync(path.join(out, skillRel)),
      `sdd-clarify SKILL.md missing from ${target} output`
    );
  }
});

test("real repo: orchestrator conditional clarify references residual_ambiguity", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "vscode", outDir: out, validate: false });

  const orchestratorPath = path.join(out, "agents", "sdd-orchestrator.agent.md");
  assert.ok(
    fs.existsSync(orchestratorPath),
    "sdd-orchestrator.agent.md missing from vscode output"
  );

  const text = fs.readFileSync(orchestratorPath, "utf8");
  assert.match(
    text,
    /residual_ambiguity/,
    "sdd-orchestrator must reference residual_ambiguity for conditional clarify gate"
  );
});

test("real repo: sdd-foundation agent mentions markitdown degradation", (t) => {
  const targetPaths = {
    claude: "agents/sdd-foundation.md",
    vscode: "agents/sdd-foundation.agent.md",
    "github-copilot": ".github/agents/sdd-foundation.agent.md",
    opencode: ".opencode/agents/sdd-foundation.md",
  };

  for (const [target, expectedPath] of Object.entries(targetPaths)) {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });

    assert.ok(
      fs.existsSync(path.join(out, expectedPath)),
      `sdd-foundation agent missing from ${target} output at ${expectedPath}`
    );

    const text = fs.readFileSync(path.join(out, expectedPath), "utf8");
    assert.match(
      text,
      /mcp__microsoft_markitdown__convert_to_markdown/,
      `sdd-foundation agent (${target}) must reference mcp__microsoft_markitdown__convert_to_markdown`
    );
    assert.match(
      text,
      /fallback|degradation/i,
      `sdd-foundation agent (${target}) must contain a fallback/degradation reference`
    );
  }
});

test("real repo: orchestrator brownfield route replaces standalone Baseline Advisory", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "vscode", outDir: out, validate: false });

  const orchestratorPath = path.join(out, "agents", "sdd-orchestrator.agent.md");
  assert.ok(
    fs.existsSync(orchestratorPath),
    "sdd-orchestrator.agent.md missing from vscode output"
  );

  const text = fs.readFileSync(orchestratorPath, "utf8");
  assert.doesNotMatch(
    text,
    /### Baseline Advisory \(optional, brownfield repos only\)/,
    "sdd-orchestrator must NOT contain the standalone Baseline Advisory heading"
  );
  assert.match(
    text,
    /Brownfield Route Handler/,
    "sdd-orchestrator must contain Brownfield Route Handler section"
  );
});
