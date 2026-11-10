# Preview status and evidence

This release is a preview, not a claim of universal Markdown support or compatibility with every DSH release.

| Area | Evidence |
| --- | --- |
| Anchored child Sessions, parallel/nested branches, cards, layered return, restart persistence | Passed an isolated DSH 0.2.1-rc.3 acceptance on 2026-10-31 |
| Baseline Client SHA256 | `8C4FF889867942325D3F2AFA08E2B21E9C3305B23223574C2480396445748B00` |
| Desktop profile activation | UI panel and composer dock observed on 2026-11-05 |
| New topic branches, Enter handling, Skill overview import | Implemented; state/keyboard local checks were run, full updated DSH GUI acceptance pending |
| Latest active-path flow visuals | Built and syntax checked; DSH visual acceptance pending |
| Complex Markdown | Conservative rejection remains an intentional boundary |
| Skill/UI live synchronization | Not implemented; manual read-only snapshot import only |
| Ordinary-message semantic routing | Not implemented in the Client |

The current source includes additions after the accepted baseline. The historical baseline hash does not certify the current release artifact. Release packaging records current hashes separately in SHA256SUMS.txt.

## Context and usage

Anchored branches reuse earlier completed DSH turns and append the selected answer's prefix. Topic branches start blank with the main topic name and question. The default-off compact-path experiment creates a new Session with a shorter explicit packet for nested branches.

One matched A/B pair on 2026-11-01 recorded A: input 154, cacheRead 13,184, output 3,280, total 16,618; B: input 2,051, cacheRead 8,448, output 2,552, total 13,051. Answers showed no obvious correctness decline in that pair, but B was shorter and had more uncached input. Total includes cacheRead and is not a billing measure. This is research evidence, not a promised saving.

## Data behavior

The plugin uses localStorage in the active browser profile for branch associations and manually entered conclusions. DSH stores the actual child Sessions. The optional Skill uses local JSON files separately. Clearing localStorage or changing profiles can leave DSH Sessions present without the plugin tree. There is no cross-profile backup/sync system in this preview.

Public release materials omit private state files, credentials, personal screenshots and internal handoff logs. The standalone demos use example content and do not call a model.
