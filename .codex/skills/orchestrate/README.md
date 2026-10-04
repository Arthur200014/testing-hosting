# orchestrate

`$orchestrate` helps an agent delegate work to subagents while retaining task
understanding, decisions, integration, and final acceptance.

The orchestrator first asks Jev for a bounded, cost-aware route using the models
actually callable in the current runtime. It then assigns explicit minimal models
to bounded workers, gathers evidence, and performs final verification. Small
changes should not create unnecessary agents. Coordination stays in native agent
messages rather than repository bookkeeping files.

This repo-scoped copy comes from
<https://github.com/harnessmachine/codex-orchestrate>. Start a new Codex session
after installation so the skill is discovered.
