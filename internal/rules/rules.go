// Package rules embeds and evaluates the DENY/ASK safety rules verbatim from
// the JS pre-tool-use hook.  regexp2 is used instead of the stdlib regexp
// because four patterns use lookahead assertions ((?=…)) that RE2 cannot compile.
package rules

import (
	_ "embed"
	"encoding/json"
	"strings"

	"github.com/dlclark/regexp2"
)

//go:embed rules.json
var rulesJSON []byte

// ruleEntry is the on-disk representation of a single rule in rules.json.
type ruleEntry struct {
	Action  string `json:"action"`
	Flags   string `json:"flags"`
	Pattern string `json:"pattern"`
	Reason  string `json:"reason"`
}

// compiledRule is a parsed and compiled rule ready for matching.
type compiledRule struct {
	action  string
	reason  string
	pattern *regexp2.Regexp
}

// compiled holds all rules, in order: DENY rules first, then ASK rules.
// Populated by init().
var compiled []compiledRule

func init() {
	var entries []ruleEntry
	if err := json.Unmarshal(rulesJSON, &entries); err != nil {
		panic("rules: failed to parse embedded rules.json: " + err.Error())
	}

	compiled = make([]compiledRule, 0, len(entries))
	for _, e := range entries {
		opts := regexp2.None
		if strings.ContainsRune(e.Flags, 'i') {
			opts |= regexp2.IgnoreCase
		}
		re := regexp2.MustCompile(e.Pattern, opts)
		compiled = append(compiled, compiledRule{
			action:  e.Action,
			reason:  e.Reason,
			pattern: re,
		})
	}
}

// Evaluate checks cmd against the embedded rule set.
// It returns ("deny", reason), ("ask", reason), or ("allow", reason).
// DENY rules are evaluated before ASK rules, preserving the same precedence
// as the original JS evaluateToolUse function.
func Evaluate(cmd string) (action, reason string) {
	// Pass 1: deny rules (checked before ask, matching JS precedence).
	for i := range compiled {
		r := &compiled[i]
		if r.action != "deny" {
			continue
		}
		if matched, _ := r.pattern.MatchString(cmd); matched {
			return "deny", r.reason
		}
	}

	// Pass 2: ask rules.
	for i := range compiled {
		r := &compiled[i]
		if r.action != "ask" {
			continue
		}
		if matched, _ := r.pattern.MatchString(cmd); matched {
			return "ask", r.reason
		}
	}

	return "allow", "Command payload passed the safety policy."
}
