//go:build !windows

// Unit tests for validatePath — POSIX-literal path cases.
// Build-tagged !windows so filepath.IsAbs and separator semantics are real.
package hooks

import "testing"

func TestValidatePath_Posix(t *testing.T) {
	cases := []struct {
		name        string
		input       string
		wantOK      bool
		wantCleaned string
	}{
		{
			name:        "valid absolute dir",
			input:       "/home/user/project",
			wantOK:      true,
			wantCleaned: "/home/user/project",
		},
		{
			name:        "valid absolute file",
			input:       "/tmp/session/transcript.jsonl",
			wantOK:      true,
			wantCleaned: "/tmp/session/transcript.jsonl",
		},
		{
			name:   "relative traversal",
			input:  "../../etc",
			wantOK: false,
		},
		{
			name:   "relative non-traversal",
			input:  "relative/path",
			wantOK: false,
		},
		{
			name:   "empty string",
			input:  "",
			wantOK: false,
		},
		{
			name:   "whitespace only",
			input:  "   ",
			wantOK: false,
		},
		// Triangulation: lexical collapse — filepath.Clean resolves /home/u/../../../etc
		// to /etc; the result is absolute with no ".." segment, so it must be accepted.
		{
			name:        "lexical collapse to absolute with no dot-dot",
			input:       "/home/u/../../../etc",
			wantOK:      true,
			wantCleaned: "/etc",
		},
		// 4R CRITICAL: filesystem root must be rejected.
		// filepath.Dir("/") == "/" (same as itself) → detected as root.
		// A cwd of "/" would steer .ospec/ writes to the filesystem root —
		// the exact write-steering fu-c2 aims to prevent.
		// RED proof: without the filepath.Dir(cleaned)==cleaned check in validatePath,
		// this case would return ok=true, making this test FAIL.
		{
			name:   "filesystem root rejected",
			input:  "/",
			wantOK: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			cleaned, ok := validatePath(tc.input)
			if ok != tc.wantOK {
				t.Errorf("validatePath(%q) ok = %v, want %v", tc.input, ok, tc.wantOK)
			}
			if tc.wantOK && cleaned != tc.wantCleaned {
				t.Errorf("validatePath(%q) cleaned = %q, want %q", tc.input, cleaned, tc.wantCleaned)
			}
			if !tc.wantOK && cleaned != "" {
				t.Errorf("validatePath(%q) cleaned = %q, want empty on reject", tc.input, cleaned)
			}
		})
	}
}
