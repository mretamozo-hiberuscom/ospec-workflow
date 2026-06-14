// pre-tool-use hook handler.
// Ports evaluateToolUse and extractCommands
// from scripts/hooks/pre-tool-use.js.  Uses internal/rules for DENY/ASK logic.
package hooks

import (
	"encoding/json"

	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/rules"
)

func init() {
	Register(&preToolUseHandler{})
}

type preToolUseHandler struct{}

func (h *preToolUseHandler) Name() string { return "pre-tool-use" }

// toolInput is the shape of the tool_input JSON object.
// command and commands can be mixed types so we use json.RawMessage.
type toolInput struct {
	Command  *string           `json:"command"`
	Commands []json.RawMessage `json:"commands"`
}

type preToolUseInput struct {
	ToolName  string    `json:"tool_name"`
	ToolInput toolInput `json:"tool_input"`
}

// extractCommands ports extractCommands from pre-tool-use.js:
// collects strings from tool_input.command (string) and tool_input.commands
// (array of strings or {command:string} objects).
func extractCommands(input *preToolUseInput) []string {
	if input == nil {
		return nil
	}
	var cmds []string
	if input.ToolInput.Command != nil {
		cmds = append(cmds, *input.ToolInput.Command)
	}
	for _, raw := range input.ToolInput.Commands {
		// Try string first.
		var s string
		if err := json.Unmarshal(raw, &s); err == nil {
			cmds = append(cmds, s)
			continue
		}
		// Try {command: string} object.
		var obj struct {
			Command string `json:"command"`
		}
		if err := json.Unmarshal(raw, &obj); err == nil && obj.Command != "" {
			cmds = append(cmds, obj.Command)
		}
	}
	return cmds
}

// makeDecision builds the hookSpecificOutput JSON blob.
func makeDecision(decision, reason string) []byte {
	type hookOutput struct {
		HookEventName            string `json:"hookEventName"`
		PermissionDecision       string `json:"permissionDecision"`
		PermissionDecisionReason string `json:"permissionDecisionReason"`
	}
	type output struct {
		HookSpecificOutput hookOutput `json:"hookSpecificOutput"`
	}
	out := output{
		HookSpecificOutput: hookOutput{
			HookEventName:            "PreToolUse",
			PermissionDecision:       decision,
			PermissionDecisionReason: reason,
		},
	}
	b, _ := json.Marshal(out)
	return b
}

func (h *preToolUseHandler) Run(stdin []byte) ([]byte, int) {
	var input preToolUseInput
	if err := json.Unmarshal(stdin, &input); err != nil {
		return makeDecision("ask",
			"The safety hook could not inspect this tool call: "+err.Error()), 0
	}

	cmds := extractCommands(&input)

	if len(cmds) == 0 {
		// No commands: allow regardless of tool type (matches JS evaluateToolUse).
		return makeDecision("allow", "Tool did not include a command payload."), 0
	}

	// Pass 1: deny takes priority across all commands.
	for _, cmd := range cmds {
		action, reason := rules.Evaluate(cmd)
		if action == "deny" {
			return makeDecision("deny", reason), 0
		}
	}

	// Pass 2: ask (only if no deny matched).
	for _, cmd := range cmds {
		action, reason := rules.Evaluate(cmd)
		if action == "ask" {
			return makeDecision("ask", reason), 0
		}
	}

	return makeDecision("allow", "Command payload passed the safety policy."), 0
}
