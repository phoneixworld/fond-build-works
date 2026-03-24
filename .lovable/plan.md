
Goal: restore deterministic end-to-end build behavior (no circular flow, no misleading task list, no false “done” responses) for prompts like “Build a HR portal,” without reverting to the old brittle behavior.

What I found (root causes from code + live data)
1) Internal build prompts are being persisted as user chat messages.
- In `useBuildOrchestration.sendMessage`, the exact execution prompt is added to chat history as a user turn.
- DB evidence shows stored user messages like `# APPLICATION REQUIREMENTS ... ## BUILD TRIGGER ...`.
- This pollutes future requirement compilation and contributes to drift/replay loops.

2) Explicit “build new app” prompts can still run through an extend-style plan when workspace already exists.
- Current intent logic in compiler context defaults to `extend` when workspace exists unless specific extend/fix patterns match.
- That can collapse to a tiny task graph (often 4-task shell/routing flow) instead of full domain build.

3) Progress list rendering has no hard guard against generic labels.
- Build progress text is assembled from `task.label` values with no canonical fallback mapping.
- If labels degrade upstream, user sees low-signal placeholders (“Task 1/2/3/4”) instead of domain tasks.

4) Timeout resilience is tied too tightly to content deltas.
- Safety timeout resets on build callbacks, but if stream activity is sparse/non-content-heavy, long builds can still look “stuck.”

5) Chat can imply completion without build evidence.
- Chat responses can present “built foundation” style statements after non-actionable inputs, even when no verified build completion event occurred.

Implementation plan
Phase 1: Stop prompt pollution at the source
- Update `sendMessage` API in `src/hooks/useBuildOrchestration.ts` to separate:
  - `executionPrompt` (internal, sent to compiler/build agent)
  - `displayUserText` (what gets persisted to chat history)
- Ensure confirmation flow (`pendingExecution`) passes original user request as display text, not compiled requirement payload.
- Prevent any auto-generated requirement envelope (`# APPLICATION REQUIREMENTS`, `## BUILD TRIGGER`) from being persisted as a user message.

Phase 2: Enforce explicit rebuild semantics
- In `src/lib/compiler/context.ts`, add a high-priority override:
  - If prompt is explicit new-app language (`build/create/generate ... portal/system/app` or `from scratch/rebuild/new app`), classify as `new_app` even if workspace exists.
- Keep edit/fix route for surgical prompts; only broad explicit build requests get forced new-app planning.

Phase 3: Canonicalize task labels before user display
- In `src/hooks/useBuildOrchestration.ts` (`onPlanReady` and progress message builder):
  - Normalize labels (`infra` -> `Infrastructure`, `auth` -> `Authentication`, `page:Employees` -> `Employees Page`, etc.).
  - Add strict fallback from task metadata/id; never emit raw empty/generic placeholders.
- Keep deterministic ordering and status markers, but guarantee meaningful labels.

Phase 4: Tighten timeout/heartbeat behavior
- In `src/lib/agentPipeline.ts` + orchestration timeout handling:
  - Treat any valid stream event as progress heartbeat (not only non-empty content chunks).
  - Reset safety timeout on phase transitions and task boundary callbacks consistently.
  - Preserve 10-minute hard cap, but eliminate false “no progress” states during active streaming.

Phase 5: Truthfulness guard for chat completion claims
- In `supabase/functions/chat-agent/index.ts` and local routing guard:
  - Add policy: chat cannot claim build/edit completion unless a recent verified build/edit completion signal exists.
  - For ambiguous short tokens (like “ok/on”), respond with clarification or next actionable step, not fabricated completion summaries.

Phase 6: End-to-end verification checklist
- Verify these scenarios in sequence:
  1. “Build a HR portal” -> confirmation -> build starts with meaningful domain task labels.
  2. No user message containing internal requirement envelope appears in persisted chat.
  3. Broad rebuild request with existing workspace triggers full new-app task graph, not minimal extend shell.
  4. Long-running build receives heartbeat updates and avoids premature timeout.
  5. Non-actionable short follow-ups do not produce fake “built” summaries.

Files to update
- `src/hooks/useBuildOrchestration.ts`
- `src/lib/compiler/context.ts`
- `src/lib/agentPipeline.ts`
- `supabase/functions/chat-agent/index.ts`
- (If needed for parity) small utility for label normalization in `src/lib/compiler/*` or hook-local helper.

Acceptance criteria
- Build progress always shows domain-meaningful steps (never generic “Task N” placeholders).
- No internal compiled prompt is stored as user conversation content.
- Explicit rebuild prompts reliably run full new-app planning even on non-empty workspaces.
- Timeout occurs only on true inactivity, not active long-stream generation.
- Chat cannot claim completion without actual verified build/edit completion state.
