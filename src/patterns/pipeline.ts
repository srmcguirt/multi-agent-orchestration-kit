/**
 * Pipeline Pattern — Sequential multi-agent execution.
 *
 * Each agent in the pipeline receives the previous agent's output as its input.
 * Use when tasks have clear sequential dependencies (research → write → review).
 *
 * Visual:
 *
 *   Input ──→ [Agent A] ──→ [Agent B] ──→ [Agent C] ──→ Final Output
 *
 * When to use:
 * - Content production: researcher → writer → reviewer
 * - Code generation: architect → coder → tester
 * - Data processing: extractor → transformer → validator
 * - Report creation: analyst → narrator → editor
 *
 * Example:
 *   const result = await runPipeline(orchestrator, stages, initialInput);
 *   console.log(result.finalOutput.text); // Writer's final text
 *   console.log(result.totalTokens);      // All stages combined
 */

import { Orchestrator } from '../orchestrator.js';
import { logger } from '../lib/logger.js';
import type { AgentRunResult, PipelineStage } from '../types.js';

export interface PipelineResult {
  /** Results from each stage in order */
  stages: AgentRunResult[];
  /** The final stage's result (convenience accessor) */
  finalOutput: AgentRunResult;
  /** Total tokens used across all stages */
  totalTokens: number;
  /** Total wall-clock time in milliseconds */
  durationMs: number;
}

/**
 * Run a sequential pipeline of agents.
 *
 * @param orchestrator - Orchestrator with registered agents
 * @param stages - Ordered list of {agentName, transform?} stages
 * @param initialInput - First agent's input
 * @returns PipelineResult with all stage outputs
 *
 * @example
 * const result = await runPipeline(orchestrator, [
 *   { agentName: 'researcher' },
 *   {
 *     agentName: 'writer',
 *     transform: (prevResult, original) =>
 *       `RESEARCH FINDINGS:\n${prevResult.text}\n\nORIGINAL BRIEF:\n${original}`
 *   },
 *   { agentName: 'reviewer' }
 * ], 'Research and write about MCP server patterns');
 */
export async function runPipeline(
  orchestrator: Orchestrator,
  stages: PipelineStage[],
  initialInput: string
): Promise<PipelineResult> {
  const startTime = Date.now();

  logger.info('pipeline', 'starting', {
    stages: stages.map(s => s.agentName),
    inputPreview: initialInput.slice(0, 80),
  });

  const stageResults = await orchestrator.pipeline(stages, initialInput);

  const totalTokens = stageResults.reduce((sum, r) => sum + r.usage.totalTokens, 0);
  const durationMs = Date.now() - startTime;

  logger.info('pipeline', 'complete', {
    stages: stages.length,
    totalTokens,
    durationMs,
  });

  const finalOutput = stageResults[stageResults.length - 1];
  if (!finalOutput) throw new Error('Pipeline produced no results');

  return {
    stages: stageResults,
    finalOutput,
    totalTokens,
    durationMs,
  };
}

/**
 * Build a standard research → write → review pipeline.
 * The most common multi-agent workflow — ready to use out of the box.
 */
export function makeResearchWriteReviewStages(options: {
  outputFormat?: string;
} = {}): PipelineStage[] {
  return [
    {
      agentName: 'researcher',
    },
    {
      agentName: 'writer',
      transform: (researchResult, originalBrief) =>
        `RESEARCH FINDINGS:
${researchResult.text}

ORIGINAL BRIEF:
${originalBrief}

${options.outputFormat ? `OUTPUT FORMAT: ${options.outputFormat}` : ''}

Please write the content based on the research above.`,
    },
    {
      agentName: 'reviewer',
      transform: (writerResult, originalBrief) =>
        `ORIGINAL BRIEF:
${originalBrief}

DRAFT TO REVIEW:
${writerResult.text}

Please review this draft for accuracy, clarity, and quality.`,
    },
  ];
}

/**
 * Extract the final polished output from a pipeline result.
 * Handles the case where the reviewer's output is a feedback report
 * rather than the polished content itself.
 */
export function extractFinalContent(result: PipelineResult): string {
  const stages = result.stages;

  // If there's a reviewer stage and it approved, return the writer's output
  // If the reviewer requested changes, return the reviewer's feedback
  const lastStage = stages[stages.length - 1];
  const secondLastStage = stages[stages.length - 2];

  if (lastStage?.agentName === 'reviewer' && secondLastStage) {
    // Check if reviewer approved
    const reviewText = lastStage.text.toLowerCase();
    if (reviewText.includes('approve') || reviewText.includes('ready to ship')) {
      return secondLastStage.text; // Return the approved draft
    }
    // Return reviewer feedback so the writer can revise
    return lastStage.text;
  }

  return lastStage?.text ?? result.finalOutput.text;
}
