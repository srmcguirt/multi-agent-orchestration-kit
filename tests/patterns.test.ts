/**
 * Tests for pattern helpers and aggregators.
 *
 * These test the pure functions (aggregators, stage builders)
 * that don't require an API call.
 *
 * Run: npx tsx tests/patterns.test.ts
 */

import {
  concatenateWithHeaders,
  mergeBulletPoints,
  takeMostDetailed,
  majorityVote,
} from '../src/patterns/fan-out.js';
import {
  makeResearchWriteReviewStages,
  extractFinalContent,
} from '../src/patterns/pipeline.js';
import type { AgentRunResult } from '../src/types.js';
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

/** Helper to create a mock AgentRunResult */
function mockResult(text: string, opts: Partial<AgentRunResult> = {}): AgentRunResult {
  return {
    agentName: opts.agentName ?? 'test-agent',
    text,
    usage: opts.usage ?? {
      inputTokens: text.length,
      outputTokens: text.length,
      totalTokens: text.length * 2,
    },
    toolRounds: opts.toolRounds ?? 0,
    hitRoundLimit: opts.hitRoundLimit ?? false,
  };
}

console.log('\nAggregator Tests\n');

// ─── concatenateWithHeaders ─────────────────────────────────────────────────

test('concatenateWithHeaders joins results with headers', () => {
  const results = [
    mockResult('First result', { agentName: 'researcher' }),
    mockResult('Second result', { agentName: 'researcher' }),
  ];
  const output = concatenateWithHeaders(results);
  assert.ok(output.includes('## Section 1'));
  assert.ok(output.includes('## Section 2'));
  assert.ok(output.includes('First result'));
  assert.ok(output.includes('Second result'));
});

test('concatenateWithHeaders handles single result', () => {
  const results = [mockResult('Only result')];
  const output = concatenateWithHeaders(results);
  assert.ok(output.includes('## Section 1'));
  assert.ok(output.includes('Only result'));
});

// ─── mergeBulletPoints ──────────────────────────────────────────────────────

test('mergeBulletPoints extracts dash bullets', () => {
  const results = [
    mockResult('Header\n- Point A\n- Point B\nFooter'),
    mockResult('Other\n- Point C\n'),
  ];
  const output = mergeBulletPoints(results);
  assert.ok(output.includes('- Point A'));
  assert.ok(output.includes('- Point B'));
  assert.ok(output.includes('- Point C'));
  assert.ok(!output.includes('Header'));
  assert.ok(!output.includes('Footer'));
});

test('mergeBulletPoints extracts bullet-character bullets', () => {
  const results = [
    mockResult('Intro\n• Bullet one\n• Bullet two'),
  ];
  const output = mergeBulletPoints(results);
  assert.ok(output.includes('• Bullet one'));
  assert.ok(output.includes('• Bullet two'));
});

test('mergeBulletPoints returns empty string for no bullets', () => {
  const results = [mockResult('No bullets here')];
  const output = mergeBulletPoints(results);
  assert.equal(output.trim(), '');
});

// ─── takeMostDetailed ───────────────────────────────────────────────────────

test('takeMostDetailed returns the result with highest output tokens', () => {
  const results = [
    mockResult('Short', { usage: { inputTokens: 10, outputTokens: 50, totalTokens: 60 } }),
    mockResult('Much longer and more detailed response', {
      usage: { inputTokens: 10, outputTokens: 500, totalTokens: 510 },
    }),
    mockResult('Medium', { usage: { inputTokens: 10, outputTokens: 200, totalTokens: 210 } }),
  ];
  const output = takeMostDetailed(results);
  assert.equal(output, 'Much longer and more detailed response');
});

// ─── majorityVote ───────────────────────────────────────────────────────────

test('majorityVote counts keyword occurrences', () => {
  const voter = majorityVote('APPROVE');
  const results = [
    mockResult('I APPROVE this content'),
    mockResult('This looks great. APPROVE.'),
    mockResult('I have concerns. REJECT this.'),
  ];
  const output = JSON.parse(voter(results));
  assert.equal(output.decision, 'APPROVE');
  assert.equal(output.votes.yes, 2);
  assert.equal(output.votes.no, 1);
});

test('majorityVote returns negative when minority has keyword', () => {
  const voter = majorityVote('APPROVE');
  const results = [
    mockResult('Rejected'),
    mockResult('Rejected'),
    mockResult('APPROVE'),
  ];
  const output = JSON.parse(voter(results));
  assert.equal(output.decision, 'not_APPROVE');
  assert.equal(output.votes.yes, 1);
  assert.equal(output.votes.no, 2);
});

test('majorityVote is case-insensitive', () => {
  const voter = majorityVote('approve');
  const results = [
    mockResult('I APPROVE this'),
    mockResult('Approved!'),
    mockResult('approve'),
  ];
  const output = JSON.parse(voter(results));
  assert.equal(output.votes.yes, 3);
});

test('majorityVote returns confidence as ratio', () => {
  const voter = majorityVote('APPROVE');
  const results = [
    mockResult('APPROVE'),
    mockResult('APPROVE'),
    mockResult('APPROVE'),
  ];
  const output = JSON.parse(voter(results));
  assert.equal(output.confidence, 1);
});

console.log('\nPipeline Helper Tests\n');

// ─── makeResearchWriteReviewStages ──────────────────────────────────────────

test('makeResearchWriteReviewStages returns 3 stages', () => {
  const stages = makeResearchWriteReviewStages();
  assert.equal(stages.length, 3);
  assert.equal(stages[0]!.agentName, 'researcher');
  assert.equal(stages[1]!.agentName, 'writer');
  assert.equal(stages[2]!.agentName, 'reviewer');
});

test('writer stage transform includes research and original brief', () => {
  const stages = makeResearchWriteReviewStages();
  const writerStage = stages[1]!;
  assert.ok(writerStage.transform); // has a transform function

  const researchResult = mockResult('Research findings here');
  const transformed = writerStage.transform!(researchResult, 'Original topic');
  assert.ok(transformed.includes('Research findings here'));
  assert.ok(transformed.includes('Original topic'));
});

test('reviewer stage transform includes brief and draft', () => {
  const stages = makeResearchWriteReviewStages();
  const reviewerStage = stages[2]!;
  assert.ok(reviewerStage.transform);

  const writerResult = mockResult('Draft content');
  const transformed = reviewerStage.transform!(writerResult, 'Original topic');
  assert.ok(transformed.includes('Draft content'));
  assert.ok(transformed.includes('Original topic'));
});

test('makeResearchWriteReviewStages accepts output format option', () => {
  const stages = makeResearchWriteReviewStages({ outputFormat: 'readme' });
  const writerStage = stages[1]!;
  const researchResult = mockResult('Research');
  const transformed = writerStage.transform!(researchResult, 'Brief');
  assert.ok(transformed.includes('readme'));
});

// ─── extractFinalContent ────────────────────────────────────────────────────

test('extractFinalContent returns writer output when reviewer approves', () => {
  const result = {
    stages: [
      mockResult('Research', { agentName: 'researcher' }),
      mockResult('The polished article content', { agentName: 'writer' }),
      mockResult('VERDICT: APPROVE. This is ready to ship.', { agentName: 'reviewer' }),
    ],
    finalOutput: mockResult('VERDICT: APPROVE', { agentName: 'reviewer' }),
    totalTokens: 1000,
    durationMs: 5000,
  };
  const content = extractFinalContent(result);
  assert.equal(content, 'The polished article content');
});

test('extractFinalContent returns reviewer feedback when changes requested', () => {
  const result = {
    stages: [
      mockResult('Research', { agentName: 'researcher' }),
      mockResult('Draft content', { agentName: 'writer' }),
      mockResult('VERDICT: REQUEST_CHANGES. Fix section 3.', { agentName: 'reviewer' }),
    ],
    finalOutput: mockResult('VERDICT: REQUEST_CHANGES', { agentName: 'reviewer' }),
    totalTokens: 1000,
    durationMs: 5000,
  };
  const content = extractFinalContent(result);
  assert.ok(content.includes('REQUEST_CHANGES'));
});

test('extractFinalContent returns last stage when no reviewer', () => {
  const result = {
    stages: [
      mockResult('Research', { agentName: 'researcher' }),
      mockResult('Final content', { agentName: 'custom-agent' }),
    ],
    finalOutput: mockResult('Final content', { agentName: 'custom-agent' }),
    totalTokens: 500,
    durationMs: 3000,
  };
  const content = extractFinalContent(result);
  assert.equal(content, 'Final content');
});

console.log('\nAll pattern tests passed.\n');
