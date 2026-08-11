/**
 * Example: Fan-Out Parallel Analysis
 *
 * Demonstrates running multiple research tasks in parallel, then
 * aggregating the results into a comprehensive report.
 *
 * Run: npm run example:fanout
 *
 * What this does:
 * Distributes 3 research tasks to parallel researcher agents,
 * then aggregates their findings into a unified report.
 */

import { Orchestrator } from '../orchestrator.js';
import { SharedMemory } from '../memory/shared-memory.js';
import { ResearchAgent } from '../agents/researcher.js';
import { runFanOut, concatenateWithHeaders } from '../patterns/fan-out.js';

async function main(): Promise<void> {
  console.error('=== Fan-Out Parallel Analysis Example ===\n');

  const memory = new SharedMemory();
  const researcher = new ResearchAgent(memory);

  const orchestrator = new Orchestrator({ maxConcurrent: 3 });
  orchestrator.register(researcher);

  // Three parallel research tasks
  const topics = [
    'MCP server security: authentication patterns and common vulnerabilities',
    'MCP server performance: rate limiting, caching, and throughput optimization',
    'MCP server observability: logging, metrics, and distributed tracing',
  ];

  console.error(`Running ${topics.length} parallel research tasks...\n`);

  const result = await runFanOut(orchestrator, {
    tasks: topics,
    agentName: 'researcher',
    aggregator: concatenateWithHeaders,
  });

  console.log('\n' + '='.repeat(60));
  console.log('PARALLEL RESEARCH COMPLETE');
  console.log('='.repeat(60));

  for (const [i, agentResult] of result.results.entries()) {
    console.log(`\n[Task ${i + 1}] ${agentResult.agentName}: ${topics[i]?.slice(0, 60)}...`);
    console.log(`Tokens: ${agentResult.usage.totalTokens}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('AGGREGATED REPORT');
  console.log('='.repeat(60));
  console.log(result.aggregatedText);

  console.log('\n' + '='.repeat(60));
  console.log('STATS');
  console.log('='.repeat(60));
  console.log(`Total tokens (sum): ${result.totalTokens}`);
  console.log(`Wall-clock time: ${(result.durationMs / 1000).toFixed(1)}s`);
  console.log(`(Sequential would have taken ~${(result.durationMs * topics.length / 1000).toFixed(0)}s)`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
