"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { transform } = require("./target-transform.js");
const claude = require("./target-profiles/claude.js");
const vscode = require("./target-profiles/vscode.js");
const githubCopilot = require("./target-profiles/github-copilot.js");
const { parse, getField } = require("./frontmatter.js");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MODELS = {
  agents: {
    "sdd-apply": "default",
    "sdd-orchestrator": "premium",
    _default: "default",
  },
  tiers: {
    premium: { claude: "opus", vscode: ["Claude Opus 4.8 (copilot)"] },
    default: { claude: "sonnet", vscode: ["Claude Sonnet 4.6 (copilot)"] },
    cheap: { claude: "haiku" },
  },
};

function makeSource() {
  return [
    {
      path: ".claude-plugin/plugin.json",
      content: JSON.stringify(
        {
          name: "ospec-workflow",
          description: "desc",
          version: "2.1.0",
          author: { name: "x" },
          agents: "agents/",
          commands: "commands/",
          skills: "skills/",
          rules: "rules/",
          hooks: "hooks/hooks.json",
          mcpServers: ".mcp.json",
        },
        null,
        2,
      ),
    },
    {
      path: "hooks/hooks.json",
      content: JSON.stringify(
        {
          hooks: {
            SessionStart: [{ type: "command", command: "node x.js" }],
            PreToolUse: [{ type: "command", command: "node y.js", timeout: 5 }],
          },
        },
        null,
        2,
      ),
    },
    {
      path: "agents/sdd-apply.agent.md",
      content:
        "---\n" +
        "name: sdd-apply\n" +
        "tools: ['read', 'search', 'edit', 'vscode/askQuestions']\n" +
        "user-invocable: false\n" +
        "target: vscode\n" +
        "---\n" +
        "\n" +
        "Use `read` and `search` to explore. Ask via `vscode/askQuestions`. Any phase agent runs read-only.\n",
    },
    {
      path: "agents/sdd-orchestrator.agent.md",
      content:
        "---\n" +
        "name: sdd-orchestrator\n" +
        "description: Coordinates SDD.\n" +
        "tools: ['read']\n" +
        "target: vscode\n" +
        "---\n" +
        "\n" +
        "Orchestrator body. Delegate to each phase agent. Ask via `vscode/askQuestions`.\n",
    },
    {
      path: "commands/sdd-apply.prompt.md",
      content:
        "---\n" +
        "name: sdd-apply\n" +
        "description: desc\n" +
        "agent: sdd-orchestrator\n" +
        "target: vscode\n" +
        "---\n" +
        "\n" +
        "Run apply for ${input:changeName} now. Also ${input}.\n",
    },
    {
      path: "rules/sdd-openspec.instructions.md",
      content: "---\n" + "name: rules\n" + "---\n" + "\n" + "ALWAYS use OpenSpec. For blocking decisions use `vscode/askQuestions`.\n",
    },
    {
      path: "skills/foo/SKILL.md",
      content: "---\nname: foo\ndescription: d\n---\n\nbody. Ask via `vscode/askQuestions` when blocked.\n",
    },
  ];
}

function find(out, path) {
  return out.files.find((f) => f.path === path);
}

// ---------------------------------------------------------------------------
// Requirement: Pure Transform Contract
// ---------------------------------------------------------------------------

test("transform is idempotent: same inputs yield equal outputs", () => {
  const a = transform({ files: makeSource(), profile: claude, models: MODELS });
  const b = transform({ files: makeSource(), profile: claude, models: MODELS });
  assert.deepEqual(a, b);
});

test("transform does not mutate the input files collection", () => {
  const input = makeSource();
  const before = JSON.stringify(input);
  transform({ files: input, profile: claude, models: MODELS });
  assert.equal(JSON.stringify(input), before);
});

test("transform returns a new collection object", () => {
  const input = makeSource();
  const out = transform({ files: input, profile: claude, models: MODELS });
  assert.notEqual(out.files, input);
});

// ---------------------------------------------------------------------------
// Requirement: Manifest Reshaping
// ---------------------------------------------------------------------------

test("claude manifest omits string component paths and drops rules", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const m = JSON.parse(find(out, ".claude-plugin/plugin.json").content);
  for (const k of ["agents", "commands", "skills", "hooks", "mcpServers", "rules"]) {
    assert.ok(!(k in m), `manifest must not contain ${k}`);
  }
  assert.equal(m.name, "ospec-workflow");
  assert.equal(m.version, "2.1.0");
});

test("vscode (identity) leaves the manifest untouched", () => {
  const out = transform({ files: makeSource(), profile: vscode, models: MODELS });
  const m = JSON.parse(find(out, ".claude-plugin/plugin.json").content);
  assert.equal(m.agents, "agents/");
  assert.equal(m.rules, "rules/");
});

// ---------------------------------------------------------------------------
// Requirement: Hooks Shape Transformation
// ---------------------------------------------------------------------------

test("claude nests flat event entries preserving type/command/timeout", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const h = JSON.parse(find(out, "hooks/hooks.json").content);
  assert.deepEqual(h.hooks.SessionStart, [{ hooks: [{ type: "command", command: "node x.js" }] }]);
  assert.deepEqual(h.hooks.PreToolUse, [{ hooks: [{ type: "command", command: "node y.js", timeout: 5 }] }]);
});

test("vscode leaves hooks flat (identity)", () => {
  const out = transform({ files: makeSource(), profile: vscode, models: MODELS });
  const h = JSON.parse(find(out, "hooks/hooks.json").content);
  assert.deepEqual(h.hooks.SessionStart, [{ type: "command", command: "node x.js" }]);
});

// ---------------------------------------------------------------------------
// Requirement: File Extension Mapping
// ---------------------------------------------------------------------------

test("claude renames agent and command files to .md", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  assert.ok(find(out, "agents/sdd-apply.md"));
  assert.ok(find(out, "commands/sdd-apply.md"));
  assert.ok(!find(out, "agents/sdd-apply.agent.md"));
  assert.ok(!find(out, "commands/sdd-apply.prompt.md"));
});

test("vscode preserves the agent and command suffixes (identity)", () => {
  const out = transform({ files: makeSource(), profile: vscode, models: MODELS });
  assert.ok(find(out, "agents/sdd-apply.agent.md"));
  assert.ok(find(out, "commands/sdd-apply.prompt.md"));
});

// ---------------------------------------------------------------------------
// Requirement: Tool-Name Substitution (context-aware)
// ---------------------------------------------------------------------------

test("claude substitutes tool names in the frontmatter grant, expanding one-to-many", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const fm = parse(find(out, "agents/sdd-apply.md").content).frontmatter;
  assert.deepEqual(getField(fm, "tools").value, ["Read", "Grep", "Glob", "Edit", "AskUserQuestion"]);
});

test("claude substitutes backticked tool references in prose, primary for one-to-many", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const agent = find(out, "agents/sdd-apply.md").content;
  assert.match(agent, /Use `Read` and `Grep` to explore/);
  assert.match(agent, /Ask via `AskUserQuestion`/);
});

test("claude does NOT corrupt the generic word 'agent' in bare prose", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const agent = find(out, "agents/sdd-apply.md").content;
  assert.match(agent, /Any phase agent runs read-only/); // unchanged concept word
  assert.doesNotMatch(agent, /phase Agent/);
});

test("no vscode/ namespaced strings remain anywhere in a claude tree (agents, commands, skills, inlined rules)", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const all = out.files.map((f) => f.content).join("\n");
  assert.doesNotMatch(all, /vscode\//);
});

test("skills passthrough content is tool-substituted (CRITICAL-1 guard)", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const skill = find(out, "skills/foo/SKILL.md").content;
  assert.match(skill, /Ask via `AskUserQuestion`/);
  assert.doesNotMatch(skill, /vscode\//);
});

// ---------------------------------------------------------------------------
// Requirement: Command Variable and Routing Transformation
// ---------------------------------------------------------------------------

test("claude rewrites ${input} to $ARGUMENTS", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const cmd = find(out, "commands/sdd-apply.md").content;
  assert.match(cmd, /\$ARGUMENTS/);
  assert.doesNotMatch(cmd, /\$\{input\}/);
});

test("claude rewrites ${input:name} to $name and declares it in the arguments frontmatter", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const cmd = find(out, "commands/sdd-apply.md").content;
  assert.match(cmd, /\$changeName/);
  assert.doesNotMatch(cmd, /\$\{input:changeName\}/);
  const fm = parse(cmd).frontmatter;
  // `arguments` is what actually enables `$name` substitution in Claude
  assert.equal(getField(fm, "arguments").value, "changeName");
  // argument-hint is the autocomplete hint (plain name, not a YAML array)
  assert.equal(getField(fm, "argument-hint").value, "changeName");
});

test("claude drops the inert agent:/context: command routing keys", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const fm = parse(find(out, "commands/sdd-apply.md").content).frontmatter;
  assert.equal(getField(fm, "agent"), null);
  assert.equal(getField(fm, "context"), null);
});

// ---------------------------------------------------------------------------
// Requirement: Frontmatter Key Stripping
// ---------------------------------------------------------------------------

test("claude strips target, user-invocable from agent frontmatter", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const fm = parse(find(out, "agents/sdd-apply.md").content).frontmatter;
  assert.equal(getField(fm, "target"), null);
  assert.equal(getField(fm, "user-invocable"), null);
});

// ---------------------------------------------------------------------------
// Requirement: Orchestrator Delivery (claude → skill)
// ---------------------------------------------------------------------------

test("claude emits the orchestrator as a skill, not a sub-agent", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  assert.ok(find(out, "skills/sdd-orchestrator/SKILL.md"), "orchestrator skill must exist");
  assert.ok(!find(out, "agents/sdd-orchestrator.md"), "orchestrator must NOT be a sub-agent");
});

test("the orchestrator skill carries name + description and the inlined rules, with no model/tools/target", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const skill = find(out, "skills/sdd-orchestrator/SKILL.md").content;
  const fm = parse(skill).frontmatter;
  assert.equal(getField(fm, "name").value, "sdd-orchestrator");
  assert.ok(getField(fm, "description"));
  assert.equal(getField(fm, "model"), null);
  assert.equal(getField(fm, "tools"), null);
  assert.equal(getField(fm, "target"), null);
  assert.match(skill, /ALWAYS use OpenSpec/); // inlined rule
  assert.doesNotMatch(skill, /vscode\//); // inlined rule was tool-substituted
});

// ---------------------------------------------------------------------------
// Requirement: Rules Inlining
// ---------------------------------------------------------------------------

test("claude drops the rules dir (content inlined into the orchestrator skill)", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  assert.ok(!out.files.some((f) => f.path.startsWith("rules/")));
});

test("vscode keeps the rules directory (identity transform)", () => {
  const out = transform({ files: makeSource(), profile: vscode, models: MODELS });
  assert.ok(out.files.some((f) => f.path === "rules/sdd-openspec.instructions.md"));
});

// ---------------------------------------------------------------------------
// Model resolution
// ---------------------------------------------------------------------------

test("claude adds the resolved model alias to phase agents", () => {
  const out = transform({ files: makeSource(), profile: claude, models: MODELS });
  const fm = parse(find(out, "agents/sdd-apply.md").content).frontmatter;
  assert.equal(getField(fm, "model").value, "sonnet");
});

test("vscode does not inject a model key (source intentionally omits it)", () => {
  const out = transform({ files: makeSource(), profile: vscode, models: MODELS });
  const fm = parse(find(out, "agents/sdd-apply.agent.md").content).frontmatter;
  assert.equal(getField(fm, "model"), null);
});

// ---------------------------------------------------------------------------
// Target: github-copilot (.github/ layout)
// ---------------------------------------------------------------------------

test("github-copilot emits agents under .github/agents with target: github-copilot", () => {
  const out = transform({ files: makeSource(), profile: githubCopilot, models: MODELS });
  const agent = find(out, ".github/agents/sdd-apply.agent.md");
  assert.ok(agent, "agent must be under .github/agents/");
  assert.ok(!find(out, "agents/sdd-apply.agent.md"));
  assert.ok(!find(out, "agents/sdd-apply.md"));
  const fm = parse(agent.content).frontmatter;
  assert.equal(getField(fm, "target").value, "github-copilot");
  assert.equal(getField(fm, "model"), null); // no model injection
});

test("github-copilot keeps valid tool aliases and drops vscode/askQuestions from the grant", () => {
  const out = transform({ files: makeSource(), profile: githubCopilot, models: MODELS });
  const fm = parse(find(out, ".github/agents/sdd-apply.agent.md").content).frontmatter;
  assert.deepEqual(getField(fm, "tools").value, ["read", "search", "edit"]);
});

test("github-copilot orchestrator stays a normal agent (not a skill)", () => {
  const out = transform({ files: makeSource(), profile: githubCopilot, models: MODELS });
  assert.ok(find(out, ".github/agents/sdd-orchestrator.agent.md"));
  assert.ok(!find(out, "skills/sdd-orchestrator/SKILL.md"));
});

test("github-copilot emits prompts under .github/prompts, keeping ${input:..} and agent routing", () => {
  const out = transform({ files: makeSource(), profile: githubCopilot, models: MODELS });
  const cmd = find(out, ".github/prompts/sdd-apply.prompt.md");
  assert.ok(cmd, "command must be under .github/prompts/");
  assert.match(cmd.content, /\$\{input:changeName\}/); // prompt-file variable syntax preserved
  const fm = parse(cmd.content).frontmatter;
  assert.equal(getField(fm, "agent").value, "sdd-orchestrator"); // routing kept (valid here)
  assert.equal(getField(fm, "target"), null); // not a prompt-file field
});

test("github-copilot turns rules into .github/instructions/*.instructions.md with applyTo", () => {
  const out = transform({ files: makeSource(), profile: githubCopilot, models: MODELS });
  const instr = find(out, ".github/instructions/sdd-openspec.instructions.md");
  assert.ok(instr, "rule must become an instruction file");
  assert.ok(!out.files.some((f) => f.path.startsWith("rules/")));
  const fm = parse(instr.content).frontmatter;
  assert.equal(getField(fm, "applyTo").value, "**");
  assert.match(instr.content, /ALWAYS use OpenSpec/);
});

test("github-copilot drops plugin-only artifacts (manifest, hooks, skills)", () => {
  const out = transform({ files: makeSource(), profile: githubCopilot, models: MODELS });
  assert.ok(!find(out, ".claude-plugin/plugin.json"));
  assert.ok(!find(out, "hooks/hooks.json"));
  assert.ok(!out.files.some((f) => f.path.startsWith("skills/")));
});

test("no vscode/ namespaced strings remain anywhere in a github-copilot tree", () => {
  const out = transform({ files: makeSource(), profile: githubCopilot, models: MODELS });
  const all = out.files.map((f) => f.content).join("\n");
  assert.doesNotMatch(all, /vscode\//);
});

test("github-copilot does not mutate the input collection", () => {
  const input = makeSource();
  const before = JSON.stringify(input);
  transform({ files: input, profile: githubCopilot, models: MODELS });
  assert.equal(JSON.stringify(input), before);
});
