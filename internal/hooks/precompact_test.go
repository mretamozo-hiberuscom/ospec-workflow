// Tests for the pre-compact handler.
// Cases derived from scripts/hooks/pre-compact.test.js.
package hooks_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/hooks"
)

// ── helpers ────────────────────────────────────────────────────────────────────

type preCompactResult struct {
	Continue      bool   `json:"continue"`
	Status        string `json:"status"`
	Change        string `json:"change"`
	Path          string `json:"path"`
	Reason        string `json:"reason"`
	SystemMessage string `json:"systemMessage"`
}

func runPreCompact(t *testing.T, cwd string) (preCompactResult, int) {
	t.Helper()
	var stdin []byte
	if cwd != "" {
		m := map[string]string{"cwd": cwd}
		stdin, _ = json.Marshal(m)
	} else {
		stdin = []byte("{}")
	}
	out, code := hooks.Dispatch([]string{"pre-compact"}, stdin)
	if out == nil {
		t.Fatalf("pre-compact: nil output (handler not registered?)")
	}
	var r preCompactResult
	if err := json.Unmarshal(out, &r); err != nil {
		t.Fatalf("pre-compact: parse output: %v; raw=%q", err, out)
	}
	return r, code
}

// createPreCompactWorkspace builds a workspace with openspec/changes/.
func createPreCompactWorkspace(t *testing.T) string {
	t.Helper()
	ws := t.TempDir()
	if err := os.MkdirAll(filepath.Join(ws, "openspec", "changes"), 0755); err != nil {
		t.Fatal(err)
	}
	return ws
}

func createPreCompactChange(t *testing.T, ws, name, stateYAML string, artifacts map[string]string) string {
	t.Helper()
	changeDir := filepath.Join(ws, "openspec", "changes", name)
	if err := os.MkdirAll(changeDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(changeDir, "state.yaml"), []byte(stateYAML), 0644); err != nil {
		t.Fatal(err)
	}
	for relPath, content := range artifacts {
		p := filepath.Join(changeDir, relPath)
		if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}
	return changeDir
}

// ── tests ──────────────────────────────────────────────────────────────────────

func TestPreCompact_NoActiveChange(t *testing.T) {
	ws := createPreCompactWorkspace(t)

	out, code := hooks.Dispatch([]string{"pre-compact"}, func() []byte {
		b, _ := json.Marshal(map[string]string{"cwd": ws})
		return b
	}())

	if code != 0 {
		t.Errorf("exitCode: got %d, want 0", code)
	}
	var r preCompactResult
	_ = json.Unmarshal(out, &r)
	if !r.Continue {
		t.Errorf("continue: got false, want true")
	}
}

func TestPreCompact_WritesSessionSummary(t *testing.T) {
	ws := createPreCompactWorkspace(t)
	createPreCompactChange(t, ws, "add-export-csv",
		strings.Join([]string{
			"change:",
			"  name: add-export-csv",
			"  status: active",
			"  current_phase: apply",
			"approvals:",
			"  - id: delivery-strategy-001",
			"    gate: delivery-strategy",
			"    decision: ask-on-risk",
			"",
		}, "\n"),
		map[string]string{
			"proposal.md": "proposal\n",
			"design.md":   "design\n",
			"tasks.md":    "tasks\n",
		},
	)

	r, code := runPreCompact(t, ws)

	if code != 0 {
		t.Errorf("exitCode: got %d, want 0", code)
	}
	if !r.Continue {
		t.Errorf("continue: got false, want true")
	}

	// Session summary must exist.
	summaryPath := filepath.Join(ws, ".ospec", "session", "add-export-csv", "session-summary.md")
	data, err := os.ReadFile(summaryPath)
	if err != nil {
		t.Fatalf("summary file missing: %v", err)
	}
	summary := string(data)
	if !strings.Contains(summary, "add-export-csv") {
		t.Errorf("summary missing change name; got:\n%s", summary)
	}
	if !strings.Contains(summary, "apply") {
		t.Errorf("summary missing phase; got:\n%s", summary)
	}
	// approval should appear
	if !strings.Contains(summary, "delivery-strategy") {
		t.Errorf("summary missing approval; got:\n%s", summary)
	}
}

func TestPreCompact_Idempotent(t *testing.T) {
	ws := createPreCompactWorkspace(t)
	createPreCompactChange(t, ws, "stable",
		"change:\n  name: stable\n  current_phase: tasks\n",
		map[string]string{"design.md": "design\n"},
	)

	r1, _ := runPreCompact(t, ws)
	r2, _ := runPreCompact(t, ws)

	if r1.Continue != true || r2.Continue != true {
		t.Error("continue should be true on both runs")
	}
	// After first "written", second run on unchanged content should be "fresh".
	// Both runs produce continue:true regardless.
}

func TestPreCompact_ErrorContinues(t *testing.T) {
	// Malformed JSON stdin → error path → continue:true, systemMessage set.
	out, code := hooks.Dispatch([]string{"pre-compact"}, []byte("{bad"))
	if code != 0 {
		t.Errorf("exitCode: got %d, want 0", code)
	}
	var r preCompactResult
	if err := json.Unmarshal(out, &r); err != nil {
		t.Fatalf("parse: %v; raw=%q", err, out)
	}
	if !r.Continue {
		t.Errorf("continue: got false, want true")
	}
}

// ── resolveCwd hardening ──────────────────────────────────────────────────────

func TestPreCompact_ResolveCwdHardening(t *testing.T) {
	t.Run("traversal cwd is non-blocking", func(t *testing.T) {
		// (a) traversal path — old resolveCwd did not validate; hardened one falls back to ".".
		// Handler must always emit continue:true and exit 0.
		stdin, _ := json.Marshal(map[string]any{"cwd": "../../etc"})
		out, code := hooks.Dispatch([]string{"pre-compact"}, stdin)
		if code != 0 {
			t.Errorf("exitCode: got %d, want 0", code)
		}
		var r preCompactResult
		if err := json.Unmarshal(out, &r); err != nil {
			t.Fatalf("parse: %v; raw=%q", err, out)
		}
		if !r.Continue {
			t.Errorf("continue: got false, want true for traversal cwd")
		}
	})

	t.Run("valid tmpdir cwd with empty changes workspace", func(t *testing.T) {
		// (b) valid absolute cwd that exists — triangulation anchor.
		ws := createPreCompactWorkspace(t)
		r, code := runPreCompact(t, ws)
		if code != 0 {
			t.Errorf("exitCode: got %d, want 0", code)
		}
		if !r.Continue {
			t.Errorf("continue: got false, want true for valid cwd")
		}
	})

	t.Run("non-existent absolute cwd is non-blocking", func(t *testing.T) {
		// (c) absolute path that does not exist — hardened resolveCwd falls back to ".".
		// Handler must emit continue:true and exit 0.
		nonExistent := t.TempDir() + "/nonexistent"
		stdin, _ := json.Marshal(map[string]any{"cwd": nonExistent})
		out, code := hooks.Dispatch([]string{"pre-compact"}, stdin)
		if code != 0 {
			t.Errorf("exitCode: got %d, want 0", code)
		}
		var r preCompactResult
		if err := json.Unmarshal(out, &r); err != nil {
			t.Fatalf("parse: %v; raw=%q", err, out)
		}
		if !r.Continue {
			t.Errorf("continue: got false, want true for non-existent absolute cwd")
		}
	})
}

// ── triangulation ──────────────────────────────────────────────────────────────

func TestPreCompact_Triangulate(t *testing.T) {
	t.Run("terminal change not selected", func(t *testing.T) {
		ws := createPreCompactWorkspace(t)
		createPreCompactChange(t, ws, "done-change",
			"change:\n  status: completed\n  current_phase: archive\n",
			nil,
		)
		r, _ := runPreCompact(t, ws)
		if !r.Continue {
			t.Error("continue: got false, want true")
		}
		// No summary written for terminal change.
		_, err := os.Stat(filepath.Join(ws, ".ospec", "session", "done-change", "session-summary.md"))
		if err == nil {
			t.Error("summary file should NOT exist for terminal change")
		}
	})

	t.Run("summary contains next action", func(t *testing.T) {
		ws := createPreCompactWorkspace(t)
		createPreCompactChange(t, ws, "test-change",
			"change:\n  name: test-change\n  current_phase: verify\nnext_recommended: sdd-verify\n",
			nil,
		)
		runPreCompact(t, ws)
		data, err := os.ReadFile(filepath.Join(ws, ".ospec", "session", "test-change", "session-summary.md"))
		if err != nil {
			t.Fatalf("summary missing: %v", err)
		}
		if !strings.Contains(string(data), "sdd-verify") {
			t.Errorf("summary missing next action; got:\n%s", data)
		}
	})

	t.Run("summary contains blocking decision", func(t *testing.T) {
		ws := createPreCompactWorkspace(t)
		createPreCompactChange(t, ws, "blocked-change",
			strings.Join([]string{
				"change:",
				"  name: blocked-change",
				"  current_phase: verify",
				"blocking_questions:",
				"  - id: deployment-target",
				"    question: Choose the deployment target",
				"",
			}, "\n"),
			nil,
		)
		runPreCompact(t, ws)
		data, err := os.ReadFile(filepath.Join(ws, ".ospec", "session", "blocked-change", "session-summary.md"))
		if err != nil {
			t.Fatalf("summary missing: %v", err)
		}
		if !strings.Contains(string(data), "Choose the deployment target") {
			t.Errorf("summary missing blocker; got:\n%s", data)
		}
	})
}
