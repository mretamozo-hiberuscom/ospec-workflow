# Delta for hooks-runtime — hooks-path-traversal-hardening

## ADDED Requirements

### Requirement: Untrusted CWD Traversal Validation (fu-c2)

The `resolveCwd` helper MUST validate the `cwd` payload field before using it as
the workspace root. `filepath.Clean` alone is insufficient because it preserves
leading `..` segments; the helper MUST perform an explicit traversal check after
cleaning.

A `cwd` value MUST be rejected — and the helper MUST fall back to `"."` — when
any of the following is true:

| Rejection condition | Rationale |
|---|---|
| Cleaned path contains a `..` element | Traversal escape via relative segments |
| Path is not absolute | Relative paths can escape via `..` after join |
| Cleaned form is a filesystem or volume root | Write-steering to the filesystem root (see 4R CRITICAL below) |
| Resolved path is not an existing directory | Workspace must be reachable |

**validatePath policy (normative):** a path is valid only if ALL of the following hold:
1. The path is absolute (`filepath.IsAbs` is true after `filepath.Clean`)
2. The cleaned form contains no `..` segment
3. The cleaned form is NOT a filesystem or volume root
   (detection: `filepath.Dir(cleaned) == cleaned` — true for `/`, `C:\`, `\\host\share`, etc.)

The `transcript_path` validation shares the same policy (conditions 1 and 2); the
existing-directory check (condition 4 above) applies to `cwd` only via `resolveCwd`.

On rejection the helper MUST return `"."`. The calling handler MUST remain
non-blocking: it MUST write `{"continue":true}` to stdout and MUST exit 0.

The precompact, stop, and subagent-stop handlers MUST all resolve `cwd` through
this shared `resolveCwd` helper. Per-handler duplication of the traversal policy
is NOT permitted.

#### Scenario: Valid absolute cwd accepted — POSIX

- GIVEN the hook payload contains `"cwd": "/home/user/project"` and the path is an existing directory
- WHEN `resolveCwd` processes the value
- THEN it MUST return `"/home/user/project"` as the workspace root

#### Scenario: Valid absolute cwd accepted — Windows

- GIVEN the hook payload contains `"cwd": "C:\\Users\\user\\project"` and the path is an existing directory
- WHEN `resolveCwd` processes the value
- THEN it MUST return `"C:\Users\user\project"` as the workspace root

#### Scenario: POSIX traversal cwd rejected — fallback applied

- GIVEN the hook payload contains `"cwd": "../../etc"`
- WHEN `resolveCwd` processes the value
- THEN it MUST return `"."` and MUST NOT use `"../../etc"` as the workspace root

#### Scenario: Windows traversal cwd rejected — fallback applied

- GIVEN the hook payload contains `"cwd": "..\\..\\Windows\\System32"`
- WHEN `resolveCwd` processes the value
- THEN it MUST return `"."` and MUST NOT use the traversal path as the workspace root

#### Scenario: Relative non-traversal cwd rejected — fallback applied

- GIVEN the hook payload contains `"cwd": "relative/path"`
- WHEN `resolveCwd` processes the value
- THEN it MUST return `"."` because the path is not absolute

#### Scenario: Handler stays non-blocking on cwd rejection

- GIVEN the hook payload for precompact, stop, or subagent-stop contains a traversal `cwd` (e.g., `"../../../tmp"`)
- WHEN the handler processes the payload
- THEN the handler MUST write `{"continue":true}` to stdout
- AND MUST exit 0

#### Scenario: POSIX filesystem root cwd rejected — fallback applied (4R CRITICAL)

- GIVEN the hook payload contains `"cwd": "/"`
- WHEN `resolveCwd` processes the value via `validatePath`
- THEN it MUST return `"."` because `filepath.Dir("/") == "/"` (root detected)
- AND MUST NOT use `"/"` as the workspace root (doing so would steer `.ospec/` writes to the filesystem root)

#### Scenario: Windows drive root cwd rejected — fallback applied (4R CRITICAL)

- GIVEN the hook payload contains `"cwd": "C:\\"`
- WHEN `resolveCwd` processes the value via `validatePath`
- THEN it MUST return `"."` because `filepath.Dir("C:\\") == "C:\\"` (root detected)
- AND MUST NOT use `"C:\"` as the workspace root (doing so would steer `.ospec/` writes to the drive root)

#### Scenario: Windows UNC volume root cwd rejected — fallback applied (4R CRITICAL)

- GIVEN the hook payload contains `"cwd": "\\\\host\\share"`
- WHEN `resolveCwd` processes the value via `validatePath`
- THEN it MUST return `"."` because `filepath.Dir("\\\\host\\share") == "\\\\host\\share"` (root detected)
- AND MUST NOT use `"\\host\share"` as the workspace root

---

### Requirement: Untrusted Transcript Path Validation (fu-c1)

The subagent-stop handler MUST validate the `transcript_path` payload field for
path traversal before reading it. A `transcript_path` MUST be rejected — and
treated as absent — when any of the following is true:

| Rejection condition | Rationale |
|---|---|
| Path is not absolute | Relative paths from untrusted payloads are rejected; mirrors the cwd policy |
| Cleaned path contains a `..` element | Traversal escape via relative segments |

Rejected paths MUST NOT be passed to `os.ReadFile`; they MUST be treated as
absent — identical degradation to ENOENT, which `readFilePermissive` already
handles safely. A single shared validation helper MUST apply this policy for
both `transcript_path` (absolute + no `..`) and `cwd` (absolute + no `..` +
existing directory), enabling both flows to use the same validation code.

The handler MUST remain non-blocking on rejection: it MUST write
`{"continue":true}` to stdout and MUST exit 0.

#### Scenario: Valid transcript path accepted — POSIX

- GIVEN the hook payload contains `"transcript_path": "/tmp/session/transcript.jsonl"`
- WHEN the subagent-stop handler processes the value
- THEN it MUST attempt to read the file at that path via `readFilePermissive`

#### Scenario: Valid transcript path accepted — Windows

- GIVEN the hook payload contains `"transcript_path": "C:\\sessions\\transcript.jsonl"`
- WHEN the subagent-stop handler processes the value
- THEN it MUST attempt to read the file at that path via `readFilePermissive`

#### Scenario: POSIX traversal transcript path rejected — treated as absent

- GIVEN the hook payload contains `"transcript_path": "../../.env"`
- WHEN the subagent-stop handler processes the value
- THEN it MUST NOT read the file at that path
- AND MUST degrade as if the transcript were absent (skill resolution unavailable from file)

#### Scenario: Windows traversal transcript path rejected — treated as absent

- GIVEN the hook payload contains `"transcript_path": "..\\..\\secrets.txt"`
- WHEN the subagent-stop handler processes the value
- THEN it MUST NOT read the file at that path
- AND MUST degrade as if the transcript were absent

#### Scenario: Handler stays non-blocking on transcript path rejection

- GIVEN the hook payload contains a traversal `transcript_path`
- WHEN the subagent-stop handler processes the payload
- THEN the handler MUST write `{"continue":true}` to stdout
- AND MUST exit 0

---

## Clarifications

### Session 2026-06-15

- Q: transcript_path validation policy: reject-`..`-only (minimum bar) vs require-absolute + reject-`..` vs workspace-confinement. → A: Require absolute path AND reject `..` (filepath.IsAbs must be true AND cleaned form must contain no `..`). Mirrors the cwd policy so a single shared validation helper applies. Relative paths from untrusted payloads are rejected. Source: AskUserQuestion, 2026-06-15.
- Q: cwd validation: should resolveCwd include an os.Stat existing-directory check as currently specified, or stop at reject-`..` + require-absolute? → A: Include the os.Stat existing-directory check (current spec behavior). If the absolute, non-traversal cwd does not resolve to an existing directory, fall back to `.`. Source: AskUserQuestion, 2026-06-15.

### Session 2026-06-15 (4R review gate — Batch 3 refinement)

Source: 4R review gate / AskUserQuestion decision "harden-policy-now".

The 4R review gate surfaced 2 CRITICAL findings (review-reliability):
- `validatePath` accepted filesystem root `/` because it is absolute with no `..` segment.
- `validatePath` accepted Windows drive/volume root (e.g., `C:\`, `\\host\share`) for the same reason.

Both roots, if accepted as a workspace `cwd`, would steer `.ospec/` writes to the filesystem root — the exact write-steering fu-c2 aims to prevent.

Refinement (normative): the `validatePath` policy is extended. A path is valid only if:
1. absolute (`filepath.IsAbs` after `filepath.Clean`)
2. cleaned form has no `..` segment
3. cleaned form is NOT a filesystem or volume root (`filepath.Dir(cleaned) != cleaned`)

This refinement applies to both `cwd` (via `validatePath` in `resolveCwd`) and `transcript_path` (via `validatePath` in `findResolutionInTranscript`), since both share the same helper. The implementation change is a single guard added to `validatePath` in `internal/hooks/common.go`. Callers degrade as before: `resolveCwd` → `"."`, `findResolutionInTranscript` → treated as absent. Handlers remain non-blocking.
