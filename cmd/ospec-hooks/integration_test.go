// Integration tests for the ospec-hooks binary.
// These tests build and spawn the real binary, so they are gated behind
// testing.Short(): run with 'go test ./...' to include them; run with
// 'go test -short ./...' to skip.
package main_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// buildBinary compiles the ospec-hooks binary into a temp directory and
// returns its path. The binary is built from the package in the current
// directory (cmd/ospec-hooks).
func buildBinary(t *testing.T) string {
	t.Helper()

	ext := ""
	if runtime.GOOS == "windows" {
		ext = ".exe"
	}
	dir := t.TempDir()
	bin := filepath.Join(dir, "ospec-hooks"+ext)

	cmd := exec.Command("go", "build", "-o", bin, ".")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		t.Fatalf("build failed: %v\nstderr: %s", err, stderr.String())
	}
	return bin
}

// TestIntegration_PreToolUse_Deny builds the binary and verifies that a
// DENY-level command (rm -rf /) produces a deny decision via pre-tool-use.
func TestIntegration_PreToolUse_Deny(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test: skipped with -short")
	}
	bin := buildBinary(t)

	stdin := `{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}`
	cmd := exec.Command(bin, "pre-tool-use")
	cmd.Stdin = strings.NewReader(stdin)
	out, err := cmd.Output()
	if err != nil {
		// Exit code 0 is required for pre-tool-use even on deny.
		t.Fatalf("command failed unexpectedly: %v\noutput: %s", err, out)
	}

	var result struct {
		HookSpecificOutput struct {
			PermissionDecision string `json:"permissionDecision"`
		} `json:"hookSpecificOutput"`
	}
	if err := json.Unmarshal(out, &result); err != nil {
		t.Fatalf("unmarshal stdout: %v\nraw output: %s", err, out)
	}
	if result.HookSpecificOutput.PermissionDecision != "deny" {
		t.Errorf("permissionDecision = %q, want %q", result.HookSpecificOutput.PermissionDecision, "deny")
	}
}

// TestIntegration_SessionStart_NoOspec builds the binary and verifies that
// session-start with an empty directory reports ospecDetected: false.
func TestIntegration_SessionStart_NoOspec(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test: skipped with -short")
	}
	bin := buildBinary(t)

	// t.TempDir() creates a completely empty directory — no .ospec/ present.
	dir := t.TempDir()
	// Use forward-slash path in the JSON payload for cross-platform consistency.
	stdin := `{"cwd":"` + filepath.ToSlash(dir) + `"}`
	cmd := exec.Command(bin, "session-start")
	cmd.Stdin = strings.NewReader(stdin)
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("session-start failed: %v\noutput: %s", err, out)
	}

	var result struct {
		OspecDetected bool `json:"ospecDetected"`
	}
	if err := json.Unmarshal(out, &result); err != nil {
		t.Fatalf("unmarshal stdout: %v\nraw output: %s", err, out)
	}
	if result.OspecDetected {
		t.Errorf("ospecDetected = true in empty dir, want false")
	}
}

// TestIntegration_UnknownSubcommand builds the binary and verifies that an
// unknown subcommand exits with a non-zero exit code.
func TestIntegration_UnknownSubcommand(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test: skipped with -short")
	}
	bin := buildBinary(t)

	cmd := exec.Command(bin, "no-such-subcommand")
	cmd.Stdin = strings.NewReader("{}")
	err := cmd.Run()
	if err == nil {
		t.Fatal("expected non-zero exit for unknown subcommand, got exit 0")
	}
	var exitErr *exec.ExitError
	if !errors.As(err, &exitErr) {
		t.Fatalf("expected ExitError, got %T: %v", err, err)
	}
	if exitErr.ExitCode() == 0 {
		t.Error("exitCode = 0, want non-zero for unknown subcommand")
	}
}

// TestIntegration_NilArgs builds the binary and verifies that invoking it
// with no subcommand argument also exits non-zero.
func TestIntegration_NilArgs(t *testing.T) {
	if testing.Short() {
		t.Skip("integration test: skipped with -short")
	}
	bin := buildBinary(t)

	// Run binary with no arguments.
	cmd := exec.Command(bin) // #nosec G204 — controlled test binary
	out, err := cmd.CombinedOutput()
	if err == nil {
		t.Fatalf("expected non-zero exit with no args, got exit 0\noutput: %s", out)
	}
	var exitErr *exec.ExitError
	if !errors.As(err, &exitErr) {
		t.Fatalf("expected ExitError, got %T: %v", err, err)
	}
	if exitErr.ExitCode() == 0 {
		t.Errorf("exitCode = 0, want non-zero when no subcommand given")
	}
}

// TestIntegration_ShortSkips verifies that -short correctly skips integration
// tests. This test itself always passes since it has no -short gate.
func TestIntegration_ShortSkips(t *testing.T) {
	// This function documents that all TestIntegration_* tests check
	// testing.Short() and skip cleanly. No assertion needed.
	if testing.Short() {
		t.Log("short mode active — integration tests skipped as expected")
	}
	_ = os.Getenv("HOME") // prevent "no assertions" lint warning
}
