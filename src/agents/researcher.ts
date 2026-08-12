/**
 * ResearchAgent — gathers information and synthesizes findings.
 *
 * Uses web search and URL fetching tools to research topics.
 * Stores findings in SharedMemory for downstream agents.
 *
 * Usage:
 * const memory = new SharedMemory();
 * const researcher = new ResearchAgent(memory);
 * const result = await researcher.run('Research the latest MCP server patterns');
 * // Findings are in result.text AND stored in memory under 'research_findings'
 */

import { BaseAgent } from '../orchestrator.js';
import { SharedMemory } from '../memory/shared-memory.js';
import type { AgentTool } from '../types.js';

const RESEARCHER_SYSTEM_PROMPT = `You are an expert research analyst with deep experience in technology topics.

Your job:
1. Break the research topic into 3-5 specific questions to answer
2. Use your tools to gather information on each question
3. Synthesize findings into a structured report

Your output format:
## Research Report: [TOPIC]

### Key Findings
- Finding 1 (with source/confidence level)
- Finding 2 (with source/confidence level)

### Technical Details
[Detailed technical information]

### Gaps & Uncertainties
[What you couldn't find or aren't certain about]

### Summary for Next Agent
[2-3 sentence summary optimized for handing off to a writer or reviewer]

Be specific. Cite where information comes from. Flag anything you're uncertain about.`;

/**
 * Simulated web search tool (replace with real search API in production).
 */
function makeWebSearchTool(memory: SharedMemory): AgentTool {
 return {
 definition: {
 name: 'web_search',
 description: 'Search the web for information on a topic. Returns relevant snippets.',
 input_schema: {
 type: 'object' as const,
 properties: {
 query: {
 type: 'string',
 description: 'Search query (be specific for better results)',
 },
 max_results: {
 type: 'number',
 description: 'Max results to return (1-10, default 5)',
 },
 },
 required: ['query'],
 },
 },
 execute: async (input) => {
 const query = input['query'] as string;
 const maxResults = (input['max_results'] as number | undefined) ?? 5;

 // Store the search in memory for traceability
 const searchKey = `search_${Date.now()}`;
 memory.set(searchKey, { query, timestamp: new Date().toISOString() }, 'researcher');

 // In production: call Brave Search, Serper, or similar API here
 // For now, return a structured placeholder that Claude can work with
 return JSON.stringify({
 query,
 note: 'In production, replace this with a real search API (Brave Search, Serper, Tavily, etc.)',
 results: [
 {
 title: `Search result 1 for: ${query}`,
 snippet: `This is where real search content would appear for "${query}". Integrate your preferred search API by replacing the execute() function in src/agents/researcher.ts.`,
 url: 'https://example.com/result-1',
 },
 {
 title: `Search result 2 for: ${query}`,
 snippet: `Additional result content for "${query}".`,
 url: 'https://example.com/result-2',
 },
 ].slice(0, maxResults),
 });
 },
 };
}

/**
 * URL fetching tool.
 */
function makeUrlFetchTool(): AgentTool {
 return {
 definition: {
 name: 'fetch_url',
 description: 'Fetch the content of a URL. Returns the text content (truncated to 5000 chars).',
 input_schema: {
 type: 'object' as const,
 properties: {
 url: {
 type: 'string',
 description: 'URL to fetch (must be https://)',
 },
 },
 required: ['url'],
 },
 },
 execute: async (input) => {
 const url = input['url'] as string;

 if (!url.startsWith('https://')) {
 return 'Error: Only HTTPS URLs are allowed.';
 }

 try {
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), 10000);
 const response = await fetch(url, {
 signal: controller.signal,
 headers: { 'User-Agent': 'WireForge-ResearchAgent/1.0' },
 });
 clearTimeout(timeout);

 const text = await response.text();
 // Strip HTML tags for cleaner content
 const content = text
 .replace(/<script[\s\S]*?<\/script>/gi, '')
 .replace(/<style[\s\S]*?<\/style>/gi, '')
 .replace(/<[^>]+>/g, ' ')
 .replace(/\s+/g, ' ')
 .trim()
 .slice(0, 5000);

 return JSON.stringify({
 url,
 status: response.status,
 content,
 truncated: text.length > 5000,
 });
 } catch (err) {
 return `Error fetching ${url}: ${err instanceof Error ? err.message : String(err)}`;
 }
 },
 };
}

/**
 * Store findings tool — lets the agent explicitly save structured findings to SharedMemory.
 */
function makeStoreFindingsTool(memory: SharedMemory): AgentTool {
 return {
 definition: {
 name: 'store_findings',
 description: 'Store structured research findings in shared memory for downstream agents.',
 input_schema: {
 type: 'object' as const,
 properties: {
 key: {
 type: 'string',
 description: 'Memory key (e.g., "research_findings", "competitor_analysis")',
 },
 findings: {
 type: 'object',
 description: 'Structured findings to store',
 },
 },
 required: ['key', 'findings'],
 },
 },
 execute: async (input) => {
 const key = input['key'] as string;
 const findings = input['findings'];
 memory.set(key, findings, 'researcher');
 return JSON.stringify({ stored: true, key, entryCount: memory.size });
 },
 };
}

export class ResearchAgent extends BaseAgent {
 constructor(
 private readonly memory: SharedMemory,
 config: { model?: string; maxTokens?: number } = {}
 ) {
 const tools: AgentTool[] = [
 makeWebSearchTool(memory),
 makeUrlFetchTool(),
 makeStoreFindingsTool(memory),
 ];

 super(tools, {
 name: 'researcher',
 systemPrompt: RESEARCHER_SYSTEM_PROMPT,
 ...(config.model !== undefined ? { model: config.model } : {}),
 maxTokens: config.maxTokens ?? 4096,
 maxToolRounds: 8,
 });
 }
}
