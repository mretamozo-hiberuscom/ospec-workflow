// subagent-stop hook handler.
// Ports runSubagentStop from scripts/hooks/subagent-stop.js.
// Always exits 0 and emits {"continue":true}. Uses internal/store for advisory-locked append.
package hooks

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/store"
)

func init() {
	Register(&subagentStopHandler{})
}

type subagentStopHandler struct{}

func (h *subagentStopHandler) Name() string { return "subagent-stop" }

// resultFields mirrors RESULT_FIELDS in subagent-stop.js.
var resultFields = []string{
	"result",
	"output",
	"response",
	"final_output",
	"final_result",
	"message",
	"content",
}

// NormalizeResolution lowercases and trims a resolution value.
func NormalizeResolution(value any) string {
	return strings.ToLower(strings.TrimSpace(fmt.Sprintf("%v", value)))
}

// IsDegradedResolution reports whether resolution is one of the three degraded values.
// Exported for testing.
func IsDegradedResolution(resolution string) bool {
	switch resolution {
	case "fallback-registry", "fallback-path", "none":
		return true
	}
	return false
}

// FindStructuredResolution searches v recursively for a skill_resolution field.
// JSON payloads are always acyclic, so no cycle-detection is needed.
// Exported for testing.
func FindStructuredResolution(v any) string {
	if v == nil {
		return ""
	}
	switch val := v.(type) {
	case map[string]any:
		if res, ok := val["skill_resolution"]; ok {
			if s := NormalizeResolution(res); s != "" {
				return s
			}
		}
		// Collect and reverse-iterate values (mirrors JS Object.values().reverse()).
		values := make([]any, 0, len(val))
		for _, item := range val {
			values = append(values, item)
		}
		for i := len(values) - 1; i >= 0; i-- {
			if res := FindStructuredResolution(values[i]); res != "" {
				return res
			}
		}
	case []any:
		for i := len(val) - 1; i >= 0; i-- {
			if res := FindStructuredResolution(val[i]); res != "" {
				return res
			}
		}
	}
	return ""
}

// parseJsonText attempts to JSON-decode a string, returning nil on failure.
func parseJsonText(text string) any {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	var v any
	if err := json.Unmarshal([]byte(text), &v); err != nil {
		return nil
	}
	return v
}

// findTextResolution extracts a skill_resolution value from free text.
// Ports findTextResolution from subagent-stop.js.
func findTextResolution(text string) string {
	parsed := parseJsonText(text)
	if parsed != nil {
		if res := FindStructuredResolution(parsed); res != "" {
			return res
		}
	}
	// Regex fallback: last occurrence of skill_resolution: value.
	idx := strings.LastIndex(strings.ToLower(text), "skill_resolution")
	if idx == -1 {
		return ""
	}
	rest := text[idx+len("skill_resolution"):]
	// Skip optional quotes, colon, equals, spaces.
	rest = strings.TrimLeft(rest, " \t\"'`:= ")
	// Extract alphanumeric+dash token.
	end := 0
	for end < len(rest) {
		c := rest[end]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '-' || (c >= '0' && c <= '9') {
			end++
		} else {
			break
		}
	}
	return strings.ToLower(strings.TrimRight(rest[:end], `"'` + "`"))
}

// findResolutionInValue dispatches between string and object values.
func findResolutionInValue(v any) string {
	switch val := v.(type) {
	case string:
		return findTextResolution(val)
	default:
		return FindStructuredResolution(v)
	}
}

// findResolutionInInput extracts the resolution from the top-level input object.
// Ports findResolutionInInput from subagent-stop.js.
func findResolutionInInput(input map[string]any) string {
	if direct, ok := input["skill_resolution"]; ok {
		if s := NormalizeResolution(direct); s != "" {
			return s
		}
	}
	for _, field := range resultFields {
		v, ok := input[field]
		if !ok {
			continue
		}
		if res := findResolutionInValue(v); res != "" {
			return res
		}
	}
	return ""
}

// findResolutionInJsonLines scans JSONL content for a resolution, last match wins.
func findResolutionInJsonLines(content string) string {
	lines := strings.Split(content, "\n")
	// Scan in reverse.
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if line == "" {
			continue
		}
		parsed := parseJsonText(line)
		if parsed == nil {
			continue
		}
		m, ok := parsed.(map[string]any)
		if !ok {
			continue
		}
		if res := FindStructuredResolution(m); res != "" {
			return res
		}
		for _, field := range resultFields {
			v, ok := m[field]
			if !ok {
				continue
			}
			if res := findResolutionInValue(v); res != "" {
				return res
			}
		}
	}
	return ""
}

// findResolutionInTranscript reads a transcript file and extracts the resolution.
// The path must be absolute and contain no ".." segment; any rejected path is
// treated as absent (identical degradation to ENOENT) — no os.ReadFile call is made.
func findResolutionInTranscript(transcriptPath string) (string, error) {
	path, ok := validatePath(transcriptPath)
	if !ok {
		return "", nil // treated as absent — no readFilePermissive call
	}
	data, err := readFilePermissive(path)
	if err != nil {
		return "", err
	}
	if data == nil {
		return "", nil
	}
	content := string(data)
	if parsed := parseJsonText(content); parsed != nil {
		if res := FindStructuredResolution(parsed); res != "" {
			return res, nil
		}
	}
	return findResolutionInJsonLines(content), nil
}

// readFilePermissive reads a file, returning nil content (no error) for ENOENT/EACCES.
func readFilePermissive(path string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) || os.IsPermission(err) {
			return nil, nil
		}
		return nil, err
	}
	return data, nil
}

// resolveAgentName picks the best agent name field from input.
func resolveAgentName(input map[string]any) string {
	for _, field := range []string{"agent_type", "agent_name", "agent", "agent_id"} {
		if v, ok := input[field]; ok {
			if s := strings.TrimSpace(fmt.Sprintf("%v", v)); s != "" {
				return s
			}
		}
	}
	return "unknown"
}

// resolveTimestampFromInput gets timestamp from input or falls back to now.
func resolveTimestampFromInput(input map[string]any) string {
	if v, ok := input["timestamp"]; ok {
		if s := strings.TrimSpace(fmt.Sprintf("%v", v)); s != "" {
			return s
		}
	}
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func (h *subagentStopHandler) Run(stdin []byte) ([]byte, int) {
	var input map[string]any
	if err := json.Unmarshal(stdin, &input); err != nil {
		msg := fmt.Sprintf("SubagentStop observability failed: %s", err.Error())
		b, _ := json.Marshal(map[string]any{"continue": true, "systemMessage": msg})
		return b, 0
	}
	return runSubagentStop(input)
}

func runSubagentStop(input map[string]any) ([]byte, int) {
	resolution := findResolutionInInput(input)
	if resolution == "" {
		if tp, ok := input["transcript_path"].(string); ok {
			if res, err := findResolutionInTranscript(tp); err == nil {
				resolution = res
			}
		}
	}

	if !IsDegradedResolution(resolution) {
		// Healthy or unavailable — no event.
		b, _ := json.Marshal(map[string]bool{"continue": true})
		return b, 0
	}

	event := map[string]any{
		"timestamp":        resolveTimestampFromInput(input),
		"agent":            resolveAgentName(input),
		"skill_resolution": resolution,
		"action":           "refresh-registry-next-delegation",
	}

	workspace := resolveCwd(func() string {
		if v, ok := input["cwd"].(string); ok {
			return v
		}
		return ""
	}())
	s := store.NewStore(workspace)

	eventBytes, _ := json.Marshal(event)
	if err := s.AppendRuntimeEvent(eventBytes); err != nil {
		msg := fmt.Sprintf("SubagentStop observability failed: %s", err.Error())
		b, _ := json.Marshal(map[string]any{"continue": true, "systemMessage": msg})
		return b, 0
	}

	b, _ := json.Marshal(map[string]any{
		"continue":      true,
		"systemMessage": "Subagent skill resolution degraded; refresh the skill registry before the next delegation.",
	})
	return b, 0
}
