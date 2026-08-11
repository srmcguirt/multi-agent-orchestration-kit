/**
 * Fan-Out Pattern — Parallel multi-agent execution.
 *
 * Distributes multiple independent tasks to agents running concurrently,
 * then aggregates the results. Ideal when tasks don't depend on each other.
 *
 * Visual:
 *
 *              ┌──→ [Agent] task 1 ──┐
 *              │                     │
 *   Input  ────┼──→ [Agent] task 2 ──┼──→ Aggregator ──→ Final Output
 *              │                     │
 *              └──→ [Agent] task 3 ──┘
 *
 * When to use:
 * - Parallel research: research multiple topics simultaneously
 * - Batch analysis: analyze multiple code files at once
 * - Multi-perspective: get the same content reviewed from multiple angles
 * - Coverage tasks: run different security checks in parallel
 *
 * Example:
 *   const result = await runFanOut(orchestrator, {
 *     tasks: ['Analyze auth module', 'Analyze API module', 'Analyze DB module'],
 *     agentName: 'reviewer',
 *     aggregator: concatenateFindings,
 *   });
 */

import { Orchestrator } from '../orchestrator.js';
import { logger } from '../lib/logger.js';
import type { AgentRunResult } from '../types.js';

export interface FanOutOptions {
  /** Tasks to distribute (one per agent invocation) */
  tasks: string[];
  /** Agent to use for all tasks */
  agentName: string;
  /** How to combine results from all agents */
  aggregator: (results: AgentRunResult[]) => string;
  /** Max agents running in parallel (overrides orchestrator default) */
  maxConcurrent?: number;
}

export interface FanOutResult {
  /** Individual results from each parallel task */
  results: AgentRunResult[];
  /** Aggregated output */
  aggregatedText: string;
  /** Total tokens across all parallel executions */
  totalTokens: number;
  /** Wall-clock time (not sum of individual times — parallel!) */
  durationMs: number;
}

/**
 * Run tasks in parallel using the fan-out pattern.
 *
 * @example
 * const result = await runFanOut(orchestrator, {
 *   tasks: topics.map(t => `Research: ${t}`),
 *   agentName: 'researcher',
 *   aggregator: mergeResearchFindings,
 * });
 */
export async function runFanOut(
  orchestrator: Orchestrator,
  options: FanOutOptions
): Promise<FanOutResult> {
  const startTime = Date.now();

  logger.info('fan-out', 'starting', {
    agentName: options.agentName,
    taskCount: options.tasks.length,
  });

  const results = await orchestrator.fanOut(options.tasks, options.agentName);
  const aggregatedText = options.aggregator(results);

  const totalTokens = results.reduce((sum, r) => sum + r.usage.totalTokens, 0);
  const durationMs = Date.now() - startTime;

  logger.info('fan-out', 'complete', {
    taskCount: options.tasks.length,
    totalTokens,
    durationMs,
  });

  return { results, aggregatedText, totalTokens, durationMs };
}

// ─── Built-in Aggregators ────────────────────────────────────────────────────

/**
 * Concatenate all results with section headers.
 * Best for: parallel research, parallel analysis.
 */
export function concatenateWithHeaders(results: AgentRunResult[]): string {
  return results
    .map((r, i) => `## Section ${i + 1} — ${r.agentName}\n\n${r.text}`)
    .join('\n\n---\n\n');
}

/**
 * Extract bullet points from each result and merge into a single list.
 * Best for: parallel finding extraction.
 */
export function mergeBulletPoints(results: AgentRunResult[]): string {
  const allBullets = results.flatMap(r => {
    const lines = r.text.split('\n');
    return lines.filter(l => l.trim().startsWith('-') || l.trim().startsWith('•'));
  });
  return allBullets.join('\n');
}

/**
 * Use the result with the highest token count (likely most detailed).
 * Best for: when you want the most comprehensive single response.
 */
export function takeMostDetailed(results: AgentRunResult[]): string {
  const best = results.reduce(
    (max, r) => r.usage.outputTokens > max.usage.outputTokens ? r : max,
    results[0]!
  );
  return best.text;
}

/**
 * Majority vote on a boolean decision (approve/reject, yes/no).
 * Counts how many results contain a keyword and returns the majority decision.
 */
export function majorityVote(keyword: string): (results: AgentRunResult[]) => string {
  return (results) => {
    const votes = results.map(r =>
      r.text.toLowerCase().includes(keyword.toLowerCase()) ? 1 as number : 0 as number
    );
    const yesVotes = votes.reduce<number>((sum, v) => sum + v, 0);
    const noVotes = results.length - yesVotes;
    return JSON.stringify({
      decision: yesVotes > noVotes ? keyword : `not_${keyword}`,
      votes: { yes: yesVotes, no: noVotes, total: results.length },
      confidence: Math.max(yesVotes, noVotes) / results.length,
    });
  };
}

/**
 * Run the same task with multiple models for perspective diversity.
 * Returns a comparison of all outputs.
 */
export async function multiModelFanOut(
  orchestrators: Array<{ orchestrator: Orchestrator; label: string }>,
  agentName: string,
  task: string
): Promise<{ label: string; result: AgentRunResult }[]> {
  const results = await Promise.all(
    orchestrators.map(async ({ orchestrator, label }) => {
      const result = await orchestrator.runAgent(agentName, task);
      return { label, result };
    })
  );
  return results;
}
