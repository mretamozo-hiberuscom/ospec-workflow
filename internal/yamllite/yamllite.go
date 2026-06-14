// Package yamllite provides lightweight inline YAML scalar and list extraction
// without a full YAML parser.  It ports extractFirstScalar, extractListSection,
// and formatNextAction from scripts/hooks/pre-compact.js.
package yamllite

import (
	"fmt"
	"regexp"
	"strings"
)

// ListItem is a single element extracted from a YAML list section.
// Either Value (string item) or Fields (object item) is non-zero.
type ListItem struct {
	Value  string
	Fields map[string]string
}

// ── private ───────────────────────────────────────────────────────────────────

var (
	keyValueRe      = regexp.MustCompile(`^([^:]+):(?:\s*(.*))?$`)
	inlineCommentRe = regexp.MustCompile(`\s+#.*$`)
	sddCommandRe    = regexp.MustCompile(`(?i)^\/?sdd-[a-z-]+$`)
	fieldRe         = regexp.MustCompile(`^([^:]+):\s*(.*)$`)
)

type yamlLine struct {
	indent  int
	content string
}

type stackEntry struct {
	indent int
	key    string
}

// parseYamlLines splits content into trimmed lines with indent levels,
// discarding blank lines and comment-only lines.
func parseYamlLines(content string) []yamlLine {
	var out []yamlLine
	for _, raw := range strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n") {
		raw = strings.TrimRight(raw, "\r")
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		indent := len(raw) - len(strings.TrimLeft(raw, " \t"))
		out = append(out, yamlLine{indent: indent, content: trimmed})
	}
	return out
}

// parseScalar strips surrounding matching quotes or inline trailing comments.
// Ports parseScalar from scripts/hooks/pre-compact.js.
func parseScalar(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	// Matching surrounding quotes (single or double).
	if n := len(trimmed); n >= 2 {
		q := trimmed[0]
		if (q == '"' || q == '\'') && trimmed[n-1] == q {
			return trimmed[1 : n-1]
		}
	}
	return strings.TrimSpace(inlineCommentRe.ReplaceAllString(trimmed, ""))
}

// extractScalarAtPath searches content for a scalar at the given YAML key path.
// Returns "" if not found.
func extractScalarAtPath(content string, expectedPath []string) string {
	var stack []stackEntry
	for _, line := range parseYamlLines(content) {
		if strings.HasPrefix(line.content, "- ") {
			continue
		}
		m := keyValueRe.FindStringSubmatch(line.content)
		if m == nil {
			continue
		}
		// Pop stack entries whose indent >= current line's indent.
		for len(stack) > 0 && stack[len(stack)-1].indent >= line.indent {
			stack = stack[:len(stack)-1]
		}
		key := strings.TrimSpace(m[1])
		value := ""
		if len(m) > 2 {
			value = m[2]
		}
		// Build the current path from stack keys + this key.
		if len(stack)+1 == len(expectedPath) {
			pathMatches := true
			for i, e := range stack {
				if e.key != expectedPath[i] {
					pathMatches = false
					break
				}
			}
			if pathMatches && key == expectedPath[len(expectedPath)-1] && value != "" {
				return parseScalar(value)
			}
		}
		if value == "" {
			stack = append(stack, stackEntry{indent: line.indent, key: key})
		}
	}
	return ""
}

// extractTopLevelSection collects all lines belonging to a named top-level
// YAML section (stops at the next non-empty top-level key).
func extractTopLevelSection(content, sectionName string) []string {
	var result []string
	collecting := false
	patternStr := fmt.Sprintf(`^%s:\s*(?:#.*)?$`, regexp.QuoteMeta(sectionName))
	sectionRe := regexp.MustCompile(patternStr)

	for _, raw := range strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n") {
		raw = strings.TrimRight(raw, "\r")
		trimmed := strings.TrimSpace(raw)
		indent := len(raw) - len(strings.TrimLeft(raw, " \t"))

		if !collecting {
			if indent == 0 && sectionRe.MatchString(trimmed) {
				collecting = true
			}
			continue
		}
		// Break on any non-empty top-level (indent 0) line.
		if trimmed != "" && indent <= 0 {
			break
		}
		result = append(result, raw)
	}
	return result
}

// ── exported ──────────────────────────────────────────────────────────────────

// ExtractFirstScalar returns the scalar value at the first matching YAML path.
// paths is tried in order; "" is returned if none match.
func ExtractFirstScalar(content string, paths [][]string) string {
	for _, path := range paths {
		if v := extractScalarAtPath(content, path); v != "" {
			return v
		}
	}
	return ""
}

// ExtractListSection extracts list items from the named top-level YAML section.
// Each item is either a plain string (ListItem.Value) or a mapping
// (ListItem.Fields).
func ExtractListSection(content, sectionName string) []ListItem {
	section := extractTopLevelSection(content, sectionName)
	var items []ListItem
	var current *ListItem
	itemIndent := -1

	for _, raw := range section {
		trimmed := strings.TrimSpace(raw)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		indent := len(raw) - len(strings.TrimLeft(raw, " \t"))

		if strings.HasPrefix(trimmed, "- ") {
			if itemIndent == -1 {
				itemIndent = indent
			}
			if indent != itemIndent {
				continue
			}
			item := strings.TrimSpace(trimmed[2:])
			if fm := fieldRe.FindStringSubmatch(item); fm != nil {
				li := ListItem{Fields: map[string]string{
					strings.TrimSpace(fm[1]): parseScalar(fm[2]),
				}}
				items = append(items, li)
				current = &items[len(items)-1]
			} else {
				items = append(items, ListItem{Value: parseScalar(item)})
				current = nil
			}
			continue
		}
		// Continuation field of the current object item.
		if current != nil && current.Fields != nil && itemIndent >= 0 && indent == itemIndent+2 {
			if fm := fieldRe.FindStringSubmatch(trimmed); fm != nil {
				current.Fields[strings.TrimSpace(fm[1])] = parseScalar(fm[2])
			}
		}
	}
	return items
}

// FormatNextAction formats the next recommended action text for a change.
// Ports formatNextAction from scripts/hooks/pre-compact.js.
func FormatNextAction(value, changeName string) string {
	next := strings.TrimSpace(value)
	if next == "" {
		return fmt.Sprintf("Run `sdd-continue %s`.", changeName)
	}
	if strings.ToLower(next) == "none" {
		return "None."
	}
	if sddCommandRe.MatchString(next) {
		cmd := strings.TrimPrefix(next, "/")
		return fmt.Sprintf("Run `%s %s`.", cmd, changeName)
	}
	if strings.HasSuffix(next, ".") {
		return next
	}
	return next + "."
}
