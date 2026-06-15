"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  SUBCOMMANDS,
  hostBinarySuffix,
  binaryCandidates,
  resolveBinary,
  resolveInvocation,
} = require("./ospec-hooks-launch.js");

const HOOKS_DIR = path.join("plugins", "ospec-workflow", "scripts", "hooks");

test("SUBCOMMANDS covers exactly the five hook events", () => {
  assert.deepEqual(
    [...SUBCOMMANDS].sort(),
    ["pre-compact", "pre-tool-use", "session-start", "stop", "subagent-stop"],
  );
});

test("hostBinarySuffix maps node platform/arch to Go tuples", () => {
  assert.deepEqual(hostBinarySuffix("win32", "x64"), {
    goos: "windows",
    goarch: "amd64",
    ext: ".exe",
  });
  assert.deepEqual(hostBinarySuffix("darwin", "arm64"), {
    goos: "darwin",
    goarch: "arm64",
    ext: "",
  });
  assert.deepEqual(hostBinarySuffix("linux", "x64"), {
    goos: "linux",
    goarch: "amd64",
    ext: "",
  });
});

test("binaryCandidates lists per-platform then release/dist then generic", () => {
  const suffix = { goos: "windows", goarch: "amd64", ext: ".exe" };
  const candidates = binaryCandidates(HOOKS_DIR, suffix);
  assert.deepEqual(candidates, [
    path.join(HOOKS_DIR, "ospec-hooks-windows-amd64.exe"),
    path.join("plugins", "ospec-workflow", "release", "dist", "ospec-hooks-windows-amd64.exe"),
    path.join(HOOKS_DIR, "ospec-hooks.exe"),
  ]);
});

test("resolveBinary returns the first existing candidate", () => {
  const suffix = { goos: "linux", goarch: "amd64", ext: "" };
  const generic = path.join(HOOKS_DIR, "ospec-hooks");
  const exists = (p) => p === generic; // only the generic local binary is present
  assert.equal(resolveBinary(HOOKS_DIR, suffix, exists), generic);
});

test("resolveBinary returns null when no candidate exists", () => {
  const suffix = { goos: "linux", goarch: "amd64", ext: "" };
  assert.equal(resolveBinary(HOOKS_DIR, suffix, () => false), null);
});

test("resolveInvocation runs the native binary when present", () => {
  const suffix = { goos: "linux", goarch: "amd64", ext: "" };
  const platform = path.join(HOOKS_DIR, "ospec-hooks-linux-amd64");
  const invocation = resolveInvocation("stop", HOOKS_DIR, suffix, (p) => p === platform);
  assert.deepEqual(invocation, { command: platform, args: ["stop"] });
});

test("resolveInvocation falls back to node <sub>.js when no binary ships", () => {
  const suffix = { goos: "linux", goarch: "amd64", ext: "" };
  const invocation = resolveInvocation("pre-tool-use", HOOKS_DIR, suffix, () => false);
  assert.deepEqual(invocation, {
    command: process.execPath,
    args: [path.join(HOOKS_DIR, "pre-tool-use.js")],
  });
});
