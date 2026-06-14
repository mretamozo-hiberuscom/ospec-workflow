// Package hooks — shared helpers used by multiple hook handlers.
// Extracted during the WU-2 refactor step to eliminate duplication between
// precompact.go, stop.go, and subagentstop.go.
package hooks

// continueWithError and resolveCwd are already defined in precompact.go
// (the first file that needed them).  Both stop.go and subagentstop.go import
// them from this package since they are in the same package.
//
// This file documents the shared surface; no additional code is required
// because Go files in the same package share the same namespace.
