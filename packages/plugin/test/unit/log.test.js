import { expect, it, vi } from 'vitest';
import { createLogger, LOG_PREFIX } from '../../src/log.js';

it('prefixes every log level with [mindmap]', () => {
  const target = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const log = createLogger(target);
  log.info('a', 1);
  log.warn('b');
  log.error('c');
  expect(LOG_PREFIX).toBe('[mindmap]');
  expect(target.log).toHaveBeenCalledWith('[mindmap]', 'a', 1);
  expect(target.warn).toHaveBeenCalledWith('[mindmap]', 'b');
  expect(target.error).toHaveBeenCalledWith('[mindmap]', 'c');
});
