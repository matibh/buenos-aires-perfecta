# Autonomous development workflow

Buenos Aires Perfecta can use OpenAI Codex from GitHub Actions to inspect completed Pages builds, repair eligible failures, and make one validated development improvement after successful builds.

## Flow
1. `Build and deploy Buenos Aires Perfecta` completes on `main`.
2. `Autonomous Codex — repair and develop` receives the completion event.
3. On failure, Codex reads the failed job logs and attempts a minimal root-cause repair.
4. On success, Codex selects one small, high-value task from the project priorities.
5. Codex creates a patch in a read-only-permission job. A separate job applies it, validates it, commits it, and explicitly dispatches the Pages workflow.
6. The next completed build starts the next iteration.

## Safety limits
- Maximum three consecutive autonomous development iterations after a human-initiated build.
- Maximum two repair attempts for a failing chain.
- One focused task per iteration.
- Changes are validated with the project build before they are pushed.
- The agent cannot edit its own workflow, prompt, or AGENTS.md guardrails.
- The agent cannot modify generated GIS output or invent real businesses/signage.
- The chain stops if no safe patch is produced, validation fails, the main branch moved unexpectedly, or the retry/iteration limit is reached.
- A new human commit starts a fresh development chain.

## Required repository secret
Add `OPENAI_API_KEY` under **Settings → Secrets and variables → Actions → New repository secret**. The value must be an OpenAI API key with API billing enabled. A ChatGPT subscription is not an API key and does not automatically include API usage.

The key is only passed to the Codex action. The separate patch-application job receives GitHub write permissions but never receives the OpenAI key.

## Cost and review
Each Codex iteration uses OpenAI API usage and may incur charges separate from ChatGPT. The three-iteration cap prevents an unbounded autonomous loop. Review commits and GitHub Actions logs regularly. Disable the autonomous workflow or remove the repository secret to stop agent execution.

## Manual recovery
If a workflow stops because of a transient provider outage or a task requiring human judgment, fix or rerun the normal Pages workflow manually. A fresh successful run on main starts a new bounded chain.
