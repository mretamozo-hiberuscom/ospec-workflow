// Tests for the stop handler.
// Cases derived from scripts/hooks/stop.test.js.
package hooks_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/hooks"
	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/store"
)

// ── helpers ────────────────────────────────────────────────────────────────────

type stopResult struct {
	Continue      bool   `json:"continue"`
	Status        string `json:"status"`
	Path          string `json:"path"`
	ActiveChange  *string `json:"activeChange"`
	SystemMessage string `json:"systemMessage"`
}

func runStopHook(t *testing.T, stdin []byte) (stopResult, int) {
	t.Helper()
	out, code := hooks.Dispatch([]string{"stop"}, stdin)
	if out == nil {
		t.Fatalf("stop: nil output (handler not registered?)")
	}
	var r stopResult
	if err := json.Unmarshal(out, &r); err != nil {
		t.Fatalf("stop: parse output: %v; raw=%q", err, out)
	}
	return r, code
}

func stopInput(cwd, timestamp, sessionID string) []byte {
	m := map[string]any{}
	if cwd != "" {
		m["cwd"] = cwd
	}
	if timestamp != "" {
		m["timestamp"] = timestamp
	}
	if sessionID != "" {
		m["sessionId"] = sessionID
	}
	b, _ := json.Marshal(m)
	return b
}

func readLatestSession(t *testing.T, ws string) string {
	t.Helper()
	p := filepath.Join(ws, filepath.FromSlash(store.LatestRelPath))
	data, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("latest session file missing: %v", err)
	}
	return string(data)
}

func createStopWorkspace(t *testing.T) string {
	t.Helper()
	ws := t.TempDir()
	if err := os.MkdirAll(filepath.Join(ws, "openspec", "changes"), 0755); err != nil {
		t.Fatal(err)
	}
	return ws
}

func createStopChange(t *testing.T, ws, name, stateYAML string, artifacts map[string]string) {
	t.Helper()
	changeDir := filepath.Join(ws, "openspec", "changes", name)
	if err := os.MkdirAll(changeDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(changeDir, "state.yaml"), []byte(stateYAML), 0644); err != nil {
		t.Fatal(err)
	}
	for rel, content := range artifacts {
		p := filepath.Join(changeDir, rel)
		if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}
}

// ── tests ──────────────────────────────────────────────────────────────────────

func TestStop_WritesLatestTrace(t *testing.T) {
	ws := createStopWorkspace(t)
	createStopChange(t, ws, "add-export-csv",
		strings.Join([]string{
			"change:",
			"  name: add-export-csv",
			"  status: blocked",
			"  current_phase: apply",
			"next_recommended: sdd-apply",
			"",
		}, "\n"),
		map[string]string{
			"specs/export/spec.md": "spec\n",
			"design.md":            "design\n",
			"tasks.md":             "tasks\n",
		},
	)

	// Pre-create a session summary so detailed summary field resolves.
	summaryDir := filepath.Join(ws, ".ospec", "session", "add-export-csv")
	if err := os.MkdirAll(summaryDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(summaryDir, "session-summary.md"), []byte("# Session Summary\n"), 0644); err != nil {
		t.Fatal(err)
	}

	r, code := runStopHook(t, stopInput(ws, "2026-06-10T10:40:00+02:00", "session-123"))

	if code != 0 {
		t.Errorf("exitCode: got %d, want 0", code)
	}
	if !r.Continue {
		t.Errorf("continue: got false, want true")
	}

	latest := readLatestSession(t, ws)
	if !strings.Contains(latest, "2026-06-10T10:40:00+02:00") {
		t.Errorf("timestamp missing from latest; got:\n%s", latest)
	}
	if !strings.Contains(latest, "session-123") {
		t.Errorf("sessionId missing from latest; got:\n%s", latest)
	}
	if !strings.Contains(latest, "add-export-csv") {
		t.Errorf("change name missing from latest; got:\n%s", latest)
	}
	if !strings.Contains(latest, "apply") {
		t.Errorf("phase missing from latest; got:\n%s", latest)
	}
	if !strings.Contains(latest, "blocked") {
		t.Errorf("status missing from latest; got:\n%s", latest)
	}
	if !strings.Contains(latest, "sdd-apply") {
		t.Errorf("next action missing from latest; got:\n%s", latest)
	}
	// Detailed summary path should appear.
	if !strings.Contains(latest, "session-summary.md") {
		t.Errorf("detailed summary path missing from latest; got:\n%s", latest)
	}
}

func TestStop_NoActiveChange(t *testing.T) {
	ws := createStopWorkspace(t)

	r, code := runStopHook(t, stopInput(ws, "", "session-empty"))

	if code != 0 {
		t.Errorf("exitCode: got %d, want 0", code)
	}
	if r.ActiveChange != nil {
		t.Errorf("activeChange: got %q, want nil", *r.ActiveChange)
	}

	latest := readLatestSession(t, ws)
	if !strings.Contains(latest, "- Active change: `None`") {
		t.Errorf("active change section wrong; got:\n%s", latest)
	}
	if !strings.Contains(latest, "Start a new session when more work is needed") {
		t.Errorf("fallback next action missing; got:\n%s", latest)
	}
}

func TestStop_ReplacesLatestOnEachCall(t *testing.T) {
	ws := createStopWorkspace(t)

	runStopHook(t, stopInput(ws, "2026-06-10T10:40:00+02:00", "first"))
	runStopHook(t, stopInput(ws, "2026-06-10T10:45:00+02:00", "second"))

	latest := readLatestSession(t, ws)
	if strings.Contains(latest, "first") {
		t.Errorf("old session id 'first' should not appear in latest; got:\n%s", latest)
	}
	if !strings.Contains(latest, "second") {
		t.Errorf("session id 'second' missing; got:\n%s", latest)
	}
	if !strings.Contains(latest, "10:45:00") {
		t.Errorf("new timestamp missing; got:\n%s", latest)
	}
}

func TestStop_IgnoresTerminalChange(t *testing.T) {
	ws := createStopWorkspace(t)
	createStopChange(t, ws, "already-done",
		"status: completed\ncurrent_phase: archive\n",
		nil,
	)

	r, _ := runStopHook(t, stopInput(ws, "", ""))
	if r.ActiveChange != nil {
		t.Errorf("activeChange: got %q, want nil (terminal changes ignored)", *r.ActiveChange)
	}
}

func TestStop_ErrorContinues(t *testing.T) {
	out, code := hooks.Dispatch([]string{"stop"}, []byte("{bad"))
	if code != 0 {
		t.Errorf("exitCode: got %d, want 0", code)
	}
	var r stopResult
	if err := json.Unmarshal(out, &r); err != nil {
		t.Fatalf("parse: %v; raw=%q", err, out)
	}
	if !r.Continue {
		t.Errorf("continue: got false, want true")
	}
}

// ── triangulation ──────────────────────────────────────────────────────────────

func TestStop_Triangulate(t *testing.T) {
	t.Run("session_id fallback from session_id field", func(t *testing.T) {
		ws := createStopWorkspace(t)
		stdin, _ := json.Marshal(map[string]any{
			"cwd":        ws,
			"session_id": "alt-id-field",
		})
		runStopHook(t, stdin)
		latest := readLatestSession(t, ws)
		if !strings.Contains(latest, "alt-id-field") {
			t.Errorf("session_id (underscore) not found in latest; got:\n%s", latest)
		}
	})

	t.Run("no session field uses unknown", func(t *testing.T) {
		ws := createStopWorkspace(t)
		runStopHook(t, stopInput(ws, "", ""))
		latest := readLatestSession(t, ws)
		if !strings.Contains(latest, "unknown") {
			t.Errorf("'unknown' fallback missing; got:\n%s", latest)
		}
	})

	t.Run("toPortablePath uses forward slashes in detailed summary", func(t *testing.T) {
		ws := createStopWorkspace(t)
		createStopChange(t, ws, "slash-change",
			"change:\n  name: slash-change\n  current_phase: apply\n",
			nil,
		)
		// create session summary
		summaryDir := filepath.Join(ws, ".ospec", "session", "slash-change")
		_ = os.MkdirAll(summaryDir, 0755)
		_ = os.WriteFile(filepath.Join(summaryDir, "session-summary.md"), []byte("# x\n"), 0644)
		runStopHook(t, stopInput(ws, "", ""))
		latest := readLatestSession(t, ws)
		// The path should use forward slashes regardless of OS.
		if strings.Contains(latest, `\`) {
			t.Errorf("backslash in detailed summary path; got:\n%s", latest)
		}
	})
}
