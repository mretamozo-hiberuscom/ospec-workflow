"use strict";

// IO shell for the multi-target plugin generator. Reads the canonical source
// tree, applies the pure `transform`, writes dist/<target>/, then runs the
// target's own validator as a quality gate. All filesystem/process effects
// live here; the transform itself is pure (scripts/lib/target-transform.js).

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { transform } = require("../lib/target-transform.js");

const PROFILES = {
  claude: require("../lib/target-profiles/claude.js"),
  vscode: require("../lib/target-profiles/vscode.js"),
  "github-copilot": require("../lib/target-profiles/github-copilot.js"),
};

// Source roots that make up a plugin tree. Files are read into the
// { path, content } shape the transform expects; missing roots are skipped.
const SOURCE_ROOTS = [
  ".claude-plugin/plugin.json",
  "hooks/hooks.json",
  ".mcp.json",
  "agents",
  "commands",
  "rules",
  "skills",
];

// --- tree IO ---------------------------------------------------------------

function walk(absDir, relDir, acc) {
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const abs = path.join(absDir, entry.name);
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walk(abs, rel, acc);
    } else if (entry.isFile()) {
      acc.push({ path: rel, content: fs.readFileSync(abs, "utf8") });
    }
  }
}

function loadTree(sourceDir, roots = SOURCE_ROOTS) {
  const files = [];
  for (const root of roots) {
    const abs = path.join(sourceDir, root);
    if (!fs.existsSync(abs)) {
      continue;
    }
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      walk(abs, root, files);
    } else {
      files.push({ path: root, content: fs.readFileSync(abs, "utf8") });
    }
  }
  for (const script of gatherRuntimeScripts(sourceDir)) {
    files.push(script);
  }
  return files;
}

// The hooks invoke scripts/hooks/*.js, which require a subset of scripts/lib/*.js.
// Walk the require graph from the hook entry points so the generated tree ships
// exactly that runtime (self-contained dist) and nothing else — no test files and
// no generator code (target-*, frontmatter, model-resolver, configure), which the
// hooks never require. Static, dependency-free require resolution.
function gatherRuntimeScripts(sourceDir) {
  const hooksDir = path.join(sourceDir, "scripts", "hooks");
  if (!fs.existsSync(hooksDir)) {
    return [];
  }

  const seen = new Set();
  const out = [];
  const queue = [];
  for (const name of fs.readdirSync(hooksDir)) {
    if (name.endsWith(".js") && !name.endsWith(".test.js")) {
      queue.push("scripts/hooks/" + name);
    }
  }

  const requireRe = /require\(\s*["'](\.[^"']+)["']\s*\)/g;
  while (queue.length > 0) {
    const rel = queue.shift();
    if (seen.has(rel)) {
      continue;
    }
    seen.add(rel);
    const abs = path.join(sourceDir, rel);
    if (!fs.existsSync(abs)) {
      continue;
    }
    const content = fs.readFileSync(abs, "utf8");
    out.push({ path: rel, content });

    let match;
    while ((match = requireRe.exec(content)) !== null) {
      let dep = match[1];
      if (!dep.endsWith(".js")) {
        dep += ".js";
      }
      queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), dep)));
    }
  }

  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function writeTree(outDir, { files }) {
  for (const file of files) {
    const abs = path.join(outDir, file.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, file.content);
  }
}

// --- models.yaml (minimal, dependency-free) --------------------------------

// Parses the two-table models.yaml shape (nested maps, scalar and inline-array
// values) without a YAML dependency, mirroring the constrained-subset approach
// used elsewhere in scripts/lib.
function parseModels(text) {
  const root = {};
  const stack = [{ indent: -1, container: root }];

  for (const rawLine of String(text).split(/\r?\n/)) {
    if (!rawLine.trim() || /^\s*#/.test(rawLine)) {
      continue;
    }
    const indent = rawLine.match(/^\s*/)[0].length;
    const match = rawLine.match(/^\s*([^:]+):\s*(.*)$/);
    if (!match) {
      continue;
    }
    const key = match[1].trim();
    const valueRaw = match[2].trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].container;

    if (valueRaw === "") {
      const obj = {};
      parent[key] = obj;
      stack.push({ indent, container: obj });
    } else {
      parent[key] = parseScalarOrArray(valueRaw);
    }
  }

  return root;
}

function parseScalarOrArray(value) {
  if (/^\[.*\]$/.test(value)) {
    const inner = value.slice(1, -1).trim();
    if (!inner) {
      return [];
    }
    return inner.split(",").map((item) => unquote(item.trim()));
  }
  return unquote(value);
}

function unquote(value) {
  return value.replace(/^["']|["']$/g, "");
}

// --- validation gate -------------------------------------------------------

// Run a target's validator as a child process. profile.validate is an argv array
// ([command, ...args]); the {out} placeholder is substituted per element and the
// process is spawned WITHOUT a shell, so a hostile or mistyped output path is
// always a single literal argument and can never be reinterpreted by a shell.
function defaultRunValidator(profile, outDir) {
  const [command, ...rest] = profile.validate;
  const args = rest.map((part) => part.split("{out}").join(outDir));
  // "node" -> the running interpreter, avoiding PATH/PATHEXT resolution surprises.
  const bin = command === "node" ? process.execPath : command;
  const result = spawnSync(bin, args, { shell: false, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
}

// A non-zero exit, a spawn error, or any reported error/warning fails the gate.
function validatorFailed(result) {
  if (result.status !== 0) {
    return true;
  }
  const counts = String(result.stdout).match(/(\d+)\s+errors?,\s*(\d+)\s+warnings?/i);
  if (counts && (Number(counts[1]) > 0 || Number(counts[2]) > 0)) {
    return true;
  }
  return false;
}

// --- orchestration ---------------------------------------------------------

function runConfigure({ sourceDir, target, outDir, validate = true, runValidator = defaultRunValidator }) {
  const profile = PROFILES[target];
  if (!profile) {
    throw new Error(`unknown target: ${target}`);
  }

  const files = loadTree(sourceDir);
  const modelsPath = path.join(sourceDir, "models.yaml");
  const models = fs.existsSync(modelsPath) ? parseModels(fs.readFileSync(modelsPath, "utf8")) : {};

  const output = transform({ files, profile, models });
  writeTree(outDir, output);

  const summary = output.files.map((file) => file.path);
  let exitCode = 0;
  let validation = null;

  if (validate && profile.validate) {
    validation = runValidator(profile, outDir);
    if (validatorFailed(validation)) {
      exitCode = validation.status && validation.status !== 0 ? validation.status : 1;
    }
  }

  return { files: output.files, summary, exitCode, validation };
}

// --- CLI entry -------------------------------------------------------------

function parseArgs(argv) {
  const args = { validate: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target") {
      args.target = argv[++i];
    } else if (arg === "--out") {
      args.out = argv[++i];
    } else if (arg === "--source") {
      args.source = argv[++i];
    } else if (arg === "--no-validate") {
      args.validate = false;
    }
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  if (!args.target || !PROFILES[args.target]) {
    process.stderr.write(`usage: configure --target <${Object.keys(PROFILES).join("|")}> [--out dir] [--source dir] [--no-validate]\n`);
    process.exitCode = 2;
    return;
  }

  const sourceDir = args.source || process.cwd();
  const outDir = args.out || path.join("dist", args.target);
  const result = runConfigure({ sourceDir, target: args.target, outDir, validate: args.validate });

  process.stdout.write(`configure --target ${args.target} -> ${outDir}\n`);
  for (const filePath of result.summary) {
    process.stdout.write(`  + ${filePath}\n`);
  }
  if (result.validation) {
    process.stdout.write(result.validation.stdout || "");
    if (result.validation.stderr) {
      process.stderr.write(result.validation.stderr);
    }
  }
  process.exitCode = result.exitCode;
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = {
  loadTree,
  gatherRuntimeScripts,
  writeTree,
  parseModels,
  defaultRunValidator,
  runConfigure,
  main,
  PROFILES,
  SOURCE_ROOTS,
};
