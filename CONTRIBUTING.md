# Contributing

Try a real workflow: choose a passage, ask a side question, return, then reopen the branch. Report the point where navigation or context became confusing.

For a bug, include DSH version, plugin version, profile type, expected behavior, actual behavior and minimal reproduction steps. Use synthetic conversations; redact private content and credentials. A local demo result is not a DSH acceptance result.

For code changes, edit dsh-plugin/client.template.js and rebuild with `npm run build:client`; commit the generated client.js as well. Run `npm test` for changes to context, anchoring or state transitions. Keep changes focused and avoid adding dependencies for small UI changes.

Priorities: stronger source mapping, a shared state contract for Skill/UI, practical backup/export, and clearer everyday navigation.
