# Changelog

All notable changes to the Multi-Agent Orchestration Kit.

## [1.0.0] — 2026-08-11

### Added

**Core**
- `Orchestrator` — central coordinator with agent registry
- `BaseAgent` — abstract base with full Anthropic tool-use loop (handles multi-round calling automatically)
- `SharedMemory` — typed cross-agent key-value store with TTL support and snapshot/restore

**Built-in Agents**
- `ResearchAgent` — web search + URL fetch + findings storage
- `WriterAgent` — memory-aware content writer with 6 output formats (blog-post, technical-doc, executive-summary, readme, newsletter, tweet-thread)
- `ReviewerAgent` — structured reviewer with 3 modes (code, content, technical-accuracy)

**Patterns**
- `runPipeline()` — sequential agent execution with optional stage transforms
- `makeResearchWriteReviewStages()` — pre-built research/write/review pipeline config
- `extractFinalContent()` — intelligently extracts the final publishable content from a pipeline result
- `runFanOut()` — parallel execution with concurrency control
- `concatenateWithHeaders()` — aggregator: merge results with section headers
- `mergeBulletPoints()` — aggregator: extract and merge bullet points across results
- `takeMostDetailed()` — aggregator: return the highest-token-count response
- `majorityVote()` — aggregator: count keyword occurrences for boolean decisions
- `multiModelFanOut()` — run the same task across multiple model configurations
- `runSupervisor()` — hierarchical supervisor/worker delegation
- `buildSupervisorSystemPrompt()` — generates supervisor system prompt from worker descriptions
- `RESEARCH_WRITE_REVIEW_SUPERVISOR` — pre-built supervisor config for standard workflow

**Examples**
- `research-pipeline.ts` — complete research → write → review pipeline
- `fan-out-analysis.ts` — parallel topic research with result aggregation
- `supervised-workflow.ts` — dynamic task routing with a supervisor agent

**Developer Experience**
- Full TypeScript with strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- Structured logging to stderr (safe for stdio-based tool integration)
- Per-agent and per-pipeline token usage tracking
- `hitRoundLimit` flag to detect truncated agent runs
- Environment variable configuration for model, concurrency, and log level
