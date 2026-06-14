// session-start hook handler.
// Ports runSessionStart logic from scripts/hooks/session-start.js.
// Operates in single-repo mode only (no workspace-federated backend in Phase 1).
package hooks

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/skillreg"
	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/store"
)

func init() {
	Register(&sessionStartHandler{})
}

type sessionStartHandler struct{}

func (h *sessionStartHandler) Name() string { return "session-start" }

// sessionStartInput is the stdin payload for session-start.
type sessionStartInput struct {
	Cwd        string `json:"cwd"`
	PluginRoot string `json:"plugin_root"`
	Now        string `json:"now"` // optional ISO-8601 override for generated_at
}

// sessionStartOutput is the JSON written to stdout on success.
type sessionStartOutput struct {
	Status        string            `json:"status"`
	OspecDetected bool              `json:"ospecDetected"`
	Registry      registryResult    `json:"registry"`
	Baseline      *baselineResult   `json:"baseline,omitempty"`
}

type registryResult struct {
	Status string `json:"status"`
	Path   string `json:"path"`
}

type baselineResult struct {
	Hint string `json:"hint"`
}

// buildBaselineHint ports buildBaselineHint from session-start.js.
func buildBaselineHint(b *store.BaselineState) string {
	if b == nil {
		return ""
	}
	if b.Status == "pending" {
		return "Baseline not started. Run /sdd-baseline to seed openspec/specs/."
	}
	if b.Status == "partial" {
		count := len(b.DomainsPending)
		return fmt.Sprintf("Baseline partial: %d domain(s) pending. Run /sdd-baseline to resume.", count)
	}
	if len(b.StaleDomains) > 0 {
		list := strings.Join(b.StaleDomains, ", ")
		return fmt.Sprintf("Baseline done but %d domain(s) stale: %s. Run /sdd-baseline refresh to update.",
			len(b.StaleDomains), list)
	}
	return ""
}

func (h *sessionStartHandler) Run(stdin []byte) ([]byte, int) {
	var input sessionStartInput
	if err := json.Unmarshal(stdin, &input); err != nil {
		return errorOutput(err), 1
	}
	return runSessionStart(input)
}

func runSessionStart(input sessionStartInput) ([]byte, int) {
	// Resolve workspace.
	workspace := strings.TrimSpace(input.Cwd)
	if workspace == "" {
		// Fallback: use process working directory.
		workspace = "."
	}
	workspace = filepath.Clean(workspace)

	s := store.NewStore(workspace)

	initialized, err := s.IsInitialized()
	if err != nil {
		return errorOutput(err), 1
	}

	if !initialized {
		out := sessionStartOutput{
			Status:        "ok",
			OspecDetected: false,
			Registry: registryResult{
				Status: "skipped",
				Path:   store.CacheRelPath,
			},
		}
		b, _ := json.Marshal(out)
		return b, 0
	}

	// Read config for baseline hint.
	var baselineHint string
	if cfgData, err := s.ReadConfig(); err == nil && cfgData != nil {
		bs := store.ReadBaselineState(string(cfgData))
		baselineHint = buildBaselineHint(bs)
	}

	// Resolve plugin root (default: repo root = parent of workspace? use "." if absent).
	pluginRoot := strings.TrimSpace(input.PluginRoot)
	if pluginRoot == "" {
		// Default plugin root: current executable dir or "." — in practice the
		// test always supplies plugin_root; for production the binary lives in the
		// repo root, so "." is reasonable.
		pluginRoot = "."
	}
	pluginRoot = filepath.Clean(pluginRoot)

	discovery, err := skillreg.DiscoverSkills(pluginRoot)
	if err != nil {
		return errorOutput(err), 1
	}

	fingerprint, err := skillreg.CalculateFingerprint(discovery.FingerprintPaths)
	if err != nil {
		return errorOutput(err), 1
	}

	cachePath := s.CachePath()
	currentCache, _ := skillreg.ReadCache(cachePath)

	// Cache hit: same version and same fingerprint.
	cacheHit := false
	if currentCache != nil {
		v, _ := currentCache["version"].(float64)
		fp, _ := currentCache["fingerprint"].(string)
		cacheHit = int(v) == skillreg.CacheVersion && fp == fingerprint
	}

	regStatus := "generated"
	if cacheHit {
		regStatus = "reused"
	}

	if !cacheHit {
		// Resolve now timestamp.
		generatedAt := time.Now().UTC().Format(time.RFC3339Nano)
		if nowStr := strings.TrimSpace(input.Now); nowStr != "" {
			generatedAt = nowStr
		}

		// Build skills slice for cache.
		skillsSlice := make([]map[string]any, len(discovery.Skills))
		for i, sk := range discovery.Skills {
			triggers := make([]any, len(sk.Triggers))
			for j, tr := range sk.Triggers {
				triggers[j] = tr
			}
			rules := make([]any, len(sk.CompactRules))
			for j, r := range sk.CompactRules {
				rules[j] = r
			}
			skillsSlice[i] = map[string]any{
				"id":           sk.ID,
				"path":         sk.Path,
				"triggers":     triggers,
				"compact_rules": rules,
			}
		}

		cache := map[string]any{
			"version":      skillreg.CacheVersion,
			"fingerprint":  fingerprint,
			"generated_at": generatedAt,
			"skills":       skillsSlice,
		}
		if err := skillreg.WriteCache(cachePath, cache); err != nil {
			return errorOutput(err), 1
		}
	}

	out := sessionStartOutput{
		Status:        "ok",
		OspecDetected: true,
		Registry: registryResult{
			Status: regStatus,
			Path:   store.CacheRelPath,
		},
	}
	if baselineHint != "" {
		out.Baseline = &baselineResult{Hint: baselineHint}
	}

	b, _ := json.Marshal(out)
	return b, 0
}

// errorOutput encodes a {status:"error",message:...} blob.
func errorOutput(err error) []byte {
	type errOut struct {
		Status  string `json:"status"`
		Message string `json:"message"`
	}
	b, _ := json.Marshal(errOut{Status: "error", Message: err.Error()})
	return b
}
