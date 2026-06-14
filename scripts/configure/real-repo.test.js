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
const { matchConditions, parseRoutingTable, validateRouteTable } = require("../lib/route-dispatcher.js");

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

test("real repo: opencode plugin bridges ospec-hooks binary with correct subcommands", (t) => {
  const out = tmpOut(t);
  runConfigure({ sourceDir: ROOT, target: "opencode", outDir: out, validate: false });

  const plugin = fs.readFileSync(path.join(out, ".opencode", "plugins", "ospec.js"), "utf8");
  // The plugin now calls the Go binary via spawnSync — not require() of JS files.
  assert.match(plugin, /spawnSync/, "plugin must use spawnSync to invoke the binary");
  assert.match(plugin, /ospec-hooks/, "plugin must reference the ospec-hooks binary");
  assert.match(plugin, /pre-tool-use/, "plugin must bridge the pre-tool-use subcommand");
  assert.match(plugin, /session-start/, "plugin must bridge the session-start subcommand");
  // JS hook scripts still ship in the tree (fallback). Verify they are present.
  for (const rel of ["scripts/hooks/pre-tool-use.js", "scripts/hooks/session-start.js"]) {
    assert.ok(fs.existsSync(path.join(out, rel)), `fallback script not shipped: ${rel}`);
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

test("real repo: review-risk agent propagates to all four targets", (t) => {
  const targetPaths = {
    claude: "agents/review-risk.md",
    vscode: "agents/review-risk.agent.md",
    "github-copilot": ".github/agents/review-risk.agent.md",
    opencode: ".opencode/agents/review-risk.md",
  };

  for (const [target, expectedPath] of Object.entries(targetPaths)) {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });
    assert.ok(
      fs.existsSync(path.join(out, expectedPath)),
      `review-risk agent missing from ${target} output at ${expectedPath}`
    );
  }
});

test("real repo: review-readability agent propagates to all four targets", (t) => {
  const targetPaths = {
    claude: "agents/review-readability.md",
    vscode: "agents/review-readability.agent.md",
    "github-copilot": ".github/agents/review-readability.agent.md",
    opencode: ".opencode/agents/review-readability.md",
  };

  for (const [target, expectedPath] of Object.entries(targetPaths)) {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });
    assert.ok(
      fs.existsSync(path.join(out, expectedPath)),
      `review-readability agent missing from ${target} output at ${expectedPath}`
    );
  }
});

test("real repo: review-reliability agent propagates to all four targets", (t) => {
  const targetPaths = {
    claude: "agents/review-reliability.md",
    vscode: "agents/review-reliability.agent.md",
    "github-copilot": ".github/agents/review-reliability.agent.md",
    opencode: ".opencode/agents/review-reliability.md",
  };

  for (const [target, expectedPath] of Object.entries(targetPaths)) {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });
    assert.ok(
      fs.existsSync(path.join(out, expectedPath)),
      `review-reliability agent missing from ${target} output at ${expectedPath}`
    );
  }
});

test("real repo: review-resilience agent propagates to all four targets", (t) => {
  const targetPaths = {
    claude: "agents/review-resilience.md",
    vscode: "agents/review-resilience.agent.md",
    "github-copilot": ".github/agents/review-resilience.agent.md",
    opencode: ".opencode/agents/review-resilience.md",
  };

  for (const [target, expectedPath] of Object.entries(targetPaths)) {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });
    assert.ok(
      fs.existsSync(path.join(out, expectedPath)),
      `review-resilience agent missing from ${target} output at ${expectedPath}`
    );
  }
});

test("real repo: all four review-* skills propagate to opencode and github-copilot", (t) => {
  const skillRels = [
    "skills/review-risk/SKILL.md",
    "skills/review-readability/SKILL.md",
    "skills/review-reliability/SKILL.md",
    "skills/review-resilience/SKILL.md",
  ];

  for (const target of ["opencode", "github-copilot"]) {
    const out = tmpOut(t);
    runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false });
    for (const skillRel of skillRels) {
      assert.ok(
        fs.existsSync(path.join(out, skillRel)),
        `${skillRel} missing from ${target} output`
      );
    }
  }
});

// openspec/ is gitignored, so config.yaml ships only in a local working tree, not
// in a fresh CI checkout. This guard self-skips the live-config assertion when the
// file is absent (matching e2e.test.js); the matchConditions/parser behavior itself
// is covered deterministically by the route-dispatcher unit tests.
const LIVE_CONFIG_PATH = path.join(ROOT, "openspec", "config.yaml");
const HAS_LIVE_CONFIG = fs.existsSync(LIVE_CONFIG_PATH);

test(
  "real repo: live brownfield routing entry matches brownfield ctx and rejects baselined ctx",
  { skip: HAS_LIVE_CONFIG ? false : "openspec/config.yaml not present (gitignored; local dev only)" },
  () => {
  // (a) read live config.yaml from repo root
  const content = fs.readFileSync(LIVE_CONFIG_PATH, "utf8");

  // (b) parse and find brownfield entry
  const parsed = parseRoutingTable(content);
  const brownfield = parsed.find((r) => r.name === "brownfield");
  assert.ok(brownfield, "brownfield route must exist in openspec/config.yaml");

  const { conditions } = brownfield;

  // (c) match mode is 'any'
  assert.equal(conditions.match, "any", "brownfield conditions.match must be 'any'");

  // (d) baseline.status is JS array ['pending', 'partial']
  assert.deepEqual(
    conditions["baseline.status"],
    ["pending", "partial"],
    "brownfield conditions baseline.status must deep-equal ['pending','partial']",
  );

  // (e) specs_empty_with_code is native boolean true
  assert.equal(conditions.specs_empty_with_code, true);
  assert.equal(typeof conditions.specs_empty_with_code, "boolean", "specs_empty_with_code must be a boolean");

  // (f) code_without_specs is native boolean true
  assert.equal(conditions.code_without_specs, true);
  assert.equal(typeof conditions.code_without_specs, "boolean", "code_without_specs must be a boolean");

  // (g) matchConditions with pending baseline returns true
  assert.equal(
    matchConditions(conditions, { "baseline.status": "pending" }),
    true,
    "brownfield conditions must match a pending-baseline ctx",
  );

  // (h) matchConditions with done baseline and all signals false returns false
  assert.equal(
    matchConditions(conditions, {
      "baseline.status": "done",
      specs_empty_with_code: false,
      code_without_specs: false,
    }),
    false,
    "brownfield conditions must NOT match a done-baseline ctx with all signals false",
  );

  // (i) validateRouteTable on the full parsed table returns valid: true
  const tableResult = validateRouteTable(parsed);
  assert.equal(
    tableResult.valid,
    true,
    `routing table must be valid after C1 update; errors: ${JSON.stringify(tableResult.errors)}`,
  );
});
