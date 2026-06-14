// stop hook handler.
// Ports runStop from scripts/hooks/stop.js.
// Always exits 0 and emits {"continue":true}. Uses internal/store + internal/yamllite.
package hooks

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/store"
	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/yamllite"
)

func init() {
	Register(&stopHandler{})
}

type stopHandler struct{}

func (h *stopHandler) Name() string { return "stop" }

// stopInput is the stdin payload for stop.
type stopInput struct {
	Cwd       string `json:"cwd"`
	Timestamp string `json:"timestamp"`
	SessionID string `json:"sessionId"`
	SessionIDUnderscore string `json:"session_id"`
}

type stopOutput struct {
	Continue     bool    `json:"continue"`
	Status       string  `json:"status,omitempty"`
	Path         string  `json:"path,omitempty"`
	ActiveChange *string `json:"activeChange,omitempty"`
	SystemMessage string `json:"systemMessage,omitempty"`
}

func (h *stopHandler) Run(stdin []byte) ([]byte, int) {
	var input stopInput
	if err := json.Unmarshal(stdin, &input); err != nil {
		return continueWithError(fmt.Sprintf("Stop hook could not write the session trace: %s", err.Error())), 0
	}

	if err := runStop(input); err != nil {
		return continueWithError(fmt.Sprintf("Stop hook could not write the session trace: %s", err.Error())), 0
	}

	b, _ := json.Marshal(map[string]bool{"continue": true})
	return b, 0
}

func runStop(input stopInput) error {
	workspace := resolveCwd(input.Cwd)
	s := store.NewStore(workspace)

	changes, err := s.FindActiveChanges()
	if err != nil {
		return err
	}

	var activeChange *store.ActiveChange
	if len(changes) > 0 {
		activeChange = changes[0]
	}

	changeName := ""
	currentPhase := ""
	status := ""
	nextRecommended := ""

	if activeChange != nil {
		changeName = yamllite.ExtractFirstScalar(activeChange.Content, [][]string{
			{"change", "name"},
		})
		if changeName == "" {
			changeName = activeChange.DirectoryName
		}
		currentPhase = yamllite.ExtractFirstScalar(activeChange.Content, [][]string{
			{"change", "current_phase"},
			{"current_phase"},
			{"phase"},
		})
		status = yamllite.ExtractFirstScalar(activeChange.Content, [][]string{
			{"change", "status"},
			{"status"},
		})
		nextRecommended = yamllite.ExtractFirstScalar(activeChange.Content, [][]string{
			{"next_recommended"},
		})
	}

	// Resolve timestamp.
	ts := strings.TrimSpace(input.Timestamp)
	if ts == "" {
		ts = time.Now().UTC().Format(time.RFC3339Nano)
	}

	// Resolve session ID — camelCase takes priority, then underscore.
	sessionID := strings.TrimSpace(input.SessionID)
	if sessionID == "" {
		sessionID = strings.TrimSpace(input.SessionIDUnderscore)
	}
	if sessionID == "" {
		sessionID = "unknown"
	}

	// Detailed summary path.
	detailedSummary := "None"
	if activeChange != nil {
		summaryPath := s.SessionSummaryPath(activeChange.DirectoryName)
		if info, err := os.Stat(summaryPath); err == nil && info.Mode().IsRegular() {
			rel, err := filepath.Rel(workspace, summaryPath)
			if err == nil {
				detailedSummary = filepath.ToSlash(rel)
			} else {
				detailedSummary = filepath.ToSlash(summaryPath)
			}
		}
	}

	// Resolve next action.
	var nextAction string
	if activeChange != nil {
		nextAction = yamllite.FormatNextAction(nextRecommended, changeName)
	} else {
		nextAction = "Start a new session when more work is needed."
	}

	latestContent := renderLatestSummary(renderLatestArgs{
		hasChange:    activeChange != nil,
		changeName:   changeName,
		currentPhase: currentPhase,
		status:       status,
		detailedSummary: detailedSummary,
		endedAt:      ts,
		sessionID:    sessionID,
		nextAction:   nextAction,
	})

	latestPath := s.LatestSessionPath()
	if err := os.MkdirAll(filepath.Dir(latestPath), 0755); err != nil {
		return fmt.Errorf("stop: mkdir: %w", err)
	}
	return os.WriteFile(latestPath, []byte(latestContent), 0644)
}

// renderLatestArgs bundles all rendering parameters.
type renderLatestArgs struct {
	hasChange       bool
	changeName      string
	currentPhase    string
	status          string
	detailedSummary string
	endedAt         string
	sessionID       string
	nextAction      string
}

// renderLatestSummary ports renderLatestSummary from stop.js.
func renderLatestSummary(a renderLatestArgs) string {
	activeChangeVal := "`None`"
	if a.hasChange {
		activeChangeVal = "`" + a.changeName + "`"
	}
	currentPhaseVal := "`None`"
	if a.hasChange {
		p := a.currentPhase
		if p == "" {
			p = "unknown"
		}
		currentPhaseVal = "`" + p + "`"
	}
	statusVal := "`None`"
	if a.hasChange {
		st := a.status
		if st == "" {
			st = "active"
		}
		statusVal = "`" + st + "`"
	}

	lines := []string{
		"# Latest Session",
		"",
		"- Ended at: `" + a.endedAt + "`",
		"- Session: `" + a.sessionID + "`",
		"- Active change: " + activeChangeVal,
		"- Current phase: " + currentPhaseVal,
		"- Change status: " + statusVal,
		"- Detailed summary: `" + a.detailedSummary + "`",
		"",
		"## Next recommended action",
		a.nextAction,
		"",
	}
	return strings.Join(lines, "\n")
}
