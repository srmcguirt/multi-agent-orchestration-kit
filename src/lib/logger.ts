/**
 * Logger — writes to stderr only.
 * In multi-agent systems, stdout may be consumed by a parent process.
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const minLevel = (process.env['LOG_LEVEL'] as LogLevel | undefined) ?? 'INFO';

function log(level: LogLevel, agentName: string, message: string, data?: unknown): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

  const ts = new Date().toISOString();
  const prefix = `${ts} [${level.padEnd(5)}] [${agentName}]`;
  const line = data !== undefined
    ? `${prefix} ${message} ${JSON.stringify(data)}`
    : `${prefix} ${message}`;

  process.stderr.write(line + '\n');
}

export const logger = {
  debug: (agentName: string, msg: string, data?: unknown) => log('DEBUG', agentName, msg, data),
  info:  (agentName: string, msg: string, data?: unknown) => log('INFO',  agentName, msg, data),
  warn:  (agentName: string, msg: string, data?: unknown) => log('WARN',  agentName, msg, data),
  error: (agentName: string, msg: string, data?: unknown) => log('ERROR', agentName, msg, data),
};
