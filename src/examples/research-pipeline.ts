/**
 * Example: Research → Write → Review Pipeline
 *
 * A full working example that demonstrates the core multi-agent orchestration
 * pattern: a researcher gathers information, a writer synthesizes it into
 * content, and a reviewer evaluates the result.
 *
 * Run:
 *   npx tsc && node --env-file=.env dist/examples/research-pipeline.js
 *
 * Prerequisites:
 *   - ANTHROPIC_API_KEY set in .env
 *   - npm install
 */

import {
  Orchestrator,
  SharedMemory,
  ResearchAgent,
  WriterAgent,
  ReviewerAgent,
  runPipeline,
  makeResearchWriteReviewStages,
  extractFinalContent,
} from '../index.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const TOPIC = process.argv[2] ?? 'Multi-agent orchestration patterns in production AI systems';
const MODEL = process.env['DEFAULT_MODEL'];

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(70));
  console.log(' Multi-Agent Research Pipeline');
  console.log('='.repeat(70));
  console.log(`\nTopic: ${TOPIC}\n`);

  // 1. Create shared memory (the communication bus between agents)
  const memory = new SharedMemory();

  // 2. Create agents — each one takes shared memory so they can exchange data
  const researcher = new ResearchAgent(memory, MODEL ? { model: MODEL } : {});
  const writer = new WriterAgent(memory, {
    ...(MODEL ? { model: MODEL } : {}),
    outputFormat: 'blog-post',
  });
  const reviewer = new ReviewerAgent(memory, {
    ...(MODEL ? { model: MODEL } : {}),
    mode: 'content',
  });

  // 3. Register agents with the orchestrator
  const orchestrator = new Orchestrator({ verbose: true });
  orchestrator.register(researcher);
  orchestrator.register(writer);
  orchestrator.register(reviewer);

  console.log(`Registered agents: ${orchestrator.listAgents().join(', ')}\n`);

  // 4. Build the standard research → write → review pipeline
  const stages = makeResearchWriteReviewStages({
    outputFormat: 'blog-post',
  });

  // 5. Execute the pipeline
  console.log('--- Starting Pipeline ---\n');
  const startTime = Date.now();

  const result = await runPipeline(orchestrator, stages, TOPIC);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n--- Pipeline Complete (${elapsed}s) ---\n`);

  // 6. Print results
  printStageResults(result);

  // 7. Extract final content
  const finalContent = extractFinalContent(result);
  console.log('\n' + '='.repeat(70));
  console.log(' FINAL OUTPUT');
  console.log('='.repeat(70));
  console.log(finalContent);

  // 8. Show shared memory state
  console.log('\n' + '='.repeat(70));
  console.log(' SHARED MEMORY SNAPSHOT');
  console.log('='.repeat(70));
  console.log(memory.summarize({ keysOnly: true }));

  // 9. Show token usage
  console.log('\n' + '='.repeat(70));
  console.log(' TOKEN USAGE');
  console.log('='.repeat(70));
  console.log(`Total tokens: ${result.totalTokens.toLocaleString()}`);
  for (const stage of result.stages) {
    console.log(`  ${stage.agentName}: ${stage.usage.totalTokens.toLocaleString()} tokens`);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function printStageResults(result: Awaited<ReturnType<typeof runPipeline>>) {
  for (const [i, stage] of result.stages.entries()) {
    console.log(`\n--- Stage ${i + 1}: ${stage.agentName} ---`);
    console.log(`Tokens: ${stage.usage.totalTokens.toLocaleString()}`);
    console.log(`Tool rounds: ${stage.toolRounds}`);
    if (stage.hitRoundLimit) {
      console.log(`WARNING: Hit tool round limit`);
    }
    console.log(`Output preview: ${stage.text.slice(0, 200)}...`);
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────

main().catch(error => {
  console.error('Pipeline failed:', error);
  process.exit(1);
});
