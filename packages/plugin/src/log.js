// Prefixed console logging, so plugin output is easy to filter from draw.io's own noise.
export const LOG_PREFIX = '[mindmap]';

export function createLogger(target = console) {
  return {
    info: (...args) => target.log(LOG_PREFIX, ...args),
    warn: (...args) => target.warn(LOG_PREFIX, ...args),
    error: (...args) => target.error(LOG_PREFIX, ...args),
  };
}

export const log = createLogger();
