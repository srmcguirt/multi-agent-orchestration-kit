/**
 * Supervisor Pattern — Hierarchical multi-agent execution.
 *
 * A supervisor agent dynamically routes tasks to specialized workers,
 * reviews their output, and synthesizes the final answer.
 * The supervisor decides WHAT to delegate and WHEN it's done.
 *
 * Visual:
 *
 *                   ┌──→ [Worker: researcher] ──┐
 *   Input ──→ [Supervisor] ──→ [Worker: writer] ──→ [Supervisor] ──→ Output
 *                   └──→ [Worker: reviewer]  ──┘
 *
 * When to use:
 * - Complex tasks where the right approach isn't known upfront
 * - Tasks that may require different specialists based on content
 * - Workflows where the number of steps varies per task
 * - Quality gates where a supervisor must approve before finishing
 *
 * Example:
 *   const result = await runSupervisor(orchestrator, {
 *     supervisorName: 'supervisor',
 *     workerNames: ['researcher', 'writer', 'reviewer'],
 *     maxDelegationRounds: 4,
 *   }, task);
 */

import { Orchestrator } from '../orchestrator.js';
import { logger } from '../lib/logger.js';
import type { AgentRunResult, SupervisorConfig } from '../types.js';

export interface SupervisorResult {
  /** Final output from the supervisor after all delegation */
  finalOutput: AgentRunResult;
  /** Total tokens used across supervisor and all workers */
  totalTokens: number;
  /** Wall-clock duration */
  durationMs: number;
}

/**
 * Run the supervisor pattern.
 *
 * @param orchestrator - Orchestrator with supervisor and workers registered
 * @param config - Supervisor configuration (supervisor name, worker names, max rounds)
 * @param task - The initial task for the supervisor to route
 *
 * @example
 * const result = await runSupervisor(orchestrator, {
 *   supervisorName: 'supervisor',
 *   workerNames: ['researcher', 'writer', 'reviewer'],
 *   maxDelegationRounds: 3,
 * }, 'Create a comprehensive guide to MCP server security');
 */
export async function runSupervisor(
  orchestrator: Orchestrator,
  config: SupervisorConfig,
  task: string
): Promise<SupervisorResult> {
  const startTime = Date.now();

  logger.info('supervisor', 'starting', {
    supervisor: config.supervisorName,
    workers: config.workerNames,
    maxRounds: config.maxDelegationRounds ?? 3,
  });

  const finalOutput = await orchestrator.supervisor(config, task);
  const durationMs = Date.now() - startTime;

  return {
    finalOutput,
    totalTokens: finalOutput.usage.totalTokens,
    durationMs,
  };
}

/**
 * Create a supervisor system prompt that knows about its workers.
 *
 * Pass this to an agent's systemPrompt when configuring a supervisor.
 * The supervisor will intelligently route based on these descriptions.
 */
export function buildSupervisorSystemPrompt(workers: Array<{
  name: string;
  description: string;
  bestFor: string[];
}>): string {
  const workerDescriptions = workers.map(w =>
    `**${w.name}**: ${w.description}
   Best for: ${w.bestFor.join(', ')}`
  ).join('\n\n');

  return `You are a supervisor coordinating a team of specialized AI agents.

YOUR WORKERS:
${workerDescriptions}

YOUR RESPONSIBILITIES:
1. Analyze incoming tasks to determine the best worker(s) for each
2. Break complex tasks into clear sub-tasks for individual workers
3. Review worker outputs and determine if they meet the requirements
4. Synthesize final answers from worker outputs
5. Decide when the task is complete

ROUTING FORMAT:
When delegating, respond with ONLY this JSON:
{
  "delegateTo": "<worker-name>",
  "subTask": "<specific, detailed instructions for the worker>",
  "reasoning": "<why this worker for this sub-task>"
}

COMPLETION FORMAT:
When the task is complete and no more delegation is needed:
- Provide the final synthesized answer directly
- Do NOT use the JSON routing format
- Include a brief note on what you synthesized and from whom

PRINCIPLES:
- Match task complexity to worker capability
- Give workers specific, actionable sub-tasks (not vague instructions)
- If a worker's output is incomplete, delegate again with clearer instructions
- When in doubt, a researcher first, then a specialist
- Know when to stop delegating and synthesize`;
}

/**
 * Pre-built supervisor configuration for the research/write/review workflow.
 * The supervisor decides whether to research, write, or both — based on the task.
 */
export const RESEARCH_WRITE_REVIEW_SUPERVISOR: Omit<SupervisorConfig, 'supervisorName'> = {
  workerNames: ['researcher', 'writer', 'reviewer'],
  maxDelegationRounds: 4,
};
