package jsonio_test

import (
	"bytes"
	"strings"
	"testing"

	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/jsonio"
)

// TestReadInput_EmptyAndWhitespace verifies that empty or whitespace-only input
// returns the sentinel value []byte("{}") rather than an error.
func TestReadInput_EmptyAndWhitespace(t *testing.T) {
	tests := []struct {
		name  string
		input string
	}{
		{name: "empty bytes", input: ""},
		{name: "single newline", input: "\n"},
		{name: "whitespace only", input: "   \t\n  "},
		{name: "carriage return newline", input: "\r\n"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := strings.NewReader(tt.input)
			got, err := jsonio.ReadInput(r)
			if err != nil {
				t.Fatalf("ReadInput(%q) returned unexpected error: %v", tt.input, err)
			}
			if string(got) != "{}" {
				t.Errorf("ReadInput(%q) = %q, want %q", tt.input, got, "{}")
			}
		})
	}
}

// TestReadInput_ValidJSON verifies that non-empty input is returned as-is
// (ReadInput does not parse or validate JSON; callers do that).
func TestReadInput_ValidJSON(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "simple object",
			input: `{"tool_name":"bash","tool_input":{"command":"git status"}}`,
			want:  `{"tool_name":"bash","tool_input":{"command":"git status"}}`,
		},
		{
			name:  "object with trailing newline",
			input: `{"key":"value"}` + "\n",
			want:  `{"key":"value"}`,
		},
		{
			name:  "minimal object",
			input: "{}",
			want:  "{}",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := strings.NewReader(tt.input)
			got, err := jsonio.ReadInput(r)
			if err != nil {
				t.Fatalf("ReadInput(%q) unexpected error: %v", tt.input, err)
			}
			if string(got) != tt.want {
				t.Errorf("ReadInput(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

// TestWriteOutput verifies that WriteOutput appends exactly one newline to the
// payload and writes it to the provided writer.
func TestWriteOutput(t *testing.T) {
	tests := []struct {
		name    string
		payload string
		want    string
	}{
		{
			name:    "simple JSON",
			payload: `{"status":"ok"}`,
			want:    `{"status":"ok"}` + "\n",
		},
		{
			name:    "empty bytes still gets newline",
			payload: "",
			want:    "\n",
		},
		{
			name:    "payload without trailing newline",
			payload: `{"continue":true}`,
			want:    `{"continue":true}` + "\n",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var buf bytes.Buffer
			err := jsonio.WriteOutput(&buf, []byte(tt.payload))
			if err != nil {
				t.Fatalf("WriteOutput(%q) unexpected error: %v", tt.payload, err)
			}
			if buf.String() != tt.want {
				t.Errorf("WriteOutput(%q) wrote %q, want %q", tt.payload, buf.String(), tt.want)
			}
		})
	}
}
