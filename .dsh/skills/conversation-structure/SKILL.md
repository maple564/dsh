---
name: conversation-structure
description: Organize long AI conversations as anchored branches with clear context paths and reliable return to the point where a side discussion began.
---

# Conversation Structure

Use this skill when a conversation needs a side discussion, when the user asks to return to an earlier topic, resume a paused branch, or inspect how the current thread is organized. It is domain-neutral: learning, coding, research, planning, and document discussions can all use the same branch-and-return model.

## Core behavior

- Treat each new conversation as a separate session unless the user selects an existing one. Within that conversation, keep the user's overall subject as the root. A related new topic is a sibling branch, not a new session. Do not call `start` merely because a new question differs from the previous question.
- Keep the main line and each side discussion as separate nodes. Never rewrite or delete an earlier answer.
- Answer a short clarification in place when it does not create a meaningful context switch. Create a branch for a substantial side topic that the user will likely return from.
- Use `branch` for a question about an exact phrase in an assistant answer. Never invent its anchor or bypass an ambiguous mapping. Use `topic` for a related new subject with no selected phrase, choosing the root for parallel topics or the current node for a nested topic. Missing literal text is not a reason to reject a topic branch.
- Inherit only the ancestor conversation up to the selected answer and anchor. Keep unrelated later turns and sibling branches out of the side discussion context.
- On return, give a 1–2 sentence outcome, then quote the exact original paragraph where the user left off. Do not continue the main topic unless asked.
- A completed branch may carry a short summary. An unfinished branch can be paused and resumed. A mistaken branch is marked abandoned, never erased.
- Ask only when the user's intent or destination is genuinely ambiguous; do not require a confirmation for every ordinary follow-up.
- Use the actual main topic title in the current path, not the placeholder `Main topic`. After a branch is created, switched, or returned from, read `show` and display a compact tree from its `nodes`, with sibling topics at the same depth, statuses, and a current-position marker. A path is only the current location, not the complete overview. Never invent branches based on answer headings.
- Example: under a user-established root `计算方法`, matrix methods, numerical integration, and calculator use may be parallel topics. A question about an integration error term remains under numerical integration. Do not assume a broad course root until supplied or established by the conversation.
- The Client plugin and this local state helper currently have separate storage. Do not claim a local-tool operation created a visible DSH child Session or a clickable plugin card. For historical overview, save the complete `show` result as a JSON snapshot under project `data/` for the user to import using the plugin's `导入 Skill 总览`. Imported trees are read-only records, not live DSH Sessions.

## State tool

Project-local runtime data is stored under `data/` and ignored by Git. Run the helper from this checkout's root (the directory containing `package.json` and `lib/store.mjs`), not from a hard-coded machine path.

1. Read current state with `node .dsh/skills/conversation-structure/scripts/state.mjs <operation> <request-file>`.
2. The request file must be a JSON file created inside `data/requests/`. The helper removes it after processing. Do not put user text in a shell command; write JSON with DSH's filesystem tool.
3. Pass the current `revision` for every mutation. If a revision conflict is returned, reload state and reconcile with the newest conversation before retrying.
4. Use `start` for a new main topic. Use `branch` for a side question with an exact anchor and its answer. Use `append` for an in-place turn. Use `return`, `resume`, or `abandon` when appropriate.
   Use `topic` for a parallel or nested new subject without a text anchor. It inherits the root identity, not unrelated conversation text; put any necessary user-provided constraints in its question. Do not create a second root for a related subject.
5. `show` returns the active path, context projection, saved answers, and heading outlines. The state helper records structure; it does not modify DSH's visible chat transcript or restore a UI scroll position.

## Operations and request fields

- `start`: `{ "title": string, "question": string, "answer": string }`
- `show`: `{ "sessionId": string }`
- `list`: `{}`
- `source`: `{ "sessionId": string, "sourceId": string }`
- `branch`: `{ "sessionId": string, "sourceId": string, "anchor": string, "question": string, "answer": string, "expectedRevision": number }`
- `topic`: `{ "sessionId": string, "parentNodeId": "root"|string, "title": string, "question": string, "answer": string, "expectedRevision": number }`
- `append`: `{ "sessionId": string, "userText": string, "answer": string, "expectedRevision": number }`
- `return`: `{ "sessionId": string, "target": "parent"|"root", "disposition": "resolved"|"paused", "summary": string, "expectedRevision": number }`
- `resume`: `{ "sessionId": string, "branchId": string, "expectedRevision": number }`
- `abandon`: `{ "sessionId": string, "expectedRevision": number }`

For `return`, omit `summary` when the branch is paused. A resolved branch requires a concise summary.

## First trial

Start with a real conversation that naturally contains a side question. A course explanation is one candidate; a coding discussion or research topic is another. The user should supply the actual main question and answer. Do not fabricate usage history or save conversation content outside this project-local data folder.
