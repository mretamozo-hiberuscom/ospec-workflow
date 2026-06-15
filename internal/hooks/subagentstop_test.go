// Tests for the subagent-stop handler.
// Cases derived from scripts/hooks/subagent-stop.test.js.
package hooks_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/hooks"
	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/store"
)

// ── helpers ────────────────────────────────────────────────────────────────────

type subagentStopResult struct {
	Continue      bool   `json:"continue"`
	SystemMessage string `json:"systemMessage"`
}

func runSubagentStop(t *testing.T, stdin []byte) (subagentStopResult, int) {
	t.Helper()
	out, code := hooks.Dispatch([]string{"subagent-stop"}, stdin)
	if out == nil {
		t.Fatalf("subagent-stop: nil output (handler not registered?)")
	}
	var r subagentStopResult
	if err := json.Unmarshal(out, &r); err != nil {
		t.Fatalf("subagent-stop: parse output: %v; raw=%q", err, out)
	}
	return r, code
}

func createSubagentWorkspace(t *testing.T) string {
	t.Helper()
	return t.TempDir()
}

func readSubagentEvents(t *testing.T, ws string) []map[string]any {
	t.Helper()
	evPath := filepath.Join(ws, filepath.FromSlash(store.RuntimeEventsRelPath))
	data, err := os.ReadFile(evPath)
	if err != nil {
		t.Fatalf("events file missing: %v", err)
	}
	var events []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		if line == "" {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(line), &m); err != nil {
			t.Fatalf("parse event line: %v; line=%q", err, line)
		}
		events = append(events, m)
	}
	return events
}

// ── isDegradedResolution ──────────────────────────────────────────────────────

func TestSubagentStop_IsDegraded(t *testing.T) {
	cases := []struct {
		resolution string
		wantDeg    bool
	}{
		{"fallback-registry", true},
		{"fallback-path", true},
		{"none", true},
		{"injected", false},
		{"", false},
	}

	for _, tc := range cases {
		t.Run(tc.resolution, func(t *testing.T) {
			got := hooks.IsDegradedResolution(tc.resolution)
			if got != tc.wantDeg {
				t.Errorf("IsDegradedResolution(%q) = %v, want %v", tc.resolution, got, tc.wantDeg)
			}
		})
	}
}

// ── findStructuredResolution ──────────────────────────────────────────────────

func TestSubagentStop_FindStructuredResolution(t *testing.T) {
	t.Run("direct field", func(t *testing.T) {
		v := map[string]any{"skill_resolution": "fallback-registry"}
		got := hooks.FindStructuredResolution(v)
		if got != "fallback-registry" {
			t.Errorf("got %q, want %q", got, "fallback-registry")
		}
	})

	t.Run("nested object", func(t *testing.T) {
		v := map[string]any{
			"status": "partial",
			"inner":  map[string]any{"skill_resolution": "fallback-path"},
		}
		got := hooks.FindStructuredResolution(v)
		if got != "fallback-path" {
			t.Errorf("got %q, want %q", got, "fallback-path")
		}
	})

	t.Run("nested in array", func(t *testing.T) {
		v := []any{
			map[string]any{"skill_resolution": "none"},
		}
		got := hooks.FindStructuredResolution(v)
		if got != "none" {
			t.Errorf("got %q, want %q", got, "none")
		}
	})

	t.Run("healthy resolution not treated as degraded", func(t *testing.T) {
		v := map[string]any{"skill_resolution": "injected"}
		got := hooks.FindStructuredResolution(v)
		if got != "injected" {
			t.Errorf("got %q, want %q", got, "injected")
		}
	})

	t.Run("missing field returns empty", func(t *testing.T) {
		v := map[string]any{"status": "ok"}
		got := hooks.FindStructuredResolution(v)
		if got != "" {
			t.Errorf("got %q, want empty", got)
		}
	})
}

// ── degraded resolution recorded ─────────────────────────────────────────────

func TestSubagentStop_RecordsDegradedResolution(t *testing.T) {
	ws := createSubagentWorkspace(t)
	stdin, _ := json.Marshal(map[string]any{
		"cwd":        ws,
		"timestamp":  "2026-06-10T10:35:00+02:00",
		"agent_type": "sdd-apply",
		"result": map[string]any{
			"status":          "success",
			"skill_resolution": "fallback-registry",
		},
	})

	r, code := runSubagentStop(t, stdin)

	if code != 0 {
		t.Errorf("exitCode: got %d, want 0", code)
	}
	if !r.Continue {
		t.Errorf("continue: got false, want true")
	}
	if r.SystemMessage == "" {
		t.Error("systemMessage: empty, want non-empty for degraded resolution")
	}

	events := readSubagentEvents(t, ws)
	if len(events) != 1 {
		t.Fatalf("events: got %d, want 1", len(events))
	}
	ev := events[0]
	if ev["timestamp"] != "2026-06-10T10:35:00+02:00" {
		t.Errorf("timestamp: got %v", ev["timestamp"])
	}
	if ev["agent"] != "sdd-apply" {
		t.Errorf("agent: got %v", ev["agent"])
	}
	if ev["skill_resolution"] != "fallback-registry" {
		t.Errorf("skill_resolution: got %v", ev["skill_resolution"])
	}
	if ev["action"] != "refresh-registry-next-delegation" {
		t.Errorf("action: got %v", ev["action"])
	}
}

func TestSubagentStop_HealthyResolutionSkipped(t *testing.T) {
	ws := createSubagentWorkspace(t)
	stdin, _ := json.Marshal(map[string]any{
		"cwd":        ws,
		"agent_type": "sdd-design",
		"result":     `{"skill_resolution":"injected"}`,
	})

	r, _ := runSubagentStop(t, stdin)

	if !r.Continue {
		t.Errorf("continue: got false, want true")
	}
	// No events file should be created.
	evPath := filepath.Join(ws, filepath.FromSlash(store.RuntimeEventsRelPath))
	if _, err := os.Stat(evPath); err == nil {
		t.Error("events file should NOT exist for healthy resolution")
	}
	// No .ospec dir at all.
	if _, err := os.Stat(filepath.Join(ws, ".ospec")); err == nil {
		t.Error(".ospec dir should NOT exist for healthy resolution")
	}
}

func TestSubagentStop_NullResolutionSkipped(t *testing.T) {
	ws := createSubagentWorkspace(t)
	stdin, _ := json.Marshal(map[string]any{
		"cwd":        ws,
		"agent_type": "Plan",
	})

	r, _ := runSubagentStop(t, stdin)

	if !r.Continue {
		t.Errorf("continue: got false, want true")
	}
	if r.SystemMessage != "" {
		t.Errorf("systemMessage: got %q, want empty for unavailable resolution", r.SystemMessage)
	}
}

func TestSubagentStop_AppendsMultipleEvents(t *testing.T) {
	ws := createSubagentWorkspace(t)

	for _, tc := range []struct {
		agent      string
		resolution string
		ts         string
	}{
		{"sdd-apply", "none", "2026-06-10T08:35:00.000Z"},
		{"sdd-spec", "fallback-path", "2026-06-10T08:36:00.000Z"},
	} {
		stdin, _ := json.Marshal(map[string]any{
			"cwd":        ws,
			"agent_type": tc.agent,
			"timestamp":  tc.ts,
			"result":     map[string]any{"skill_resolution": tc.resolution},
		})
		runSubagentStop(t, stdin)
	}

	events := readSubagentEvents(t, ws)
	if len(events) != 2 {
		t.Fatalf("events: got %d, want 2", len(events))
	}
	if events[0]["skill_resolution"] != "none" {
		t.Errorf("event[0].skill_resolution: got %v", events[0]["skill_resolution"])
	}
	if events[1]["skill_resolution"] != "fallback-path" {
		t.Errorf("event[1].skill_resolution: got %v", events[1]["skill_resolution"])
	}
}

func TestSubagentStop_TranscriptPath(t *testing.T) {
	ws := createSubagentWorkspace(t)
	transcriptPath := filepath.Join(ws, "transcript.jsonl")
	lines := []string{
		`{"role":"system","content":"Agents must report skill_resolution: injected."}`,
		`{"role":"assistant","result":{"status":"success","skill_resolution":"fallback-registry"}}`,
	}
	if err := os.WriteFile(transcriptPath, []byte(strings.Join(lines, "\n")+"\n"), 0644); err != nil {
		t.Fatal(err)
	}

	stdin, _ := json.Marshal(map[string]any{
		"cwd":             ws,
		"agent_type":      "sdd-verify",
		"timestamp":       "2026-06-10T08:35:00.000Z",
		"transcript_path": transcriptPath,
	})

	r, _ := runSubagentStop(t, stdin)
	if !r.Continue {
		t.Error("continue: got false, want true")
	}
	events := readSubagentEvents(t, ws)
	if len(events) != 1 {
		t.Fatalf("events: got %d, want 1", len(events))
	}
	if events[0]["skill_resolution"] != "fallback-registry" {
		t.Errorf("skill_resolution: got %v", events[0]["skill_resolution"])
	}
}

// ── transcript_path traversal hardening ──────────────────────────────────────

func TestSubagentStop_TranscriptPathTraversal(t *testing.T) {
	// Build a controlled directory structure shared across sub-tests:
	//   root/
	//     workspace/            ← test CWD for case (a)
	//     secret/
	//       transcript.jsonl    ← real degraded-resolution payload ("fallback-registry")
	//
	// Using the SAME file in both sub-tests proves the gate — not file absence —
	// is the cause of the non-read in case (a).
	root := t.TempDir()
	workspace := filepath.Join(root, "workspace")
	secretDir := filepath.Join(root, "secret")
	if err := os.MkdirAll(workspace, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(secretDir, 0755); err != nil {
		t.Fatal(err)
	}
	secretTranscript := filepath.Join(secretDir, "transcript.jsonl")
	if err := os.WriteFile(secretTranscript, []byte(`{"skill_resolution":"fallback-registry"}`+"\n"), 0644); err != nil {
		t.Fatal(err)
	}

	t.Run("traversal transcript_path rejected even when file exists (discriminating)", func(t *testing.T) {
		// Change CWD to workspace so "../secret/transcript.jsonl" resolves to the real
		// degraded-resolution file written above. The file EXISTS at the traversal target.
		//
		// With the gate: validatePath rejects the relative path (filepath.IsAbs = false)
		// → no readFilePermissive call → resolution = "" → no event emitted.
		//
		// RED proof (if validatePath gate were removed from findResolutionInTranscript):
		//   readFilePermissive("../secret/transcript.jsonl") would succeed (file exists),
		//   findResolutionInJsonLines would return "fallback-registry",
		//   IsDegradedResolution → event written → evPath exists → assertion below FAILS.
		//   This confirms the gate, not file absence, is the cause.
		chdirT(t, workspace)

		traversalPath := filepath.Join("..", "secret", "transcript.jsonl")
		stdin, _ := json.Marshal(map[string]any{
			"cwd":             workspace,
			"agent_type":      "sdd-apply",
			"transcript_path": traversalPath,
			// No inline result — the only resolution source is the transcript file.
		})

		r, code := runSubagentStop(t, stdin)

		if code != 0 {
			t.Errorf("exitCode: got %d, want 0", code)
		}
		if !r.Continue {
			t.Errorf("continue: got false, want true")
		}
		// Gate blocked the read — no event must be emitted.
		// Removing validatePath from findResolutionInTranscript would cause this to FAIL.
		evPath := filepath.Join(workspace, filepath.FromSlash(store.RuntimeEventsRelPath))
		if _, err := os.Stat(evPath); err == nil {
			t.Error("events file must NOT exist: validatePath gate must block traversal before readFilePermissive")
		}
	})

	t.Run("same file via absolute path allows event emission (triangulation)", func(t *testing.T) {
		// The SAME file referenced by its absolute clean path: gate passes, content is
		// read, event is emitted. This proves the gate — not file absence — was the cause
		// in the sub-test above.
		ws := t.TempDir()
		stdin, _ := json.Marshal(map[string]any{
			"cwd":             ws,
			"agent_type":      "sdd-apply",
			"transcript_path": secretTranscript, // absolute path to the same secret transcript
			// No inline result — resolution must come from the transcript file.
		})

		r, code := runSubagentStop(t, stdin)

		if code != 0 {
			t.Errorf("exitCode: got %d, want 0", code)
		}
		if !r.Continue {
			t.Errorf("continue: got false, want true")
		}
		// Gate passes; event must be recorded from the file content.
		events := readSubagentEvents(t, ws)
		if len(events) != 1 {
			t.Fatalf("events: got %d, want 1 (absolute path to same file must be read and event emitted)", len(events))
		}
		if events[0]["skill_resolution"] != "fallback-registry" {
			t.Errorf("skill_resolution: got %v, want fallback-registry", events[0]["skill_resolution"])
		}
	})
}

// ── triangulation ──────────────────────────────────────────────────────────────

// chdirT changes the working directory to dir for the duration of the test and
// restores it on cleanup. Equivalent to testing.T.Chdir but compatible with the
// module's declared Go 1.23 minimum (T.Chdir requires Go 1.24). The restore is
// registered after t.TempDir's removal cleanup, so it runs first (LIFO) and the
// temp dir is no longer the working directory when it is removed.
func chdirT(t *testing.T, dir string) {
	t.Helper()
	orig, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("chdir %s: %v", dir, err)
	}
	t.Cleanup(func() { _ = os.Chdir(orig) })
}

// ── traversal-cwd regression guard ────────────────────────────────────────────

func TestSubagentStop_TraversalCwdNonBlocking(t *testing.T) {
	// Isolate with t.Chdir so the "." fallback writes .ospec/ into a temp dir,
	// not into the package source directory (internal/hooks/).
	// Without this isolation the traversal-cwd test contaminates the source tree.
	tmpDir := t.TempDir()
	chdirT(t, tmpDir)

	stdin, _ := json.Marshal(map[string]any{
		"cwd":        "../../etc",
		"agent_type": "sdd-apply",
		"result":     map[string]any{"skill_resolution": "fallback-registry"},
	})

	r, code := runSubagentStop(t, stdin)

	if code != 0 {
		t.Errorf("exitCode: got %d, want 0", code)
	}
	if !r.Continue {
		t.Errorf("continue: got false, want true")
	}
	// Negative: the store must NOT have written under the literal traversal path.
	traversalOspec := filepath.Join("../../etc", ".ospec")
	if _, err := os.Stat(traversalOspec); err == nil {
		t.Error(".ospec dir must NOT be created at traversal path ../../etc")
	}
	// Positive: the "." fallback must have written .ospec/ into the hermetic temp dir.
	tmpOspec := filepath.Join(tmpDir, ".ospec")
	if _, err := os.Stat(tmpOspec); err != nil {
		t.Errorf(".ospec fallback must exist in temp CWD (got %v); verify resolveCwd fallback", err)
	}
}

// TestSubagentStop_DriveRootCwdFallback verifies that a Windows drive root passed
// as cwd is rejected by validatePath (4R CRITICAL: root-rejection check) and that
// resolveCwd falls back to "." — writing .ospec into the hermetic temp dir rather
// than at the drive root.
//
// This test is added post-GREEN because a pre-fix (RED) behavior test is not safe:
// in RED state, validatePath would accept "C:\" as a valid cwd, resolveCwd would
// accept it (os.Stat succeeds on a real drive root), and the store would attempt to
// create C:\.ospec — a root write that is harmless only when permission-denied.
// The unit-matrix tests in pathsafe_windows_test.go are the primary discriminating
// RED evidence; this behavior test provides defense-in-depth that the validated
// path reaches resolveCwd and the fallback chain correctly.
func TestSubagentStop_DriveRootCwdFallback(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("drive root cwd test is Windows-specific (C:\\ syntax)")
	}
	// Use hermetic CWD so the "." fallback lands in a temp dir,
	// not in the package source directory.
	tmpDir := t.TempDir()
	chdirT(t, tmpDir)

	stdin, _ := json.Marshal(map[string]any{
		"cwd":        `C:\`,
		"agent_type": "sdd-apply",
		"result":     map[string]any{"skill_resolution": "fallback-registry"},
	})

	r, code := runSubagentStop(t, stdin)

	if code != 0 {
		t.Errorf("exitCode: got %d, want 0", code)
	}
	if !r.Continue {
		t.Errorf("continue: got false, want true")
	}
	// Positive: "." fallback must write .ospec into the hermetic temp dir.
	// If root-rejection were absent, resolveCwd would return "C:\" and the
	// store would write there (or fail with EPERM), leaving tmpOspec absent.
	tmpOspec := filepath.Join(tmpDir, ".ospec")
	if _, err := os.Stat(tmpOspec); err != nil {
		t.Errorf(".ospec fallback must exist in hermetic temp CWD (got %v); "+
			"check root-rejection check in validatePath", err)
	}
	// Negative: drive root must NOT have received .ospec writes.
	driveRootOspec := `C:\.ospec`
	if _, err := os.Stat(driveRootOspec); err == nil {
		t.Error(".ospec must NOT be created at C:\\ (drive root cwd must be rejected by validatePath)")
	}
}

func TestSubagentStop_Triangulate(t *testing.T) {
	t.Run("error path continues with message", func(t *testing.T) {
		out, code := hooks.Dispatch([]string{"subagent-stop"}, []byte("{bad"))
		if code != 0 {
			t.Errorf("exitCode: got %d, want 0", code)
		}
		var r subagentStopResult
		if err := json.Unmarshal(out, &r); err != nil {
			t.Fatalf("parse: %v; raw=%q", err, out)
		}
		if !r.Continue {
			t.Errorf("continue: got false, want true")
		}
	})

	t.Run("agent_name fallback", func(t *testing.T) {
		ws := createSubagentWorkspace(t)
		stdin, _ := json.Marshal(map[string]any{
			"cwd":        ws,
			"agent_name": "my-agent",
			"result":     map[string]any{"skill_resolution": "fallback-path"},
		})
		runSubagentStop(t, stdin)
		events := readSubagentEvents(t, ws)
		if len(events) == 0 {
			t.Fatal("no events")
		}
		if events[0]["agent"] != "my-agent" {
			t.Errorf("agent: got %v, want my-agent", events[0]["agent"])
		}
	})

	t.Run("text resolution parsed from output field", func(t *testing.T) {
		ws := createSubagentWorkspace(t)
		stdin, _ := json.Marshal(map[string]any{
			"cwd":        ws,
			"agent_type": "sdd-spec",
			"output":     `status: blocked\nskill_resolution: none\n`,
		})
		r, _ := runSubagentStop(t, stdin)
		if !r.Continue {
			t.Errorf("continue: got false, want true")
		}
		// Should have recorded an event.
		events := readSubagentEvents(t, ws)
		if len(events) == 0 {
			t.Error("no events recorded for text resolution 'none'")
		}
	})
}
