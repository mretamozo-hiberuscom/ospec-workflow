//go:build windows

// Unit tests for validatePath — Windows-literal path cases.
// Build-tagged windows so filepath.IsAbs and separator semantics are real.
package hooks

import "testing"

func TestValidatePath_Windows(t *testing.T) {
	cases := []struct {
		name        string
		input       string
		wantOK      bool
		wantCleaned string
	}{
		{
			name:        "valid absolute dir",
			input:       `C:\Users\user\project`,
			wantOK:      true,
			wantCleaned: `C:\Users\user\project`,
		},
		{
			name:        "valid absolute file",
			input:       `C:\sessions\transcript.jsonl`,
			wantOK:      true,
			wantCleaned: `C:\sessions\transcript.jsonl`,
		},
		{
			name:   "Windows traversal dir",
			input:  `..\..\Windows\System32`,
			wantOK: false,
		},
		{
			name:   "Windows traversal file",
			input:  `..\..\secrets.txt`,
			wantOK: false,
		},
		{
			name:   "Windows relative",
			input:  `relative\path`,
			wantOK: false,
		},
		// 4R CRITICAL: drive root must be rejected.
		// filepath.Dir("C:\\") == "C:\\" (same as itself) → detected as root.
		// A cwd of "C:\" would steer .ospec/ writes to the filesystem root —
		// the exact write-steering fu-c2 aims to prevent.
		// RED proof: without the filepath.Dir(cleaned)==cleaned check in validatePath,
		// this case would return ok=true, making this test FAIL.
		{
			name:   "drive root C:\\ rejected",
			input:  `C:\`,
			wantOK: false,
		},
		// 4R CRITICAL: UNC volume root must also be rejected.
		// filepath.Dir("\\\\host\\share") == "\\\\host\\share" (same as itself) → root.
		{
			name:   "UNC volume root rejected",
			input:  `\\host\share`,
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
