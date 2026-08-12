/**
 * @srmcguirt/multi-agent-kit
 *
 * Production-ready multi-agent orchestration for Claude.
 * Three patterns, shared memory, composable agents.
 */

// Core
export { Orchestrator, BaseAgent } from './orchestrator.js';

// Memory
export { SharedMemory } from './memory/shared-memory.js';

// Built-in Agents
export { ResearchAgent } from './agents/researcher.js';
export { WriterAgent } from './agents/writer.js';
export type { WriterOutputFormat } from './agents/writer.js';
export { ReviewerAgent } from './agents/reviewer.js';
export type { ReviewerMode } from './agents/reviewer.js';

// Patterns — Pipeline
export {
 runPipeline,
 makeResearchWriteReviewStages,
 extractFinalContent,
} from './patterns/pipeline.js';
export type { PipelineResult } from './patterns/pipeline.js';

// Patterns — Fan-Out
export {
 runFanOut,
 concatenateWithHeaders,
 mergeBulletPoints,
 takeMostDetailed,
 majorityVote,
 multiModelFanOut,
} from './patterns/fan-out.js';
export type { FanOutOptions, FanOutResult } from './patterns/fan-out.js';

// Patterns — Supervisor
export {
 runSupervisor,
 buildSupervisorSystemPrompt,
 RESEARCH_WRITE_REVIEW_SUPERVISOR,
} from './patterns/supervisor.js';
export type { SupervisorResult } from './patterns/supervisor.js';

// Types
export type {
 AgentTool,
 AgentConfig,
 AgentRunResult,
 OrchestratorConfig,
 PipelineStage,
 FanOutConfig,
 SupervisorConfig,
 MemoryEntry,
 SharedMemorySnapshot,
} from './types.js';
