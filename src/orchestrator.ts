/**
 * Orchestrator — the core coordinator for multi-agent workflows.
 *
 * Manages a registry of named agents, routes tasks to the right agent,
 * and provides three execution patterns:
 *
 * - runAgent(name, task)          — run a single named agent
 * - pipeline([stages], input)     — sequential: A → B → C
 * - fanOut(tasks, agentName)      — parallel: distribute → collect
 * - supervisor(config, input)     — hierarchical: boss routes to workers
 *
 * Usage:
 *   const orchestrator = new Orchestrator({ maxConcurrent: 3 });
 *   orchestrator.register(new ResearchAgent(memory));
 *   orchestrator.register(new WriterAgent(memory));
 *
 *   const result = await orchestrator.pipeline(
 *     [{ agentName: 'researcher' }, { agentName: 'writer' }],
 *     'Research and write about TypeScript 5.5 features'
 *   );
 */

import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';
import { logger } from './lib/logger.js';
import type {
  AgentConfig,
  AgentRunResult,
  AgentTool,
  OrchestratorConfig,
  PipelineStage,
  SupervisorConfig,
} from './types.js';

// ─── BaseAgent (embedded to keep this file self-contained) ────────────────────

/**
 * BaseAgent — the foundation every specialized agent builds on.
 * Handles the Anthropic tool-use loop automatically.
 */
export abstract class BaseAgent {
  protected readonly client: Anthropic;
  protected readonly config: Required<AgentConfig>;
  protected readonly tools: AgentTool[];
  private conversationHistory: MessageParam[] = [];

  constructor(tools: AgentTool[], config: AgentConfig) {
    this.client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
    this.config = {
      model: config.model ?? (process.env['DEFAULT_MODEL'] || 'claude-opus-5'),
      maxTokens: config.maxTokens ?? 4096,
      maxToolRounds: config.maxToolRounds ?? 10,
      temperature: config.temperature ?? 1,
      ...config,
    };
    this.tools = tools;
  }

  get name(): string {
    return this.config.name;
  }

  /**
   * Run the agent on a task. Handles the full tool-use loop.
   */
  async run(userMessage: string): Promise<AgentRunResult> {
    logger.info(this.name, 'starting task', { preview: userMessage.slice(0, 100) });

    this.conversationHistory.push({ role: 'user', content: userMessage });

    let inputTokens = 0;
    let outputTokens = 0;
    let toolRounds = 0;
    let hitRoundLimit = false;

    while (toolRounds <= this.config.maxToolRounds) {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        system: this.config.systemPrompt,
        tools: this.tools.map(t => t.definition),
        messages: this.conversationHistory,
      });

      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      // Collect tool use blocks and text blocks
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      const textBlocks = response.content.filter(b => b.type === 'text');

      // Add assistant message to history
      this.conversationHistory.push({
        role: 'assistant',
        content: response.content,
      });

      if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
        const text = textBlocks.map(b => (b.type === 'text' ? b.text : '')).join('');
        logger.info(this.name, 'task complete', {
          toolRounds,
          inputTokens,
          outputTokens,
        });
        return {
          agentName: this.name,
          text,
          usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
          toolRounds,
          hitRoundLimit: false,
        };
      }

      // Execute tools in parallel
      toolRounds++;
      if (toolRounds > this.config.maxToolRounds) {
        hitRoundLimit = true;
        const text = textBlocks.map(b => (b.type === 'text' ? b.text : '')).join('');
        logger.warn(this.name, 'hit max tool rounds', { maxToolRounds: this.config.maxToolRounds });
        return {
          agentName: this.name,
          text,
          usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
          toolRounds,
          hitRoundLimit,
        };
      }

      const toolResults = await Promise.all(
        toolUseBlocks.map(async block => {
          if (block.type !== 'tool_use') return null;
          const tool = this.tools.find(t => t.definition.name === block.name);
          logger.debug(this.name, `executing tool: ${block.name}`);

          let resultContent: string;
          if (!tool) {
            resultContent = `Error: Unknown tool "${block.name}"`;
          } else {
            try {
              resultContent = await tool.execute(block.input as Record<string, unknown>);
            } catch (err) {
              resultContent = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
              logger.warn(this.name, `tool "${block.name}" failed`, { error: resultContent });
            }
          }

          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: resultContent,
          };
        })
      );

      this.conversationHistory.push({
        role: 'user',
        content: toolResults.filter(Boolean) as NonNullable<typeof toolResults[number]>[],
      });
    }

    // Should never reach here, but TypeScript requires exhaustive return
    throw new Error(`${this.name}: Unexpected loop exit`);
  }

  /**
   * Reset conversation history for a fresh task.
   */
  reset(): void {
    this.conversationHistory = [];
  }

  /**
   * Run the agent with an isolated conversation history.
   * Safe for concurrent use — each call gets its own message array,
   * so multiple fanOut tasks on the same agent instance don't collide.
   */
  async runIsolated(userMessage: string): Promise<AgentRunResult> {
    logger.info(this.name, 'starting isolated task', { preview: userMessage.slice(0, 100) });

    const localHistory: MessageParam[] = [{ role: 'user', content: userMessage }];

    let inputTokens = 0;
    let outputTokens = 0;
    let toolRounds = 0;

    while (toolRounds <= this.config.maxToolRounds) {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        system: this.config.systemPrompt,
        tools: this.tools.map(t => t.definition),
        messages: localHistory,
      });

      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      const textBlocks = response.content.filter(b => b.type === 'text');

      localHistory.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
        const text = textBlocks.map(b => (b.type === 'text' ? b.text : '')).join('');
        logger.info(this.name, 'isolated task complete', { toolRounds, inputTokens, outputTokens });
        return {
          agentName: this.name,
          text,
          usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
          toolRounds,
          hitRoundLimit: false,
        };
      }

      toolRounds++;
      if (toolRounds > this.config.maxToolRounds) {
        const text = textBlocks.map(b => (b.type === 'text' ? b.text : '')).join('');
        logger.warn(this.name, 'isolated task hit max tool rounds', { maxToolRounds: this.config.maxToolRounds });
        return {
          agentName: this.name,
          text,
          usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
          toolRounds,
          hitRoundLimit: true,
        };
      }

      const toolResults = await Promise.all(
        toolUseBlocks.map(async block => {
          if (block.type !== 'tool_use') return null;
          const tool = this.tools.find(t => t.definition.name === block.name);
          logger.debug(this.name, `executing tool (isolated): ${block.name}`);

          let resultContent: string;
          if (!tool) {
            resultContent = `Error: Unknown tool "${block.name}"`;
          } else {
            try {
              resultContent = await tool.execute(block.input as Record<string, unknown>);
            } catch (err) {
              resultContent = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
              logger.warn(this.name, `tool "${block.name}" failed`, { error: resultContent });
            }
          }

          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: resultContent,
          };
        })
      );

      localHistory.push({
        role: 'user',
        content: toolResults.filter(Boolean) as NonNullable<typeof toolResults[number]>[],
      });
    }

    throw new Error(`${this.name}: Unexpected loop exit in isolated run`);
  }
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export class Orchestrator {
  private readonly agents = new Map<string, BaseAgent>();
  private readonly config: Required<OrchestratorConfig>;

  constructor(config: OrchestratorConfig = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? parseInt(process.env['MAX_CONCURRENT_AGENTS'] ?? '5'),
      verbose: config.verbose ?? false,
    };
  }

  /**
   * Register an agent with the orchestrator.
   */
  register(agent: BaseAgent): this {
    this.agents.set(agent.name, agent);
    logger.info('orchestrator', `registered agent: ${agent.name}`);
    return this;
  }

  /**
   * Get a registered agent by name.
   */
  getAgent(name: string): BaseAgent {
    const agent = this.agents.get(name);
    if (!agent) {
      throw new Error(`Orchestrator: No agent registered with name "${name}". Available: ${[...this.agents.keys()].join(', ')}`);
    }
    return agent;
  }

  /**
   * Run a single named agent on a task.
   */
  async runAgent(agentName: string, task: string): Promise<AgentRunResult> {
    const agent = this.getAgent(agentName);
    agent.reset();
    return agent.run(task);
  }

  /**
   * Pipeline pattern — sequential execution.
   * Each stage receives the previous stage's output as its input.
   *
   * A → B → C
   *
   * @param stages - Ordered list of agents to run
   * @param initialInput - The first agent's input
   * @returns Array of results from each stage (last result is the final output)
   */
  async pipeline(stages: PipelineStage[], initialInput: string): Promise<AgentRunResult[]> {
    if (stages.length === 0) throw new Error('Pipeline: stages cannot be empty');

    logger.info('orchestrator', 'starting pipeline', {
      stages: stages.map(s => s.agentName),
    });

    const results: AgentRunResult[] = [];
    let currentInput = initialInput;

    for (const [i, stage] of stages.entries()) {
      logger.info('orchestrator', `pipeline stage ${i + 1}/${stages.length}: ${stage.agentName}`);

      const agent = this.getAgent(stage.agentName);
      agent.reset();

      // Allow stage to transform the input from the previous stage
      const stageInput = stage.transform && i > 0 && results[i - 1]
        ? stage.transform(results[i - 1]!, initialInput)
        : currentInput;

      const result = await agent.run(stageInput);
      results.push(result);

      // Next stage gets this stage's output as input
      currentInput = result.text;
    }

    logger.info('orchestrator', 'pipeline complete', {
      stages: stages.length,
      totalTokens: results.reduce((sum, r) => sum + r.usage.totalTokens, 0),
    });

    return results;
  }

  /**
   * Fan-out pattern — parallel execution.
   * Distributes multiple tasks to the same (or different) agents and runs them concurrently.
   *
   *        ┌→ Agent A (task 1) ─┐
   * input ─┤→ Agent A (task 2) ─┼→ aggregated output
   *        └→ Agent A (task 3) ─┘
   *
   * @param tasks - List of task descriptions to run in parallel
   * @param agentName - Which agent to use for all tasks
   * @returns Results from all agents (order matches input tasks)
   */
  async fanOut(tasks: string[], agentName: string): Promise<AgentRunResult[]> {
    if (tasks.length === 0) return [];

    logger.info('orchestrator', 'starting fan-out', {
      agentName,
      taskCount: tasks.length,
      maxConcurrent: this.config.maxConcurrent,
    });

    // Process in batches to respect maxConcurrent
    const results: AgentRunResult[] = [];
    for (let i = 0; i < tasks.length; i += this.config.maxConcurrent) {
      const batch = tasks.slice(i, i + this.config.maxConcurrent);
      logger.info('orchestrator', `fan-out batch ${Math.floor(i / this.config.maxConcurrent) + 1}`, {
        batchSize: batch.length,
      });

      const batchResults = await Promise.all(
        batch.map(async (task, batchIdx) => {
          const agent = this.getAgent(agentName);
          // Use runIsolated — each task gets its own conversation history
          // so concurrent tasks don't corrupt each other's state
          logger.debug('orchestrator', `fan-out task ${i + batchIdx + 1}/${tasks.length} started`);
          return agent.runIsolated(task);
        })
      );

      results.push(...batchResults);
    }

    logger.info('orchestrator', 'fan-out complete', {
      taskCount: tasks.length,
      totalTokens: results.reduce((sum, r) => sum + r.usage.totalTokens, 0),
    });

    return results;
  }

  /**
   * Supervisor pattern — hierarchical routing.
   * A supervisor agent decides which worker to delegate to, then reviews the result.
   *
   *           ┌→ Worker A ─┐
   * Supervisor ┤            ├→ Supervisor (review) → final answer
   *           └→ Worker B ─┘
   *
   * @param config - Supervisor and worker configuration
   * @param initialTask - The initial task to route
   * @returns Final result after supervisor review
   */
  async supervisor(config: SupervisorConfig, initialTask: string): Promise<AgentRunResult> {
    const maxRounds = config.maxDelegationRounds ?? 3;
    const workerNames = config.workerNames;

    logger.info('orchestrator', 'starting supervisor pattern', {
      supervisor: config.supervisorName,
      workers: workerNames,
      maxRounds,
    });

    const supervisorAgent = this.getAgent(config.supervisorName);
    supervisorAgent.reset();

    // Build a routing prompt for the supervisor
    const routingPrompt = `You are a supervisor coordinating a team of specialized workers.

AVAILABLE WORKERS:
${workerNames.map(n => {
  const agent = this.agents.get(n);
  return `- ${n}: ${agent ? 'registered agent' : 'NOT FOUND'}`;
}).join('\n')}

TASK TO DELEGATE:
${initialTask}

INSTRUCTIONS:
1. Analyze the task and decide which worker is best suited for it.
2. Formulate a specific, detailed sub-task for that worker.
3. Respond in this EXACT JSON format:
{
  "delegateTo": "<worker-name>",
  "subTask": "<specific instructions for the worker>",
  "reasoning": "<why this worker>"
}`;

    let supervisorResult = await supervisorAgent.run(routingPrompt);
    let delegationRound = 0;
    let finalWorkerResult: AgentRunResult | null = null;

    while (delegationRound < maxRounds) {
      // Parse supervisor's routing decision
      const jsonMatch = supervisorResult.text.match(/\{[\s\S]*"delegateTo"[\s\S]*\}/);
      if (!jsonMatch) {
        // Supervisor gave a direct answer without routing
        logger.info('orchestrator', 'supervisor gave direct answer (no routing)');
        return supervisorResult;
      }

      let routing: { delegateTo: string; subTask: string; reasoning: string };
      try {
        routing = JSON.parse(jsonMatch[0]) as typeof routing;
      } catch {
        logger.warn('orchestrator', 'supervisor routing JSON parse failed, returning direct answer');
        return supervisorResult;
      }

      logger.info('orchestrator', `supervisor delegating to: ${routing.delegateTo}`, {
        reasoning: routing.reasoning,
        round: delegationRound + 1,
      });

      if (!workerNames.includes(routing.delegateTo)) {
        logger.warn('orchestrator', `supervisor tried to route to unknown worker: ${routing.delegateTo}`);
        return supervisorResult;
      }

      // Run the worker
      const workerAgent = this.getAgent(routing.delegateTo);
      workerAgent.reset();
      finalWorkerResult = await workerAgent.run(routing.subTask);

      delegationRound++;

      // Let supervisor review the worker's result
      supervisorAgent.reset();
      const reviewPrompt = `You previously delegated a task to ${routing.delegateTo}.

ORIGINAL TASK:
${initialTask}

WORKER'S RESULT:
${finalWorkerResult.text}

Is this result complete and satisfactory for the original task?
- If YES: Summarize and present the final answer.
- If NO and you want to delegate again: Use the JSON routing format again.
- If NO and you can answer directly: Provide the answer directly.`;

      supervisorResult = await supervisorAgent.run(reviewPrompt);

      // Check if this looks like another routing request
      if (!supervisorResult.text.includes('"delegateTo"')) {
        // Supervisor is satisfied — return the synthesized result
        break;
      }
    }

    logger.info('orchestrator', 'supervisor pattern complete', {
      delegationRounds: delegationRound,
      usedWorker: finalWorkerResult?.agentName,
    });

    return supervisorResult;
  }

  /**
   * List all registered agents.
   */
  listAgents(): string[] {
    return [...this.agents.keys()];
  }
}
