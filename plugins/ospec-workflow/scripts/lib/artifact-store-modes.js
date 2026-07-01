"use strict";

// Leaf module: the canonical set of artifact-store backend modes.
// Kept dependency-free so both artifact-store.js and ospec-state.js can require
// it without forming an import cycle.

const DEFAULT_ARTIFACT_STORE_MODE = "openspec";
const ARTIFACT_STORE_MODES = ["openspec", "workspace-federated"];

module.exports = {
  ARTIFACT_STORE_MODES,
  DEFAULT_ARTIFACT_STORE_MODE,
};
