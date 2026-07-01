---
name: caveman-help
description: "Trigger: /caveman-help, caveman help, what caveman commands, how do I use caveman. Show one-shot caveman command help."
license: Apache-2.0
metadata:
  author: manuel-retamozo-garcia
  version: "1.0"
---

## Activation Contract

Load only when the user asks for caveman help or invokes `/caveman-help`. This is one-shot help; it must not activate or deactivate any caveman mode.

## Hard Rules

- Keep the help compact and scannable.
- Do not write files, flags, config, or persistent state.
- Do not load compression scripts.
- Use caveman style for the help output, but keep commands exact.

## Decision Gates

| User asks | Show |
| --- | --- |
| General help | Modes, task skills, deactivate command. |
| Specific mode | Only that mode plus activation command. |
| Config/defaults | Default mode and precedence if known. |

## Execution Steps

1. Identify whether the user wants full help or a narrow answer.
2. Show commands exactly: `/caveman`, `/caveman lite`, `/caveman ultra`, `/caveman wenyan`, `/caveman-review`, `/caveman-commit`, `/caveman:compress <file>`.
3. Mention deactivation: `stop caveman` or `normal mode`.
4. When showing defaults, state precedence: `CAVEMAN_DEFAULT_MODE` > `~/.config/caveman/config.json` > `full`.

## Output Contract

Return a compact help card. Do not end by asking a follow-up question.

## References

- None.
