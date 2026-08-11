# @wireforge/multi-agent-kit

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg) ![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white) ![Node](https://img.shields.io/badge/Node-%3E%3D18-339933?logo=node.js&logoColor=white) ![Patterns](https://img.shields.io/badge/Patterns-3-purple)

Production-ready multi-agent orchestration for Claude. Three composable patterns, shared memory, and real tool-calling agents -- ready to drop into your codebase.

```
                        ┌─────────────────────┐
                        │    Orchestrator      │
                        │                      │
                        │  register / route /  │
                        │  pipeline / fanOut / │
                        │  supervisor          │
                        └──────────┬───────────┘
                                   │
               ┌───────────────────┼───────────────────┐
               │                   │                   │
        ┌──────┴──────┐     ┌──────┴──────┐     ┌──────┴──────┐
        │  Researcher │     │   Writer    │     │  Reviewer   │
        │             │     │             │     │             │
        │ web_search  │     │ read_memory │     │ read_memory │
        │ fetch_url   │     │ store_draft │     │ store_review│
        │ store_find. │     │             │     │             │
        └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
               │                   │                   │
               └───────────────────┼───────────────────┘
                                   │
                        ┌──────────┴───────────┐
                        │    SharedMemory      │
                        │                      │
                        │  key-value store w/  │
                        │  TTL, snapshots,     │
                        │  agent attribution   │
                        └──────────────────────┘
```

## What You Get

- **Orchestrator** -- Agent registry, task routing, concurrency control
- **BaseAgent** -- Full Anthropic tool-use loop with multi-round execution, token tracking, round limits
- **3 Built-in Agents** -- Research (with web search + URL fetch), Write (6 output formats), Review (code/content/technical-accuracy modes)
- **3 Composable Patterns** -- Pipeline, Fan-Out, Supervisor
- **SharedMemory** -- Inter-agent communication with TTL, snapshots, and agent attribution
- **Structured Logger** -- stderr-only, level-controlled, agent-tagged

---

## Quick Start

```bash
# Clone
git clone https://github.com/srmcguirt/multi-agent-orchestration-kit.git
cd multi-agent-orchestration-kit

# Install
npm install

# Configure
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Build
npm run build

# Run the example pipeline
npm run example:research
```

### Minimal Usage

```typescript
import {
  Orchestrator,
  SharedMemory,
  ResearchAgent,
  WriterAgent,
  ReviewerAgent,
  runPipeline,
  makeResearchWriteReviewStages,
} from '@wireforge/multi-agent-kit';

// 1. Shared memory is the communication bus
const memory = new SharedMemory();

// 2. Create agents
const researcher = new ResearchAgent(memory);
const writer = new WriterAgent(memory, { outputFormat: 'blog-post' });
const reviewer = new ReviewerAgent(memory, { mode: 'content' });

// 3. Wire them up
const orchestrator = new Orchestrator({ verbose: true });
orchestrator.register(researcher);
orchestrator.register(writer);
orchestrator.register(reviewer);

// 4. Run a pipeline
const stages = makeResearchWriteReviewStages();
const result = await runPipeline(
  orchestrator,
  stages,
  'Multi-agent orchestration patterns in production'
);

console.log(result.finalOutput.text);
console.log(`Total tokens: ${result.totalTokens}`);
```

---

## Patterns

### Pipeline: Sequential Execution

Each agent receives the previous agent's output. Use for tasks with clear dependencies.

```
Input --> [Researcher] --> [Writer] --> [Reviewer] --> Output
```

```typescript
import { runPipeline } from '@wireforge/multi-agent-kit';

const result = await runPipeline(orchestrator, [
  { agentName: 'researcher' },
  {
    agentName: 'writer',
    // Transform shapes the handoff between stages
    transform: (researchResult, originalInput) =>
      `RESEARCH:\n${researchResult.text}\n\nBRIEF:\n${originalInput}`
  },
  { agentName: 'reviewer' },
], 'Explain vector databases to backend engineers');
```

**Ready-made stages:**

```typescript
import { makeResearchWriteReviewStages } from '@wireforge/multi-agent-kit';

// Pre-configured research -> write -> review with smart transforms
const stages = makeResearchWriteReviewStages({ outputFormat: 'technical-doc' });
```

### Fan-Out: Parallel Execution

Same agent processes multiple tasks concurrently. Results are aggregated.

```
        ┌--> [Agent] task 1 --┐
Input --+--> [Agent] task 2 --+--> Aggregator --> Output
        └--> [Agent] task 3 --┘
```

```typescript
import {
  runFanOut,
  concatenateWithHeaders,
  majorityVote,
} from '@wireforge/multi-agent-kit';

// Research 3 topics in parallel
const result = await runFanOut(orchestrator, {
  tasks: [
    'Research RAG architectures',
    'Research fine-tuning approaches',
    'Research prompt engineering patterns',
  ],
  agentName: 'researcher',
  aggregator: concatenateWithHeaders,
});

console.log(result.aggregatedText);

// Or use majority vote for approval decisions
const reviewResult = await runFanOut(orchestrator, {
  tasks: sections.map(s => `Review this section:\n${s}`),
  agentName: 'reviewer',
  aggregator: majorityVote('APPROVE'),
});
```

**Built-in aggregators:**

| Aggregator | Use Case |
|---|---|
| `concatenateWithHeaders` | Merge parallel research into one report |
| `mergeBulletPoints` | Extract and combine bullet findings |
| `takeMostDetailed` | Keep the most comprehensive response |
| `majorityVote(keyword)` | Boolean consensus (approve/reject) |

### Supervisor: Hierarchical Delegation

A supervisor agent dynamically routes to workers based on the task.

```
                ┌--> [Researcher] --┐
Input --> [Supervisor] --> [Writer] --+--> [Supervisor] --> Output
                └--> [Reviewer]  --┘
```

```typescript
import {
  runSupervisor,
  buildSupervisorSystemPrompt,
  BaseAgent,
  Orchestrator,
  SharedMemory,
} from '@wireforge/multi-agent-kit';

// Create a supervisor agent with worker-aware system prompt
class SupervisorAgent extends BaseAgent {
  constructor() {
    super([], {
      name: 'supervisor',
      systemPrompt: buildSupervisorSystemPrompt([
        {
          name: 'researcher',
          description: 'Gathers and synthesizes information',
          bestFor: ['fact-finding', 'topic research', 'competitive analysis'],
        },
        {
          name: 'writer',
          description: 'Produces polished written content',
          bestFor: ['articles', 'documentation', 'summaries'],
        },
        {
          name: 'reviewer',
          description: 'Reviews content for quality and accuracy',
          bestFor: ['quality checks', 'fact verification', 'code review'],
        },
      ]),
    });
  }
}

orchestrator.register(new SupervisorAgent());

const result = await runSupervisor(orchestrator, {
  supervisorName: 'supervisor',
  workerNames: ['researcher', 'writer', 'reviewer'],
  maxDelegationRounds: 4,
}, 'Create a comprehensive guide to building MCP servers');
```

---

## Agents

### ResearchAgent

Investigates topics using web search, URL fetching, and structured finding storage.

```typescript
const researcher = new ResearchAgent(memory, {
  model: 'claude-opus-4-5',  // optional model override
  maxTokens: 8192,            // optional token limit
});

const result = await researcher.run('Research the current state of WebAssembly');
// Findings stored in SharedMemory automatically
```

**Tools:** `web_search`, `fetch_url`, `store_findings`

### WriterAgent

Produces formatted content in 6 output styles. Reads from SharedMemory automatically.

```typescript
const writer = new WriterAgent(memory, {
  outputFormat: 'technical-doc',  // or blog-post, executive-summary, readme, newsletter, tweet-thread
});
```

**Tools:** `read_memory`, `store_draft`

### ReviewerAgent

Reviews code or content with structured feedback and verdicts.

```typescript
const reviewer = new ReviewerAgent(memory, {
  mode: 'code',  // or content, technical-accuracy
});
```

**Tools:** `read_memory`, `store_review`

### Custom Agents

Extend `BaseAgent` to create your own agents with custom tools:

```typescript
import { BaseAgent } from '@wireforge/multi-agent-kit';
import type { AgentTool } from '@wireforge/multi-agent-kit';

const dbQueryTool: AgentTool = {
  definition: {
    name: 'query_database',
    description: 'Run a read-only SQL query',
    input_schema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SQL query' },
      },
      required: ['sql'],
    },
  },
  execute: async (input) => {
    const sql = input['sql'] as string;
    // Your database query logic here
    return JSON.stringify({ rows: [] });
  },
};

class DataAnalyst extends BaseAgent {
  constructor() {
    super([dbQueryTool], {
      name: 'data-analyst',
      systemPrompt: 'You are a data analyst. Use SQL queries to answer questions.',
      maxToolRounds: 5,
    });
  }
}
```

---

## SharedMemory

The communication bus between agents. Every agent can read and write.

```typescript
import { SharedMemory } from '@wireforge/multi-agent-kit';

const memory = new SharedMemory();

// Store (with agent attribution)
memory.set('findings', { topics: ['...'] }, 'researcher');

// Store with TTL (auto-expires)
memory.set('cache', data, 'system', 60_000); // 60s TTL

// Read
const findings = memory.get<{ topics: string[] }>('findings');

// List everything
const all = memory.getAll();

// Generate text summary for injection into prompts
const summary = memory.summarize();

// Snapshot for persistence
const snap = memory.snapshot();
memory.restore(snap);
```

---

## API Reference

### Orchestrator

| Method | Description |
|---|---|
| `register(agent)` | Add an agent to the registry |
| `getAgent(name)` | Retrieve a registered agent |
| `listAgents()` | List all registered agent names |
| `runAgent(name, task)` | Run a single agent |
| `pipeline(stages, input)` | Sequential execution |
| `fanOut(tasks, agentName)` | Parallel execution |
| `supervisor(config, task)` | Hierarchical delegation |

### BaseAgent

| Method | Description |
|---|---|
| `run(message)` | Execute the agent (full tool-use loop) |
| `reset()` | Clear conversation history |
| `name` | Agent's registered name |

### SharedMemory

| Method | Description |
|---|---|
| `set(key, value, storedBy, ttlMs?)` | Store a value |
| `get<T>(key)` | Retrieve a value |
| `has(key)` | Check existence |
| `delete(key)` | Remove an entry |
| `getAll()` | All non-expired entries |
| `summarize()` | Text summary for prompts |
| `snapshot()` / `restore(snap)` | Serialize / deserialize |
| `clear()` | Remove everything |
| `size` | Count of non-expired entries |

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | (required) | Your Anthropic API key |
| `DEFAULT_MODEL` | `claude-opus-4-5` | Default model for all agents |
| `MAX_CONCURRENT_AGENTS` | `5` | Fan-out concurrency limit |
| `LOG_LEVEL` | `INFO` | Logging level (DEBUG, INFO, WARN, ERROR) |

### Per-Agent Overrides

Every agent accepts `model` and `maxTokens` in its constructor:

```typescript
const researcher = new ResearchAgent(memory, {
  model: 'claude-sonnet-4-20250514',
  maxTokens: 2048,
});
```

---

## Project Structure

```
src/
  index.ts              # Barrel exports
  orchestrator.ts       # Orchestrator + BaseAgent
  types.ts              # All TypeScript interfaces
  lib/
    logger.ts           # Structured stderr logger
  agents/
    base-agent.ts       # Re-export of BaseAgent
    researcher.ts       # ResearchAgent with tools
    writer.ts           # WriterAgent with format options
    reviewer.ts         # ReviewerAgent with review modes
  patterns/
    pipeline.ts         # Sequential pattern + helpers
    fan-out.ts          # Parallel pattern + aggregators
    supervisor.ts       # Hierarchical pattern + helpers
  memory/
    shared-memory.ts    # SharedMemory implementation
  examples/
    research-pipeline.ts    # Pipeline: research → write → review
    fan-out-analysis.ts     # Fan-out: parallel research + aggregation
    supervised-workflow.ts  # Supervisor: dynamic task routing
```

---

## Testing

```bash
# Run all tests (no API key needed — tests cover pure logic)
npm test

# Run individual test suites
npm run test:memory       # SharedMemory: set/get/TTL/snapshot
npm run test:orchestrator # Orchestrator: registration, routing, validation
npm run test:patterns     # Aggregators, pipeline helpers, extractFinalContent
```

39 unit tests covering:
- SharedMemory: CRUD, TTL expiry, snapshot/restore, agent attribution
- Orchestrator: registration, lookup, chaining, error handling
- Patterns: all 4 aggregators, pipeline stage builders, content extraction

---

## License

MIT -- see [LICENSE](./LICENSE).

Built by [WireForge](https://srmcguirt.gumroad.com).
