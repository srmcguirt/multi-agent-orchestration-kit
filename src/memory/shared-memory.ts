/**
 * SharedMemory — a typed key-value store shared across all agents in an orchestration.
 *
 * Purpose: Allow agents in a pipeline or fan-out to pass structured data to each
 * other without stuffing everything into the text prompt. A researcher can store
 * facts, a writer can read them, a reviewer can annotate them.
 *
 * Usage:
 *   const memory = new SharedMemory();
 *
 *   // In researcher agent:
 *   memory.set('research_findings', findings, 'researcher');
 *
 *   // In writer agent:
 *   const findings = memory.get<ResearchFindings>('research_findings');
 *
 *   // Snapshot for passing to next agent's context:
 *   const summary = memory.summarize();
 */

import type { MemoryEntry, SharedMemorySnapshot } from '../types.js';

export class SharedMemory {
  private readonly entries = new Map<string, MemoryEntry>();

  /**
   * Store a value under a key.
   * @param key - Unique identifier for this piece of data
   * @param value - Any serializable value
   * @param storedBy - Agent name storing this (for traceability)
   * @param ttlMs - Optional time-to-live in milliseconds
   */
  set<T>(key: string, value: T, storedBy: string, ttlMs?: number): void {
    const now = new Date();
    const entry: MemoryEntry<T> = {
      key,
      value,
      storedAt: now.toISOString(),
      storedBy,
      ...(ttlMs !== undefined ? { expiresAt: new Date(now.getTime() + ttlMs).toISOString() } : {}),
    };
    this.entries.set(key, entry as MemoryEntry);
  }

  /**
   * Retrieve a value by key, returning undefined if not found or expired.
   */
  get<T = unknown>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    // Check expiry
    if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete a key.
   */
  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  /**
   * Get all non-expired entries.
   */
  getAll(): MemoryEntry[] {
    const now = new Date();
    return Array.from(this.entries.values()).filter(
      e => !e.expiresAt || new Date(e.expiresAt) >= now
    );
  }

  /**
   * Generate a text summary of all memory contents for injection into a system prompt.
   * Agents call this to "know" what other agents have stored.
   */
  summarize(options: { keysOnly?: boolean } = {}): string {
    const all = this.getAll();
    if (all.length === 0) return '(shared memory is empty)';

    return all.map(entry => {
      const value = options.keysOnly
        ? '[stored]'
        : typeof entry.value === 'string'
          ? entry.value
          : JSON.stringify(entry.value, null, 2);
      return `[${entry.key}] (stored by ${entry.storedBy} at ${entry.storedAt}):\n${value}`;
    }).join('\n\n---\n\n');
  }

  /**
   * Serialize the full memory state.
   */
  snapshot(): SharedMemorySnapshot {
    const entries = this.getAll();
    return {
      entries,
      totalEntries: entries.length,
      snapshotAt: new Date().toISOString(),
    };
  }

  /**
   * Restore from a snapshot (e.g., for persistence or resumption).
   */
  restore(snapshot: SharedMemorySnapshot): void {
    this.entries.clear();
    for (const entry of snapshot.entries) {
      this.entries.set(entry.key, entry);
    }
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.getAll().length;
  }
}
