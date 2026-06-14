// Package hooks defines the Handler interface, the init()-based registry, and
// the Dispatch function used by cmd/ospec-hooks/main.go.
//
// Adding a hook requires only a new <name>.go file in this package whose init()
// calls Register — main.go and existing handlers are never modified (OCP).
package hooks

import "fmt"

// Handler is the contract every hook subcommand must satisfy.
// Run accepts the raw stdin payload and returns the JSON response bytes plus an
// exit code.  Run MUST NOT panic — unhandled errors must be encoded as JSON.
type Handler interface {
	Name() string
	Run(stdin []byte) (stdout []byte, exitCode int)
}

// registry maps subcommand names to their Handler implementations.
// Populated at program startup via each handler's init().
var registry = map[string]Handler{}

// Register adds h to the registry under h.Name().
// Panics if a handler with the same name is already registered (programming error).
func Register(h Handler) {
	name := h.Name()
	if _, exists := registry[name]; exists {
		panic(fmt.Sprintf("hooks: handler %q already registered", name))
	}
	registry[name] = h
}

// Unregister removes the handler with the given name from the registry.
// It is provided for test cleanup only; production code should not call it.
func Unregister(name string) {
	delete(registry, name)
}

// Dispatch resolves the subcommand from args[0], calls its handler, and returns
// the handler's (stdout, exitCode).  If args is empty or args[0] is not found
// in the registry, it returns (nil, 2) — non-zero, no hook JSON written.
func Dispatch(args []string, stdin []byte) (stdout []byte, exitCode int) {
	if len(args) == 0 || args[0] == "" {
		return nil, 2
	}
	h, ok := registry[args[0]]
	if !ok {
		return nil, 2
	}
	return h.Run(stdin)
}
