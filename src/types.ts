/**
 * Core type definitions for the Multi-Agent Orchestration Kit.
 */

import type { Tool, MessageParam } from '@anthropic-ai/sdk/resources/messages.js';

// ─── Agent Tool ──────────────────────────────────────────────────────────────

export interface AgentTool {
  /** Tool definition passed to Claude API */
  definition: Tool;
  /** Execute the tool with the given input */
  execute: (input: Record<string, unknown>) => Promise<string>;
}

// ─── Agent Config ─────────────────────────────────────────────────────────────

export interface AgentConfig {
  /** Agent name (used in logs and for routing) */
  name: string;
  /** System prompt defining the agent's role and capabilities */
  systemPrompt: string;
  /** Claude model to use (default: claude-opus-5) */
  model?: string;
  /** Max output tokens (default: 4096) */
  maxTokens?: number;
  /** Max tool-calling rounds before stopping (default: 10) */
  maxToolRounds?: number;
  /** Temperature — keep at 1 for tool use (Anthropic recommendation) */
  temperature?: number;
}

// ─── Agent Run Result ─────────────────────────────────────────────────────────

export interface AgentRunResult {
  /** Agent that produced this result */
  agentName: string;
  /** Final text response */
  text: string;
  /** Token usage across all rounds */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Number of tool-calling rounds completed */
  toolRounds: number;
  /** Whether the agent hit the maxToolRounds limit */
  hitRoundLimit: boolean;
  /** Metadata the agent wants to pass to the next stage */
  metadata?: Record<string, unknown>;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export interface OrchestratorConfig {
  /** Max agents that can run concurrently in fan-out mode (default: 5) */
  maxConcurrent?: number;
  /** Whether to log inter-agent communication (default: false) */
  verbose?: boolean;
}

export interface TaskRoute {
  /** Task description to match */
  pattern: string | RegExp;
  /** Agent name to route to */
  agentName: string;
}

// ─── Pattern Configs ──────────────────────────────────────────────────────────

export interface PipelineStage {
  /** Agent name to use at this stage */
  agentName: string;
  /** Optional transformation to apply to the previous stage output before passing to this stage */
  transform?: (previousResult: AgentRunResult, originalInput: string) => string;
}

export interface FanOutConfig {
  /** Agent to use for each parallel task */
  agentName: string;
  /** How to aggregate results from parallel agents */
  aggregator: (results: AgentRunResult[]) => string;
}

export interface SupervisorConfig {
  /** Agent name of the supervisor */
  supervisorName: string;
  /** Available worker agent names */
  workerNames: string[];
  /** Max rounds of supervisor→worker delegation */
  maxDelegationRounds?: number;
}

// ─── Shared Memory ───────────────────────────────────────────────────────────

export interface MemoryEntry<T = unknown> {
  key: string;
  value: T;
  /** ISO timestamp when this was stored */
  storedAt: string;
  /** Which agent stored this */
  storedBy: string;
  /** Optional expiry (ISO timestamp) */
  expiresAt?: string;
}

export interface SharedMemorySnapshot {
  entries: MemoryEntry[];
  totalEntries: number;
  snapshotAt: string;
}
