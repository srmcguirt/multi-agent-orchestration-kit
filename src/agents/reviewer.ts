/**
 * ReviewerAgent — reviews code or content for quality, correctness, and improvements.
 *
 * Reads drafts from SharedMemory, provides structured feedback,
 * and stores review results for the writer to act on.
 *
 * Usage (code review):
 *   const reviewer = new ReviewerAgent(memory, { mode: 'code' });
 *   const result = await reviewer.run('Review the authentication implementation');
 *
 * Usage (content review):
 *   const reviewer = new ReviewerAgent(memory, { mode: 'content' });
 *   const result = await reviewer.run('Review the draft blog post for accuracy and clarity');
 */

import { BaseAgent } from '../orchestrator.js';
import { SharedMemory } from '../memory/shared-memory.js';
import type { AgentTool } from '../types.js';

export type ReviewerMode = 'code' | 'content' | 'technical-accuracy';

const MODE_INSTRUCTIONS: Record<ReviewerMode, string> = {
  code: `Review code for:
1. CORRECTNESS — Bugs, edge cases, logic errors, type safety issues
2. SECURITY — Injection risks, auth bypass, exposed secrets, insecure defaults
3. PERFORMANCE — N+1 queries, unnecessary re-computation, blocking calls, memory leaks
4. MAINTAINABILITY — Naming clarity, function size, coupling, documentation gaps
5. ERROR HANDLING — Unhandled rejections, missing null checks, silent failures

Format each finding as:
[SEVERITY: critical/high/medium/low] [FILE:LINE if known]
Issue: <what's wrong>
Why: <why it matters>
Fix: <specific code change>`,

  content: `Review content for:
1. ACCURACY — Factual errors, outdated information, unsupported claims
2. CLARITY — Confusing explanations, undefined jargon, missing context
3. STRUCTURE — Flow problems, missing sections, redundancy
4. TONE — Appropriate for audience, not condescending, not vague
5. COMPLETENESS — Missing edge cases, unanswered questions

Format each issue as:
[SEVERITY: critical/high/medium/low] [SECTION if applicable]
Issue: <what's wrong>
Why: <reader impact>
Suggestion: <specific improvement>`,

  'technical-accuracy': `Review for technical accuracy specifically:
1. API/method signatures — are they correct for the stated library version?
2. Code examples — do they actually run? Are types correct?
3. Claims about performance, security, or behavior — are they accurate?
4. Version-specific claims — are they current?
5. Missing caveats — what important context is omitted?

Be skeptical. Treat every claim as potentially wrong until verified.`,
};

function makeReadMemoryTool(memory: SharedMemory): AgentTool {
  return {
    definition: {
      name: 'read_memory',
      description: 'Read stored data from shared memory. Use to access drafts and research.',
      input_schema: {
        type: 'object' as const,
        properties: {
          key: {
            type: 'string',
            description: 'Memory key. Use "list" to see available keys.',
          },
        },
        required: ['key'],
      },
    },
    execute: async (input) => {
      const key = input['key'] as string;
      if (key === 'list') {
        return JSON.stringify({
          availableKeys: memory.getAll().map(e => ({
            key: e.key,
            storedBy: e.storedBy,
            storedAt: e.storedAt,
          })),
        });
      }
      const value = memory.get(key);
      if (value === undefined) {
        return JSON.stringify({ error: `Key "${key}" not found` });
      }
      return JSON.stringify({ key, value });
    },
  };
}

function makeStoreReviewTool(memory: SharedMemory): AgentTool {
  return {
    definition: {
      name: 'store_review',
      description: 'Store structured review feedback in shared memory.',
      input_schema: {
        type: 'object' as const,
        properties: {
          key: {
            type: 'string',
            description: 'Storage key (e.g., "review_v1", "code_review_findings")',
          },
          review: {
            type: 'object',
            description: 'Structured review with findings, verdict, and suggestions',
          },
        },
        required: ['key', 'review'],
      },
    },
    execute: async (input) => {
      const key = input['key'] as string;
      const review = input['review'];
      memory.set(key, review, 'reviewer');
      return JSON.stringify({ stored: true, key });
    },
  };
}

export class ReviewerAgent extends BaseAgent {
  constructor(
    private readonly memory: SharedMemory,
    config: {
      model?: string;
      maxTokens?: number;
      mode?: ReviewerMode;
    } = {}
  ) {
    const mode = config.mode ?? 'content';

    const systemPrompt = `You are a senior engineer conducting a rigorous review.

REVIEW MODE: ${mode.toUpperCase()}

REVIEW CRITERIA:
${MODE_INSTRUCTIONS[mode]}

REVIEW PROCESS:
1. Read available memory to get context (read_memory("list"), then read relevant keys)
2. Read the draft or code under review
3. Go through each review criterion systematically
4. Provide an overall verdict: APPROVE / REQUEST_CHANGES / REJECT
5. Store your structured review using store_review()
6. Output your review report in full

VERDICT DEFINITIONS:
- APPROVE: Ready to ship with minor optional suggestions
- REQUEST_CHANGES: Good foundation but specific issues must be addressed before shipping
- REJECT: Fundamental problems requiring significant rework

Be direct. "This is unclear" is not actionable. "The sentence starting 'The system uses...' assumes the reader knows what X is — add a one-line definition" is actionable.`;

    const tools: AgentTool[] = [
      makeReadMemoryTool(memory),
      makeStoreReviewTool(memory),
    ];

    super(tools, {
      name: 'reviewer',
      systemPrompt,
      model: config.model,
      maxTokens: config.maxTokens ?? 4096,
      maxToolRounds: 5,
    });
  }
}
