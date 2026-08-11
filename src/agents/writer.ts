/**
 * WriterAgent — synthesizes research into polished written content.
 *
 * Reads from SharedMemory (findings from ResearchAgent) and produces
 * structured written output: articles, docs, reports, summaries.
 *
 * Usage:
 *   const writer = new WriterAgent(memory, { outputFormat: 'blog-post' });
 *   const result = await writer.run('Write a blog post about MCP server patterns');
 *   // Uses memory contents (research_findings, etc.) automatically
 */

import { BaseAgent } from '../orchestrator.js';
import { SharedMemory } from '../memory/shared-memory.js';
import type { AgentTool } from '../types.js';

export type WriterOutputFormat =
  | 'blog-post'
  | 'technical-doc'
  | 'executive-summary'
  | 'readme'
  | 'newsletter'
  | 'tweet-thread';

const FORMAT_INSTRUCTIONS: Record<WriterOutputFormat, string> = {
  'blog-post': `Write a developer blog post with:
- Engaging headline and intro hook
- H2/H3 section headers
- Code examples where relevant
- Concrete takeaways
- Length: 800-1500 words`,

  'technical-doc': `Write technical documentation with:
- Clear purpose statement
- Prerequisites
- Step-by-step instructions
- Code examples with comments
- Troubleshooting section
- Follow docs.anthropic.com style`,

  'executive-summary': `Write an executive summary with:
- One-paragraph overview
- 3-5 bullet key findings
- Business impact
- Recommended actions
- Length: 250-400 words, no jargon`,

  'readme': `Write a README.md with:
- Project title and 1-line description
- Key features (bullets)
- Quick start (installation + first run)
- Usage examples with code
- Contributing/license section`,

  'newsletter': `Write a developer newsletter section with:
- Punchy subject-line suggestion
- Brief intro
- Main content in scannable format
- "Why this matters" callout
- One clear CTA`,

  'tweet-thread': `Write a Twitter/X thread with:
- Hook tweet (must stop the scroll)
- 8-12 numbered follow-up tweets
- Each tweet max 280 characters
- End with CTA tweet
- Mark each: [Tweet 1], [Tweet 2], etc.`,
};

function makeReadMemoryTool(memory: SharedMemory): AgentTool {
  return {
    definition: {
      name: 'read_memory',
      description: 'Read stored data from shared memory. Use this to access research findings from the research agent.',
      input_schema: {
        type: 'object' as const,
        properties: {
          key: {
            type: 'string',
            description: 'Memory key to read. Use "list" to see all available keys.',
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
        return JSON.stringify({ error: `Key "${key}" not found in shared memory` });
      }
      return JSON.stringify({ key, value });
    },
  };
}

function makeStoreOutputTool(memory: SharedMemory): AgentTool {
  return {
    definition: {
      name: 'store_draft',
      description: 'Store a draft or section of content in shared memory for review by the reviewer agent.',
      input_schema: {
        type: 'object' as const,
        properties: {
          key: {
            type: 'string',
            description: 'Storage key (e.g., "draft_v1", "section_intro")',
          },
          content: {
            type: 'string',
            description: 'The content to store',
          },
        },
        required: ['key', 'content'],
      },
    },
    execute: async (input) => {
      const key = input['key'] as string;
      const content = input['content'] as string;
      memory.set(key, content, 'writer');
      return JSON.stringify({ stored: true, key, wordCount: content.split(' ').length });
    },
  };
}

export class WriterAgent extends BaseAgent {
  constructor(
    private readonly memory: SharedMemory,
    config: {
      model?: string;
      maxTokens?: number;
      outputFormat?: WriterOutputFormat;
    } = {}
  ) {
    const format = config.outputFormat ?? 'blog-post';

    const systemPrompt = `You are an expert technical writer who produces clear, engaging, and accurate content.

OUTPUT FORMAT REQUIREMENTS:
${FORMAT_INSTRUCTIONS[format]}

WRITING PRINCIPLES:
- Specificity beats generality. "Handles 10,000 requests/second" beats "handles high load."
- Show, don't just tell. Use code examples, diagrams (ASCII), concrete scenarios.
- Write for the reader, not the topic. Anticipate confusion points.
- First draft quality: aim for 80% publishable, not perfect.

USING SHARED MEMORY:
Before writing, use read_memory to check what the research agent has found.
Call read_memory("list") first to see available data, then read the relevant keys.

WORKFLOW:
1. Read relevant memory keys
2. Plan the structure (brief internal outline)
3. Write the full content
4. Store the draft using store_draft("draft_v1", content)`;

    const tools: AgentTool[] = [
      makeReadMemoryTool(memory),
      makeStoreOutputTool(memory),
    ];

    super(tools, {
      name: 'writer',
      systemPrompt,
      ...(config.model !== undefined ? { model: config.model } : {}),
      maxTokens: config.maxTokens ?? 6000,
      maxToolRounds: 5,
    });
  }
}
