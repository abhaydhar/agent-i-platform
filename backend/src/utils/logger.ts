type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PREFIX: Record<Level, string> = {
  debug: '[debug]',
  info: '[info ]',
  warn: '[warn ]',
  error: '[error]',
};

function emit(level: Level, scope: string, args: unknown[]) {
  const ts = new Date().toISOString();
  const prefix = `${LEVEL_PREFIX[level]} ${ts} ${scope}`;
  if (level === 'error') {
    console.error(prefix, ...args);
  } else if (level === 'warn') {
    console.warn(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
}

export function createLogger(scope: string) {
  return {
    debug: (...args: unknown[]) => emit('debug', scope, args),
    info: (...args: unknown[]) => emit('info', scope, args),
    warn: (...args: unknown[]) => emit('warn', scope, args),
    error: (...args: unknown[]) => emit('error', scope, args),
  };
}

export type Logger = ReturnType<typeof createLogger>;
