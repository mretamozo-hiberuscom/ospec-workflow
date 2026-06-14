// Tests for the subagent-stop handler.
// Cases derived from scripts/hooks/subagent-stop.test.js.
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

// ── triangulation ──────────────────────────────────────────────────────────────

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
