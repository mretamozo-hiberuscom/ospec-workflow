// Package store_test verifies the Store surface used by the hook handlers.
package store_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/store"
)

// ── helpers ───────────────────────────────────────────────────────────────────

func makeWorkspace(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	return dir
}

func makeOpenSpec(t *testing.T, configContent string) string {
	t.Helper()
	ws := makeWorkspace(t)
	if err := os.MkdirAll(filepath.Join(ws, "openspec"), 0755); err != nil {
		t.Fatalf("mkdir openspec: %v", err)
	}
	if err := os.WriteFile(filepath.Join(ws, "openspec", "config.yaml"), []byte(configContent), 0644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	return ws
}

func makeChange(t *testing.T, ws, name, stateContent string) string {
	t.Helper()
	dir := filepath.Join(ws, "openspec", "changes", name)
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("mkdir change %q: %v", name, err)
	}
	if err := os.WriteFile(filepath.Join(dir, "state.yaml"), []byte(stateContent), 0644); err != nil {
		t.Fatalf("write state.yaml: %v", err)
	}
	return dir
}

// ── IsInitialized ─────────────────────────────────────────────────────────────

func TestIsInitialized(t *testing.T) {
	t.Run("false when openspec dir missing", func(t *testing.T) {
		ws := makeWorkspace(t)
		s := store.NewStore(ws)
		ok, err := s.IsInitialized()
		if err != nil {
			t.Fatalf("IsInitialized error: %v", err)
		}
		if ok {
			t.Error("expected false, got true")
		}
	})

	t.Run("true when openspec/config.yaml exists", func(t *testing.T) {
		ws := makeOpenSpec(t, "strict_tdd: true\n")
		s := store.NewStore(ws)
		ok, err := s.IsInitialized()
		if err != nil {
			t.Fatalf("IsInitialized error: %v", err)
		}
		if !ok {
			t.Error("expected true, got false")
		}
	})
}

// ── ReadConfig ────────────────────────────────────────────────────────────────

func TestReadConfig(t *testing.T) {
	t.Run("returns config content when present", func(t *testing.T) {
		ws := makeOpenSpec(t, "strict_tdd: true\n")
		s := store.NewStore(ws)
		got, err := s.ReadConfig()
		if err != nil {
			t.Fatalf("ReadConfig error: %v", err)
		}
		if !strings.Contains(string(got), "strict_tdd") {
			t.Errorf("expected config content, got %q", string(got))
		}
	})

	t.Run("returns nil when config absent", func(t *testing.T) {
		ws := makeWorkspace(t)
		s := store.NewStore(ws)
		got, err := s.ReadConfig()
		if err != nil {
			t.Fatalf("ReadConfig error: %v", err)
		}
		if got != nil {
			t.Errorf("expected nil, got %q", string(got))
		}
	})
}

// ── AppendRuntimeEvent ────────────────────────────────────────────────────────

func TestAppendRuntimeEvent(t *testing.T) {
	t.Run("creates dir and appends JSONL line", func(t *testing.T) {
		ws := makeWorkspace(t)
		s := store.NewStore(ws)

		line1 := []byte(`{"timestamp":"T1","agent":"sdd-apply","skill_resolution":"none","action":"refresh"}`)
		if err := s.AppendRuntimeEvent(line1); err != nil {
			t.Fatalf("first append: %v", err)
		}

		eventFile := filepath.Join(ws, ".ospec", "runtime", "subagent-events.jsonl")
		data, err := os.ReadFile(eventFile)
		if err != nil {
			t.Fatalf("read event file: %v", err)
		}
		content := string(data)
		if !strings.Contains(content, `"T1"`) {
			t.Errorf("event not in file; got %q", content)
		}
	})

	t.Run("two sequential appends produce two JSONL lines", func(t *testing.T) {
		ws := makeWorkspace(t)
		s := store.NewStore(ws)

		_ = s.AppendRuntimeEvent([]byte(`{"agent":"a1"}`))
		_ = s.AppendRuntimeEvent([]byte(`{"agent":"a2"}`))

		eventFile := filepath.Join(ws, ".ospec", "runtime", "subagent-events.jsonl")
		data, _ := os.ReadFile(eventFile)
		lines := strings.Split(strings.TrimRight(string(data), "\n"), "\n")
		if len(lines) != 2 {
			t.Errorf("expected 2 lines, got %d: %q", len(lines), string(data))
		}

		var e1, e2 map[string]any
		if err := json.Unmarshal([]byte(lines[0]), &e1); err != nil {
			t.Fatalf("line 1 not valid JSON: %v", err)
		}
		if err := json.Unmarshal([]byte(lines[1]), &e2); err != nil {
			t.Fatalf("line 2 not valid JSON: %v", err)
		}
		if e1["agent"] != "a1" || e2["agent"] != "a2" {
			t.Errorf("wrong agents: %v %v", e1["agent"], e2["agent"])
		}
	})
}

// ── WriteSessionSummary ───────────────────────────────────────────────────────

func TestWriteSessionSummary(t *testing.T) {
	t.Run("writes file and returns written status", func(t *testing.T) {
		ws := makeWorkspace(t)
		s := store.NewStore(ws)

		res, err := s.WriteSessionSummary("my-change", "# Session Summary\n")
		if err != nil {
			t.Fatalf("WriteSessionSummary: %v", err)
		}
		if res.Status != "written" {
			t.Errorf("status: got %q, want %q", res.Status, "written")
		}
		if !strings.Contains(res.Path, "session-summary.md") {
			t.Errorf("path: got %q", res.Path)
		}
		data, _ := os.ReadFile(filepath.Join(ws, filepath.FromSlash(res.Path)))
		if string(data) != "# Session Summary\n" {
			t.Errorf("content mismatch")
		}
	})

	t.Run("returns fresh when content unchanged", func(t *testing.T) {
		ws := makeWorkspace(t)
		s := store.NewStore(ws)
		content := "# Session Summary\n"
		_, _ = s.WriteSessionSummary("my-change", content)
		res, err := s.WriteSessionSummary("my-change", content)
		if err != nil {
			t.Fatalf("second write: %v", err)
		}
		if res.Status != "fresh" {
			t.Errorf("status: got %q, want %q", res.Status, "fresh")
		}
	})
}

// ── FindActiveChanges ─────────────────────────────────────────────────────────

func TestFindActiveChanges(t *testing.T) {
	t.Run("empty when no openspec dir", func(t *testing.T) {
		ws := makeWorkspace(t)
		s := store.NewStore(ws)
		changes, err := s.FindActiveChanges()
		if err != nil {
			t.Fatalf("FindActiveChanges: %v", err)
		}
		if len(changes) != 0 {
			t.Errorf("expected 0 changes, got %d", len(changes))
		}
	})

	t.Run("returns non-terminal changes", func(t *testing.T) {
		ws := makeOpenSpec(t, "strict_tdd: true\n")
		_ = os.MkdirAll(filepath.Join(ws, "openspec", "changes"), 0755)

		makeChange(t, ws, "active-change", "status: applying\n")
		makeChange(t, ws, "completed-change", "status: completed\n")
		makeChange(t, ws, "blocked-change", "status: blocked\n")

		s := store.NewStore(ws)
		changes, err := s.FindActiveChanges()
		if err != nil {
			t.Fatalf("FindActiveChanges: %v", err)
		}
		names := make(map[string]bool)
		for _, c := range changes {
			names[c.DirectoryName] = true
		}
		if names["completed-change"] {
			t.Error("completed-change should be filtered")
		}
		if !names["active-change"] || !names["blocked-change"] {
			t.Errorf("expected active and blocked, got %v", names)
		}
	})

	t.Run("sorts by modification time descending", func(t *testing.T) {
		ws := makeOpenSpec(t, "strict_tdd: true\n")
		_ = os.MkdirAll(filepath.Join(ws, "openspec", "changes"), 0755)

		oldDir := makeChange(t, ws, "older", "status: applying\n")
		newDir := makeChange(t, ws, "newer", "status: applying\n")

		oldTime := time.Now().Add(-10 * time.Minute)
		newTime := time.Now()

		_ = os.Chtimes(filepath.Join(oldDir, "state.yaml"), oldTime, oldTime)
		_ = os.Chtimes(filepath.Join(newDir, "state.yaml"), newTime, newTime)

		s := store.NewStore(ws)
		changes, err := s.FindActiveChanges()
		if err != nil {
			t.Fatalf("FindActiveChanges: %v", err)
		}
		if len(changes) < 2 {
			t.Fatalf("expected 2 changes, got %d", len(changes))
		}
		if changes[0].DirectoryName != "newer" {
			t.Errorf("first change should be newer, got %q", changes[0].DirectoryName)
		}
	})
}

// ── ReadBaselineState ─────────────────────────────────────────────────────────

func TestReadBaselineState(t *testing.T) {
	t.Run("returns nil when no baseline block", func(t *testing.T) {
		got := store.ReadBaselineState("strict_tdd: true\n")
		if got != nil {
			t.Errorf("expected nil, got %+v", got)
		}
	})

	t.Run("parses status pending", func(t *testing.T) {
		content := "baseline:\n  status: pending\n  domains_pending: []\n  domains_done: []\n  stale_domains: []\n"
		got := store.ReadBaselineState(content)
		if got == nil {
			t.Fatal("expected non-nil baseline")
		}
		if got.Status != "pending" {
			t.Errorf("status: got %q, want %q", got.Status, "pending")
		}
	})

	t.Run("parses domains_pending list", func(t *testing.T) {
		content := "baseline:\n  status: partial\n  domains_pending:\n    - auth\n    - payments\n  domains_done: []\n  stale_domains: []\n"
		got := store.ReadBaselineState(content)
		if got == nil {
			t.Fatal("expected non-nil baseline")
		}
		if len(got.DomainsPending) != 2 {
			t.Errorf("DomainsPending: got %v, want [auth payments]", got.DomainsPending)
		}
		if got.DomainsPending[0] != "auth" || got.DomainsPending[1] != "payments" {
			t.Errorf("wrong values: %v", got.DomainsPending)
		}
	})

	t.Run("parses stale_domains list", func(t *testing.T) {
		content := "baseline:\n  status: done\n  domains_pending: []\n  domains_done:\n    - auth\n  stale_domains:\n    - auth\n"
		got := store.ReadBaselineState(content)
		if got == nil {
			t.Fatal("expected non-nil baseline")
		}
		if len(got.StaleDomains) != 1 || got.StaleDomains[0] != "auth" {
			t.Errorf("StaleDomains: got %v", got.StaleDomains)
		}
	})
}
