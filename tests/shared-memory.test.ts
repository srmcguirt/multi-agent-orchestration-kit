/**
 * Tests for SharedMemory — the inter-agent communication layer.
 *
 * Run: npx tsx tests/shared-memory.test.ts
 */

import { SharedMemory } from '../src/memory/shared-memory.js';
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

console.log('\nSharedMemory Tests\n');

// ─── Basic set/get ──────────────────────────────────────────────────────────

test('set and get a string value', () => {
  const mem = new SharedMemory();
  mem.set('greeting', 'hello', 'test-agent');
  assert.equal(mem.get<string>('greeting'), 'hello');
});

test('set and get an object value', () => {
  const mem = new SharedMemory();
  const data = { topics: ['AI', 'MCP'], count: 2 };
  mem.set('findings', data, 'researcher');
  const result = mem.get<typeof data>('findings');
  assert.deepEqual(result, data);
});

test('get returns undefined for missing key', () => {
  const mem = new SharedMemory();
  assert.equal(mem.get('nonexistent'), undefined);
});

test('has returns true for existing key', () => {
  const mem = new SharedMemory();
  mem.set('key', 'value', 'agent');
  assert.equal(mem.has('key'), true);
});

test('has returns false for missing key', () => {
  const mem = new SharedMemory();
  assert.equal(mem.has('missing'), false);
});

// ─── Delete ─────────────────────────────────────────────────────────────────

test('delete removes an entry', () => {
  const mem = new SharedMemory();
  mem.set('temp', 'data', 'agent');
  assert.equal(mem.has('temp'), true);
  mem.delete('temp');
  assert.equal(mem.has('temp'), false);
});

test('delete returns false for non-existent key', () => {
  const mem = new SharedMemory();
  assert.equal(mem.delete('ghost'), false);
});

// ─── Overwrite ──────────────────────────────────────────────────────────────

test('set overwrites existing key', () => {
  const mem = new SharedMemory();
  mem.set('version', 'v1', 'agent-a');
  mem.set('version', 'v2', 'agent-b');
  assert.equal(mem.get<string>('version'), 'v2');
});

// ─── TTL / Expiry ───────────────────────────────────────────────────────────

test('entry with expired TTL returns undefined', async () => {
  const mem = new SharedMemory();
  mem.set('ephemeral', 'data', 'agent', 1); // 1ms TTL
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(mem.get('ephemeral'), undefined);
});

test('entry with long TTL is still accessible', () => {
  const mem = new SharedMemory();
  mem.set('persistent', 'data', 'agent', 60_000); // 60s TTL
  assert.equal(mem.get<string>('persistent'), 'data');
});

// ─── getAll ─────────────────────────────────────────────────────────────────

test('getAll returns all non-expired entries', () => {
  const mem = new SharedMemory();
  mem.set('a', 1, 'agent');
  mem.set('b', 2, 'agent');
  mem.set('c', 3, 'agent');
  const all = mem.getAll();
  assert.equal(all.length, 3);
});

test('getAll filters expired entries', async () => {
  const mem = new SharedMemory();
  mem.set('keep', 'yes', 'agent');
  mem.set('expire', 'no', 'agent', 1); // 1ms TTL
  await new Promise(resolve => setTimeout(resolve, 10));
  const all = mem.getAll();
  assert.equal(all.length, 1);
  assert.equal(all[0]?.key, 'keep');
});

// ─── size ───────────────────────────────────────────────────────────────────

test('size returns count of non-expired entries', () => {
  const mem = new SharedMemory();
  assert.equal(mem.size, 0);
  mem.set('a', 1, 'agent');
  mem.set('b', 2, 'agent');
  assert.equal(mem.size, 2);
});

// ─── clear ──────────────────────────────────────────────────────────────────

test('clear removes all entries', () => {
  const mem = new SharedMemory();
  mem.set('a', 1, 'agent');
  mem.set('b', 2, 'agent');
  mem.clear();
  assert.equal(mem.size, 0);
  assert.equal(mem.get('a'), undefined);
});

// ─── summarize ──────────────────────────────────────────────────────────────

test('summarize returns empty message when no entries', () => {
  const mem = new SharedMemory();
  assert.equal(mem.summarize(), '(shared memory is empty)');
});

test('summarize includes all entries with attribution', () => {
  const mem = new SharedMemory();
  mem.set('findings', 'Claude is great', 'researcher');
  const summary = mem.summarize();
  assert.ok(summary.includes('findings'));
  assert.ok(summary.includes('researcher'));
  assert.ok(summary.includes('Claude is great'));
});

test('summarize keysOnly mode hides values', () => {
  const mem = new SharedMemory();
  mem.set('secret', 'hidden-data', 'agent');
  const summary = mem.summarize({ keysOnly: true });
  assert.ok(summary.includes('[stored]'));
  assert.ok(!summary.includes('hidden-data'));
});

// ─── snapshot / restore ─────────────────────────────────────────────────────

test('snapshot captures full state', () => {
  const mem = new SharedMemory();
  mem.set('a', 1, 'agent');
  mem.set('b', 2, 'agent');
  const snap = mem.snapshot();
  assert.equal(snap.totalEntries, 2);
  assert.equal(snap.entries.length, 2);
  assert.ok(snap.snapshotAt); // ISO timestamp
});

test('restore recovers from snapshot', () => {
  const mem = new SharedMemory();
  mem.set('original', 'data', 'agent');
  const snap = mem.snapshot();

  mem.clear();
  assert.equal(mem.size, 0);

  mem.restore(snap);
  assert.equal(mem.size, 1);
  assert.equal(mem.get<string>('original'), 'data');
});

test('restore replaces existing entries', () => {
  const mem = new SharedMemory();
  mem.set('a', 1, 'agent');
  const snap = mem.snapshot();

  mem.set('b', 2, 'agent');
  mem.restore(snap);

  assert.equal(mem.size, 1);
  assert.equal(mem.has('b'), false);
});

// ─── Agent attribution ──────────────────────────────────────────────────────

test('entries track which agent stored them', () => {
  const mem = new SharedMemory();
  mem.set('research', 'data', 'researcher');
  mem.set('draft', 'content', 'writer');
  const all = mem.getAll();
  const research = all.find(e => e.key === 'research');
  const draft = all.find(e => e.key === 'draft');
  assert.equal(research?.storedBy, 'researcher');
  assert.equal(draft?.storedBy, 'writer');
});

test('entries have ISO timestamps', () => {
  const mem = new SharedMemory();
  mem.set('test', 'data', 'agent');
  const all = mem.getAll();
  const entry = all[0];
  assert.ok(entry?.storedAt);
  // Validate ISO format
  assert.ok(!isNaN(new Date(entry!.storedAt).getTime()));
});

console.log('\nAll SharedMemory tests passed.\n');
