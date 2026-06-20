"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

function compareStrings(left, right) {
  if (left < right) {
    return -1;
  }

  return left > right ? 1 : 0;
}

function toPortablePath(filePath) {
  return filePath.split(path.sep).join("/");
}

async function collectFiles(root, include) {
  const files = [];

  async function visit(directory) {
    let entries;

    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") {
        return;
      }

      throw error;
    }

    entries.sort((left, right) => compareStrings(left.name, right.name));

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile() && include(absolutePath)) {
        files.push(absolutePath);
      }
    }
  }

  await visit(root);
  return files;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

  if (!match) {
    return { attributes: {}, body: content };
  }

  const attributes = {};

  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");

    if (separator === -1 || /^\s/.test(line)) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");

    attributes[key] = value;
  }

  return {
    attributes,
    body: content.slice(match[0].length),
  };
}

function extractTriggers(description, fallback) {
  const match = description.match(/\bTrigger:\s*(.+)$/i);

  if (!match) {
    return [fallback];
  }

  const triggers = match[1]
    .split(/[,;]/)
    .map((trigger) => trigger.trim())
    .filter(Boolean);

  return triggers.length > 0 ? triggers : [fallback];
}

function extractCapabilities(raw) {
  if (typeof raw !== "string") {
    return [];
  }
  let str = raw.trim();
  if (str.startsWith("[")) {
    str = str.slice(1);
  }
  if (str.endsWith("]")) {
    str = str.slice(0, -1);
  }
  return str
    .split(/[,;]/)
    .map((cap) => cap.trim())
    .filter(Boolean);
}

function extractCompactRules(skillMarkdown) {
  const { body } = parseFrontmatter(skillMarkdown);
  const lines = body.split(/\r?\n/);
  const rules = [];
  let inRulesSection = false;

  function addRule(value) {
    const rule = value
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .trim();

    if (rule && !rules.includes(rule)) {
      rules.push(rule);
    }
  }

  for (const line of lines) {
    const heading = line.match(/^#{2,4}\s+(.+?)\s*$/);

    if (heading) {
      inRulesSection =
        /\b(?:(?:hard|critical|core|decision)\s+)?(?:rules|patterns|constraints|gates)\b/i.test(
          heading[1],
        );
      continue;
    }

    if (!inRulesSection) {
      continue;
    }

    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      addRule(line);
      continue;
    }

    if (/^\|.+\|$/.test(line) && !/^\|[\s:|-]+\|$/.test(line)) {
      const columns = line
        .split("|")
        .slice(1, -1)
        .map((column) => column.trim());
      const label = columns[0]?.toLowerCase();

      if (columns.length >= 2 && label !== "rule" && label !== "gate") {
        addRule(`${columns[0]}: ${columns.slice(1).join(" - ")}`);
      }
    }
  }

  if (rules.length === 0) {
    for (const line of lines) {
      if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
        addRule(line);
      }

      if (rules.length >= 15) {
        break;
      }
    }
  }

  return rules.slice(0, 15);
}

function shouldIncludeSkill(relativePath) {
  const skillDirectory = relativePath.split("/")[1] || "";

  return (
    relativePath.startsWith("skills/") &&
    relativePath.endsWith("/SKILL.md") &&
    skillDirectory !== "_shared" &&
    skillDirectory !== "skill-registry" &&
    !skillDirectory.startsWith("sdd-")
  );
}

async function discoverSkills(root) {
  const absoluteRoot = path.resolve(root);
  const skillsRoot = path.join(absoluteRoot, "skills");
  const rulesRoot = path.join(absoluteRoot, "rules");
  const [skillFiles, ruleFiles] = await Promise.all([
    collectFiles(skillsRoot, (filePath) => {
      const relativePath = toPortablePath(path.relative(skillsRoot, filePath));

      return (
        path.basename(filePath) === "SKILL.md" ||
        (relativePath.startsWith("_shared/") && filePath.endsWith(".md"))
      );
    }),
    collectFiles(rulesRoot, (filePath) => filePath.endsWith(".md")),
  ]);
  const fingerprintPaths = [...skillFiles, ...ruleFiles]
    .map((absolutePath) => ({
      absolutePath,
      relativePath: toPortablePath(path.relative(absoluteRoot, absolutePath)),
    }))
    .sort((left, right) =>
      compareStrings(left.relativePath, right.relativePath),
    );
  const skills = [];

  for (const file of fingerprintPaths.filter(({ relativePath }) =>
    shouldIncludeSkill(relativePath),
  )) {
    let markdown = "";
    try {
      markdown = await fs.readFile(file.absolutePath, "utf8");
    } catch (error) {
      console.error(`Warning: failed to read skill file ${file.absolutePath}: ${error.message}`);
      continue;
    }
    const { attributes } = parseFrontmatter(markdown);
    const fallbackName = path.basename(path.dirname(file.absolutePath));
    const id = attributes.name || fallbackName;

    skills.push({
      id,
      path: file.relativePath,
      triggers: extractTriggers(attributes.description || "", id),
      compact_rules: extractCompactRules(markdown),
      capabilities: extractCapabilities(attributes.capabilities || ""),
    });
  }

  skills.sort((left, right) => compareStrings(left.id, right.id));

  return { fingerprintPaths, skills };
}

function normalizeFingerprintPath(entry) {
  if (typeof entry === "string") {
    return {
      absolutePath: path.resolve(entry),
      relativePath: toPortablePath(entry),
    };
  }

  if (
    entry &&
    typeof entry.absolutePath === "string" &&
    typeof entry.relativePath === "string"
  ) {
    return {
      absolutePath: path.resolve(entry.absolutePath),
      relativePath: toPortablePath(entry.relativePath),
    };
  }

  throw new TypeError(
    "Fingerprint paths must be file paths or { absolutePath, relativePath } objects.",
  );
}

async function calculateFingerprint(paths) {
  const files = paths
    .map(normalizeFingerprintPath)
    .sort((left, right) =>
      compareStrings(left.relativePath, right.relativePath),
    );
  const hash = crypto.createHash("sha256");

  for (const file of files) {
    hash.update(file.relativePath);
    hash.update("\0");
    let content = "";
    try {
      content = await fs.readFile(file.absolutePath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    hash.update(content);
    hash.update("\0");
  }

  return `sha256:${hash.digest("hex")}`;
}

async function readRegistryCache(cachePath) {
  try {
    return JSON.parse(await fs.readFile(cachePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
}

async function writeRegistryCache(cachePath, data) {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });

  const temporaryPath = `${cachePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let writeFailed = false;

  try {
    await fs.writeFile(
      temporaryPath,
      `${JSON.stringify(data, null, 2)}\n`,
      "utf8",
    );
    await fs.rename(temporaryPath, cachePath);
  } catch (error) {
    writeFailed = true;
    throw error;
  } finally {
    try {
      await fs.rm(temporaryPath, { force: true });
    } catch (error) {
      if (!writeFailed && error.code !== "ENOENT") {
        throw error;
      } else if (error.code !== "ENOENT") {
        console.error(`Warning: failed to remove temporary cache file ${temporaryPath}: ${error.message}`);
      }
    }
  }
}

module.exports = {
  calculateFingerprint,
  collectFiles,
  discoverSkills,
  extractCapabilities,
  extractCompactRules,
  readRegistryCache,
  writeRegistryCache,
};
