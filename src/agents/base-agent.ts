/**
 * Re-export BaseAgent from the orchestrator module.
 *
 * BaseAgent is defined in orchestrator.ts to keep the core self-contained.
 * This file provides a convenient import path:
 *
 *   import { BaseAgent } from './agents/base-agent.js';
 *
 * Both paths resolve to the same class.
 */

export { BaseAgent } from '../orchestrator.js';
