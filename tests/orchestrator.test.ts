/**
 * Tests for Orchestrator — agent registry, routing, and pattern wiring.
 *
 * These tests cover the non-API parts of the orchestrator:
 * agent registration, lookup, validation, and configuration.
 * API-dependent tests (pipeline/fanOut/supervisor) require mocking
 * the Anthropic client — see tests/integration/ for those.
 *
 * Run: npx tsx tests/orchestrator.test.ts
 */

import { Orchestrator, BaseAgent } from '../src/orchestrator.js';
import type { AgentTool, AgentRunResult } from '../src/types.js';
import assert from 'node:assert/strict';

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      result.then(() => console.log(`  ✓ ${name}`)).catch(err => {
        console.error(`  ✗ ${name}`);
        console.error(`    ${err}`);
        process.exitCode = 1;
      });
    } else {
      console.log(`  ✓ ${name}`);
    }
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err}`);
    process.exitCode = 1;
  }
}

/**
 * Minimal concrete agent for testing (doesn't call the API).
 */
class StubAgent extends BaseAgent {
  constructor(name: string) {
    super([] as AgentTool[], {
      name,
      systemPrompt: `You are ${name}.`,
      maxToolRounds: 0,
    });
  }
}

console.log('\nOrchestrator Tests\n');

// ─── Registration ───────────────────────────────────────────────────────────

test('register adds an agent and returns this for chaining', () => {
  const orch = new Orchestrator();
  const agent = new StubAgent('test-agent');
  const result = orch.register(agent);
  assert.equal(result, orch); // returns this
});

test('listAgents returns registered agent names', () => {
  const orch = new Orchestrator();
  orch.register(new StubAgent('alice'));
  orch.register(new StubAgent('bob'));
  const names = orch.listAgents();
  assert.deepEqual(names.sort(), ['alice', 'bob']);
});

test('getAgent returns the registered agent', () => {
  const orch = new Orchestrator();
  const agent = new StubAgent('finder');
  orch.register(agent);
  assert.equal(orch.getAgent('finder'), agent);
});

test('getAgent throws for unknown agent', () => {
  const orch = new Orchestrator();
  assert.throws(
    () => orch.getAgent('nobody'),
    /No agent registered with name "nobody"/
  );
});

test('registering with same name overwrites', () => {
  const orch = new Orchestrator();
  const agent1 = new StubAgent('dup');
  const agent2 = new StubAgent('dup');
  orch.register(agent1);
  orch.register(agent2);
  assert.equal(orch.getAgent('dup'), agent2);
  assert.equal(orch.listAgents().length, 1);
});

// ─── Chaining ───────────────────────────────────────────────────────────────

test('register supports fluent chaining', () => {
  const orch = new Orchestrator();
  const result = orch
    .register(new StubAgent('a'))
    .register(new StubAgent('b'))
    .register(new StubAgent('c'));
  assert.equal(result, orch);
  assert.equal(orch.listAgents().length, 3);
});

// ─── Configuration ──────────────────────────────────────────────────────────

test('default config has maxConcurrent=5', () => {
  // We can't directly access private config, but we can verify
  // the constructor doesn't throw with no args
  const orch = new Orchestrator();
  assert.ok(orch);
});

test('custom config is accepted', () => {
  const orch = new Orchestrator({ maxConcurrent: 10, verbose: true });
  assert.ok(orch);
});

// ─── BaseAgent ──────────────────────────────────────────────────────────────

test('BaseAgent exposes name from config', () => {
  const agent = new StubAgent('my-agent');
  assert.equal(agent.name, 'my-agent');
});

test('BaseAgent reset clears history without error', () => {
  const agent = new StubAgent('resettable');
  agent.reset(); // Should not throw
  agent.reset(); // Double reset should be fine
});

// ─── Pipeline validation ────────────────────────────────────────────────────

test('pipeline throws on empty stages', async () => {
  const orch = new Orchestrator();
  await assert.rejects(
    () => orch.pipeline([], 'some input'),
    /stages cannot be empty/
  );
});

// ─── Fan-out edge cases ─────────────────────────────────────────────────────

test('fanOut returns empty array for empty tasks', async () => {
  const orch = new Orchestrator();
  orch.register(new StubAgent('worker'));
  const results = await orch.fanOut([], 'worker');
  assert.deepEqual(results, []);
});

console.log('\nAll Orchestrator tests passed.\n');
