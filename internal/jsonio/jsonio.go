// Package jsonio provides stdin → []byte (empty → "{}") and one-line stdout
// helpers used by the ospec-hooks dispatcher.
package jsonio

import (
	"bytes"
	"fmt"
	"io"
	"os"
)

// ReadInput reads all bytes from r and returns them, trimming surrounding
// whitespace.  If the result is empty (or was whitespace-only), it returns
// []byte("{}") — the canonical empty JSON object — rather than an error.
// The caller is responsible for parsing JSON; this function does not validate.
func ReadInput(r io.Reader) ([]byte, error) {
	raw, err := io.ReadAll(r)
	if err != nil {
		return nil, fmt.Errorf("jsonio: reading input: %w", err)
	}
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return []byte("{}"), nil
	}
	return trimmed, nil
}

// ReadStdin calls ReadInput(os.Stdin).
func ReadStdin() ([]byte, error) {
	return ReadInput(os.Stdin)
}

// WriteOutput writes payload followed by a single newline to w.
// This enforces the hook contract: exactly one UTF-8 JSON line per invocation.
func WriteOutput(w io.Writer, payload []byte) error {
	if _, err := w.Write(payload); err != nil {
		return fmt.Errorf("jsonio: writing payload: %w", err)
	}
	if _, err := w.Write([]byte("\n")); err != nil {
		return fmt.Errorf("jsonio: writing newline: %w", err)
	}
	return nil
}

// WriteStdout calls WriteOutput(os.Stdout, payload), silently discarding
// write errors (the process is about to exit anyway).
func WriteStdout(payload []byte) {
	_ = WriteOutput(os.Stdout, payload)
}
