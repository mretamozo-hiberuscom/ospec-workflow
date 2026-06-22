"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const {
  selectCandidates,
  nextMember,
  hasForwardProgress,
  shouldSkipBatch0,
  resolveCoordinatorRoot,
  applyFailurePolicy,
  recordGateApproval,
  transition,
  parseStatus,
  serializeStatus,
  loadStatus,
} = require("./federation-baseline-orchestrator.js");

async function createTempDir() {
  return await fs.mkdtemp(path.join(os.tmpdir(), "orchestrator-test-"));
}

test("4.1.1 · selectCandidates: brownfield-pending member is selected", async () => {
  const atlas = {
    members: [{ id: "svc-api", path: "svc-api" }],
  };
  const probe = {
    isBrownfield: async (id) => id === "svc-api",
    isInitDone: async (id) => id !== "svc-api",
    logs: [],
    log(msg) { this.logs.push(msg); }
  };

  const candidates = await selectCandidates(atlas, probe);
  assert.deepEqual(candidates, ["svc-api"]);
});

test("4.1.2 · selectCandidates: greenfield member is excluded", async () => {
  const atlas = {
    members: [{ id: "lib-green", path: "lib-green" }],
  };
  const logs = [];
  const probe = {
    isBrownfield: async () => false,
    isInitDone: async () => false,
    log(msg) { logs.push(msg); }
  };

  const candidates = await selectCandidates(atlas, probe);
  assert.deepEqual(candidates, []);
  assert.ok(logs.some(l => l.includes("skipped-greenfield") && l.includes("lib-green")));
});

test("4.1.3 · selectCandidates: already-initialized member is excluded", async () => {
  const atlas = {
    members: [{ id: "svc-init", path: "svc-init" }],
  };
  const logs = [];
  const probe = {
    isBrownfield: async () => true,
    isInitDone: async () => true,
    log(msg) { logs.push(msg); }
  };

  const candidates = await selectCandidates(atlas, probe);
  assert.deepEqual(candidates, []);
  assert.ok(logs.some(l => l.includes("skipped-initialized") && l.includes("svc-init")));
});

test("4.1.4 · selectCandidates: brownfield and initDone never read from marker", async () => {
  const atlas = {
    members: [{ id: "svc-api", path: "svc-api", brownfield: false, initDone: true }],
  };
  const probe = {
    isBrownfield: async (id) => id === "svc-api",
    isInitDone: async (id) => false,
    log() {}
  };

  const candidates = await selectCandidates(atlas, probe);
  assert.deepEqual(candidates, ["svc-api"]);
});

test("4.1.5 · nextMember: multi-member sequential order preserved", () => {
  const state = {
    change: "test",
    unified_gate: { status: "approved" },
    members: [
      { id: "svc-api", target_dir: "api", baseline_status: "pending" },
      { id: "svc-payments", target_dir: "pay", baseline_status: "pending" },
      { id: "svc-reporting", target_dir: "rep", baseline_status: "pending" },
    ]
  };

  const member = nextMember(state, {});
  assert.strictEqual(member.id, "svc-api");
});

test("4.1.6 · nextMember: member with baseline_status: done is skipped", () => {
  const state = {
    change: "test",
    unified_gate: { status: "approved" },
    members: [
      { id: "svc-api", target_dir: "api", baseline_status: "done" },
      { id: "svc-payments", target_dir: "pay", baseline_status: "pending" },
    ]
  };

  const member = nextMember(state, {});
  assert.strictEqual(member.id, "svc-payments");
});

test("4.1.7 · nextMember: member with baseline_status: partial is returned for delegation", () => {
  const state = {
    change: "test",
    unified_gate: { status: "approved" },
    members: [
      { id: "svc-api", target_dir: "api", baseline_status: "partial", domains_pending: ["dom-B"] },
    ]
  };

  const member = nextMember(state, {});
  assert.strictEqual(member.id, "svc-api");
  assert.deepEqual(member.domains_pending, ["dom-B"]);
});

test("4.1.8 · nextMember: pending member with approved gate returned for delegation", () => {
  const state = {
    change: "test",
    unified_gate: { status: "approved" },
    members: [
      { id: "svc-api", target_dir: "api", baseline_status: "pending" },
    ]
  };

  const member = nextMember(state, {});
  assert.strictEqual(member.id, "svc-api");
});

test("4.1.9 · nextMember: pending member with pending gate returns blockedByGate", () => {
  const state = {
    change: "test",
    unified_gate: { status: "pending" },
    members: [
      { id: "svc-api", target_dir: "api", baseline_status: "pending" },
    ]
  };

  const member = nextMember(state, {});
  assert.deepEqual(member, { blockedByGate: true });
});

test("4.1.10 · nextMember: failed member without retryFailed is skipped", () => {
  const state = {
    change: "test",
    unified_gate: { status: "approved" },
    members: [
      { id: "svc-api", target_dir: "api", baseline_status: "failed" },
    ]
  };

  const member = nextMember(state, {});
  assert.strictEqual(member, null);
});

test("4.1.11 · nextMember: failed member with retryFailed is re-included", () => {
  const state = {
    change: "test",
    unified_gate: { status: "approved" },
    members: [
      { id: "svc-api", target_dir: "api", baseline_status: "failed" },
    ]
  };

  const member = nextMember(state, { retryFailed: true });
  assert.strictEqual(member.id, "svc-api");
});

test("4.1.12 · hasForwardProgress returns true if pending count decreased", () => {
  const prev = ["A", "B", "C"];
  const curr = ["B", "C"];
  assert.strictEqual(hasForwardProgress(prev, curr), true);
});

test("4.1.13 · hasForwardProgress returns false if pending count remained same", () => {
  const prev = ["A", "B"];
  const curr = ["A", "B"];
  assert.strictEqual(hasForwardProgress(prev, curr), false);
});

test("4.1.14 · shouldSkipBatch0 returns true if manifest and config exist", async () => {
  const probe = {
    fileExists: async (p) => p.endsWith("manifest.md") || p.endsWith("config.yaml")
  };
  const skip = await shouldSkipBatch0("some/dir", probe);
  assert.strictEqual(skip, true);
});

test("4.1.15 · shouldSkipBatch0 returns false if config is absent", async () => {
  const probe = {
    fileExists: async (p) => p.endsWith("manifest.md") ? true : false
  };
  const skip = await shouldSkipBatch0("some/dir", probe);
  assert.strictEqual(skip, false);
});

test("4.1.16 · shouldSkipBatch0 returns false if both absent", async () => {
  const probe = {
    fileExists: async () => false
  };
  const skip = await shouldSkipBatch0("some/dir", probe);
  assert.strictEqual(skip, false);
});

test("4.1.17 · resolveCoordinatorRoot uses explicit parameter directly", async () => {
  const resolved = await resolveCoordinatorRoot("target/dir", "parent-change", { coordinatorRoot: "explicit/root" });
  assert.strictEqual(resolved, "explicit/root");
});

test("4.1.18 · resolveCoordinatorRoot falls back to upward traversal", async (t) => {
  const tmpDir = await createTempDir();
  try {
    const parentChange = "my-change";
    const changeDir = path.join(tmpDir, "openspec", "changes", parentChange);
    await fs.mkdir(changeDir, { recursive: true });

    const memberDir = path.join(tmpDir, "nested", "member");
    await fs.mkdir(memberDir, { recursive: true });

    const resolved = await resolveCoordinatorRoot(memberDir, parentChange, {});
    assert.strictEqual(path.resolve(resolved), path.resolve(tmpDir));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("4.1.19 · resolveCoordinatorRoot returns blocked when root indeterminate", async () => {
  // Pass non-existent path so traversal fails
  const resolved = await resolveCoordinatorRoot(os.tmpdir(), "ghost-change", {});
  assert.deepEqual(resolved, {
    blocked: true,
    question_gate: {
      question: "Coordinator root is indeterminate. Please specify coordinator_root.",
      options: ["Specify root path"]
    }
  });
});

test("4.1.20 · applyFailurePolicy marks failed, appends warning verbatim, keeps gate", () => {
  const state = {
    change: "test",
    unified_gate: { status: "approved" },
    members: [
      { id: "svc-pay", target_dir: "pay", baseline_status: "pending", warnings: [] }
    ]
  };

  applyFailurePolicy(state, "svc-pay", "domain-core", "write permission denied");

  const member = state.members[0];
  assert.strictEqual(member.baseline_status, "failed");
  assert.ok(member.warnings.some(w => w.includes("svc-pay") && w.includes("domain-core") && w.includes("write permission denied")));
  assert.strictEqual(state.unified_gate.status, "approved");
});

test("4.1.21 · applyFailurePolicy: one member failure doesn't block others", () => {
  const state = {
    change: "test",
    unified_gate: { status: "approved" },
    members: [
      { id: "svc-pay", target_dir: "pay", baseline_status: "pending", warnings: [] },
      { id: "svc-api", target_dir: "api", baseline_status: "pending", warnings: [] }
    ]
  };

  applyFailurePolicy(state, "svc-pay", "domain-core", "failed");

  // Next member is svc-api (svc-pay is failed)
  const member = nextMember(state, {});
  assert.strictEqual(member.id, "svc-api");
});

test("4.1.22 · recordGateApproval updates status atomically", async (t) => {
  const tmpDir = await createTempDir();
  try {
    const statusPath = path.join(tmpDir, "status.yaml");
    const state = {
      change: "test",
      unified_gate: { status: "pending" },
      members: []
    };

    await recordGateApproval(state, statusPath);

    assert.strictEqual(state.unified_gate.status, "approved");
    assert.ok(state.unified_gate.approved_at);
    assert.strictEqual(state.unified_gate.approver, "orchestrator/askQuestions");
    assert.ok(!state.unified_gate.approver.includes("vscode/"), "approver must not contain vscode namespace residue");

    const content = await fs.readFile(statusPath, "utf8");
    assert.match(content, /status: approved/);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("4.1.23 · recordGateApproval approved status skips gate on re-launch", () => {
  const state = {
    change: "test",
    unified_gate: { status: "approved" },
    members: [
      { id: "svc-api", target_dir: "api", baseline_status: "pending" }
    ]
  };

  const member = nextMember(state, {});
  assert.strictEqual(member.id, "svc-api"); // Returns member directly (doesn't return blockedByGate)
});

test("4.1.24 · parseStatus: empty content populates all candidates as pending", () => {
  const atlas = {
    members: [
      { id: "svc-api", path: "api" },
      { id: "svc-pay", path: "pay" }
    ]
  };

  const state = parseStatus("", atlas);

  assert.strictEqual(state.unified_gate.status, "pending");
  assert.equal(state.members.length, 2);
  assert.strictEqual(state.members[0].id, "svc-api");
  assert.strictEqual(state.members[0].baseline_status, "pending");
});

test("4.1.25 · parseStatus: corrupt content is recovered safely", () => {
  const atlas = {
    members: [{ id: "svc-api", path: "api" }]
  };

  const state = parseStatus("corrupt yaml ::: [[]", atlas);
  assert.strictEqual(state.unified_gate.status, "pending");
  assert.strictEqual(state.members[0].id, "svc-api");
});

test("4.1.26 · loadStatus recovers .bak file if target is absent", async (t) => {
  const tmpDir = await createTempDir();
  try {
    const statusPath = path.join(tmpDir, "status.yaml");
    const bakPath = statusPath + ".bak";

    const bakContent = `
change: test
unified_gate:
  status: approved
members: []
`;
    await fs.writeFile(bakPath, bakContent);

    const atlas = { members: [] };
    const state = await loadStatus(statusPath, atlas);

    assert.strictEqual(state.unified_gate.status, "approved");
    assert.equal(await exists(statusPath), true); // restored
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("4.1.27 · parseStatus/serializeStatus round-trip", () => {
  const atlas = {
    members: [{ id: "svc-api", path: "api" }]
  };
  const state = {
    change: "test",
    generated_at: new Date().toISOString(),
    unified_gate: { status: "approved", approved_at: "2026-06-18", approver: "vscode" },
    members: [
      { id: "svc-api", target_dir: "api", baseline_status: "pending", domains_pending: [], domains_done: [], warnings: [] }
    ]
  };

  const yaml = serializeStatus(state);
  const parsed = parseStatus(yaml, atlas);

  assert.strictEqual(parsed.change, state.change);
  assert.strictEqual(parsed.unified_gate.status, state.unified_gate.status);
  assert.strictEqual(parsed.members[0].id, state.members[0].id);
});

test("4.1.28 · parseStatus: missing unified_gate treated as pending", () => {
  const atlas = { members: [] };
  const yaml = "change: test\nmembers: []";

  const state = parseStatus(yaml, atlas);
  assert.strictEqual(state.unified_gate.status, "pending");
});

test("4.1.29 · transition to success completes member atomically", async (t) => {
  const tmpDir = await createTempDir();
  try {
    const statusPath = path.join(tmpDir, "status.yaml");
    const state = {
      change: "test",
      unified_gate: { status: "approved" },
      members: [
        { id: "svc-api", target_dir: "api", baseline_status: "partial", domains_pending: ["dom-A"], domains_done: ["dom-B"] }
      ]
    };

    await transition(state, "svc-api", { status: "success", domains_done: ["dom-A", "dom-B"] }, statusPath);

    const member = state.members[0];
    assert.strictEqual(member.baseline_status, "done");
    assert.deepEqual(member.domains_pending, []);
    assert.deepEqual(member.domains_done.sort(), ["dom-A", "dom-B"].sort());

    const content = await fs.readFile(statusPath, "utf8");
    assert.match(content, /baseline_status: done/);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("4.1.30 · transition to partial with progress updates pending and done domains", async (t) => {
  const tmpDir = await createTempDir();
  try {
    const statusPath = path.join(tmpDir, "status.yaml");
    const state = {
      change: "test",
      unified_gate: { status: "approved" },
      members: [
        { id: "svc-api", target_dir: "api", baseline_status: "partial", domains_pending: ["dom-A", "dom-B"], domains_done: [] },
        { id: "svc-pay", target_dir: "pay", baseline_status: "pending" }
      ]
    };

    // Transition to partial with dom-A done
    await transition(state, "svc-api", { status: "partial", domains_done: ["dom-A"], domains_pending: ["dom-B"] }, statusPath);

    const member = state.members[0];
    assert.strictEqual(member.baseline_status, "partial");
    assert.deepEqual(member.domains_pending, ["dom-B"]);
    assert.deepEqual(member.domains_done, ["dom-A"]);

    // Untouched member checks
    assert.strictEqual(state.members[1].baseline_status, "pending");
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("4.1.31 · transition to partial without progress (stuck-guard) fails member", async (t) => {
  const tmpDir = await createTempDir();
  try {
    const statusPath = path.join(tmpDir, "status.yaml");
    const state = {
      change: "test",
      unified_gate: { status: "approved" },
      members: [
        { id: "svc-api", target_dir: "api", baseline_status: "partial", domains_pending: ["dom-A", "dom-B"], domains_done: [] }
      ]
    };

    // Transition with same pending domains (no progress)
    await transition(state, "svc-api", { status: "partial", domains_done: [], domains_pending: ["dom-A", "dom-B"] }, statusPath);

    const member = state.members[0];
    assert.strictEqual(member.baseline_status, "failed");
    assert.ok(member.warnings.some(w => w.includes("stuck") || w.includes("progress")));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("4.1.32 · transition: already done member is skipped idempotently", async (t) => {
  const tmpDir = await createTempDir();
  try {
    const statusPath = path.join(tmpDir, "status.yaml");
    const state = {
      change: "test",
      unified_gate: { status: "approved" },
      members: [
        { id: "svc-api", target_dir: "api", baseline_status: "done", domains_pending: [], domains_done: ["dom-A"] }
      ]
    };

    // Seed file
    await fs.writeFile(statusPath, serializeStatus(state));

    const originalRename = fs.rename;
    let renameCalled = false;
    fs.rename = async (oldPath, newPath) => {
      renameCalled = true;
      return originalRename(oldPath, newPath);
    };

    try {
      await transition(state, "svc-api", { status: "success", domains_done: ["dom-A"] }, statusPath);
      assert.strictEqual(renameCalled, false); // No write performed
    } finally {
      fs.rename = originalRename;
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

async function exists(target) {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}

test("4.1.33 · Integration: multi-member loop in sibling layout", async (t) => {
  const tmpDir = await createTempDir();
  try {
    const parentChange = "my-change";
    const changeDir = path.join(tmpDir, "coordinator", "openspec", "changes", parentChange);
    await fs.mkdir(changeDir, { recursive: true });

    // Set up members
    const members = ["svc-api", "svc-pay", "svc-rep"];
    for (const m of members) {
      const mDir = path.join(tmpDir, m);
      await fs.mkdir(mDir, { recursive: true });
      // make it brownfield by creating a source file
      await fs.writeFile(path.join(mDir, "index.js"), "console.log('hi');");
    }

    const atlas = {
      members: members.map(m => ({ id: m, path: `../${m}` }))
    };

    // Probe
    const probe = {
      isBrownfield: async (id, p) => true,
      isInitDone: async (id, p) => false,
      log() {}
    };

    const candidates = await selectCandidates(atlas, probe);
    assert.deepEqual(candidates, ["svc-api", "svc-pay", "svc-rep"]);

    const statusPath = path.join(changeDir, "federation-baseline-status.yaml");
    let state = parseStatus("", { members: candidates.map(c => ({ id: c, path: `../${c}` })) });
    state.change = parentChange;

    // Approve gate
    await recordGateApproval(state, statusPath);

    // Loop
    let current;
    while ((current = nextMember(state, {}))) {
      assert.strictEqual(current.baseline_status, "pending");
      // Simulate delegation success
      await transition(state, current.id, { status: "success", domains_done: ["dom-1"] }, statusPath);
    }

    const finalState = await loadStatus(statusPath, { members: [] });
    assert.strictEqual(finalState.unified_gate.status, "approved");
    assert.equal(finalState.members.length, 3);
    assert.ok(finalState.members.every(m => m.baseline_status === "done"));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("4.1.34 · Integration: resume mid-loop", async (t) => {
  const tmpDir = await createTempDir();
  try {
    const parentChange = "my-change";
    const changeDir = path.join(tmpDir, "coordinator", "openspec", "changes", parentChange);
    await fs.mkdir(changeDir, { recursive: true });

    const statusPath = path.join(changeDir, "federation-baseline-status.yaml");

    // Seed pre-existing state: svc-api is done, svc-pay is partial
    const state = {
      change: parentChange,
      unified_gate: { status: "approved", approved_at: "2026-06-18", approver: "vscode" },
      members: [
        { id: "svc-api", target_dir: "../svc-api", baseline_status: "done", domains_pending: [], domains_done: ["dom-A"] },
        { id: "svc-pay", target_dir: "../svc-pay", baseline_status: "partial", domains_pending: ["dom-B", "dom-C"], domains_done: ["dom-A"] }
      ]
    };
    await fs.writeFile(statusPath, serializeStatus(state));

    const atlas = {
      members: [
        { id: "svc-api", path: "../svc-api" },
        { id: "svc-pay", path: "../svc-pay" }
      ]
    };

    const loadedState = await loadStatus(statusPath, atlas);

    const member = nextMember(loadedState, {});
    // Should skip svc-api and return svc-pay
    assert.strictEqual(member.id, "svc-pay");
    assert.deepEqual(member.domains_pending, ["dom-B", "dom-C"]);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("4.1.35 · Integration: one member fails, others continue", async (t) => {
  const tmpDir = await createTempDir();
  try {
    const parentChange = "my-change";
    const changeDir = path.join(tmpDir, "coordinator", "openspec", "changes", parentChange);
    await fs.mkdir(changeDir, { recursive: true });

    const statusPath = path.join(changeDir, "federation-baseline-status.yaml");
    const atlas = {
      members: [
        { id: "svc-api", path: "../svc-api" },
        { id: "svc-pay", path: "../svc-pay" },
        { id: "svc-rep", path: "../svc-rep" }
      ]
    };

    const state = parseStatus("", atlas);
    state.change = parentChange;
    await recordGateApproval(state, statusPath);

    // svc-api succeeds
    let member = nextMember(state, {});
    assert.strictEqual(member.id, "svc-api");
    await transition(state, member.id, { status: "success" }, statusPath);

    // svc-pay fails
    member = nextMember(state, {});
    assert.strictEqual(member.id, "svc-pay");
    applyFailurePolicy(state, member.id, "domain-core", "network timeout");
    await transition(state, member.id, { status: "partial", domains_pending: ["domain-core"], domains_done: [] }, statusPath);

    // svc-rep is next and succeeds
    member = nextMember(state, {});
    assert.strictEqual(member.id, "svc-rep");
    await transition(state, member.id, { status: "success" }, statusPath);

    const finalState = await loadStatus(statusPath, atlas);
    assert.strictEqual(finalState.members.find(m => m.id === "svc-api").baseline_status, "done");
    assert.strictEqual(finalState.members.find(m => m.id === "svc-pay").baseline_status, "failed");
    assert.strictEqual(finalState.members.find(m => m.id === "svc-rep").baseline_status, "done");
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("4.1.36 · Integration: coordinator never writes under member/openspec/specs/", async (t) => {
  const tmpDir = await createTempDir();
  try {
    const parentChange = "my-change";
    const changeDir = path.join(tmpDir, "coordinator", "openspec", "changes", parentChange);
    await fs.mkdir(changeDir, { recursive: true });

    const memberDir = path.join(tmpDir, "svc-api");
    await fs.mkdir(memberDir, { recursive: true });

    const statusPath = path.join(changeDir, "federation-baseline-status.yaml");
    const atlas = {
      members: [{ id: "svc-api", path: "../svc-api" }]
    };

    const state = parseStatus("", atlas);
    state.change = parentChange;
    await recordGateApproval(state, statusPath);

    const member = nextMember(state, {});
    await transition(state, member.id, { status: "success" }, statusPath);

    // Verify member openspec directory has NOT been created or written to by orchestrator
    const memberSpecsDir = path.join(memberDir, "openspec");
    assert.equal(await exists(memberSpecsDir), false);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
