---
name: orchestrate
description: Use when work should be delegated across subagents while one orchestrator keeps decisions, scope, integration, and final acceptance.
---

# Orchestrate

The orchestrator owns task understanding, product and architecture decisions, decomposition, integration, and final acceptance. Subagents handle bounded research, implementation, testing, and review. The orchestrator does not duplicate their mechanical work.

## Workflow

1. Read the request and applicable repository instructions. Resolve decisions that affect scope, behavior, architecture, or public interfaces.
2. Before implementation or delegation, make one bounded Jev routing request through the official TypeSafe SDK. Supply the task scope/risk, required checks, budget preference, and exact model identifiers and per-agent controls callable in the current runtime. Ask Jev for complexity, roles, agent count, the minimum model/reasoning per role, parallelism, review need, and escalation conditions.
3. Follow the Jev route unless it conflicts with user instructions, safety, permissions, or actual runtime capability. State any fallback. If Jev is unavailable, attempt it once, report a sanitized failure, and use the cheapest conservative fallback without promoting all work to a strong model.
4. Split the work into bounded packages. Run independent packages concurrently and dependent work sequentially. For a small task, use one worker and a proportional check.
5. Prevent concurrent writers from touching the same files, tests, schemas, generated artifacts, or shared configuration. Assign exact ownership or serialize the work.
6. Dispatch each package with the objective, allowed scope and ownership, acceptance criteria, required checks, non-goals, permission limits, and expected evidence.
7. Receive results through native messages. A HANDOFF reports the result, changed files or findings, checks run, acceptance mapping, risks, and next step.
8. Inspect the actual evidence and integrated result. `DONE` is a claim, not proof.
9. Return defects to the responsible implementer. Use a fresh independent reviewer when the work has meaningful behavioral, integration, security, or regression risk.
10. Synthesize the final answer only after the accepted result is verified. A second Jev request is allowed only for a genuinely uncertain COMPLETE / RETRY / ESCALATE decision.

Keep coordination in messages and HANDOFF replies. Do not create plans, state files, task files, logs, or other coordination artifacts unless the user or repository contract explicitly requires them.

When TDD is requested, establish accepted behavior and an exact observable boundary first. A tester demonstrates a meaningful RED before implementation; an implementer produces the smallest GREEN result; a fresh reviewer verifies the behavior and test quality. Tests written after existing implementation are regression tests, not TDD. Never delete or revert existing work without authorization.

Invocation authorizes delegation inside the requested task. It does not authorize expanded scope, commits, pushes, deployments, publication, destructive changes, or messages to people or services outside the run. Preserve existing permission boundaries. If delegation is unavailable or conflicts with another instruction, state the conflict before taking over delegated work.

## Model routing

Roles matter more than model names. Use the user's routing when specified and let the mandatory Jev decision choose among the models the current launcher actually exposes.

- The current capable root remains the architect/orchestrator.
- Prefer Luna low for inexpensive search and context gathering.
- Prefer Terra low/medium for implementation and UI work when a callable Terra identifier is exposed. If it is not exposed, use Luna medium for routine implementation and GPT-5.6 Sol only for genuinely complex code.
- Run deterministic checks directly when no agent judgment is needed. When a test agent is useful, start with Luna low; use Luna medium only for demanding browser, realtime, or integration scenarios.
- Use a fresh Luna low/medium reviewer by default. Reserve GPT-5.6 Sol review for high-risk or unresolved cases.
- Do not use a model stronger than GPT-5.6 Sol merely for implementation. Stronger models belong to orchestration or exceptional architectural judgment unless the user explicitly asks otherwise.

Set each worker's model and reasoning explicitly and give it a narrow task packet. Do not use a full-history fork that accidentally inherits an expensive root model. A model visible in the user interface may still be absent from the current subagent API; if Terra is not callable, report `TERRA: UNAVAILABLE_IN_RUNTIME` and the chosen fallback rather than pretending it ran or silently inheriting Sol.
