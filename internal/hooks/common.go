// Package hooks — shared helpers used by multiple hook handlers.
// Extracted during the WU-2 refactor step to eliminate duplication between
// precompact.go, stop.go, and subagentstop.go.
package hooks

import (
	"path/filepath"
	"strings"
)

// validatePath returns (cleaned, true) when p is an absolute path whose
// cleaned form contains no ".." segment and is NOT a filesystem or volume root.
// Any other input returns ("", false).
// This is the single shared policy for both cwd and transcript_path validation.
//
// Root detection: filepath.Dir(cleaned) == cleaned is true for "/", "C:\",
// and UNC volume roots such as "\\host\share" — all of which are rejected to
// prevent write-steering to the filesystem root (fu-c2).
func validatePath(p string) (cleaned string, ok bool) {
	p = strings.TrimSpace(p)
	if p == "" {
		return "", false
	}
	cleaned = filepath.Clean(p)
	if !filepath.IsAbs(cleaned) {
		return "", false
	}
	for _, seg := range strings.Split(filepath.ToSlash(cleaned), "/") {
		if seg == ".." {
			return "", false
		}
	}
	// Reject filesystem/volume roots: filepath.Dir(cleaned) == cleaned is true
	// for "/", "C:\", "\\host\share", etc.  Such a path accepted as a workspace
	// root would steer .ospec/ writes to the filesystem root.
	if filepath.Dir(cleaned) == cleaned {
		return "", false
	}
	return cleaned, true
}

// continueWithError and resolveCwd are defined in precompact.go.
// Both stop.go and subagentstop.go use them from this package since they are
// in the same package namespace.
