---
name: caveman-compress
description: "Trigger: /caveman:compress <filepath>, compress memory file. Compress prose files while preserving technical content and backups."
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
---

## Activation Contract

Load only when the user explicitly asks to compress a natural-language file or invokes `/caveman:compress <filepath>`.

## Hard Rules

- Compress only prose files: `.md`, `.txt`, or extensionless memory files.
- Never compress source, config, lock, env, SQL, shell, HTML, XML, JSON, YAML, TOML, CSS, or generated files.
- Preserve exactly: fenced code blocks, inline code, URLs, markdown links, file paths, commands, technical names, proper nouns, dates, versions, numbers, and frontmatter.
- Preserve markdown heading text, list nesting, table structure, and numbering.
- Back up the original beside the file as `<filename>.original.md` before overwriting.
- Never compress an `.original.md` backup.
- If unsure whether text is code or prose, leave it unchanged.

## Decision Gates

| Condition | Action |
| --- | --- |
| Supported prose file | Compress prose outside protected regions. |
| Unsupported file type | Stop and report unsupported file. |
| Existing `.original.md` target | Stop unless user explicitly confirms overwrite. |
| Validation fails | Report failure; leave original untouched. |

## Execution Steps

1. Resolve the target path from the user command.
2. Validate file type and backup path.
3. Prefer the local script in `skills/caveman-compress/scripts/` when available: run `python -m scripts <absolute_filepath>` from `skills/caveman-compress`.
4. Compress by removing filler, hedging, pleasantries, redundant phrasing, and duplicate examples.
5. Validate protected regions stayed byte-identical before writing.

## Output Contract

Return the target path, backup path, compression status, and any validation failures.

## References

- `README.md` - usage details and examples.
- `SECURITY.md` - safety model for subprocess and file I/O.
