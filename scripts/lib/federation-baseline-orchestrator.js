"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { writeFileAtomic, recoverOrphanBak } = require("./atomic-write.js");

/**
 * Derives the baseline candidates by probing the filesystem.
 * @param {object} atlas
 * @param {object} probe
 * @returns {Promise<string[]>}
 */
async function selectCandidates(atlas, probe) {
  const candidates = [];
  const members = (atlas && atlas.members) || [];

  for (const member of members) {
    const isBrownfield = await probe.isBrownfield(member.id, member.path);
    const isInitDone = await probe.isInitDone(member.id, member.path);

    if (isBrownfield && !isInitDone) {
      candidates.push(member.id);
    } else if (!isBrownfield) {
      probe.log(`skipped-greenfield: ${member.id}`);
    } else if (isInitDone) {
      probe.log(`skipped-initialized: ${member.id}`);
    }
  }

  return candidates;
}

/**
 * Returns the next member in the iteration queue, or a gate blockage sentinel.
 * @param {object} state
 * @param {object} options
 * @returns {object|null}
 */
function nextMember(state, options = {}) {
  const members = (state && state.members) || [];

  for (const member of members) {
    if (member.baseline_status === "done") {
      continue;
    }

    if (member.baseline_status === "failed" && !options.retryFailed) {
      continue;
    }

    // Gate-block branch: a pending member exists but the unified gate has not
    // been resolved yet — signal the caller to wait before processing it.
    if (state.unified_gate && state.unified_gate.status === "pending" && member.baseline_status === "pending") {
      return { blockedByGate: true };
    }

    // Candidate found: gate is either absent or already resolved.
    return member;
  }

  return null;
}

/**
 * stuck-partial guard: returns true if pending count decreased.
 * @param {string[]} prevPending
 * @param {string[]} currentPending
 * @returns {boolean}
 */
function hasForwardProgress(prevPending, currentPending) {
  const prevCount = Array.isArray(prevPending) ? prevPending.length : 0;
  const currentCount = Array.isArray(currentPending) ? currentPending.length : 0;
  return currentCount < prevCount;
}

/**
 * Returns true if both manifest.md and config.yaml are present in targetDir.
 * @param {string} targetDir
 * @param {object} probe
 * @returns {Promise<boolean>}
 */
async function shouldSkipBatch0(targetDir, probe) {
  const manifestPath = path.join(targetDir, "openspec", "specs", "_baseline", "manifest.md");
  const configPath = path.join(targetDir, "openspec", "specs", "_baseline", "config.yaml");
  const manifestExists = await probe.fileExists(manifestPath);
  const configExists = await probe.fileExists(configPath);
  return manifestExists && configExists;
}

/**
 * Resolves the coordinator root directory.
 * @param {string} targetDir
 * @param {string} parentChange
 * @param {object} options
 * @returns {Promise<string|object>}
 */
async function resolveCoordinatorRoot(targetDir, parentChange, options = {}) {
  if (options.coordinatorRoot) {
    return options.coordinatorRoot;
  }

  let current = path.resolve(targetDir);
  const root = path.parse(current).root;

  while (current && current !== root) {
    const checkPath = path.join(current, "openspec", "changes", parentChange);
    try {
      const stats = await fs.stat(checkPath);
      if (stats.isDirectory()) {
        return current;
      }
    } catch (_) {}

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return {
    blocked: true,
    question_gate: {
      question: "Coordinator root is indeterminate. Please specify coordinator_root.",
      options: ["Specify root path"]
    }
  };
}

/**
 * Marks member status to failed and logs a warning verbatim.
 * @param {object} state
 * @param {string} memberId
 * @param {string} domain
 * @param {string} errorMsg
 */
function applyFailurePolicy(state, memberId, domain, errorMsg) {
  const member = state.members.find((m) => m.id === memberId);
  if (member) {
    member.baseline_status = "failed";
    if (!member.warnings) {
      member.warnings = [];
    }
    member.warnings.push(`Member "${memberId}" failed at domain "${domain}": ${errorMsg}`);
    member.updated_at = new Date().toISOString();
  }
}

/**
 * Records unified gate approval atomically.
 * @param {object} state
 * @param {string} statusPath
 */
async function recordGateApproval(state, statusPath) {
  if (!state.unified_gate) {
    state.unified_gate = {};
  }
  state.unified_gate.status = "approved";
  state.unified_gate.approved_at = new Date().toISOString();
  // Target-agnostic identifier: uses the "orchestrator/<action>" format with no
  // per-target namespace prefix. This value is written into the generated status
  // YAML and consumed by the federation baseline gate to record which agent
  // approved the unified gate.
  state.unified_gate.approver = "orchestrator/askQuestions";
  state.generated_at = new Date().toISOString();

  const yaml = serializeStatus(state);
  await writeFileAtomic(statusPath, yaml);
}

/**
 * Serializes state to YAML format.
 * @param {object} state
 * @returns {string}
 */
function serializeStatus(state) {
  const lines = [];
  lines.push(`change: ${state.change || ""}`);
  lines.push(`generated_at: ${state.generated_at || new Date().toISOString()}`);

  if (state.unified_gate) {
    lines.push("unified_gate:");
    lines.push(`  status: ${state.unified_gate.status || "pending"}`);
    lines.push(`  approved_at: ${state.unified_gate.approved_at || null}`);
    lines.push(`  approver: ${state.unified_gate.approver || null}`);
  }

  lines.push("members:");
  const members = state.members || [];
  for (const member of members) {
    lines.push(`  - id: ${member.id}`);
    lines.push(`    target_dir: ${member.target_dir || ""}`);
    lines.push(`    baseline_status: ${member.baseline_status || "pending"}`);
    lines.push(`    domains_pending: [${(member.domains_pending || []).join(", ")}]`);
    lines.push(`    domains_done: [${(member.domains_done || []).join(", ")}]`);
    lines.push(`    warnings: [${(member.warnings || []).map((w) => `"${w.replace(/"/g, '\\"')}"`).join(", ")}]`);
    lines.push(`    updated_at: ${member.updated_at || new Date().toISOString()}`);
  }

  return lines.join("\n") + "\n";
}

function parseYamlList(val) {
  const match = val.match(/^\[(.*)\]$/);
  if (!match) return [];
  const inner = match[1].trim();
  if (!inner) return [];
  return inner.split(",").map((s) => {
    let str = s.trim();
    if (str.startsWith('"') && str.endsWith('"')) {
      str = str.slice(1, -1);
    }
    return str;
  }).filter(Boolean);
}

/**
 * Parses YAML content to state object, falls back to default candidate mapping.
 * @param {string} yamlContent
 * @param {object} atlas
 * @returns {object}
 */
function parseStatus(yamlContent, atlas) {
  const defaultState = {
    change: "",
    generated_at: new Date().toISOString(),
    unified_gate: { status: "pending", approved_at: null, approver: null },
    members: [],
  };

  if (atlas && atlas.members) {
    defaultState.members = atlas.members.map((m) => ({
      id: m.id,
      target_dir: m.path || "",
      baseline_status: "pending",
      domains_pending: [],
      domains_done: [],
      warnings: [],
      updated_at: new Date().toISOString(),
    }));
  }

  if (!yamlContent || typeof yamlContent !== "string" || !yamlContent.trim()) {
    return defaultState;
  }

  try {
    const lines = yamlContent.split(/\r?\n/);
    const state = {
      change: "",
      generated_at: "",
      unified_gate: { status: "pending", approved_at: null, approver: null },
      members: [],
    };

    let currentMember = null;
    let inUnifiedGate = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const indent = line.match(/^\s*/)[0].length;

      if (indent === 0) {
        inUnifiedGate = false;
        currentMember = null;
        const match = trimmed.match(/^([^:]+):\s*(.*)$/);
        if (match) {
          const key = match[1].trim();
          const val = match[2].trim();
          if (key === "change") {
            state.change = val;
          } else if (key === "generated_at") {
            state.generated_at = val;
          } else if (key === "unified_gate") {
            inUnifiedGate = true;
          }
        }
      } else if (indent === 2 && inUnifiedGate) {
        const match = trimmed.match(/^([^:]+):\s*(.*)$/);
        if (match) {
          const key = match[1].trim();
          const val = match[2].trim();
          if (key === "status") {
            state.unified_gate.status = val;
          } else if (key === "approved_at") {
            state.unified_gate.approved_at = val === "null" ? null : val;
          } else if (key === "approver") {
            state.unified_gate.approver = val === "null" ? null : val;
          }
        }
      } else if (trimmed.startsWith("- ") && indent === 2) {
        inUnifiedGate = false;
        const match = trimmed.slice(2).trim().match(/^([^:]+):\s*(.*)$/);
        if (match && match[1].trim() === "id") {
          currentMember = {
            id: match[2].trim(),
            target_dir: "",
            baseline_status: "pending",
            domains_pending: [],
            domains_done: [],
            warnings: [],
            updated_at: "",
          };
          state.members.push(currentMember);
        }
      } else if (indent === 4 && currentMember) {
        const match = trimmed.match(/^([^:]+):\s*(.*)$/);
        if (match) {
          const key = match[1].trim();
          const val = match[2].trim();
          if (key === "target_dir") {
            currentMember.target_dir = val;
          } else if (key === "baseline_status") {
            currentMember.baseline_status = val;
          } else if (key === "updated_at") {
            currentMember.updated_at = val;
          } else if (key === "domains_pending") {
            currentMember.domains_pending = parseYamlList(val);
          } else if (key === "domains_done") {
            currentMember.domains_done = parseYamlList(val);
          } else if (key === "warnings") {
            currentMember.warnings = parseYamlList(val).map((w) =>
              w.replace(/^"|"$/g, "").replace(/\\"/g, '"'),
            );
          }
        }
      }
    }

    if (!state.change && !state.members.length) {
      return defaultState;
    }

    return state;
  } catch (_) {
    return defaultState;
  }
}

/**
 * Loads and parses state file, resolving orphaned .bak if target is absent.
 * @param {string} statusPath
 * @param {object} atlas
 * @returns {Promise<object>}
 */
async function loadStatus(statusPath, atlas) {
  await recoverOrphanBak(statusPath);
  try {
    const content = await fs.readFile(statusPath, "utf8");
    return parseStatus(content, atlas);
  } catch (error) {
    // Only a missing file means "no status yet". Any other I/O error (EACCES,
    // EBUSY, disk error) must not be swallowed into an empty state — that would
    // silently reset every member to pending and re-run completed baselines.
    if (error.code !== "ENOENT") {
      throw error;
    }
    return parseStatus("", atlas);
  }
}

/**
 * Transitions member state after success or progress check.
 * @param {object} state
 * @param {string} memberId
 * @param {object} result
 * @param {string} statusPath
 */
async function transition(state, memberId, result, statusPath) {
  const member = state.members.find((m) => m.id === memberId);
  if (!member) return;

  if (member.baseline_status === "done") {
    return;
  }

  if (result.status === "success") {
    member.baseline_status = "done";
    member.domains_done = result.domains_done || [];
    member.domains_pending = [];
    member.updated_at = new Date().toISOString();
  } else if (result.status === "partial") {
    const prevPending = member.domains_pending || [];
    const currPending = result.domains_pending || [];

    if (hasForwardProgress(prevPending, currPending)) {
      member.baseline_status = "partial";
      member.domains_pending = currPending;
      member.domains_done = result.domains_done || [];
    } else {
      member.baseline_status = "failed";
      if (!member.warnings) {
        member.warnings = [];
      }
      member.warnings.push(
        `Member "${memberId}" is stuck-partial: made zero forward progress (pending domains remained: [${prevPending.join(", ")}])`,
      );
    }
    member.updated_at = new Date().toISOString();
  }

  state.generated_at = new Date().toISOString();
  const yaml = serializeStatus(state);
  await writeFileAtomic(statusPath, yaml);
}

module.exports = {
  selectCandidates,
  nextMember,
  hasForwardProgress,
  shouldSkipBatch0,
  resolveCoordinatorRoot,
  applyFailurePolicy,
  recordGateApproval,
  serializeStatus,
  parseStatus,
  loadStatus,
  transition,
};
