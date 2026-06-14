// Command ospec-hooks is the single cross-compiled Go binary that dispatches
// to one of the five runtime hook handlers by subcommand name (os.Args[1]).
//
// Usage:
//
//	ospec-hooks <subcommand>   (stdin: UTF-8 JSON; stdout: UTF-8 JSON line)
//
// Exit codes:
//   - 0   : handler ran successfully (or error encoded as JSON ask/continue)
//   - 1   : session-start unhandled error (written to stdout as JSON)
//   - 2   : unknown subcommand or no args — no hook JSON written
//
// Each hook handler registers itself via init() in its own file inside
// internal/hooks/.  Adding a hook = new file + init() call; this file
// and handler.go never change (OCP).
package main

import (
	"os"

	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/hooks"
	"github.com/mretamozo-hiberuscom/ospec-workflow/internal/jsonio"
)

func main() {
	stdin, err := jsonio.ReadStdin()
	if err != nil {
		// Unreadable stdin is treated as empty JSON — handlers must be tolerant.
		stdin = []byte("{}")
	}

	out, exitCode := hooks.Dispatch(os.Args[1:], stdin)

	if len(out) > 0 {
		jsonio.WriteStdout(out)
	}

	os.Exit(exitCode)
}
