/**
 * Example: Supervisor-Directed Workflow
 *
 * Demonstrates the supervisor pattern where a supervisor agent
 * dynamically decides which workers to delegate to.
 *
 * Run: npm run example:supervisor
 *
 * What this does:
 * A supervisor receives a complex task, decides to first delegate
 * to the researcher, then to the writer, then reviews the output
 * and synthesizes a final answer.
 */

import { Orchestrator, BaseAgent } from '../orchestrator.js';
import { SharedMemory } from '../memory/shared-memory.js';
import { ResearchAgent } from '../agents/researcher.js';
import { WriterAgent } from '../agents/writer.js';
import { ReviewerAgent } from '../agents/reviewer.js';
import { runSupervisor, buildSupervisorSystemPrompt, RESEARCH_WRITE_REVIEW_SUPERVISOR } from '../patterns/supervisor.js';
import type { AgentTool } from '../types.js';

/**
 * SupervisorAgent — dynamically routes tasks to workers.
 * No tools needed: the supervisor uses reasoning + the orchestrator to delegate.
 */
class SupervisorAgent extends BaseAgent {
  constructor(workerDescriptions: Parameters<typeof buildSupervisorSystemPrompt>[0]) {
    super([] as AgentTool[], {
      name: 'supervisor',
      systemPrompt: buildSupervisorSystemPrompt(workerDescriptions),
      model: process.env['DEFAULT_MODEL'] ?? 'claude-opus-4-5',
      maxTokens: 2048,
      maxToolRounds: 0, // Supervisor doesn't use tools directly
    });
  }
}

async function main(): Promise<void> {
  console.error('=== Supervisor-Directed Workflow Example ===\n');

  const memory = new SharedMemory();

  // Create workers
  const researcher = new ResearchAgent(memory);
  const writer = new WriterAgent(memory, { outputFormat: 'technical-doc' });
  const reviewer = new ReviewerAgent(memory, { mode: 'content' });

  // Create supervisor with worker knowledge
  const supervisor = new SupervisorAgent([
    {
      name: 'researcher',
      description: 'Gathers and synthesizes information from web searches and URLs',
      bestFor: ['fact gathering', 'market research', 'technical research', 'competitive analysis'],
    },
    {
      name: 'writer',
      description: 'Produces polished written content in various formats',
      bestFor: ['blog posts', 'technical docs', 'READMEs', 'executive summaries'],
    },
    {
      name: 'reviewer',
      description: 'Reviews content or code for quality, accuracy, and improvements',
      bestFor: ['content review', 'code review', 'fact checking', 'quality gate'],
    },
  ]);

  // Register all agents
  const orchestrator = new Orchestrator({ maxConcurrent: 2 });
  orchestrator
    .register(supervisor)
    .register(researcher)
    .register(writer)
    .register(reviewer);

  const task = process.argv[2] ??
    'Create a technical guide explaining the three main multi-agent orchestration patterns (pipeline, fan-out, supervisor) with code examples and when to use each.';

  console.error(`Task: ${task}\n`);
  console.error('Supervisor will decide how to route this...\n');

  const result = await runSupervisor(
    orchestrator,
    { supervisorName: 'supervisor', ...RESEARCH_WRITE_REVIEW_SUPERVISOR },
    task
  );

  console.log('\n' + '='.repeat(60));
  console.log('SUPERVISOR WORKFLOW COMPLETE');
  console.log('='.repeat(60));
  console.log('\n' + result.finalOutput.text);

  console.log('\n' + '='.repeat(60));
  console.log('STATS');
  console.log('='.repeat(60));
  console.log(`Total tokens: ${result.totalTokens}`);
  console.log(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
  console.log(`Memory entries after workflow: ${memory.size}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
