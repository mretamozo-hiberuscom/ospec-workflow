// Package skillreg is a Go port of scripts/lib/skill-registry.js.
// It discovers skills in a plugin root, computes a deterministic fingerprint,
// and reads/writes a versioned JSON cache.
package skillreg

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// CacheVersion is the schema version written to the registry cache.
const CacheVersion = 2

// ── public types ──────────────────────────────────────────────────────────────

// SkillEntry holds the parsed metadata for a single skill.
type SkillEntry struct {
	ID           string   `json:"id"`
	Path         string   `json:"path"`
	Triggers     []string `json:"triggers"`
	CompactRules []string `json:"compact_rules"`
}

// FingerprintPath pairs a file's absolute path with its workspace-relative
// portable path (forward-slash separated) for deterministic hashing.
type FingerprintPath struct {
	AbsolutePath string
	RelativePath string
}

// DiscoveryResult is returned by DiscoverSkills.
type DiscoveryResult struct {
	// FingerprintPaths is the sorted set of all files included in the
	// fingerprint (SKILL.md + _shared/*.md + rules/*.md).
	FingerprintPaths []FingerprintPath
	// Skills is the filtered, sorted list of non-sdd, non-shared skills.
	Skills []SkillEntry
}

// ── regex ─────────────────────────────────────────────────────────────────────

var (
	frontmatterRe   = regexp.MustCompile(`(?s)^---\r?\n(.*?)\r?\n---\r?\n?`)
	triggerRe       = regexp.MustCompile(`(?i)\bTrigger:\s*(.+)$`)
	rulesSectionRe  = regexp.MustCompile(`(?i)\b(?:(?:hard|critical|core|decision)\s+)?(?:rules|patterns|constraints|gates)\b`)
	headingRe       = regexp.MustCompile(`^#{2,4}\s+(.+?)\s*$`)
	bulletRe        = regexp.MustCompile(`^\s*(?:[-*+]|\d+\.)\s+`)
	tableSepRe      = regexp.MustCompile(`^\|[\s:|-]+\|$`)
	tableRowRe      = regexp.MustCompile(`^\|.+\|$`)
)

// ── DiscoverSkills ────────────────────────────────────────────────────────────

// DiscoverSkills walks root/skills/ and root/rules/ to collect fingerprint
// paths and parsed skill entries.  Missing directories are silently skipped.
func DiscoverSkills(root string) (*DiscoveryResult, error) {
	absRoot := filepath.Clean(root)
	skillsRoot := filepath.Join(absRoot, "skills")
	rulesRoot := filepath.Join(absRoot, "rules")

	skillFiles, err := collectFiles(skillsRoot, func(abs string) bool {
		rel := toPortablePath(relativeTo(absRoot, abs))
		return filepath.Base(abs) == "SKILL.md" ||
			(strings.HasPrefix(rel, "skills/_shared/") && strings.HasSuffix(abs, ".md"))
	})
	if err != nil {
		return nil, fmt.Errorf("skillreg.DiscoverSkills skills: %w", err)
	}

	ruleFiles, err := collectFiles(rulesRoot, func(abs string) bool {
		return strings.HasSuffix(abs, ".md")
	})
	if err != nil {
		return nil, fmt.Errorf("skillreg.DiscoverSkills rules: %w", err)
	}

	// Build fingerprint paths sorted by relative path.
	combined := append(skillFiles, ruleFiles...)
	var fpPaths []FingerprintPath
	for _, abs := range combined {
		fpPaths = append(fpPaths, FingerprintPath{
			AbsolutePath: abs,
			RelativePath: toPortablePath(relativeTo(absRoot, abs)),
		})
	}
	sort.Slice(fpPaths, func(i, j int) bool {
		return fpPaths[i].RelativePath < fpPaths[j].RelativePath
	})

	// Parse skills from files that satisfy shouldIncludeSkill.
	var skills []SkillEntry
	for _, fp := range fpPaths {
		if !shouldIncludeSkill(fp.RelativePath) {
			continue
		}
		data, err := os.ReadFile(fp.AbsolutePath)
		if err != nil {
			return nil, fmt.Errorf("skillreg.DiscoverSkills read %s: %w", fp.AbsolutePath, err)
		}
		attrs, body := parseFrontmatter(string(data))
		fallbackName := filepath.Base(filepath.Dir(fp.AbsolutePath))
		id := attrs["name"]
		if id == "" {
			id = fallbackName
		}
		skills = append(skills, SkillEntry{
			ID:           id,
			Path:         fp.RelativePath,
			Triggers:     extractTriggers(attrs["description"], id),
			CompactRules: extractCompactRules(body),
		})
	}
	sort.Slice(skills, func(i, j int) bool {
		return skills[i].ID < skills[j].ID
	})

	return &DiscoveryResult{FingerprintPaths: fpPaths, Skills: skills}, nil
}

// shouldIncludeSkill mirrors the JS shouldIncludeSkill filter.
func shouldIncludeSkill(relPath string) bool {
	parts := strings.SplitN(relPath, "/", 3)
	if len(parts) < 2 {
		return false
	}
	if parts[0] != "skills" {
		return false
	}
	if !strings.HasSuffix(relPath, "/SKILL.md") {
		return false
	}
	dir := parts[1]
	if dir == "_shared" || dir == "skill-registry" {
		return false
	}
	if strings.HasPrefix(dir, "sdd-") {
		return false
	}
	return true
}

// ── CalculateFingerprint ──────────────────────────────────────────────────────

// CalculateFingerprint computes a sha256 fingerprint over the sorted set of
// fingerprint paths.  The hash includes each file's relative path and content,
// matching the JS calculateFingerprint implementation.
func CalculateFingerprint(paths []FingerprintPath) (string, error) {
	sorted := make([]FingerprintPath, len(paths))
	copy(sorted, paths)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].RelativePath < sorted[j].RelativePath
	})

	h := sha256.New()
	for _, fp := range sorted {
		data, err := os.ReadFile(fp.AbsolutePath)
		if err != nil {
			return "", fmt.Errorf("skillreg.CalculateFingerprint read %s: %w", fp.AbsolutePath, err)
		}
		h.Write([]byte(fp.RelativePath))
		h.Write([]byte{0})
		h.Write(data)
		h.Write([]byte{0})
	}
	return fmt.Sprintf("sha256:%x", h.Sum(nil)), nil
}

// ── ReadCache / WriteCache ────────────────────────────────────────────────────

// ReadCache reads and JSON-decodes the cache at path.
// Returns (nil, nil) when the file is absent or contains invalid JSON.
func ReadCache(path string) (map[string]any, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("skillreg.ReadCache: %w", err)
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, nil // treat corrupted cache as a miss
	}
	return result, nil
}

// WriteCache atomically writes data as pretty-printed JSON + newline to path.
func WriteCache(path string, data map[string]any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Errorf("skillreg.WriteCache mkdir: %w", err)
	}
	bs, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("skillreg.WriteCache marshal: %w", err)
	}
	bs = append(bs, '\n')

	tmp, err := os.CreateTemp(filepath.Dir(path), ".cache-*")
	if err != nil {
		return fmt.Errorf("skillreg.WriteCache temp: %w", err)
	}
	tmpPath := tmp.Name()

	_, wErr := tmp.Write(bs)
	cErr := tmp.Close()
	if wErr != nil || cErr != nil {
		_ = os.Remove(tmpPath)
		if wErr != nil {
			return fmt.Errorf("skillreg.WriteCache write: %w", wErr)
		}
		return fmt.Errorf("skillreg.WriteCache close: %w", cErr)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("skillreg.WriteCache rename: %w", err)
	}
	return nil
}

// ── parsing helpers ───────────────────────────────────────────────────────────

// parseFrontmatter extracts the YAML frontmatter attributes and body.
func parseFrontmatter(content string) (attrs map[string]string, body string) {
	attrs = map[string]string{}
	m := frontmatterRe.FindStringIndex(content)
	if m == nil {
		return attrs, content
	}
	full := content[m[0]:m[1]]
	// Extract the YAML block between the two --- lines.
	inner := frontmatterRe.FindStringSubmatch(content)
	if inner == nil {
		return attrs, content
	}
	for _, line := range strings.Split(inner[1], "\n") {
		line = strings.TrimRight(line, "\r")
		sep := strings.IndexByte(line, ':')
		if sep == -1 {
			continue
		}
		if len(line) > 0 && (line[0] == ' ' || line[0] == '\t') {
			continue
		}
		key := strings.TrimSpace(line[:sep])
		val := strings.TrimSpace(line[sep+1:])
		// Strip surrounding quotes.
		if n := len(val); n >= 2 {
			q := val[0]
			if (q == '"' || q == '\'') && val[n-1] == q {
				val = val[1 : n-1]
			}
		}
		attrs[key] = val
	}
	_ = full
	return attrs, content[m[1]:]
}

// extractTriggers parses the "Trigger: X, Y" fragment from description.
func extractTriggers(description, fallback string) []string {
	m := triggerRe.FindStringSubmatch(description)
	if m == nil {
		return []string{fallback}
	}
	var triggers []string
	for _, part := range strings.FieldsFunc(m[1], func(r rune) bool { return r == ',' || r == ';' }) {
		part = strings.TrimSpace(part)
		if part != "" {
			triggers = append(triggers, part)
		}
	}
	if len(triggers) == 0 {
		return []string{fallback}
	}
	return triggers
}

// extractCompactRules extracts up to 15 rules from a rules/constraints section.
func extractCompactRules(body string) []string {
	lines := strings.Split(body, "\n")
	var rules []string
	seen := map[string]bool{}
	inRulesSection := false

	addRule := func(raw string) {
		r := strings.TrimSpace(bulletRe.ReplaceAllString(raw, ""))
		if r != "" && !seen[r] {
			seen[r] = true
			rules = append(rules, r)
		}
	}

	for _, line := range lines {
		line = strings.TrimRight(line, "\r")
		if hm := headingRe.FindStringSubmatch(line); hm != nil {
			inRulesSection = rulesSectionRe.MatchString(hm[1])
			continue
		}
		if !inRulesSection {
			continue
		}
		if bulletRe.MatchString(line) {
			addRule(line)
			continue
		}
		if tableRowRe.MatchString(line) && !tableSepRe.MatchString(line) {
			cols := strings.Split(line, "|")
			if len(cols) > 2 {
				cols = cols[1 : len(cols)-1]
			}
			for i, c := range cols {
				cols[i] = strings.TrimSpace(c)
			}
			label := strings.ToLower(cols[0])
			if len(cols) >= 2 && label != "rule" && label != "gate" {
				addRule(cols[0] + ": " + strings.Join(cols[1:], " - "))
			}
		}
	}

	// Fallback: all bullets if no rules section matched.
	if len(rules) == 0 {
		for _, line := range lines {
			if bulletRe.MatchString(line) {
				addRule(line)
			}
			if len(rules) >= 15 {
				break
			}
		}
	}

	if len(rules) > 15 {
		rules = rules[:15]
	}
	return rules
}

// ── fs helpers ────────────────────────────────────────────────────────────────

// collectFiles recursively walks root and returns files passing include.
// Missing root directory is silently ignored.
func collectFiles(root string, include func(abs string) bool) ([]string, error) {
	var files []string
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return nil
			}
			return err
		}
		if !info.IsDir() && include(path) {
			files = append(files, path)
		}
		return nil
	})
	if err != nil && errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	// Sort entries within each directory for determinism (Walk already sorts).
	sort.Strings(files)
	return files, err
}

// relativeTo returns the path of abs relative to base, using os-specific
// separators.
func relativeTo(base, abs string) string {
	rel, err := filepath.Rel(base, abs)
	if err != nil {
		return abs
	}
	return rel
}

// toPortablePath converts OS path separators to forward slashes.
func toPortablePath(p string) string {
	return filepath.ToSlash(p)
}
