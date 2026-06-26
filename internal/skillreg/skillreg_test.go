// Package skillreg_test verifies skill discovery, fingerprint calculation, and
// cache round-trips.  Cases are derived from session-start.test.js.
package skillreg_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/skillreg"
)

// ── helpers ───────────────────────────────────────────────────────────────────

func makePluginRoot(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	for _, d := range []string{
		filepath.Join(root, "skills", "example"),
		filepath.Join(root, "skills", "_shared"),
		filepath.Join(root, "rules"),
	} {
		if err := os.MkdirAll(d, 0755); err != nil {
			t.Fatalf("mkdir %s: %v", d, err)
		}
	}
	if err := os.WriteFile(
		filepath.Join(root, "skills", "example", "SKILL.md"),
		[]byte("---\nname: example\ndescription: \"Example skill. Trigger: JavaScript, hooks\"\ncapabilities: [node-test, javascript-eval]\n---\n\n## Hard Rules\n\n- Keep output deterministic.\n- Do not mutate OpenSpec.\n"),
		0644,
	); err != nil {
		t.Fatalf("write SKILL.md: %v", err)
	}
	if err := os.WriteFile(
		filepath.Join(root, "skills", "_shared", "runtime.md"),
		[]byte("Shared runtime contract.\n"),
		0644,
	); err != nil {
		t.Fatalf("write runtime.md: %v", err)
	}
	if err := os.WriteFile(
		filepath.Join(root, "rules", "common.md"),
		[]byte("Common project rule.\n"),
		0644,
	); err != nil {
		t.Fatalf("write common.md: %v", err)
	}
	return root
}

// ── DiscoverSkills ────────────────────────────────────────────────────────────

func TestDiscoverSkills(t *testing.T) {
	t.Run("empty dir returns zero skills and fingerprint paths", func(t *testing.T) {
		root := t.TempDir()
		result, err := skillreg.DiscoverSkills(root)
		if err != nil {
			t.Fatalf("DiscoverSkills: %v", err)
		}
		if len(result.Skills) != 0 {
			t.Errorf("expected 0 skills, got %d", len(result.Skills))
		}
		if len(result.FingerprintPaths) != 0 {
			t.Errorf("expected 0 fingerprint paths, got %d", len(result.FingerprintPaths))
		}
	})

	t.Run("discovers example skill with triggers and compact rules", func(t *testing.T) {
		root := makePluginRoot(t)
		result, err := skillreg.DiscoverSkills(root)
		if err != nil {
			t.Fatalf("DiscoverSkills: %v", err)
		}
		if len(result.Skills) != 1 {
			t.Fatalf("expected 1 skill, got %d: %v", len(result.Skills), result.Skills)
		}
		skill := result.Skills[0]
		if skill.ID != "example" {
			t.Errorf("ID: got %q, want %q", skill.ID, "example")
		}
		if skill.Path != "skills/example/SKILL.md" {
			t.Errorf("Path: got %q", skill.Path)
		}
		if len(skill.Triggers) != 2 || skill.Triggers[0] != "JavaScript" || skill.Triggers[1] != "hooks" {
			t.Errorf("Triggers: got %v", skill.Triggers)
		}
		if len(skill.CompactRules) != 2 {
			t.Errorf("CompactRules: got %v", skill.CompactRules)
		}
		if skill.CompactRules[0] != "Keep output deterministic." {
			t.Errorf("CompactRules[0]: got %q", skill.CompactRules[0])
		}
		if len(skill.Capabilities) != 2 || skill.Capabilities[0] != "node-test" || skill.Capabilities[1] != "javascript-eval" {
			t.Errorf("Capabilities: got %v, want [node-test javascript-eval]", skill.Capabilities)
		}
	})

	t.Run("includes _shared and rules in fingerprint paths but not in skills", func(t *testing.T) {
		root := makePluginRoot(t)
		result, err := skillreg.DiscoverSkills(root)
		if err != nil {
			t.Fatalf("DiscoverSkills: %v", err)
		}
		fpPaths := make(map[string]bool)
		for _, fp := range result.FingerprintPaths {
			fpPaths[fp.RelativePath] = true
		}
		// _shared runtime.md should be in fingerprint paths
		if !fpPaths["skills/_shared/runtime.md"] {
			t.Errorf("_shared/runtime.md not in fingerprint paths: %v", fpPaths)
		}
		// rules/common.md should be in fingerprint paths
		if !fpPaths["rules/common.md"] {
			t.Errorf("rules/common.md not in fingerprint paths: %v", fpPaths)
		}
		// Only 1 skill (example), _shared not included in Skills
		if len(result.Skills) != 1 {
			t.Errorf("expected 1 skill, got %d", len(result.Skills))
		}
	})
}

// ── CalculateFingerprint ──────────────────────────────────────────────────────

func TestCalculateFingerprint(t *testing.T) {
	t.Run("same files produce same fingerprint", func(t *testing.T) {
		root := makePluginRoot(t)
		result, _ := skillreg.DiscoverSkills(root)
		fp1, err1 := skillreg.CalculateFingerprint(result.FingerprintPaths)
		fp2, err2 := skillreg.CalculateFingerprint(result.FingerprintPaths)
		if err1 != nil || err2 != nil {
			t.Fatalf("fingerprint errors: %v %v", err1, err2)
		}
		if fp1 != fp2 {
			t.Errorf("fingerprints differ: %q vs %q", fp1, fp2)
		}
		if !strings.HasPrefix(fp1, "sha256:") {
			t.Errorf("expected sha256: prefix, got %q", fp1)
		}
	})

	t.Run("changed file produces different fingerprint", func(t *testing.T) {
		root := makePluginRoot(t)
		result, _ := skillreg.DiscoverSkills(root)
		fp1, _ := skillreg.CalculateFingerprint(result.FingerprintPaths)

		_ = os.WriteFile(
			filepath.Join(root, "rules", "common.md"),
			[]byte("Changed project rule.\n"),
			0644,
		)
		fp2, _ := skillreg.CalculateFingerprint(result.FingerprintPaths)
		if fp1 == fp2 {
			t.Error("fingerprints should differ after file change")
		}
	})

	t.Run("empty paths produces stable fingerprint", func(t *testing.T) {
		fp, err := skillreg.CalculateFingerprint(nil)
		if err != nil {
			t.Fatalf("CalculateFingerprint(nil): %v", err)
		}
		if !strings.HasPrefix(fp, "sha256:") {
			t.Errorf("expected sha256: prefix, got %q", fp)
		}
	})
}

// ── ReadCache / WriteCache ────────────────────────────────────────────────────

func TestCacheRoundTrip(t *testing.T) {
	t.Run("returns nil for missing cache file", func(t *testing.T) {
		dir := t.TempDir()
		result, err := skillreg.ReadCache(filepath.Join(dir, "missing.json"))
		if err != nil {
			t.Fatalf("ReadCache: %v", err)
		}
		if result != nil {
			t.Errorf("expected nil, got %v", result)
		}
	})

	t.Run("write then read round-trip preserves data", func(t *testing.T) {
		dir := t.TempDir()
		path := filepath.Join(dir, "cache.json")
		data := map[string]any{
			"version":      float64(skillreg.CacheVersion),
			"fingerprint":  "sha256:abc",
			"generated_at": "2026-06-10T08:00:00.000Z",
			"skills":       []any{},
		}
		if err := skillreg.WriteCache(path, data); err != nil {
			t.Fatalf("WriteCache: %v", err)
		}
		result, err := skillreg.ReadCache(path)
		if err != nil {
			t.Fatalf("ReadCache: %v", err)
		}
		if result == nil {
			t.Fatal("expected non-nil cache")
		}
		if result["fingerprint"] != "sha256:abc" {
			t.Errorf("fingerprint mismatch: %v", result["fingerprint"])
		}
		if result["version"] != float64(skillreg.CacheVersion) {
			t.Errorf("version mismatch: %v", result["version"])
		}
	})

	t.Run("WriteCache is atomic (file is valid JSON or does not exist)", func(t *testing.T) {
		dir := t.TempDir()
		path := filepath.Join(dir, "cache.json")
		data := map[string]any{"version": float64(2), "fingerprint": "sha256:x"}
		if err := skillreg.WriteCache(path, data); err != nil {
			t.Fatalf("WriteCache: %v", err)
		}
		raw, _ := os.ReadFile(path)
		var check map[string]any
		if err := json.Unmarshal(raw, &check); err != nil {
			t.Errorf("cache file is not valid JSON: %v", err)
		}
	})
}
