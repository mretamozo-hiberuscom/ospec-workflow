// Tests for the session-start handler.
// Cases derived from scripts/hooks/session-start.test.js.
// The Go port operates in single-repo mode only (no workspace-federated backend).
package hooks_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/hooks"
)

// ── helpers ────────────────────────────────────────────────────────────────────

type sessionStartResult struct {
	Status        string `json:"status"`
	OspecDetected bool   `json:"ospecDetected"`
	Registry      struct {
		Status string `json:"status"`
		Path   string `json:"path"`
	} `json:"registry"`
	Baseline *struct {
		Hint string `json:"hint"`
	} `json:"baseline"`
	Message string `json:"message"`
}

// runSessionStart dispatches "session-start" and decodes the result.
func runSessionStart(t *testing.T, stdin []byte) (sessionStartResult, int) {
	t.Helper()
	out, code := hooks.Dispatch([]string{"session-start"}, stdin)
	if out == nil {
		t.Fatalf("session-start: nil output (handler not registered?)")
	}
	var r sessionStartResult
	if err := json.Unmarshal(out, &r); err != nil {
		t.Fatalf("session-start: parse output: %v; raw=%q", err, out)
	}
	return r, code
}

// makeSessionInput builds the stdin JSON payload with an optional cwd and pluginRoot.
func makeSessionInput(cwd, pluginRoot string, nowISO string) []byte {
	m := map[string]string{}
	if cwd != "" {
		m["cwd"] = cwd
	}
	if pluginRoot != "" {
		m["plugin_root"] = pluginRoot
	}
	if nowISO != "" {
		m["now"] = nowISO
	}
	b, _ := json.Marshal(m)
	return b
}

// createMinimalPluginRoot builds a minimal skills/rules tree so DiscoverSkills works.
func createMinimalPluginRoot(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	for _, dir := range []string{
		filepath.Join(root, "skills", "example"),
		filepath.Join(root, "skills", "_shared"),
		filepath.Join(root, "rules"),
	} {
		if err := os.MkdirAll(dir, 0755); err != nil {
			t.Fatal(err)
		}
	}
	skill := "---\nname: example\ndescription: \"Example skill. Trigger: hooks\"\n---\n\n## Rules\n\n- Keep output deterministic.\n"
	if err := os.WriteFile(filepath.Join(root, "skills", "example", "SKILL.md"), []byte(skill), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "skills", "_shared", "runtime.md"), []byte("Shared runtime.\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "rules", "common.md"), []byte("Common rule.\n"), 0644); err != nil {
		t.Fatal(err)
	}
	return root
}

// createWorkspace builds a tmp workspace with optional openspec/config.yaml.
func createWorkspaceWithConfig(t *testing.T, configContent string) string {
	t.Helper()
	ws := t.TempDir()
	if configContent != "" {
		if err := os.MkdirAll(filepath.Join(ws, "openspec"), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(ws, "openspec", "config.yaml"), []byte(configContent), 0644); err != nil {
			t.Fatal(err)
		}
	}
	return ws
}

// ── tests ──────────────────────────────────────────────────────────────────────

func TestSessionStart_NoOspec(t *testing.T) {
	ws := createWorkspaceWithConfig(t, "") // no openspec dir
	pr := createMinimalPluginRoot(t)
	stdin := makeSessionInput(ws, pr, "")

	got, code := runSessionStart(t, stdin)

	if code != 0 {
		t.Errorf("exitCode: got %d, want 0", code)
	}
	if got.Status != "ok" {
		t.Errorf("status: got %q, want %q", got.Status, "ok")
	}
	if got.OspecDetected {
		t.Errorf("ospecDetected: got true, want false")
	}
	if got.Registry.Status != "skipped" {
		t.Errorf("registry.status: got %q, want %q", got.Registry.Status, "skipped")
	}
}

func TestSessionStart_WithOspec_GeneratesCache(t *testing.T) {
	ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
	pr := createMinimalPluginRoot(t)
	nowISO := "2026-06-10T08:00:00.000Z"
	stdin := makeSessionInput(ws, pr, nowISO)

	got, code := runSessionStart(t, stdin)

	if code != 0 {
		t.Errorf("exitCode: got %d, want 0", code)
	}
	if !got.OspecDetected {
		t.Errorf("ospecDetected: got false, want true")
	}
	if got.Registry.Status != "generated" {
		t.Errorf("registry.status: got %q, want %q", got.Registry.Status, "generated")
	}
	// Cache file must exist.
	cachePath := filepath.Join(ws, ".ospec", "cache", "skill-registry.cache.json")
	data, err := os.ReadFile(cachePath)
	if err != nil {
		t.Fatalf("cache file missing: %v", err)
	}
	var cache map[string]any
	if err := json.Unmarshal(data, &cache); err != nil {
		t.Fatalf("cache parse: %v", err)
	}
	if v, _ := cache["version"].(float64); int(v) != 2 {
		t.Errorf("cache.version: got %v, want 2", cache["version"])
	}
	if fp, _ := cache["fingerprint"].(string); len(fp) < 10 {
		t.Errorf("cache.fingerprint: too short %q", fp)
	}
	if ga, _ := cache["generated_at"].(string); ga != nowISO {
		t.Errorf("cache.generated_at: got %q, want %q", ga, nowISO)
	}
}

func TestSessionStart_CacheReused(t *testing.T) {
	ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
	pr := createMinimalPluginRoot(t)

	// First run: generate.
	runSessionStart(t, makeSessionInput(ws, pr, "2026-06-10T08:00:00.000Z"))

	cachePath := filepath.Join(ws, ".ospec", "cache", "skill-registry.cache.json")
	original, _ := os.ReadFile(cachePath)

	// Second run: should reuse.
	got, _ := runSessionStart(t, makeSessionInput(ws, pr, "2026-06-10T09:00:00.000Z"))

	if got.Registry.Status != "reused" {
		t.Errorf("registry.status: got %q, want %q", got.Registry.Status, "reused")
	}
	current, _ := os.ReadFile(cachePath)
	if string(current) != string(original) {
		t.Error("cache file was overwritten on reuse")
	}
}

func TestSessionStart_CacheRegeneratedAfterChange(t *testing.T) {
	ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
	pr := createMinimalPluginRoot(t)

	runSessionStart(t, makeSessionInput(ws, pr, "2026-06-10T08:00:00.000Z"))

	cachePath := filepath.Join(ws, ".ospec", "cache", "skill-registry.cache.json")
	before := func() string {
		b, _ := os.ReadFile(cachePath)
		var m map[string]any
		_ = json.Unmarshal(b, &m)
		fp, _ := m["fingerprint"].(string)
		return fp
	}()

	// Mutate a fingerprint file.
	if err := os.WriteFile(filepath.Join(pr, "rules", "common.md"), []byte("Changed rule.\n"), 0644); err != nil {
		t.Fatal(err)
	}

	runSessionStart(t, makeSessionInput(ws, pr, "2026-06-10T09:00:00.000Z"))

	after := func() string {
		b, _ := os.ReadFile(cachePath)
		var m map[string]any
		_ = json.Unmarshal(b, &m)
		fp, _ := m["fingerprint"].(string)
		return fp
	}()

	if before == after {
		t.Error("fingerprint unchanged after modifying a source file")
	}
}

func TestSessionStart_BaselineHint_Pending(t *testing.T) {
	cfg := "strict_tdd: true\nbaseline:\n  status: pending\n  domains_pending: []\n  domains_done: []\n  stale_domains: []\n  last_checked: \"\"\n"
	ws := createWorkspaceWithConfig(t, cfg)
	pr := createMinimalPluginRoot(t)

	got, _ := runSessionStart(t, makeSessionInput(ws, pr, "2026-06-10T08:00:00.000Z"))

	if got.Baseline == nil {
		t.Fatal("baseline key missing, want non-nil")
	}
	if got.Baseline.Hint == "" {
		t.Error("baseline.hint empty, want non-empty")
	}
}

func TestSessionStart_BaselineHint_Partial(t *testing.T) {
	cfg := "strict_tdd: true\nbaseline:\n  status: partial\n  domains_pending:\n    - auth\n    - payments\n  domains_done: []\n  stale_domains: []\n  last_checked: \"\"\n"
	ws := createWorkspaceWithConfig(t, cfg)
	pr := createMinimalPluginRoot(t)

	got, _ := runSessionStart(t, makeSessionInput(ws, pr, "2026-06-10T08:00:00.000Z"))

	if got.Baseline == nil {
		t.Fatal("baseline key missing")
	}
	hint := got.Baseline.Hint
	if hint == "" {
		t.Error("hint empty")
	}
	// Must mention the count "2".
	found := false
	for _, c := range hint {
		if c == '2' {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("hint %q does not contain '2' (pending count)", hint)
	}
}

func TestSessionStart_BaselineHint_StaleDomain(t *testing.T) {
	cfg := "strict_tdd: true\nbaseline:\n  status: done\n  domains_pending: []\n  domains_done:\n    - auth\n  stale_domains:\n    - auth\n  last_checked: \"2026-06-10T12:00:00Z\"\n"
	ws := createWorkspaceWithConfig(t, cfg)
	pr := createMinimalPluginRoot(t)

	got, _ := runSessionStart(t, makeSessionInput(ws, pr, "2026-06-10T08:00:00.000Z"))

	if got.Baseline == nil {
		t.Fatal("baseline key missing")
	}
	// Hint must mention the stale domain name.
	if hint := got.Baseline.Hint; len(hint) == 0 {
		t.Error("hint empty")
	} else if !containsString(hint, "auth") {
		t.Errorf("hint %q does not mention stale domain 'auth'", hint)
	}
}

func TestSessionStart_BaselineHint_DoneNoStale(t *testing.T) {
	cfg := "strict_tdd: true\nbaseline:\n  status: done\n  domains_pending: []\n  domains_done:\n    - auth\n  stale_domains: []\n  last_checked: \"\"\n"
	ws := createWorkspaceWithConfig(t, cfg)
	pr := createMinimalPluginRoot(t)

	got, _ := runSessionStart(t, makeSessionInput(ws, pr, "2026-06-10T08:00:00.000Z"))

	if got.Baseline != nil {
		t.Errorf("baseline key present, want nil; hint=%q", got.Baseline.Hint)
	}
}

func TestSessionStart_ErrorExitsOne(t *testing.T) {
	// Provide a cwd that does not exist to force an error path.
	// We use a path inside a TempDir that we delete, so it is guaranteed absent.
	tmp := t.TempDir()
	gone := filepath.Join(tmp, "does-not-exist")
	pr := createMinimalPluginRoot(t)

	// This workspace has no config.yaml so ospecDetected=false — not an error.
	// To force an actual error we send a malformed JSON stdin instead.
	out, code := hooks.Dispatch([]string{"session-start"}, []byte("{bad"))
	_ = gone
	_ = pr
	if code != 1 {
		t.Errorf("exitCode on parse error: got %d, want 1", code)
	}
	if out == nil {
		t.Fatal("nil output on error")
	}
	var r sessionStartResult
	if err := json.Unmarshal(out, &r); err != nil {
		t.Fatalf("parse error output: %v; raw=%q", err, out)
	}
	if r.Status != "error" {
		t.Errorf("status: got %q, want %q", r.Status, "error")
	}
	if r.Message == "" {
		t.Error("message: empty, want non-empty")
	}
}

// ── triangulation ──────────────────────────────────────────────────────────────

func TestSessionStart_Triangulate(t *testing.T) {
	t.Run("empty stdin uses fallback cwd", func(t *testing.T) {
		ws := createWorkspaceWithConfig(t, "")
		_ = ws
		// Empty stdin → no cwd field → fallback → process cwd (no ospec there normally).
		// Just check we get valid JSON back with no panic.
		out, code := hooks.Dispatch([]string{"session-start"}, []byte("{}"))
		if code != 0 {
			t.Errorf("exitCode: got %d, want 0", code)
		}
		var r sessionStartResult
		if err := json.Unmarshal(out, &r); err != nil {
			t.Fatalf("parse: %v; raw=%q", err, out)
		}
		if r.Status != "ok" && r.Status != "error" {
			t.Errorf("unexpected status %q", r.Status)
		}
	})

	t.Run("now ISO injected into generated_at", func(t *testing.T) {
		ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
		pr := createMinimalPluginRoot(t)
		nowISO := "2026-01-01T00:00:00.000Z"

		runSessionStart(t, makeSessionInput(ws, pr, nowISO))

		cachePath := filepath.Join(ws, ".ospec", "cache", "skill-registry.cache.json")
		data, _ := os.ReadFile(cachePath)
		var cache map[string]any
		_ = json.Unmarshal(data, &cache)
		if ga, _ := cache["generated_at"].(string); ga != nowISO {
			t.Errorf("generated_at: got %q, want %q", ga, nowISO)
		}
	})

	t.Run("no config baseline block emits no hint", func(t *testing.T) {
		ws := createWorkspaceWithConfig(t, "strict_tdd: true\n")
		pr := createMinimalPluginRoot(t)
		got, _ := runSessionStart(t, makeSessionInput(ws, pr, time.Now().UTC().Format(time.RFC3339)))
		if got.Baseline != nil {
			t.Errorf("baseline present when config has no baseline block; hint=%q", got.Baseline.Hint)
		}
	})
}

func containsString(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 ||
		func() bool {
			for i := 0; i+len(sub) <= len(s); i++ {
				if s[i:i+len(sub)] == sub {
					return true
				}
			}
			return false
		}())
}
