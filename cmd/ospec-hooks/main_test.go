package main_test

import (
	"testing"

	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/hooks"
)

// TestDispatch_UnknownSubcommand verifies that an unregistered subcommand
// results in a non-zero exit code and no hook JSON written to stdout.
func TestDispatch_UnknownSubcommand(t *testing.T) {
	tests := []struct {
		name string
		args []string
	}{
		{name: "unknown string", args: []string{"unknown-cmd"}},
		{name: "nil args", args: nil},
		{name: "empty args", args: []string{}},
		{name: "empty string subcommand", args: []string{""}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stdout, exitCode := hooks.Dispatch(tt.args, []byte("{}"))
			if exitCode == 0 {
				t.Errorf("Dispatch(%v) exitCode = 0, want non-zero", tt.args)
			}
			if len(stdout) != 0 {
				t.Errorf("Dispatch(%v) stdout = %q, want empty", tt.args, stdout)
			}
		})
	}
}

// TestDispatch_KnownSubcommandRoutes verifies that a registered handler is
// called and its output is returned (not swallowed by the dispatcher).
// This test registers a stub handler in the same test binary.
func TestDispatch_KnownSubcommandRoutes(t *testing.T) {
	const stubName = "test-stub-handler"
	const stubOutput = `{"test":"ok"}`

	// Register a one-shot stub for this test.
	hooks.Register(&stubHandler{name: stubName, output: []byte(stubOutput), code: 0})
	t.Cleanup(func() { hooks.Unregister(stubName) })

	stdout, exitCode := hooks.Dispatch([]string{stubName}, []byte("{}"))
	if exitCode != 0 {
		t.Errorf("Dispatch(%q) exitCode = %d, want 0", stubName, exitCode)
	}
	if string(stdout) != stubOutput {
		t.Errorf("Dispatch(%q) stdout = %q, want %q", stubName, stdout, stubOutput)
	}
}

// stubHandler is a minimal Handler for use in tests only.
type stubHandler struct {
	name   string
	output []byte
	code   int
}

func (s *stubHandler) Name() string                              { return s.name }
func (s *stubHandler) Run(_ []byte) ([]byte, int)               { return s.output, s.code }
